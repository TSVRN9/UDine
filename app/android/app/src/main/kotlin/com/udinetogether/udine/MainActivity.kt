package com.udinetogether.udine

import android.app.ActivityManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    // Notify me's two questions of the OS that no plugin answers (lib/alerts/alerts.dart, PlatformAlertsOs).
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "com.udinetogether.udine/alerts").setMethodCallHandler { call, result ->
            when (call.method) {
                // battery use set to "Restricted": the OS will not run the check
                "backgroundRestricted" ->
                    result.success(Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && (getSystemService(ACTIVITY_SERVICE) as ActivityManager).isBackgroundRestricted)
                // "notifications": the app's notification page. "background": App info, where Battery is set (no public page of its own)
                "openSettings" -> {
                    val intent = if (call.arguments == "notifications") {
                        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                    } else {
                        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
                    }
                    startActivity(intent)
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
    }
}
