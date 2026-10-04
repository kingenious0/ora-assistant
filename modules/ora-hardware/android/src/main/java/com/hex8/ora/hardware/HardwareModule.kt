package com.hex8.ora.hardware

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.os.BatteryManager
import android.os.Build
import android.provider.AlarmClock
import android.util.Log
import android.view.KeyEvent
import android.view.WindowManager
import com.hex8.ora.services.OraAccessibilityService
import com.hex8.ora.services.OraDeviceAdminReceiver
import com.hex8.ora.services.OraForegroundListenerService
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class HardwareModule : Module() {
  companion object {
    private const val TAG = "OraHardware"
    @JvmStatic
    var pendingVoiceCommand: String? = null
    @JvmStatic
    var isTorchActive: Boolean = false
  }

  override fun definition() = ModuleDefinition {
    Name("OraHardware")

    Function("getPendingVoiceCommand") {
      val cmd = pendingVoiceCommand
      pendingVoiceCommand = null
      cmd
    }

    Function("getTorchState") {
      isTorchActive
    }

    AsyncFunction("setTorchMode") { enabled: Boolean ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as? CameraManager ?: return@AsyncFunction false
      try {
        var targetCameraId: String? = null
        val candidateIds = mutableListOf<String>()

        try {
          for (id in cameraManager.cameraIdList) {
            try {
              val chars = cameraManager.getCameraCharacteristics(id)
              val hasFlash = chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) ?: false
              val facing = chars.get(CameraCharacteristics.LENS_FACING)
              if (hasFlash) {
                candidateIds.add(id)
                if (facing == CameraCharacteristics.LENS_FACING_BACK && targetCameraId == null) {
                  targetCameraId = id
                }
              }
            } catch (e: Exception) {
              Log.w(TAG, "Error checking camera ID $id characteristics: ${e.message}")
            }
          }
        } catch (e: Exception) {
          Log.w(TAG, "Failed to read camera list: ${e.message}")
        }

        // Priority candidate list: preferred rear camera, any camera with flash info, then fallback to "0" and "1"
        val idsToTry = mutableListOf<String>()
        if (targetCameraId != null) idsToTry.add(targetCameraId)
        idsToTry.addAll(candidateIds)
        if (!idsToTry.contains("0")) idsToTry.add("0")
        if (!idsToTry.contains("1")) idsToTry.add("1")

        var success = false
        var lastError: Exception? = null

        for (id in idsToTry.distinct()) {
          try {
            cameraManager.setTorchMode(id, enabled)
            Log.i(TAG, "Successfully set torch mode to $enabled on camera ID: $id")
            isTorchActive = enabled
            success = true
            break
          } catch (e: Exception) {
            lastError = e
            Log.w(TAG, "Failed to set torch mode on camera ID $id: ${e.message}")
          }
        }

        if (!success && lastError != null) {
          Log.e(TAG, "All torch mode attempts failed on device.", lastError)
        }
        success
      } catch (e: Exception) {
        Log.e(TAG, "Fatal error executing setTorchMode: ${e.message}", e)
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

    AsyncFunction("performGlobalAction") { action: String ->
      OraAccessibilityService.performAction(action)
    }

    Function("isAccessibilityServiceActive") {
      OraAccessibilityService.isAvailable
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

    AsyncFunction("dispatchMediaKey") { action: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return@AsyncFunction false
      try {
        val keyCode = when (action.lowercase()) {
          "play", "resume" -> KeyEvent.KEYCODE_MEDIA_PLAY
          "pause" -> KeyEvent.KEYCODE_MEDIA_PAUSE
          "play_pause", "toggle" -> KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
          "stop" -> KeyEvent.KEYCODE_MEDIA_STOP
          "next", "skip" -> KeyEvent.KEYCODE_MEDIA_NEXT
          "previous", "prev", "back" -> KeyEvent.KEYCODE_MEDIA_PREVIOUS
          else -> return@AsyncFunction false
        }
        audioManager.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, keyCode))
        audioManager.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, keyCode))
        true
      } catch (e: Exception) {
        false
      }
    }

    AsyncFunction("setSilentAlarm") { hour: Int, minute: Int, message: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      try {
        val intent = Intent(AlarmClock.ACTION_SET_ALARM).apply {
          putExtra(AlarmClock.EXTRA_HOUR, hour)
          putExtra(AlarmClock.EXTRA_MINUTES, minute)
          putExtra(AlarmClock.EXTRA_MESSAGE, message.ifEmpty { "Ora Alarm" })
          putExtra(AlarmClock.EXTRA_SKIP_UI, true)
          flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        context.startActivity(intent)
        true
      } catch (e: Exception) {
        false
      }
    }

    AsyncFunction("setSilentTimer") { seconds: Int, message: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      try {
        val intent = Intent(AlarmClock.ACTION_SET_TIMER).apply {
          putExtra(AlarmClock.EXTRA_LENGTH, seconds)
          putExtra(AlarmClock.EXTRA_MESSAGE, message.ifEmpty { "Ora Timer" })
          putExtra(AlarmClock.EXTRA_SKIP_UI, true)
          flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        context.startActivity(intent)
        true
      } catch (e: Exception) {
        false
      }
    }

    AsyncFunction("dismissAlarm") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      try {
        val intent = Intent(AlarmClock.ACTION_DISMISS_ALARM).apply {
          flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        context.startActivity(intent)
        true
      } catch (e: Exception) {
        false
      }
    }

    AsyncFunction("showAlarms") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      try {
        val intent = Intent(AlarmClock.ACTION_SHOW_ALARMS).apply {
          flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        context.startActivity(intent)
        true
      } catch (e: Exception) {
        false
      }
    }
  }
}
