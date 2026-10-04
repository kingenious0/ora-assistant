package com.hex8.ora.services

import android.accessibilityservice.AccessibilityService
import android.os.Build
import android.view.accessibility.AccessibilityEvent

class OraAccessibilityService : AccessibilityService() {
  companion object {
    var instance: OraAccessibilityService? = null
      private set

    fun lockScreen(): Boolean {
      return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        instance?.performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN) ?: false
      } else {
        false
      }
    }

    fun performAction(actionName: String): Boolean {
      val service = instance ?: return false
      return when (actionName.lowercase().trim()) {
        "screenshot", "take_screenshot" -> {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            service.performGlobalAction(GLOBAL_ACTION_TAKE_SCREENSHOT)
          } else {
            false
          }
        }
        "home", "go_home" -> service.performGlobalAction(GLOBAL_ACTION_HOME)
        "recents", "recent_apps", "app_switcher" -> service.performGlobalAction(GLOBAL_ACTION_RECENTS)
        "notifications", "notification_shade" -> service.performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS)
        "quick_settings", "control_center" -> service.performGlobalAction(GLOBAL_ACTION_QUICK_SETTINGS)
        "power_dialog", "power_menu" -> {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            service.performGlobalAction(GLOBAL_ACTION_POWER_DIALOG)
          } else {
            false
          }
        }
        "lock", "lock_screen" -> lockScreen()
        else -> false
      }
    }

    val isAvailable: Boolean
      get() = instance != null
  }

  override fun onServiceConnected() {
    super.onServiceConnected()
    instance = this
  }

  override fun onDestroy() {
    super.onDestroy()
    instance = null
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
  override fun onInterrupt() {}
}
