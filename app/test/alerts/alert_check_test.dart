import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/alerts/alert_check.dart';
import 'package:udine/core/date.dart';
import 'package:udine/core/m2/board.dart';
import 'package:udine/core/m2/where.dart';
import 'package:udine/core/store/db.dart';
import 'package:udine/core/store/store.dart';
import 'package:udine/core/types.dart';

import '../core/m2/support.dart';

const thigh = 'Golden BBQ Chicken Thigh';
DateTime at(String hhmm, [String day = '2026-10-08']) => DateTime.parse('${day}T$hhmm:00');

void main() {
  sqfliteFfiInit();
  late UdineStore store;
  late List<AlertNotice> sent;
  late Directory dir;
  setUp(() async {
    dir = Directory.systemTemp.createTempSync('udine_alerts');
    store = UdineStore(((await openStore('${dir.path}/SQLite/udine.db', factory: databaseFactoryFfi)) as StoreReady).db);
    await store.setAlertsOn(true);
    await store.addFavorite(DishFavorite(thigh));
    sent = [];
  });
  tearDown(() async {
    await store.db.close();
    dir.deleteSync(recursive: true);
  });

  Future<int> run(DateTime now) => runAlertCheck(store: store, now: () => now, loadBoard: (_) async => board, notify: (n) async => sent.add(n));

  test('a favourited dish on today\'s menu posts one notice: the name, then where and when, every serving today in one body', () async {
    expect(await run(at('12:41')), 1);
    expect(sent.single.dishName, thigh);
    expect(sent.single.body, 'Lunch now, until 4:30 PM, at Worcester\nDinner from 4:30 PM, at Worcester');
    expect(sent.single.route, '/hall/worcester?meal=lunch&day=2026-10-08&dish=Golden+BBQ+Chicken+Thigh');
    expect(Uri.parse(sent.single.route).queryParameters['dish'], thigh);
  });

  test('once per dish per day: a later check, or another process, posts nothing; the next day it posts again', () async {
    expect(await run(at('12:41')), 1);
    expect(await run(at('13:11')), 0);
    expect(await store.claimAlert(thigh, '2026-10-08'), isFalse);
    expect(sent, hasLength(1));
    expect(await store.alertsSent(), hasLength(1));
    // the 2 AM rollover: 01:30 on the 9th is still the 8th
    expect(effectiveTodayIso(at('01:30', '2026-10-09'), defaultRolloverHour), '2026-10-08');
    expect(await store.claimAlert(thigh, '2026-10-09'), isTrue);
  });

  test('a dish served by two halls in the same window says both, in one notice', () async {
    final now = at('12:41');
    final shared = {
      for (final h in ['W', 'F', 'H', 'B'])
        for (final st in board.days['2026-10-08']![h]!['lunch'] ?? <Station>[]) for (final d in st.dishes) d.dishName: <String>{},
    }.keys.firstWhere((n) => wherePlan(board, n, now).any((g) => g.halls.where((h) => halls.contains(h)).length >= 2));
    await store.removeFavorite(DishFavorite(thigh));
    await store.addFavorite(DishFavorite(shared));
    expect(await run(now), 1);
    final first = wherePlan(board, shared, now).first;
    expect(sent.single.body.split('\n').first, contains(' at ${[for (final h in first.halls) placeName(board, h)].sublist(0, first.halls.length - 1).join(', ')} and '));
  });

  test('tomorrow\'s servings are not in the body (the board carries tomorrow\'s menu)', () async {
    final now = at('12:41');
    // a dish still to be served today in a hall that is served tomorrow too
    final dish = {
      for (final h in halls) for (final st in board.days['2026-10-08']![h]!.values.expand((s) => s)) for (final d in st.dishes) d.dishName,
    }.firstWhere((n) {
      final plan = wherePlan(board, n, now);
      return plan.any((g) => g.day == 0) && plan.any((g) => g.day == 1);
    });
    await store.removeFavorite(DishFavorite(thigh));
    await store.addFavorite(DishFavorite(dish));
    await run(now);
    final today = wherePlan(board, dish, now).where((g) => g.day == 0).length;
    expect(sent.single.body, isNot(contains('Tomorrow')));
    expect(sent.single.body.split('\n'), hasLength(today));
  });

  test('nothing while Notify me is off, or with no dish favourited', () async {
    await store.setAlertsOn(false);
    expect(await run(at('12:41')), 0);
    await store.setAlertsOn(true);
    await store.removeFavorite(DishFavorite(thigh));
    await store.addFavorite(LocationFavorite(1));
    expect(await run(at('12:41')), 0);
    expect(sent, isEmpty);
  });

  test('not before 7 AM, and the dish is not spent by waiting', () async {
    expect(await run(at('06:59')), 0);
    expect(await store.alertsSent(), isEmpty);
    expect(await run(at('07:00')), 1);
    expect(sent.single.body, startsWith('Lunch from 11 AM'));
  });

  test('never once the dish\'s last serving that day has ended', () async {
    expect(await run(at('23:30')), 0);
    expect(sent, isEmpty);
    expect(await store.alertsSent(), isEmpty);
  });

  test('with no hours or menus to read (offline, nothing saved) it posts nothing and spends nothing', () async {
    expect(await runAlertCheck(store: store, now: () => at('12:41'), loadBoard: (_) async => null, notify: (n) async => sent.add(n)), 0);
    expect(await store.alertsSent(), isEmpty);
  });
}
