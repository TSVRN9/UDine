import Flutter
import UIKit
import workmanager_apple

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // The favourite-alerts check (alerts.dart's alertTask); Dart schedules it, this registers the BGTaskScheduler handler.
    WorkmanagerPlugin.registerPeriodicTask(withIdentifier: "com.udinetogether.udine.favoriteAlerts", frequency: NSNumber(value: 15 * 60))
    WorkmanagerPlugin.setPluginRegistrantCallback { registry in GeneratedPluginRegistrant.register(with: registry) }
    UNUserNotificationCenter.current().delegate = self as UNUserNotificationCenterDelegate
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    // Notify me's two questions of the OS that no plugin answers (lib/alerts/alerts.dart, PlatformAlertsOs).
    FlutterMethodChannel(name: "com.udinetogether.udine/alerts", binaryMessenger: engineBridge.applicationRegistrar.messenger())
      .setMethodCallHandler { call, result in
        switch call.method {
        case "backgroundRestricted":
          // Background App Refresh off for UDine (or for the whole device, or restricted)
          result(UIApplication.shared.backgroundRefreshStatus != .available)
        case "openSettings":
          if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
          result(nil)
        default:
          result(FlutterMethodNotImplemented)
        }
      }
  }
}
