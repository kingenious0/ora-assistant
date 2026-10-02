package com.hex8.ora.services

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.service.voice.VoiceInteractionSession
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Milestone 6: Native Floating Bottom Sheet Overlay for VoiceInteractionSession
 * Floats smoothly over running apps on Android 8-15 (MIUI / HyperOS tested).
 */
class OraVoiceInteractionSession(context: Context) : VoiceInteractionSession(context) {
  private var bottomSheetView: LinearLayout? = null
  private var statusTextView: TextView? = null

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
    }
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
  }

  override fun onHide() {
    super.onHide()
  }
}
