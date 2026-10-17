/// Which settings page Open Settings goes to: the app's notifications (denied), or where background work is switched (iOS Background App
/// Refresh; Android's battery use, under App info).
enum AlertsSettings { notifications, background }

/// What Notify me needs of the OS. A test hands in its own; `PlatformAlertsOs` (alerts.dart) is the device's.
abstract interface class AlertsOs {
  /// Notifications are allowed now.
  Future<bool> allowed();

  /// The OS's own permission sheet; false when denied, and at once (no sheet) when the OS won't ask again.
  Future<bool> request();

  /// Notifications are allowed but the OS won't run UDine in the background (iOS Background App Refresh off; Android battery use "Restricted").
  Future<bool> backgroundRestricted();

  Future<void> openSettings(AlertsSettings page);

  /// The periodic check, registered or cancelled.
  Future<void> schedule(bool on);
}
