package com.hex8.ora.services

import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder

class OraForegroundListenerService : Service() {
  companion object {
    fun startService(context: Context) {
      // Safe no-op: speech recognition is handled in-app and by VoiceInteractionSession
    }

    fun stopService(context: Context) {
      // Safe no-op
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null
}

