package com.hex8.ora.telephony

import android.content.Intent
import android.net.Uri
import android.provider.ContactsContract
import android.telephony.SmsManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TelephonyBridgeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OraTelephony")

    AsyncFunction("dialNumber") { phoneNumber: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      try {
        val sanitized = phoneNumber.replace(Regex("[^0-9+]"), "")
        val callIntent = Intent(Intent.ACTION_CALL).apply {
          data = Uri.parse("tel:$sanitized")
          flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        context.startActivity(callIntent)
        true
      } catch (e: Exception) {
        false
      }
    }

    AsyncFunction("sendDirectSms") { phoneNumber: String, message: String ->
      try {
        val smsManager = SmsManager.getDefault()
        smsManager.sendTextMessage(phoneNumber, null, message, null, null)
        true
      } catch (e: Exception) {
        false
      }
    }

    AsyncFunction("lookupContactNumber") { name: String ->
      val context = appContext.reactContext ?: return@AsyncFunction null
      try {
        val cursor = context.contentResolver.query(
          ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
          arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER, ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME),
          "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} LIKE ?",
          arrayOf("%$name%"),
          null
        )
        cursor?.use {
          if (it.moveToFirst()) {
            val numberIndex = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
            if (numberIndex >= 0) {
              return@AsyncFunction it.getString(numberIndex)
            }
          }
        }
        null
      } catch (e: Exception) {
        null
      }
    }
  }
}
