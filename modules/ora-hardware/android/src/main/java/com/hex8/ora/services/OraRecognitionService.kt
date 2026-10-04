package com.hex8.ora.services

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognitionService
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

  private fun createDelegate(): SpeechRecognizer? {
    val ctx = applicationContext
    val myPkg = ctx.packageName

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
        delegateRecognizer?.destroy()
        val recognizer = createDelegate()
        if (recognizer == null) {
          Log.e(TAG, "Could not create delegate speech recognizer")
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
              Log.w(TAG, "Delegate recognizer error: $error")
              currentListener?.error(error)
            }

            override fun onResults(results: Bundle?) {
              Log.i(TAG, "Delegate recognizer results received")
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
        listener?.error(SpeechRecognizer.ERROR_CLIENT)
      }
    }
  }

  override fun onCancel(listener: Callback?) {
    mainHandler.post {
      try {
        delegateRecognizer?.cancel()
      } catch (e: Exception) {
        Log.w(TAG, "Error cancelling recognizer: ${e.message}")
      }
    }
  }

  override fun onStopListening(listener: Callback?) {
    mainHandler.post {
      try {
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
        delegateRecognizer?.destroy()
        delegateRecognizer = null
      } catch (e: Exception) {}
    }
  }
}
