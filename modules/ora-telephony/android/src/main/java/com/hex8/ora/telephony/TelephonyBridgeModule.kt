package com.hex8.ora.telephony

import android.content.Intent
import android.net.Uri
import android.provider.ContactsContract
import android.telephony.SmsManager
import android.telephony.SubscriptionManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TelephonyBridgeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OraTelephony")

    AsyncFunction("dialNumber") { phoneNumber: String, simSlot: Int? ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val sanitized = phoneNumber.replace(Regex("[^0-9+]"), "")
      try {
        val callIntent = Intent(Intent.ACTION_CALL).apply {
          data = Uri.parse("tel:$sanitized")
          flags = Intent.FLAG_ACTIVITY_NEW_TASK

          if (simSlot != null && simSlot in 1..2) {
            val slotIndex = simSlot - 1
            putExtra("android.telephony.extra.SUBSCRIPTION_INDEX", slotIndex)
            putExtra("com.android.phone.extra.slot", slotIndex)
            putExtra("simSlot", slotIndex)
            putExtra("phone_type", slotIndex)
            putExtra("slot", slotIndex)
            putExtra("com.android.phone.DialingMode", slotIndex)
          }
        }
        context.startActivity(callIntent)
        true
      } catch (e: SecurityException) {
        // Fallback to ACTION_DIAL if CALL_PHONE is restricted by OS
        try {
          val dialIntent = Intent(Intent.ACTION_DIAL).apply {
            data = Uri.parse("tel:$sanitized")
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
          }
          context.startActivity(dialIntent)
          true
        } catch (e2: Exception) {
          false
        }
      } catch (e: Exception) {
        false
      }
    }

    AsyncFunction("sendDirectSms") { phoneNumber: String, message: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val sanitized = phoneNumber.replace(Regex("[^0-9+]"), "")
      try {
        val smsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          context.getSystemService(SmsManager::class.java)
        } else {
          @Suppress("DEPRECATION")
          SmsManager.getDefault()
        }
        val parts = smsManager.divideMessage(message)
        if (parts.size > 1) {
          smsManager.sendMultipartTextMessage(sanitized, null, parts, null, null)
        } else {
          smsManager.sendTextMessage(sanitized, null, message, null, null)
        }
        true
      } catch (e: Exception) {
        // Fallback to launching messaging app with pre-filled recipient and text
        try {
          val smsIntent = Intent(Intent.ACTION_SENDTO).apply {
            data = Uri.parse("smsto:$sanitized")
            putExtra("sms_body", message)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
          }
          context.startActivity(smsIntent)
          true
        } catch (e2: Exception) {
          false
        }
      }
    }

    AsyncFunction("lookupContactNumber") { name: String ->
      val context = appContext.reactContext ?: return@AsyncFunction null
      try {
        val trimmed = name.trim()
        if (trimmed.isEmpty()) return@AsyncFunction null

        // 1. Android Native Filter URI (Fast indexed prefix/substring lookup across accounts)
        val filterUri = Uri.withAppendedPath(
          ContactsContract.CommonDataKinds.Phone.CONTENT_FILTER_URI,
          Uri.encode(trimmed)
        )
        val filterCursor = context.contentResolver.query(
          filterUri,
          arrayOf(
            ContactsContract.CommonDataKinds.Phone.NUMBER,
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME
          ),
          null,
          null,
          null
        )
        filterCursor?.use {
          if (it.moveToFirst()) {
            val numberIndex = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
            if (numberIndex >= 0) {
              val num = it.getString(numberIndex)
              if (!num.isNullOrBlank()) return@AsyncFunction num
            }
          }
        }

        // 2. Fallback: Case-insensitive query on DISPLAY_NAME
        val cursor = context.contentResolver.query(
          ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
          arrayOf(
            ContactsContract.CommonDataKinds.Phone.NUMBER,
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME
          ),
          "UPPER(${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME}) LIKE UPPER(?)",
          arrayOf("%$trimmed%"),
          null
        )
        cursor?.use {
          if (it.moveToFirst()) {
            val numberIndex = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
            if (numberIndex >= 0) {
              val num = it.getString(numberIndex)
              if (!num.isNullOrBlank()) return@AsyncFunction num
            }
          }
        }
        null
      } catch (e: Exception) {
        null
      }
    }

    AsyncFunction("getAllContacts") {
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, String>>()
      val list = mutableListOf<Map<String, String>>()
      try {
        val cursor = context.contentResolver.query(
          ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
          arrayOf(
            ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NUMBER
          ),
          null,
          null,
          "${ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME} ASC"
        )
        cursor?.use {
          val idIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.CONTACT_ID)
          val nameIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
          val numIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
          while (it.moveToNext()) {
            val contactName = if (nameIdx >= 0) it.getString(nameIdx) ?: "" else ""
            val contactNum = if (numIdx >= 0) it.getString(numIdx) ?: "" else ""
            val contactId = if (idIdx >= 0) it.getString(idIdx) ?: contactName else contactName
            if (contactName.isNotBlank() && contactNum.isNotBlank()) {
              list.add(mapOf("id" to contactId, "name" to contactName, "phone" to contactNum))
            }
          }
        }
      } catch (e: Exception) {
        // Return whatever was gathered
      }
      list
    }
  }
}
