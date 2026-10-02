package com.hex8.ora.notifications

import android.app.Notification
import android.app.RemoteInput
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NotificationReplyService : NotificationListenerService() {
  companion object {
    // Map of packageName -> latest Notification Action with RemoteInput
    val activeActions = mutableMapOf<String, Notification.Action>()

    fun sendReply(context: Context, targetApp: String, text: String): Boolean {
      val cleanTarget = targetApp.lowercase()
      val matchedEntry = activeActions.entries.find { (pkg, _) ->
        pkg.lowercase().contains(cleanTarget)
      } ?: return false

      val action = matchedEntry.value
      val remoteInputs = action.remoteInputs ?: return false

      for (remoteInput in remoteInputs) {
        val bundle = Bundle().apply {
          putCharSequence(remoteInput.resultKey, text)
        }
        val replyIntent = Intent().apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        RemoteInput.addResultsToIntent(arrayOf(remoteInput), replyIntent, bundle)
        try {
          action.actionIntent.send(context, 0, replyIntent)
          return true
        } catch (e: Exception) {
          return false
        }
      }
      return false
    }
  }

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    super.onNotificationPosted(sbn)
    if (sbn == null) return
    val notification = sbn.notification ?: return
    val actions = notification.actions ?: return

    for (action in actions) {
      if (action.remoteInputs != null && action.remoteInputs.isNotEmpty()) {
        activeActions[sbn.packageName] = action
      }
    }
  }

  override fun onNotificationRemoved(sbn: StatusBarNotification?) {
    super.onNotificationRemoved(sbn)
    if (sbn != null) {
      activeActions.remove(sbn.packageName)
    }
  }
}

class NotificationsBridgeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OraNotifications")

    AsyncFunction("replyToLatest") { appName: String, text: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      NotificationReplyService.sendReply(context, appName, text)
    }

    Function("isServiceEnabled") {
      // Returns true if notification listener is registered
      NotificationReplyService.activeActions.isNotEmpty()
    }
  }
}
