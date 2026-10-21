import 'dart:async';

import 'package:flutter/foundation.dart' show debugPrint, visibleForTesting;
import 'package:flutter/services.dart' show MethodChannel;

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:workmanager/workmanager.dart';

import 'alerts_os.dart';
import 'push.dart' show PushNotice;

/// The retired on-device menu check's WorkManager unique name / BGTaskScheduler identifier. Installs from before the push alerts still have it scheduled.
const alertTask = 'com.udinetogether.udine.favoriteAlerts';

final _notifications = FlutterLocalNotificationsPlugin();

/// A tap on a favourite-alert notification while the app is running, carrying the dish's name; Shell (shell.dart) opens its sheet.
final alertTaps = StreamController<String>.broadcast();
String? _heldTap;

/// A tap that arrived before the app listened (the OS restarting a killed process on the notification's intent), once: the dish's name.
String? takeHeldTap() {
  final t = _heldTap;
  _heldTap = null;
  return t;
}

@visibleForTesting
void debugTapForTest(String dish) => _tapped(dish);

/// A tap that came from a push (launch, backgrounded): [dish] is the notification's title. The foreground notification's own response lands here too.
void tapAlert(String dish) => _tapped(dish);

@visibleForTesting
void debugResponseForTest(String dish) => _responded(NotificationResponse(notificationResponseType: NotificationResponseType.selectedNotification, payload: dish));

void _responded(NotificationResponse r) {
  if (r.payload case final dish?) _tapped(dish);
}

// A payload from the retired check (or any old build) is a route, not a dish: it lands on Halls home like a push with no title.
void _tapped(String payload) {
  final dish = payload.startsWith('/') ? '' : payload;
  alertTaps.hasListener ? alertTaps.add(dish) : _heldTap = dish;
}

Future<void> _initNotifications() => _notifications.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('ic_stat_alert'),
        // The OS permission sheet is asked for by the Favorites row (Task 2), never at start-up.
        iOS: DarwinInitializationSettings(requestAlertPermission: false, requestBadgePermission: false, requestSoundPermission: false),
      ),
      onDidReceiveNotificationResponse: _responded,
    );

/// Whether the OS will show a notification now (permission granted, not blocked).
Future<bool> _allowed() async =>
    await _notifications.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()?.areNotificationsEnabled() ??
    (await _notifications.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()?.checkPermissions())?.isEnabled ??
    true;

/// A push that arrived with the app in the foreground, shown here (FCM won't) under the server's own tag, so a replay collapses into it.
Future<void> showPush(PushNotice n) async {
  if (!await _allowed()) return;
  await _notifications.show(
      id: n.tag.hashCode & 0x7fffffff,
      title: n.title,
      body: n.body,
      notificationDetails: NotificationDetails(android: AndroidNotificationDetails('favorite_alerts', 'Favorites on the menu', tag: n.tag, styleInformation: BigTextStyleInformation(n.body)), iOS: const DarwinNotificationDetails()),
      payload: n.title, // the dish: a tap on it opens its sheet
    );
}

/// Start-up: plugin set-up, and the old check cancelled. The notification that launched the app is held like any tap before the app listens,
/// and lands the same way (Shell takes it).
Future<void> startAlerts() async {
  await cancelRetiredCheck();
  await _initNotifications();
  if ((await _notifications.getNotificationAppLaunchDetails())?.notificationResponse?.payload case final dish?) _tapped(dish);
}

/// The WorkManager check Notify me used to schedule is gone; an install from before it still has the job, which would keep waking the app.
Future<void> cancelRetiredCheck({Future<void> Function(String)? cancel}) async {
  try {
    await (cancel ?? Workmanager().cancelByUniqueName)(alertTask);
  } catch (e) {
    debugPrint('retired check: $e'); // nothing scheduled, or no plugin (a test)
  }
}

const _os = MethodChannel('com.udinetogether.udine/alerts');

/// The device's side of Notify me. Every call that fails (no plugin: a test, a recorded route) answers as "nothing known": allowed, no settings page.
class PlatformAlertsOs implements AlertsOs {
  Future<T> _try<T>(Future<T> Function() f, T otherwise) async {
    try {
      return await f();
    } catch (e) {
      debugPrint('alerts os: $e');
      return otherwise;
    }
  }

  @override
  Future<bool> allowed() => _try(_allowed, true);

  @override
  Future<bool> request() => _try(() async {
        final android = _notifications.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
        if (android != null) return await android.requestNotificationsPermission() ?? false;
        final ios = _notifications.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>();
        return await ios?.requestPermissions(alert: true, badge: true, sound: true) ?? false;
      }, false);

  @override
  Future<void> openSettings() => _try(() => _os.invokeMethod<void>('openSettings'), null);
}
