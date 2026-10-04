package com.hex8.ora.services

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognitionService
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log

/**
 * System-Level Recognition Service for Ora Assistant
 * Fulfills Android's VoiceInteractionService contract so the OS accepts Ora
 * as the permanent system Default Digital Assistant app and handles external voice requests.
 */
class OraRecognitionService : RecognitionService() {
  private var delegateRecognizer: SpeechRecognizer? = null
  private var currentListener: Callback? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  companion object {
    private const val TAG = "OraRecognitionService"
    private val PREFERRED_PACKAGES = listOf(
      "com.google.android.googlequicksearchbox",
      "com.google.android.tts",
      "com.xiaomi.mibrain.speech",
      "com.samsung.android.bixby.agent",
      "com.google.android.as"
    )
  }

  private var audioFocusRequest: android.media.AudioFocusRequest? = null

  private fun acquireAudioFocus(): Boolean {
    return try {
      val audioManager = applicationContext.getSystemService(Context.AUDIO_SERVICE) as? android.media.AudioManager ?: return false
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
        val playbackAttributes = android.media.AudioAttributes.Builder()
          .setUsage(android.media.AudioAttributes.USAGE_ASSISTANT)
          .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH)
          .build()
        val request = android.media.AudioFocusRequest.Builder(android.media.AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
          .setAudioAttributes(playbackAttributes)
          .setAcceptsDelayedFocusGain(false)
          .build()
        audioFocusRequest = request
        audioManager.requestAudioFocus(request) == android.media.AudioManager.AUDIOFOCUS_REQUEST_GRANTED
      } else {
        @Suppress("DEPRECATION")
        audioManager.requestAudioFocus(
          null,
          android.media.AudioManager.STREAM_VOICE_CALL,
          android.media.AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE
        ) == android.media.AudioManager.AUDIOFOCUS_REQUEST_GRANTED
      }
    } catch (e: Exception) {
      Log.w(TAG, "Failed to acquire audio focus: ${e.message}")
      false
    }
  }

  private fun releaseAudioFocus() {
    try {
      val audioManager = applicationContext.getSystemService(Context.AUDIO_SERVICE) as? android.media.AudioManager ?: return
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
        audioFocusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
        audioFocusRequest = null
      } else {
        @Suppress("DEPRECATION")
        audioManager.abandonAudioFocus(null)
      }
    } catch (e: Exception) {
      Log.w(TAG, "Failed to release audio focus: ${e.message}")
    }
  }

  private fun createDelegate(): SpeechRecognizer? {
    val ctx = applicationContext
    val myPkg = ctx.packageName

    // 0. Explicitly try trusted system on-device speech engines via ComponentName
    val explicitComponents = listOf(
      android.content.ComponentName("com.google.android.tts", "com.google.android.apps.speech.tts.googletts.service.GoogleRecognitionService"),
      android.content.ComponentName("com.google.android.googlequicksearchbox", "com.google.android.voicesearch.serviceapi.GoogleRecognitionService"),
      android.content.ComponentName("com.xiaomi.mibrain.speech", "com.xiaomi.mibrain.speech.RecognitionService")
    )
    for (comp in explicitComponents) {
      try {
        val ri = ctx.packageManager.resolveService(Intent(RecognitionService.SERVICE_INTERFACE).setComponent(comp), 0)
        if (ri != null) {
          Log.i(TAG, "Binding delegate recognizer to explicit ComponentName: $comp")
          return SpeechRecognizer.createSpeechRecognizer(ctx, comp)
        }
      } catch (ignored: Exception) {}
    }

    // 1. Discover available system recognition services, explicitly filtering out self to prevent circular loop
    try {
      val intent = Intent(RecognitionService.SERVICE_INTERFACE)
      val services = ctx.packageManager.queryIntentServices(intent, 0)
      val nonSelfServices = services.filter { it.serviceInfo.packageName != myPkg }

      // Try preferred offline / system packages first (Google App, Google Speech, Xiaomi HyperOS)
      for (preferred in PREFERRED_PACKAGES) {
        val match = nonSelfServices.firstOrNull { it.serviceInfo.packageName == preferred }
        if (match != null) {
          val comp = android.content.ComponentName(match.serviceInfo.packageName, match.serviceInfo.name)
          Log.i(TAG, "Binding delegate recognizer to preferred package: ${match.serviceInfo.packageName}")
          return SpeechRecognizer.createSpeechRecognizer(ctx, comp)
        }
      }

      // Try any non-self service
      val firstOther = nonSelfServices.firstOrNull()
      if (firstOther != null) {
        val comp = android.content.ComponentName(firstOther.serviceInfo.packageName, firstOther.serviceInfo.name)
        Log.i(TAG, "Binding delegate recognizer to fallback package: ${firstOther.serviceInfo.packageName}")
        return SpeechRecognizer.createSpeechRecognizer(ctx, comp)
      }
    } catch (e: Exception) {
      Log.w(TAG, "Error discovering system recognition services: ${e.message}")
    }

    // 2. Android 12+ (API 31+): Direct On-Device Speech Recognizer (secondary fallback)
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
      try {
        if (SpeechRecognizer.isOnDeviceRecognitionAvailable(ctx)) {
          Log.i(TAG, "Creating native on-device speech recognizer (API 31+)")
          return SpeechRecognizer.createOnDeviceSpeechRecognizer(ctx)
        }
      } catch (e: Exception) {
        Log.w(TAG, "On-device recognizer creation failed: ${e.message}")
      }
    }

    return null
  }

  override fun onStartListening(recognizerIntent: Intent?, listener: Callback?) {
    currentListener = listener
    Log.i(TAG, "onStartListening invoked by caller: ${recognizerIntent?.action}")

    mainHandler.post {
      try {
        acquireAudioFocus()
        delegateRecognizer?.destroy()
        val recognizer = createDelegate()
        if (recognizer == null) {
          Log.e(TAG, "Could not create delegate speech recognizer")
          releaseAudioFocus()
          listener?.error(SpeechRecognizer.ERROR_CLIENT)
          return@post
        }

        delegateRecognizer = recognizer.apply {
          setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
              currentListener?.readyForSpeech(params)
            }

            override fun onBeginningOfSpeech() {
              currentListener?.beginningOfSpeech()
            }

            override fun onRmsChanged(rmsdB: Float) {
              currentListener?.rmsChanged(rmsdB)
            }

            override fun onBufferReceived(buffer: ByteArray?) {
              currentListener?.bufferReceived(buffer)
            }

            override fun onEndOfSpeech() {
              currentListener?.endOfSpeech()
            }

            override fun onError(error: Int) {
              val errorLabel = when (error) {
                SpeechRecognizer.ERROR_AUDIO -> "ERROR_AUDIO (3)"
                SpeechRecognizer.ERROR_CLIENT -> "ERROR_CLIENT (5)"
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "ERROR_INSUFFICIENT_PERMISSIONS (9)"
                SpeechRecognizer.ERROR_NETWORK -> "ERROR_NETWORK (2)"
                SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "ERROR_NETWORK_TIMEOUT (1)"
                SpeechRecognizer.ERROR_NO_MATCH -> "ERROR_NO_MATCH (7)"
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "ERROR_RECOGNIZER_BUSY (8)"
                SpeechRecognizer.ERROR_SERVER -> "ERROR_SERVER (4)"
                SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "ERROR_SPEECH_TIMEOUT (6)"
                else -> "ERROR_UNKNOWN ($error)"
              }
              Log.w(TAG, "Delegate recognizer error: $errorLabel")
              releaseAudioFocus()
              currentListener?.error(error)
            }

            override fun onResults(results: Bundle?) {
              Log.i(TAG, "Delegate recognizer results received")
              releaseAudioFocus()
              currentListener?.results(results)
            }

            override fun onPartialResults(partialResults: Bundle?) {
              currentListener?.partialResults(partialResults)
            }

            override fun onEvent(eventType: Int, params: Bundle?) {
              // RecognitionService.Callback does not expose onEvent; safely ignored
            }
          })
          val speechIntent = (recognizerIntent ?: Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)).apply {
            if (!hasExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL)) {
              putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            }
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
          }
          startListening(speechIntent)
        }
      } catch (e: Exception) {
        Log.e(TAG, "Failed to start delegate speech recognizer", e)
        releaseAudioFocus()
        listener?.error(SpeechRecognizer.ERROR_CLIENT)
      }
    }
  }

  override fun onCancel(listener: Callback?) {
    mainHandler.post {
      try {
        releaseAudioFocus()
        delegateRecognizer?.cancel()
      } catch (e: Exception) {
        Log.w(TAG, "Error cancelling recognizer: ${e.message}")
      }
    }
  }

  override fun onStopListening(listener: Callback?) {
    mainHandler.post {
      try {
        releaseAudioFocus()
        delegateRecognizer?.stopListening()
      } catch (e: Exception) {
        Log.w(TAG, "Error stopping recognizer: ${e.message}")
      }
    }
  }

  override fun onDestroy() {
    super.onDestroy()
    mainHandler.post {
      try {
        releaseAudioFocus()
        delegateRecognizer?.destroy()
        delegateRecognizer = null
      } catch (e: Exception) {}
    }
  }
}
