import 'dart:async';

import 'package:flutter/foundation.dart' show debugPrint, visibleForTesting;
import 'package:flutter/services.dart' show MethodChannel;

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:http/http.dart' as http;
import 'package:sqflite/sqflite.dart' show DatabaseFactory;
import 'package:workmanager/workmanager.dart';

import '../core/store/db.dart';
import '../core/store/store.dart';
import '../data/repository.dart';
import '../data/source.dart';
import 'alert_check.dart';
import 'alerts_os.dart';

/// The one periodic task. Android: WorkManager's unique work name (15 minutes is its floor). iOS: the BGTaskScheduler identifier,
/// which Info.plist lists and AppDelegate registers; iOS decides when it runs, if at all.
const alertTask = 'com.udinetogether.udine.favoriteAlerts';

final _notifications = FlutterLocalNotificationsPlugin();

/// A tap on a notification while the app is running; Shell (shell.dart) lands the route.
final alertTaps = StreamController<String>.broadcast();
String? _heldTap;

/// A tap that arrived before the app listened (the OS restarting a killed process on the notification's intent), once.
String? takeHeldTap() {
  final t = _heldTap;
  _heldTap = null;
  return t;
}

@visibleForTesting
void debugTapForTest(String route) => _tapped(route);

void _tapped(String route) => alertTaps.hasListener ? alertTaps.add(route) : _heldTap = route;

Future<void> _initNotifications() => _notifications.initialize(
      settings: const InitializationSettings(
        android: AndroidInitializationSettings('ic_stat_alert'),
        // The OS permission sheet is asked for by the Favorites row (Task 2), never at start-up.
        iOS: DarwinInitializationSettings(requestAlertPermission: false, requestBadgePermission: false, requestSoundPermission: false),
      ),
      onDidReceiveNotificationResponse: (r) {
        if (r.payload case final route?) _tapped(route);
      },
    );

/// Whether the OS will show a notification now (permission granted, not blocked).
Future<bool> _allowed() async =>
    await _notifications.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()?.areNotificationsEnabled() ??
    (await _notifications.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()?.checkPermissions())?.isEnabled ??
    true;

Future<void> _post(AlertNotice n) async {
  if (!await _allowed()) throw StateError('notifications are off');
  await _notifications.show(
      id: n.dishName.hashCode & 0x7fffffff,
      title: n.dishName,
      body: n.body,
      // BigText: a body naming several places expands instead of being cut off at two lines
      notificationDetails: NotificationDetails(android: AndroidNotificationDetails('favorite_alerts', 'Favorites on the menu', styleInformation: BigTextStyleInformation(n.body)), iOS: const DarwinNotificationDetails()),
      payload: n.route,
    );
}

/// The background check's own connection to udine.db, apart from the app's (see openStore's singleInstance).
Future<StoreOpen> openAlertStore({String? path, DatabaseFactory? factory}) async =>
    openStore(path ?? await udineDbPath(), factory: factory, singleInstance: false);

/// The background isolate's entry: the same store and cache as the app, the repository's own offline-first reads.
@pragma('vm:entry-point')
void alertsDispatcher() => Workmanager().executeTask((task, _) async {
      final opened = await openAlertStore();
      if (opened is! StoreReady) return true; // written by a newer build: leave it alone
      final client = http.Client();
      try {
        await _initNotifications();
        final repo = Repository(UmassSource(client), opened.db);
        await runAlertCheck(store: UdineStore(opened.db), now: repo.now, loadBoard: (day) => loadAlertBoard(repo, day), notify: _post);
        return true;
      } finally {
        client.close();
        await opened.db.close();
      }
    });

/// Start-up: plugin set-up and the schedule following the switch. The notification that launched the app is held like any tap before the
/// app listens, and lands the same way (Shell takes it).
Future<void> startAlerts({required bool on}) async {
  await _initNotifications();
  await Workmanager().initialize(alertsDispatcher);
  await setAlertsScheduled(on);
  if ((await _notifications.getNotificationAppLaunchDetails())?.notificationResponse?.payload case final route?) _tapped(route);
}

/// Notify me on registers the check (the plugin's default frequency is the 15 minutes WorkManager allows); off cancels it.
Future<void> setAlertsScheduled(bool on) => on
    ? Workmanager().registerPeriodicTask(alertTask, alertTask, existingWorkPolicy: ExistingPeriodicWorkPolicy.keep)
    : Workmanager().cancelByUniqueName(alertTask);

const _os = MethodChannel('com.udinetogether.udine/alerts');

/// The device's side of Notify me. Every call that fails (no plugin: a test, a recorded route) answers as "nothing known": allowed, not
/// restricted, no settings page, no schedule.
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
  Future<bool> backgroundRestricted() => _try(() async => await _os.invokeMethod<bool>('backgroundRestricted') ?? false, false);

  @override
  Future<void> openSettings(AlertsSettings page) => _try(() => _os.invokeMethod<void>('openSettings', page.name), null);

  @override
  Future<void> schedule(bool on) => _try(() => setAlertsScheduled(on), null);
}
