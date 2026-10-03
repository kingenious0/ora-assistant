package com.hex8.ora.services

import android.content.Intent
import android.speech.RecognitionService

/**
 * System-Level Recognition Service for Ora Assistant
 * Fulfills Android's VoiceInteractionService contract so the OS accepts Ora
 * as the permanent system Default Digital Assistant app.
 */
class OraRecognitionService : RecognitionService() {
  override fun onStartListening(recognizerIntent: Intent?, listener: Callback?) {
    // Invoked when an external app or system requests speech recognition through Ora
  }

  override fun onCancel(listener: Callback?) {
    // Invoked when recognition is cancelled
  }

  override fun onStopListening(listener: Callback?) {
    // Invoked when recognition stops
  }
}
