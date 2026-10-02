package com.hex8.ora.hardware

import android.content.Context
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.os.BatteryManager
import android.os.Build
import android.view.WindowManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class HardwareModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OraHardware")

    AsyncFunction("setTorchMode") { enabled: Boolean ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as? CameraManager
      try {
        val cameraId = cameraManager?.cameraIdList?.firstOrNull() ?: return@AsyncFunction false
        cameraManager.setTorchMode(cameraId, enabled)
        true
      } catch (e: Exception) {
        false
      }
    }

    AsyncFunction("setRingerMode") { mode: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return@AsyncFunction false
      try {
        when (mode.lowercase()) {
          "silent" -> audioManager.ringerMode = AudioManager.RINGER_MODE_SILENT
          "vibrate" -> audioManager.ringerMode = AudioManager.RINGER_MODE_VIBRATE
          "normal" -> audioManager.ringerMode = AudioManager.RINGER_MODE_NORMAL
        }
        true
      } catch (e: Exception) {
        false
      }
    }

    Function("getBatteryLevel") {
      val context = appContext.reactContext ?: return@Function -1
      val batteryManager = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
      batteryManager?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
    }

    AsyncFunction("wakeScreen") {
      val activity = appContext.currentActivity ?: return@AsyncFunction false
      activity.runOnUiThread {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
          activity.setShowWhenLocked(true)
          activity.setTurnScreenOn(true)
        } else {
          @Suppress("DEPRECATION")
          activity.window.addFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
          )
        }
      }
      true
    }
  }
}
