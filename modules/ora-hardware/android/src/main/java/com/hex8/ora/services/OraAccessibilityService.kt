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
