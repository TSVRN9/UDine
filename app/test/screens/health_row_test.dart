// The You row for Health Connect / Apple Health and each of its states (flutter-port-health Task 2).
import 'dart:ui' show AppLifecycleState;

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/health/health_client.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'health_support.dart';
import 'support.dart';
import 'you_support.dart';

Finder get row => find.widgetWithText(CheckRow, 'Write to Health Connect');
bool checked(WidgetTester t, Finder f) => t.widget<CheckRow>(f).on;

void main() {
  setUpAll(loadFonts);

  testWidgets('off: under Track what I eat, "Each meal you log", unchecked, no button', (t) async {
    final b = await bootYou(t, History.none);
    await bootHealth(t, b);
    await openYou(t, b);
    expect(row, findsOneWidget);
    expect(find.text('Each meal you log'), findsOneWidget);
    expect(checked(t, row), isFalse);
    expect(find.byType(Button), findsNothing);
    expect(t.getRect(row).top, t.getRect(find.widgetWithText(CheckRow, 'Track what I eat')).bottom);
    await drain(t);
  });

  testWidgets('tracking off: the row is absent', (t) async {
    final b = await bootYou(t, History.none);
    await bootHealth(t, b);
    await t.runAsync(() => b.prefs.setTrack(false));
    await openYou(t, b);
    expect(find.widgetWithText(CheckRow, 'Track what I eat'), findsOneWidget);
    await t.runAsync(() => b.prefs.setTrack(true));
    await t.pumpAndSettle();
    expect(row, findsOneWidget); // (back on, it is still there)
    await t.runAsync(() => b.prefs.setTrack(false));
    await t.pumpAndSettle();
    expect(find.textContaining('Health Connect'), findsNothing);
    await drain(t);
  });

  testWidgets('no store, no health book: no row', (t) async {
    final b = await bootYou(t, History.none);
    await openYou(t, b);
    expect(find.textContaining('Health Connect'), findsNothing);
    await drain(t);
  });

  testWidgets('allowed: a tap raises the permission sheet at once and the check fills; a second tap turns it off', (t) async {
    final b = await bootYou(t, History.none);
    final os = await bootHealth(t, b);
    await openYou(t, b);
    await t.tap(row);
    await wrote(t);
    expect(os.status, HealthAccess.granted);
    expect(checked(t, row), isTrue);
    expect(find.text('Each meal you log'), findsOneWidget);
    expect(await t.runAsync(() => b.store!.healthOn()), isTrue);
    await t.tap(row);
    await wrote(t);
    expect(checked(t, row), isFalse);
    expect(await t.runAsync(() => b.store!.healthOn()), isFalse);
    await drain(t);
  });

  testWidgets('denied: the check stays empty, the line says so, and Open Health Connect opens its settings', (t) async {
    final b = await bootYou(t, History.none);
    final os = await bootHealth(t, b, health: 'deny');
    await openYou(t, b);
    await t.tap(row);
    await wrote(t);
    expect(checked(t, row), isFalse);
    expect(find.text("Health Connect didn't allow it"), findsOneWidget);
    expect(find.text('Each meal you log'), findsNothing);
    await t.tap(find.widgetWithText(Button, 'Open Health Connect'));
    await t.pump();
    expect(os.opened, 1);
    await drain(t);
  });

  testWidgets('revoked, found when the app opens: the denied state with "Not allowed in Health Connect any more"', (t) async {
    final b = await bootYou(t, History.none);
    await bootHealth(t, b, health: 'revoked');
    await openYou(t, b);
    expect(checked(t, row), isFalse);
    expect(find.text('Not allowed in Health Connect any more'), findsOneWidget);
    expect(find.widgetWithText(Button, 'Open Health Connect'), findsOneWidget);
    await drain(t);
  });

  testWidgets('revoked in system settings while UDine was away: found on resume', (t) async {
    final b = await bootYou(t, History.none);
    final os = await bootHealth(t, b);
    await openYou(t, b);
    await t.tap(row);
    await wrote(t);
    expect(checked(t, row), isTrue);
    os.status = HealthAccess.denied; // (the user takes it away in Health Connect)
    for (final s in [AppLifecycleState.inactive, AppLifecycleState.hidden, AppLifecycleState.paused, AppLifecycleState.hidden, AppLifecycleState.inactive, AppLifecycleState.resumed]) {
      t.binding.handleAppLifecycleStateChanged(s);
    }
    await wrote(t);
    expect(checked(t, row), isFalse);
    expect(find.text('Not allowed in Health Connect any more'), findsOneWidget);
    await drain(t);
  });

  testWidgets('revoked in system settings, found when You is shown', (t) async {
    final b = await bootYou(t, History.none);
    final os = await bootHealth(t, b);
    await openYou(t, b);
    await t.tap(row);
    await wrote(t);
    os.status = HealthAccess.denied;
    await t.tap(find.bySemanticsLabel('Halls').first);
    await t.pumpAndSettle();
    await t.tap(find.bySemanticsLabel('You').first);
    await wrote(t);
    expect(find.text('Not allowed in Health Connect any more'), findsOneWidget);
    await drain(t);
  });

  testWidgets('iOS names Apple Health and offers Open Settings', (t) async {
    final b = await bootYou(t, History.none);
    await bootHealth(t, b, os: 'ios', health: 'deny');
    await openYou(t, b);
    await t.tap(find.widgetWithText(CheckRow, 'Write to Apple Health'));
    await wrote(t);
    expect(find.text("Apple Health didn't allow it"), findsOneWidget);
    expect(find.widgetWithText(Button, 'Open Settings'), findsOneWidget);
    await drain(t);
  });

  for (final h in ['unsupported']) {
    testWidgets('Health Connect not there ($h): no row', (t) async {
      final b = await bootYou(t, History.none);
      await bootHealth(t, b, health: h);
      await openYou(t, b);
      expect(find.textContaining('Health Connect'), findsNothing);
      expect(t.getRect(find.widgetWithText(CheckRow, 'Track what I eat')).height, 56.0);
      await drain(t);
    });
  }
}
