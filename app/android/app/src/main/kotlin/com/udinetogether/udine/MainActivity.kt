package com.udinetogether.udine

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Mass
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.time.Instant
import java.time.ZoneOffset
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

// FlutterFragmentActivity: Health Connect's permission contract needs an ActivityResult registry, which FlutterActivity lacks.
class MainActivity : FlutterFragmentActivity() {
    companion object {
        const val HEALTH_CONNECT_PACKAGE = "com.google.android.apps.healthdata"
    }

    private val scope = CoroutineScope(Dispatchers.Main)
    private var pending: MethodChannel.Result? = null
    private lateinit var askForPermissions: ActivityResultLauncher<Set<String>>

    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT < 26) return
        askForPermissions = registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { granted ->
            pending?.success(granted.isNotEmpty())
            pending = null
        }
    }

    override fun onDestroy() {
        pending?.success(false)
        pending = null
        super.onDestroy()
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "udine/health").setMethodCallHandler { call, result -> handle(call, result) }
        // Notify me's one question of the OS that no plugin answers (lib/alerts/alerts.dart, PlatformAlertsOs): the app's notification page.
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "com.udinetogether.udine/alerts").setMethodCallHandler { call, result ->
            when (call.method) {
                "openSettings" -> {
                    startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun perms(call: MethodCall): Set<String> = call.argument<List<String>>("permissions")!!.toSet()

    private fun providerInstalled(): Boolean = try {
        packageManager.getPackageInfo(HEALTH_CONNECT_PACKAGE, 0); true
    } catch (e: Exception) { false }

    // Health Connect's home (Android 14+; MANAGE_HEALTH_PERMISSIONS is protected, Permission Denial on the A53), the provider's settings, then its Play listing when it isn't installed.
    private fun openSettings() {
        val intents = listOfNotNull(
            if (Build.VERSION.SDK_INT >= 34) Intent("android.health.connect.action.HEALTH_HOME_SETTINGS") else null,
            Intent("androidx.health.ACTION_HEALTH_CONNECT_SETTINGS"),
            Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$HEALTH_CONNECT_PACKAGE")),
            Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$HEALTH_CONNECT_PACKAGE")),
        )
        for (i in intents) {
            try { startActivity(i); return } catch (e: Exception) { android.util.Log.w("UDineHealth", "settings intent failed", e) }
        }
    }

    // Write only: nothing here ever reads a record back.
    private fun handle(call: MethodCall, result: MethodChannel.Result) {
        if (call.method == "openSettings") { openSettings(); result.success(null); return }
        // minSdk is 24 but Health Connect's library is 26+ (manifest overrideLibrary): no call below may run on older devices.
        if (Build.VERSION.SDK_INT < 26) {
            result.success(when (call.method) { "access" -> "unsupported"; "write" -> null; else -> false })
            return
        }
        val status = HealthConnectClient.getSdkStatus(this)
        if (call.method == "access" && status != HealthConnectClient.SDK_AVAILABLE) {
            // Android 13 and below keep Health Connect in an app: absent (or too old) it can be installed, anything else can't have it
            result.success(if (status == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED || !providerInstalled()) "notInstalled" else "unsupported")
            return
        }
        if (status != HealthConnectClient.SDK_AVAILABLE) { result.success(if (call.method == "write" || call.method == "delete") null else false); return }
        val client = HealthConnectClient.getOrCreate(this)
        when (call.method) {
            // The scope has no exception handler: anything Health Connect throws (RemoteException, SecurityException) must be caught here.
            "access" -> scope.launch {
                try {
                    result.success(if (client.permissionController.getGrantedPermissions().containsAll(perms(call))) "granted" else "denied")
                } catch (e: Exception) { result.success("denied") }
            }
            "requestWrite" -> {
                if (pending != null) { result.success(false); return }
                try {
                    val wanted = perms(call)
                    pending = result
                    askForPermissions.launch(wanted)
                } catch (e: Exception) { pending = null; result.success(false) }
            }
            "write" -> scope.launch {
                try {
                    val id = call.argument<String>("clientId")!!
                    val f = call.argument<Map<String, Double>>("fields")!!
                    val off = ZoneOffset.ofTotalSeconds(call.argument<Int>("zoneOffsetSeconds")!!)
                    fun g(k: String) = f[k]?.let { Mass.grams(it) }
                    fun mg(k: String) = f[k]?.let { Mass.milligrams(it) }
                    client.insertRecords(listOf(NutritionRecord(
                        startTime = Instant.ofEpochMilli(call.argument<Number>("startMs")!!.toLong()), startZoneOffset = off,
                        endTime = Instant.ofEpochMilli(call.argument<Number>("endMs")!!.toLong()), endZoneOffset = off,
                        name = call.argument<String>("name"),
                        energy = f["energyKcal"]?.let { Energy.kilocalories(it) },
                        totalFat = g("fatG"), saturatedFat = g("satFatG"), transFat = g("transFatG"),
                        cholesterol = mg("cholesterolMg"), sodium = mg("sodiumMg"),
                        totalCarbohydrate = g("carbG"), dietaryFiber = g("fiberG"), sugar = g("sugarG"), protein = g("proteinG"),
                        // Same clientRecordId + a higher version replaces the record in place (an edit).
                        metadata = Metadata.manualEntry(clientRecordId = id, clientRecordVersion = System.currentTimeMillis()),
                    )))
                    result.success(listOf(id))
                } catch (e: Exception) { android.util.Log.w("UDineHealth", "write failed", e); result.success(null) }
            }
            "delete" -> scope.launch {
                try {
                    client.deleteRecords(NutritionRecord::class, emptyList(), call.argument<List<String>>("ids")!!)
                    result.success(true)
                } catch (e: Exception) { android.util.Log.w("UDineHealth", "delete failed", e); result.success(false) }
            }
            else -> result.notImplemented()
        }
    }
}
