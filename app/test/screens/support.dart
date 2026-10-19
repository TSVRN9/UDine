import 'dart:async';
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
import 'package:http/http.dart' as http;
import 'package:udine/data/packaged.dart' show LookupDishSource;
import 'package:udine/data/pdf_pages.dart';
import 'package:udine/data/recorded/recorded.dart';
import 'package:udine/alerts/alerts_os.dart';
import 'package:udine/shell/alerts_model.dart';
import 'package:udine/shell/prefs.dart';
import '../alerts/fake_os.dart';
import 'package:udine/motion/routes.dart';
import 'package:udine/screens/halls/halls_screen.dart';
import 'package:udine/screens/halls/hall_page.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/core/m2/board.dart' show isCafe;
import 'package:udine/data/repository.dart' show HoursData;
import 'package:udine/data/states.dart';
import 'package:udine/ui/ui.dart' show Photos;

/// M2's fixed clock, Thursday October 8, 12:41 Eastern (lunch), wherever the machine is.
final lunch = easternInstant(DateTime.utc(2026, 10, 8, 12, 41));

Future<String> readRecorded(String name) => File('assets/recorded/$name').readAsString();

/// The app's `Boot` over M2's recordings and a throwaway store, as `Boot.open` builds it for a recorded route. Real I/O (sqlite on an
/// isolate) runs under `runAsync`.
Future<Boot> bootRecorded(WidgetTester t, {NetMode net = NetMode.ok, DateTime? at, List<String> pins = const [], bool charlesRiver = false, Duration? slow, bool health = false, bool carbon = false, bool track = true, bool firstRun = false, Set<String> savedCafes = const {}, bool persistPins = false, List<String> avoid = const [], List<String> onlyShow = const [], PdfOpen? pages, bool pdfsLinked = true, Future<String> Function(String)? read, Future<void> Function(String)? shareFlyer, bool foods = false, LookupMode lookup = LookupMode.found, bool packFail = false, bool busyLate = false, HangingClient? hangLookup, CountingClient? count, AlertsOs? alertsOs, bool alertsOn = false}) async {
  return (await t.runAsync(() async {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
    final db = (await openStore(inMemoryDatabasePath)) as StoreReady;
    addTearDown(db.db.close); // sqflite shares one in-memory database per path: the next test must not inherit this one's cache
    final store = UdineStore(db.db);
    await store.setCharlesRiver(charlesRiver);
    await store.setScores(healthfulness: health, carbon: carbon);
    await store.setTracking(track);
    await store.setFirstRunSeen(!firstRun); // (a recorded route marks it shown, as M2's own harnesses do)
    if (avoid.isNotEmpty) await store.setAvoid(avoid);
    if (onlyShow.isNotEmpty) await store.setOnlyShow(onlyShow);
    // the recorded PDFs are UMass's and never in the repo: a test's are synthetic, and its pages are drawn by [pages]
    final pdfDir = Directory.systemTemp.createTempSync('udine-test-pdf');
    addTearDown(() => pdfDir.deleteSync(recursive: true));
    final repo = await recordedRepository(RecordedFlags(at: at ?? lunch, net: net, savedCafes: savedCafes, busyLate: busyLate), db.db, read: read ?? readRecorded, slow: slow, pins: pins, readPdf: (_) async => pdfsLinked ? utf8.encode('%PDF-1.4\n%synthetic\n') : throw 'not linked', pdfDir: pdfDir);
    final flags = RecordedFlags(at: at ?? lunch, net: net, lookup: lookup, packFail: packFail);
    final r = await recordedPackaged(flags, read: read ?? readRecorded, wrap: count == null ? null : (inner) => count..inner = inner);
    await store.setAlertsOn(alertsOn);
    final boot = Boot(repo, store, await AppPrefs.load(store, pins: persistPins ? null : pins), alerts: await AlertsModel.load(store, alertsOs ?? FakeAlertsOs()), pdfOpen: pages ?? pdfxOpen, shareFlyer: shareFlyer, packaged: r.packaged, lookup: hangLookup == null ? r.lookup : LookupDishSource(hangLookup, now: () => lunch));
    if (foods) await boot.seedFoods(read ?? readRecorded);
    await boot.foods?.reload();
    return boot;
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

/// Lets a hall's busy reading land when one is coming (today's, at a hall with a live headcount): its header is the short one until it
/// does (M2 R13 `LATE_D`), and a test of the loaded page looks at the loaded one. Nothing waits for a café, another day or a page with no hours.
Future<void> landReading(WidgetTester t) async {
  final menu = find.byType(HallMenu);
  if (menu.evaluate().isEmpty) return;
  final s = t.state<HallMenuState>(menu.first), h = s.c.hours;
  if (s.debugDay != 0 || isCafe(s.place) || h is! Loaded<HoursData> || h.value.busy == null) return;
  for (var i = 0; i < 80 && s.c.busy == null; i++) {
    await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 5)));
    await t.pump(const Duration(milliseconds: 16));
  }
  await t.pumpAndSettle();
}

/// Opens `route` (`/hall/worcester?meal=lunch&day=2026-10-10`) and waits for the hall's list or the line that stands for it.
Future<void> openHall(WidgetTester t, Boot boot, String route, {double w = 390, double h = 844, bool reduced = false}) async {
  await openApp(t, boot, route: route, w: w, h: h, reduced: reduced);
  await until(t, () => find.byType(DishRow).evaluate().isNotEmpty || find.textContaining(RegExp(r'^(No menu posted|You.re offline|.* menu .*didn.t load)')).evaluate().isNotEmpty);
  await t.pumpAndSettle();
  await landReading(t);
}

/// Opens any place's menu page (`W`, `c3`) by a push over Halls, as a café page will host it, and waits for its list.
Future<void> openPlace(WidgetTester t, Boot boot, String place, {double w = 390, double h = 844, int day = 0, String? meal}) async {
  await openApp(t, boot, w: w, h: h);
  await t.pump();
  Nav.push<void>(t.element(find.byType(HallsScreen)), (_) => HallMenuPage(place: place, top: 24, day: day, meal: meal));
  await t.pump();
  await until(t, () => find.byType(DishRow).evaluate().isNotEmpty || find.textContaining(RegExp(r'^(No menu posted|You.re offline|.* menu .*didn.t load)')).evaluate().isNotEmpty);
  await t.pumpAndSettle();
  await landReading(t);
}

/// A network that has not answered yet: a request waits until [release] (so a state that is "in flight" can be looked at).
class HangingClient extends http.BaseClient {
  final _c = Completer<http.StreamedResponse>();
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) => _c.future;
  void release() => _c.complete(http.StreamedResponse(const Stream.empty(), 500));
}

/// Every request that reaches the network boundary, counted (the packaged and lookup sources are built over it).
class CountingClient extends http.BaseClient {
  late http.Client inner;
  final urls = <Uri>[];
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) {
    urls.add(request.url);
    return inner.send(request);
  }
}
