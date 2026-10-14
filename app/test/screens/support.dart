import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/boot.dart';
import 'package:udine/app.dart';
import 'package:udine/core/hours.dart';
import 'package:udine/core/store/db.dart';
import 'package:udine/core/store/store.dart';
import 'package:udine/data/recorded/recorded.dart';
import 'package:udine/shell/prefs.dart';

/// M2's fixed clock, Thursday October 8, 12:41 Eastern (lunch), wherever the machine is.
final lunch = easternInstant(DateTime.utc(2026, 10, 8, 12, 41));

Future<String> readRecorded(String name) => File('assets/recorded/$name').readAsString();

/// The app's `Boot` over M2's recordings and a throwaway store, as `Boot.open` builds it for a recorded route. Real I/O (sqlite on an
/// isolate) runs under `runAsync`.
Future<Boot> bootRecorded(WidgetTester t, {NetMode net = NetMode.ok, DateTime? at, List<String> pins = const [], bool charlesRiver = false, Duration? slow}) async {
  return (await t.runAsync(() async {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
    final db = (await openStore(inMemoryDatabasePath)) as StoreReady;
    addTearDown(db.db.close); // sqflite shares one in-memory database per path: the next test must not inherit this one's cache
    final store = UdineStore(db.db);
    await store.setCharlesRiver(charlesRiver);
    final repo = await recordedRepository(RecordedFlags(at: at ?? lunch, net: net), db.db, read: readRecorded, slow: slow);
    return Boot(repo, store, await AppPrefs.load(store, pins: pins));
  }))!;
}

void phone(WidgetTester t, {double w = 390, double h = 844}) {
  t.view.physicalSize = Size(w, h);
  t.view.devicePixelRatio = 1;
  addTearDown(t.view.reset);
}

/// Pumps real time for the store and the stream, and frames, until `done` holds.
Future<void> until(WidgetTester t, bool Function() done, {int tries = 120, Duration frame = const Duration(milliseconds: 16)}) async {
  for (var i = 0; i < tries && !done(); i++) {
    await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 25)));
    await t.pump(frame);
  }
  expect(done(), isTrue, reason: 'never settled');
}

Future<void> openApp(WidgetTester t, Boot boot, {String route = '/halls', double w = 390, double h = 844, bool reduced = false}) async {
  phone(t, w: w, h: h);
  t.platformDispatcher.accessibilityFeaturesTestValue = FakeAccessibilityFeatures(disableAnimations: reduced);
  addTearDown(t.platformDispatcher.clearAccessibilityFeaturesTestValue);
  await t.pumpWidget(UdineApp(initialRoute: route, boot: boot));
}

String recordedLocations() => jsonEncode(jsonDecode(File('assets/recorded/locations-2026-10-11.json').readAsStringSync()));
