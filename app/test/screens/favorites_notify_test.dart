// The Favorites "Notify me" row (M2 R11 §2) as a user meets it: each state's words and button, what a tap asks of the OS, what Open Settings
// opens, and when the permission is read again. The OS is a fake; the row is the page's own.
import 'package:flutter/foundation.dart' show TargetPlatform, debugDefaultTargetPlatformOverride;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/alerts/alerts_os.dart';
import 'package:udine/ui/ui.dart';
import '../alerts/fake_os.dart';
import '../fonts.dart';
import 'support.dart';
import 'you_support.dart';

const _off = "When a favorite is on today's menu", _denied = 'Notifications are off for UDine';
const _battery = "Battery use is restricted, so UDine can't check menus";

bool _checked(WidgetTester t) => t.widget<CheckRow>(find.widgetWithText(CheckRow, 'Notify me')).on;
Finder get _settings => find.text('Open Settings');

Future<void> _favs(WidgetTester t, FakeAlertsOs os, {bool on = false, bool track = true}) async {
  final b = await bootYou(t, History.full, os, on, track);
  await t.runAsync(() => b.prefs.toggleFavorite('Golden BBQ Chicken Thigh'));
  await openYou(t, b, route: '/you/favs');
  await placesLoaded(t);
}

Future<void> _settle(WidgetTester t) async {
  await wrote(t);
}

void main() {
  setUpAll(loadFonts);

  testWidgets('off: the row heads the page with its line, an empty check and no button', (t) async {
    await _favs(t, FakeAlertsOs());
    expect(find.text('Notify me'), findsOneWidget);
    expect(find.text(_off), findsOneWidget);
    expect(_checked(t), isFalse);
    expect(_settings, findsNothing);
    expect(t.getTopLeft(find.text('Notify me')).dy, lessThan(t.getTopLeft(find.text('Golden BBQ Chicken Thigh')).dy));
    await drain(t);
  });

  testWidgets('a tap raises the OS sheet at once and, allowed, fills the check', (t) async {
    final os = FakeAlertsOs();
    await _favs(t, os);
    await t.tap(find.text('Notify me'));
    await _settle(t);
    expect(os.requests, 1);
    expect(_checked(t), isTrue);
    expect(find.text(_off), findsOneWidget);
    expect(os.scheduled, [true]);
    await drain(t);
  });

  testWidgets('with no favourites the row is still there, over the empty line', (t) async {
    final b = await bootYou(t, History.full, FakeAlertsOs());
    await openYou(t, b, route: '/you/favs');
    expect(find.text('Notify me'), findsOneWidget);
    expect(find.textContaining('Star a dish'), findsOneWidget);
    await drain(t);
  });

  testWidgets('denied: the check stays empty; the line and Open Settings, which opens the notification page', (t) async {
    final os = FakeAlertsOs(willAllow: false);
    await _favs(t, os);
    await t.tap(find.text('Notify me'));
    await _settle(t);
    expect(_checked(t), isFalse);
    expect(find.text(_denied), findsOneWidget);
    expect(find.text(_off), findsNothing);
    await t.tap(_settings);
    await _settle(t);
    expect(os.opened, [AlertsSettings.notifications]);
    await drain(t);
  });

  testWidgets('blocked: every tap goes straight to denied (the OS answers without a sheet)', (t) async {
    final os = FakeAlertsOs(willAllow: false);
    await _favs(t, os);
    await t.tap(find.text('Notify me'));
    await _settle(t);
    await t.tap(find.text('Notify me'));
    await _settle(t);
    expect(os.requests, 2);
    expect(find.text(_denied), findsOneWidget);
    await drain(t);
  });

  testWidgets('revoked while away: found when the app resumes, as the denied state; allowed again, found checked', (t) async {
    final os = FakeAlertsOs(permitted: true);
    await _favs(t, os, on: true);
    expect(_checked(t), isTrue);
    os.permitted = false;
    t.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await _settle(t);
    expect(_checked(t), isFalse);
    expect(find.text(_denied), findsOneWidget);
    expect(_settings, findsOneWidget);
    os.permitted = true;
    t.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await _settle(t);
    expect(_checked(t), isTrue);
    expect(_settings, findsNothing);
    await drain(t);
  });

  testWidgets('revoked while the app is open on Halls: found when You is shown', (t) async {
    final os = FakeAlertsOs(permitted: true);
    final b = await bootYou(t, History.full, os, true);
    await t.runAsync(() => b.prefs.toggleFavorite('Golden BBQ Chicken Thigh'));
    await openApp(t, b, route: '/halls');
    await t.pumpAndSettle();
    os.permitted = false;
    await t.tap(find.text('You'));
    await _settle(t);
    expect(b.alerts.denied, isTrue);
    await drain(t);
  });

  testWidgets('revoked: found when Favorites is opened', (t) async {
    final os = FakeAlertsOs(permitted: true);
    final b = await bootYou(t, History.full, os, true);
    os.permitted = false;
    await openYou(t, b, route: '/you/favs');
    await _settle(t);
    expect(find.text(_denied), findsOneWidget);
    await drain(t);
  });

  testWidgets('background off on Android: the check stays on, the battery line, Open Settings opens App info', (t) async {
    final os = FakeAlertsOs(permitted: true, restricted: true);
    await _favs(t, os, on: true);
    expect(_checked(t), isTrue);
    expect(find.text(_battery), findsOneWidget);
    await t.tap(_settings);
    await _settle(t);
    expect(os.opened, [AlertsSettings.background]);
    await drain(t);
  });

  testWidgets('on iOS a restricted background shows no row, only the plain line', (t) async {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    await _favs(t, FakeAlertsOs(permitted: true, restricted: true), on: true);
    expect(find.text(_off), findsOneWidget);
    expect(find.textContaining('Background App Refresh'), findsNothing);
    expect(find.text(_battery), findsNothing);
    expect(_settings, findsNothing);
    expect(_checked(t), isTrue);
    debugDefaultTargetPlatformOverride = null;
    await drain(t);
  });

  testWidgets('turning it off: the check empties, and the schedule is cancelled', (t) async {
    final os = FakeAlertsOs(permitted: true);
    await _favs(t, os, on: true);
    await t.tap(find.text('Notify me'));
    await _settle(t);
    expect(_checked(t), isFalse);
    expect(os.scheduled, [false]);
    expect(os.requests, 0);
    await drain(t);
  });

  testWidgets('Track what I eat off keeps the row and its alerts', (t) async {
    final os = FakeAlertsOs(permitted: true);
    await _favs(t, os, on: true, track: false);
    expect(find.text('Notify me'), findsOneWidget);
    expect(_checked(t), isTrue);
    await drain(t);
  });

  testWidgets('You\'s Favorites row stays "1 dish": it says nothing of notifying', (t) async {
    final b = await bootYou(t, History.full, FakeAlertsOs(permitted: true), true);
    await t.runAsync(() => b.prefs.toggleFavorite('Golden BBQ Chicken Thigh'));
    await openYou(t, b);
    expect(find.text('1 dish'), findsOneWidget);
    expect(find.textContaining('notif'), findsNothing);
    await drain(t);
  });
}
