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
import 'package:udine/data/pdf_pages.dart';
import 'package:udine/data/recorded/recorded.dart';
import 'package:udine/shell/prefs.dart';
import 'package:udine/motion/routes.dart';
import 'package:udine/screens/halls/halls_screen.dart';
import 'package:udine/screens/halls/hall_page.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/ui/ui.dart' show Photos;

/// M2's fixed clock, Thursday October 8, 12:41 Eastern (lunch), wherever the machine is.
final lunch = easternInstant(DateTime.utc(2026, 10, 8, 12, 41));

Future<String> readRecorded(String name) => File('assets/recorded/$name').readAsString();

/// The app's `Boot` over M2's recordings and a throwaway store, as `Boot.open` builds it for a recorded route. Real I/O (sqlite on an
/// isolate) runs under `runAsync`.
Future<Boot> bootRecorded(WidgetTester t, {NetMode net = NetMode.ok, DateTime? at, List<String> pins = const [], bool charlesRiver = false, Duration? slow, bool health = false, bool carbon = false, bool persistPins = false, List<String> avoid = const [], List<String> onlyShow = const [], PdfOpen? pages, bool pdfsLinked = true}) async {
  return (await t.runAsync(() async {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
    final db = (await openStore(inMemoryDatabasePath)) as StoreReady;
    addTearDown(db.db.close); // sqflite shares one in-memory database per path: the next test must not inherit this one's cache
    final store = UdineStore(db.db);
    await store.setCharlesRiver(charlesRiver);
    await store.setScores(healthfulness: health, carbon: carbon);
    if (avoid.isNotEmpty) await store.setAvoid(avoid);
    if (onlyShow.isNotEmpty) await store.setOnlyShow(onlyShow);
    // the recorded PDFs are UMass's and never in the repo: a test's are synthetic, and its pages are drawn by [pages]
    final repo = await recordedRepository(RecordedFlags(at: at ?? lunch, net: net), db.db, read: readRecorded, slow: slow, pins: pins, readPdf: (_) async => pdfsLinked ? utf8.encode('%PDF-1.4\n%synthetic\n') : throw 'not linked', pdfDir: Directory.systemTemp.createTempSync('udine-test-pdf'));
    return Boot(repo, store, await AppPrefs.load(store, pins: persistPins ? null : pins), pdfOpen: pages ?? pdfxOpen);
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
  Photos.enabled = false; // goldens draw none, whatever a developer has linked into assets/photos
  phone(t, w: w, h: h);
  t.platformDispatcher.accessibilityFeaturesTestValue = FakeAccessibilityFeatures(disableAnimations: reduced);
  addTearDown(t.platformDispatcher.clearAccessibilityFeaturesTestValue);
  await t.pumpWidget(UdineApp(initialRoute: route, boot: boot));
}

/// Lets the repository's real I/O (sqlite on an isolate) land before a test that opened a hall page ends: its calls start inside the
/// fake-async zone, and a query still running when the test is over leaves sqflite's 10 s timer pending.
Future<void> drain(WidgetTester t) async {
  for (var i = 0; i < 4; i++) {
    await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 60)));
    await t.pump();
  }
}

/// Opens `route` (`/hall/worcester?meal=lunch&day=2026-10-10`) and waits for the hall's list or the line that stands for it.
Future<void> openHall(WidgetTester t, Boot boot, String route, {double w = 390, double h = 844, bool reduced = false}) async {
  await openApp(t, boot, route: route, w: w, h: h, reduced: reduced);
  await until(t, () => find.byType(DishRow).evaluate().isNotEmpty || find.textContaining(RegExp(r'^(No menu posted|You.re offline|.* menu .*didn.t load)')).evaluate().isNotEmpty);
  await t.pumpAndSettle();
}

/// Opens any place's menu page (`W`, `c3`) by a push over Halls, as a café page will host it, and waits for its list.
Future<void> openPlace(WidgetTester t, Boot boot, String place, {double w = 390, double h = 844, int day = 0, String? meal}) async {
  await openApp(t, boot, w: w, h: h);
  await t.pump();
  Nav.push<void>(t.element(find.byType(HallsScreen)), (_) => HallMenuPage(place: place, top: 24, day: day, meal: meal));
  await t.pump();
  await until(t, () => find.byType(DishRow).evaluate().isNotEmpty || find.textContaining(RegExp(r'^(No menu posted|You.re offline|.* menu .*didn.t load)')).evaluate().isNotEmpty);
  await t.pumpAndSettle();
}
