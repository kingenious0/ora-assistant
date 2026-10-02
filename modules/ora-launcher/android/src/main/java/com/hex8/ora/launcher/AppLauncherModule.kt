package com.hex8.ora.launcher

import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AppLauncherModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("OraLauncher")

    AsyncFunction("launchAppByName") { targetName: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val pm = context.packageManager
      try {
        val packages = pm.getInstalledApplications(PackageManager.GET_META_DATA)
        val cleanTarget = targetName.trim().lowercase()

        for (app in packages) {
          val label = pm.getApplicationLabel(app).toString().lowercase()
          if (label == cleanTarget || label.contains(cleanTarget)) {
            val launchIntent = pm.getLaunchIntentForPackage(app.packageName)
            if (launchIntent != null) {
              launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
              context.startActivity(launchIntent)
              return@AsyncFunction true
            }
          }
        }
        false
      } catch (e: Exception) {
        false
      }
    }

    AsyncFunction("getInstalledAppList") {
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, String>>()
      val pm = context.packageManager
      val result = mutableListOf<Map<String, String>>()
      try {
        val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
        for (app in apps) {
          // Filter to launchable apps only
          if (pm.getLaunchIntentForPackage(app.packageName) != null) {
            val label = pm.getApplicationLabel(app).toString()
            result.add(mapOf("name" to label, "packageName" to app.packageName))
          }
        }
      } catch (e: Exception) {
        // Return empty or partial
      }
      result
    }
  }
}
