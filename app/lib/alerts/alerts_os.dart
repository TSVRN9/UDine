/// What Notify me needs of the OS. A test hands in its own; `PlatformAlertsOs` (alerts.dart) is the device's.
abstract interface class AlertsOs {
  /// Notifications are allowed now.
  Future<bool> allowed();

  /// The OS's own permission sheet; false when denied, and at once (no sheet) when the OS won't ask again.
  Future<bool> request();

  /// The app's notification settings (denied or revoked).
  Future<void> openSettings();
}
