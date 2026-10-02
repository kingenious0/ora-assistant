package com.hex8.ora.services

import android.os.Bundle
import android.service.voice.VoiceInteractionService
import android.service.voice.VoiceInteractionSession

class OraVoiceInteractionService : VoiceInteractionService() {
  override fun onReady() {
    super.onReady()
  }

  override fun onLaunchVoiceAssistFromKeyguard() {
    super.onLaunchVoiceAssistFromKeyguard()
    showSession(Bundle(), VoiceInteractionSession.SHOW_SOURCE_ASSIST_GESTURE)
  }
}
