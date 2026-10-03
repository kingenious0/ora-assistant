package com.hex8.ora.hardware

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.os.BatteryManager
import android.os.Build
import android.view.WindowManager
import com.hex8.ora.services.OraAccessibilityService
import com.hex8.ora.services.OraDeviceAdminReceiver
import com.hex8.ora.services.OraForegroundListenerService
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class HardwareModule : Module() {
  companion object {
    @JvmStatic
    var pendingVoiceCommand: String? = null
  }

  override fun definition() = ModuleDefinition {
    Name("OraHardware")

    Function("getPendingVoiceCommand") {
      val cmd = pendingVoiceCommand
      pendingVoiceCommand = null
      cmd
    }

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

    /**
     * Native Media Volume Control
     * Directly adjusts Android audio streams and displays native system volume HUD
     * without launching the device's Settings application.
     */
    AsyncFunction("adjustVolume") { direction: String, value: Double? ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return@AsyncFunction false
      try {
        val stream = AudioManager.STREAM_MUSIC
        when (direction.lowercase()) {
          "up", "raise", "increase" -> {
            audioManager.adjustStreamVolume(stream, AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI)
          }
          "down", "lower", "decrease" -> {
            audioManager.adjustStreamVolume(stream, AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI)
          }
          "mute" -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
              audioManager.adjustStreamVolume(stream, AudioManager.ADJUST_MUTE, AudioManager.FLAG_SHOW_UI)
            } else {
              audioManager.setStreamVolume(stream, 0, AudioManager.FLAG_SHOW_UI)
            }
          }
          "unmute" -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
              audioManager.adjustStreamVolume(stream, AudioManager.ADJUST_UNMUTE, AudioManager.FLAG_SHOW_UI)
            } else {
              val half = audioManager.getStreamMaxVolume(stream) / 2
              audioManager.setStreamVolume(stream, half, AudioManager.FLAG_SHOW_UI)
            }
          }
          "max", "maximum", "full" -> {
            val maxVol = audioManager.getStreamMaxVolume(stream)
            audioManager.setStreamVolume(stream, maxVol, AudioManager.FLAG_SHOW_UI)
          }
          "set", "percent", "percentage", "level" -> {
            if (value != null) {
              val maxVol = audioManager.getStreamMaxVolume(stream)
              val target = ((value / 100.0) * maxVol).toInt().coerceIn(0, maxVol)
              audioManager.setStreamVolume(stream, target, AudioManager.FLAG_SHOW_UI)
            } else {
              audioManager.adjustStreamVolume(stream, AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI)
            }
          }
          else -> {
            if (value != null) {
              val maxVol = audioManager.getStreamMaxVolume(stream)
              val target = ((value / 100.0) * maxVol).toInt().coerceIn(0, maxVol)
              audioManager.setStreamVolume(stream, target, AudioManager.FLAG_SHOW_UI)
            } else {
              audioManager.adjustStreamVolume(stream, AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI)
            }
          }
        }
        true
      } catch (e: Exception) {
        false
      }
    }

    /**
     * Native Screen Lock Execution
     * 1. Uses OraAccessibilityService (GLOBAL_ACTION_LOCK_SCREEN) on Android 9+
     * 2. Falls back to DevicePolicyManager.lockNow() if Device Admin is configured
     */
    AsyncFunction("lockScreen") {
      // 1. Accessibility Service lock (Preferred modern standard)
      if (OraAccessibilityService.lockScreen()) {
        return@AsyncFunction true
      }

      // 2. DevicePolicyManager lock (Admin fallback)
      val context = appContext.reactContext ?: return@AsyncFunction false
      val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager
      val adminComp = ComponentName(context, OraDeviceAdminReceiver::class.java)
      if (dpm != null && dpm.isAdminActive(adminComp)) {
        try {
          dpm.lockNow()
          return@AsyncFunction true
        } catch (e: Exception) {
          // Pass through to false
        }
      }

      false
    }

    Function("isScreenLockAvailable") {
      val context = appContext.reactContext ?: return@Function mapOf("accessibility" to false, "deviceAdmin" to false)
      val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager
      val adminComp = ComponentName(context, OraDeviceAdminReceiver::class.java)
      mapOf(
        "accessibility" to OraAccessibilityService.isAvailable,
        "deviceAdmin" to (dpm?.isAdminActive(adminComp) ?: false)
      )
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

    AsyncFunction("startForegroundService") {
      true
    }

    AsyncFunction("stopForegroundService") {
      true
    }
  }
}
