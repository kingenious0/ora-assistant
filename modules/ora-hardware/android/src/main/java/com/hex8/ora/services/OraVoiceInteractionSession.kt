package com.hex8.ora.services

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.service.voice.VoiceInteractionSession
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import com.hex8.ora.hardware.HardwareModule

/**
 * Milestone 6: Native Floating Bottom Sheet Overlay for VoiceInteractionSession
 * Floats smoothly over running apps on Android 8-15 (MIUI / HyperOS tested).
 * Now actively performs live Speech Recognition and passes recognized speech to Ora.
 */
class OraVoiceInteractionSession(context: Context) : VoiceInteractionSession(context) {
  private var bottomSheetView: LinearLayout? = null
  private var statusTextView: TextView? = null
  private var orbView: View? = null
  private var speechRecognizer: SpeechRecognizer? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  override fun onCreateContentView(): View {
    val rootLayout = FrameLayout(context).apply {
      layoutParams = ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
      setBackgroundColor(Color.parseColor("#44000000")) // Semi-transparent scrim
      setOnClickListener {
        hide() // Tap outside to dismiss overlay
      }
    }

    val dp = { value: Float ->
      TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP,
        value,
        context.resources.displayMetrics
      ).toInt()
    }

    // Bottom sheet card container
    val card = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setPadding(dp(24f), dp(18f), dp(24f), dp(36f))

      val cardBg = GradientDrawable().apply {
        setColor(Color.parseColor("#101018"))
        cornerRadii = floatArrayOf(
          dp(28f).toFloat(), dp(28f).toFloat(), // top-left
          dp(28f).toFloat(), dp(28f).toFloat(), // top-right
          0f, 0f, 0f, 0f
        )
        setStroke(dp(1.5f), Color.parseColor("#222238"))
      }
      background = cardBg

      val lp = FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
      ).apply {
        gravity = Gravity.BOTTOM
      }
      layoutParams = lp
      setOnClickListener { /* Prevent click through to root */ }
    }

    // Grab handle pill
    val handle = View(context).apply {
      val handleBg = GradientDrawable().apply {
        setColor(Color.parseColor("#44445E"))
        cornerRadius = dp(3f).toFloat()
      }
      background = handleBg
      layoutParams = LinearLayout.LayoutParams(dp(44f), dp(5f)).apply {
        gravity = Gravity.CENTER_HORIZONTAL
        bottomMargin = dp(16f)
      }
    }
    card.addView(handle)

    // Neon Voice Orb
    val orb = View(context).apply {
      val orbBg = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.parseColor("#00F5D4"))
      }
      background = orbBg
      layoutParams = LinearLayout.LayoutParams(dp(52f), dp(52f)).apply {
        gravity = Gravity.CENTER_HORIZONTAL
        bottomMargin = dp(14f)
      }
      setOnClickListener {
        startListening()
      }
    }
    orbView = orb
    card.addView(orb)

    // Ora Brand Title
    val titleView = TextView(context).apply {
      text = "ORA ASSISTANT"
      setTextColor(Color.parseColor("#00F5D4"))
      textSize = 12f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      letterSpacing = 0.15f
      layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.WRAP_CONTENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
      ).apply {
        bottomMargin = dp(6f)
      }
    }
    card.addView(titleView)

    // Live status transcript
    statusTextView = TextView(context).apply {
      text = "Listening... How can I help?"
      setTextColor(Color.parseColor("#F0F0F8"))
      textSize = 18f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      layoutParams = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.WRAP_CONTENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
      ).apply {
        bottomMargin = dp(20f)
      }
    }
    card.addView(statusTextView)

    // Action button to open full app
    val openAppBtn = TextView(context).apply {
      text = "Open Full Screen App"
      setTextColor(Color.parseColor("#A0A0C0"))
      textSize = 13f
      gravity = Gravity.CENTER
      setPadding(dp(16f), dp(8f), dp(16f), dp(8f))
      val btnBg = GradientDrawable().apply {
        setColor(Color.parseColor("#1B1B2A"))
        cornerRadius = dp(16f).toFloat()
      }
      background = btnBg
      setOnClickListener {
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        if (launchIntent != null) {
          launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          context.startActivity(launchIntent)
        }
        hide()
      }
    }
    card.addView(openAppBtn)

    bottomSheetView = card
    rootLayout.addView(card)
    return rootLayout
  }

  override fun onShow(args: Bundle?, showFlags: Int) {
    super.onShow(args, showFlags)
    // Smooth slide-up entrance animation from screen bottom
    bottomSheetView?.let { sheet ->
      sheet.translationY = 500f
      sheet.alpha = 0f
      sheet.animate()
        .translationY(0f)
        .alpha(1f)
        .setDuration(280)
        .setInterpolator(DecelerateInterpolator())
        .start()
    }

    startListening()
  }

  private fun startListening() {
    mainHandler.post {
      try {
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
          statusTextView?.text = "Speech service unavailable"
          return@post
        }

        speechRecognizer?.destroy()
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(context)

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
          putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
          putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
          putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
          putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
        }

        speechRecognizer?.setRecognitionListener(object : RecognitionListener {
          override fun onReadyForSpeech(params: Bundle?) {
            statusTextView?.text = "Listening... How can I help?"
          }

          override fun onBeginningOfSpeech() {
            statusTextView?.text = "Listening..."
          }

          override fun onRmsChanged(rmsdB: Float) {
            val scale = 1.0f + (rmsdB.coerceIn(0f, 10f) / 40f)
            orbView?.scaleX = scale
            orbView?.scaleY = scale
          }

          override fun onBufferReceived(buffer: ByteArray?) {}

          override fun onEndOfSpeech() {
            orbView?.scaleX = 1.0f
            orbView?.scaleY = 1.0f
            statusTextView?.text = "Processing..."
          }

          override fun onError(error: Int) {
            orbView?.scaleX = 1.0f
            orbView?.scaleY = 1.0f
            statusTextView?.text = "Tap orb or say a command"
          }

          override fun onResults(results: Bundle?) {
            orbView?.scaleX = 1.0f
            orbView?.scaleY = 1.0f
            val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            val command = matches?.firstOrNull()?.trim()
            if (!command.isNullOrEmpty()) {
              statusTextView?.text = "\"$command\""
              executeCommandInApp(command)
            } else {
              statusTextView?.text = "Didn't catch that. Tap orb to speak."
            }
          }

          override fun onPartialResults(partialResults: Bundle?) {
            val partial = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim()
            if (!partial.isNullOrEmpty()) {
              statusTextView?.text = "\"$partial\""
            }
          }

          override fun onEvent(eventType: Int, params: Bundle?) {}
        })

        speechRecognizer?.startListening(intent)
      } catch (e: Exception) {
        statusTextView?.text = "Tap orb to speak"
      }
    }
  }

  private fun executeCommandInApp(command: String) {
    HardwareModule.pendingVoiceCommand = command
    val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
      putExtra("ora_command", command)
      data = Uri.parse("ora://command?text=" + Uri.encode(command))
    }
    if (launchIntent != null) {
      context.startActivity(launchIntent)
    }

    mainHandler.postDelayed({
      hide()
    }, 600)
  }

  override fun onHide() {
    super.onHide()
    try {
      speechRecognizer?.stopListening()
      speechRecognizer?.destroy()
      speechRecognizer = null
    } catch (e: Exception) {}
  }
}
