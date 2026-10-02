package com.hex8.ora.services

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent

class OraDeviceAdminReceiver : DeviceAdminReceiver() {
  override fun onEnabled(context: Context, intent: Intent) {
    super.onEnabled(context, intent)
  }

  override fun onDisabled(context: Context, intent: Intent) {
    super.onDisabled(context, intent)
  }
}
