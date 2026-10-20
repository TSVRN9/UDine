import 'dart:convert' show jsonDecode;
import 'dart:io' show Directory;

import 'package:flutter/foundation.dart' show debugPrint, visibleForTesting;
import 'package:flutter/scheduler.dart' show SchedulerBinding;
import 'package:flutter/widgets.dart' show Widget;
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

import 'core/health/health_client.dart';
import 'core/hours.dart';
import 'core/m2/history.dart' show mealTitle;
import 'core/m2/bowl.dart' show Bowl;
import 'core/m2/bowl_builder.dart' show BowlSpec, bowlNow;
import 'core/m2/variants.dart' as core_variants;
import 'core/m2/board.dart' show Macro, dishKey, halls, MenuItem, M2MenuItem;
import 'core/types.dart' show MealPeriod;
import 'core/store/db.dart';
import 'core/store/log_book.dart';
import 'core/store/store.dart';
import 'data/flyer.dart';
import 'data/recorded/recorded.dart';
import 'data/recorded/simulated_health.dart';
import 'dev/log_seed.dart';
import 'data/packaged.dart';
import 'data/pdf_cache.dart';
import 'data/pdf_pages.dart';
import 'data/repository.dart';
import 'data/source.dart';
import 'data/supabase_source.dart';
import 'motion/routes.dart';
import 'screens/hall/hall_controller.dart' show mealsOfItems;
import 'screens/plate/plate_sheet.dart' show plateBoard;
import 'core/saved_food.dart';
import 'alerts/alerts.dart' show PlatformAlertsOs;
import 'alerts/push.dart' show PushSync;
import 'alerts/push_firebase.dart' show FirebaseMessagingClient;
import 'alerts/alerts_os.dart';
import 'shell/alerts_model.dart';
import 'shell/app_scope.dart';
import 'shell/food_book.dart';
import 'shell/health_book.dart';
import 'shell/plate_model.dart';
import 'shell/prefs.dart';
import 'shell/share.dart';
import 'ui/photo.dart' show Photos;

/// `?pins=N` (screenshots; M2's own flag): the first N of M2's five, held in memory and never saved. In recorded mode `?pins=A,B` names them.
const _fivePins = ['Wasabi', 'Tamales', "Peet's Coffee & Tea", 'Harvest Market', 'Procrastination Station'];

/// What the app runs on: the device store, the repository (UMass and Supabase live, or M2's recordings with a fixed clock and
/// network from the route's `?data=recorded&at=&net=`), and the preferences. Recorded mode keeps everything in a throwaway
/// in-memory store so a capture never reads or leaves anything on the device.
class Boot {
  Boot(this.repo, this.store, this.prefs, {AlertsModel? alerts, this.pdfOpen = pdfxOpen, FlyerShare? shareFlyer, this.packaged, this.lookup}) : shareFlyer = shareFlyer ?? shareFlyerFile, alerts = alerts ?? AlertsModel(store, PlatformAlertsOs());

  /// OpenFoodFacts / USDA and Search UMass Dining (live: the real endpoints; recorded: M2's recordings)
  final PackagedSource? packaged;
  final LookupDishSource? lookup;
  final PdfOpen pdfOpen;
  /// the OS share sheet Export hands its files to; a test replaces it
  @visibleForTesting
  ShareFiles share = shareFiles;
  final FlyerShare shareFlyer;
  final Repository repo;

  /// The device store; null when the file was written by a newer build (menus only, below).
  final UdineStore? store;
  final AppPrefs prefs;
  /// Notify me. A Boot built without one (a test) starts off, over the device's own OS calls.
  final AlertsModel alerts;
  final hider = BandHider();
  /// The log You reads (null with no store: menus only). Held in memory, read once at launch and again after anything writes to it.
  late final LogBook? log = store == null ? null : LogBook(store!, now: repo.now);
  /// Your foods (null with no store). Read once at launch and again after anything writes to it.
  late final FoodBook? foods = store == null ? null : FoodBook(store!, now: repo.now);
  /// Write to Health Connect / Apple Health (null with no store). Opened last, once the log is read, so what was logged before it is never written.
  HealthBook? health;
  late final plate = PlateModel(tracking: () => prefs.track, write: store?.addEntries, readDay: store?.entriesForDay, now: repo.now, changed: log?.reload);

  /// The user's database was saved by a newer build (they installed an older one): the file is never opened for writing, tracking
  /// stays off, and nothing the user does is saved. Menus, hours and busy work as ever, cached in a throwaway in-memory database.
  bool get menusOnly => store == null;

  /// M2's `VARN`, filled at load: the names of family variants in the menus saved on the device, so a logged "20 oz Cappuccino" reads
  /// "Cappuccino, 20 oz" whatever has been opened since launch. Reads the saved menus only; nothing is fetched and the log is unchanged.
  ///
  /// It starts once the first frame is out (the parse is not the launch's), and once the names are in the log's screens are told, so a
  /// You page, a day or a meal built before they landed re-reads them.
  Future<void> primeShownNames() async {
    try {
      await SchedulerBinding.instance.endOfFrame;
      for (final m in await repo.savedMenus()) {
        core_variants.primeShownNames(mealsOfItems(m).values.expand((s) => s));
      }
      await log?.reload();
    } catch (e) {
      debugPrint('udine: saved menus not read for variant names: $e');
    }
  }

  /// [dbPath] and [read] (the recordings' reader) are test seams (the device path and the app bundle by default).
  static Future<Boot> open(String route, {String? dbPath, Future<String> Function(String name)? read, TempDir tmp = getTemporaryDirectory, AlertsOs? alertsOs}) async {
    await clearExports(tmp: tmp); // last session's exports: plaintext copies of the log, not kept past the next start
    if (photosOff(route)) Photos.enabled = false;
    final flags = recordedFlags(route);
    final pinsQuery = Uri.parse(route).queryParameters['pins'], pinsFlag = int.tryParse(pinsQuery ?? '');
    final (cache, store) = await openDb(dbPath: flags != null ? inMemoryDatabasePath : (dbPath ?? await udineDbPath()));
    if (flags != null) {
      await store?.setScores(healthfulness: flags.scores.health, carbon: flags.scores.carbon);
      await store?.setTracking(!flags.trackOff);
      await store?.setFirstRunSeen(!flags.firstRun);
      if (flags.avoid.isNotEmpty) await store?.setAvoid(flags.avoid);
      if (flags.onlyShow.isNotEmpty) await store?.setOnlyShow(flags.onlyShow);
      if (Uri.parse(route).queryParameters['alerts'] == 'on') await store?.setAlertsOn(true); // Notify me stored on, as for a user who turned it on
    }
    final alerts = await AlertsModel.load(store, alertsOs ?? PlatformAlertsOs(), push: store != null && alertsOs == null && flags == null ? PushSync(store, FirebaseMessagingClient()) : null);
    final prefs = await AppPrefs.load(store, pins: pinsFlag != null ? _fivePins.take(pinsFlag).toList() : flags != null && pinsQuery != null ? pinsQuery.split(',') : null);
    // recorded routes only: `fav=Dish A|Dish B` starts with those favourites (the Halls stars are drawn from them)
    if (flags != null) {
      for (final n in (Uri.parse(route).queryParameters['fav'] ?? '').split('|').where((n) => n.isNotEmpty)) {
        await prefs.toggleFavorite(n);
      }
    }
    final Repository repo;
    if (flags != null) {
      // `at` is Eastern wall-clock time, as M2 reads it, wherever the device is
      final a = flags.at;
      repo = await recordedRepository(RecordedFlags(at: a == null ? null : easternInstant(DateTime.utc(a.year, a.month, a.day, a.hour, a.minute)), net: flags.net, savedPdfs: flags.savedPdfs, savedCafes: flags.savedCafes, noEvents: flags.noEvents, busyLate: flags.busyLate), cache, pins: prefs.pins, read: read);
    } else {
      final client = http.Client();
      repo = Repository(UmassSource(client), cache, supabase: SupabaseSource(client), pdfs: PdfCache(Directory('${(await getApplicationSupportDirectory()).path}/pdf'), client));
    }
    if (flags == null) repo.launch(pins: prefs.pins); // warm today and tomorrow; never throws
    final Boot boot;
    if (flags != null) {
      final r = await recordedPackaged(flags, read: read);
      boot = Boot(repo, store, prefs, alerts: alerts, packaged: r.packaged, lookup: r.lookup);
    } else {
      final client = http.Client();
      boot = Boot(repo, store, prefs, alerts: alerts, packaged: PackagedSource(client), lookup: LookupDishSource(client));
    }
    if (flags != null && flags.seedFoods) await boot.seedFoods(read);
    await boot.log?.reload();
    await boot.foods?.reload();
    if (flags == null) boot.primeShownNames(); // (not awaited, and after the first frame: past meals read a family's names once the saved menus are read)
    if (flags != null) await boot.seedLog(route);
    if (flags != null) await boot.seedPlate(route); // (recorded data only: a live menu might never arrive)
    await boot.openHealth(flags);
    return boot;
  }

  /// `?os=` and `?health=` (M2's own flags) stand in for the device's health store on a recorded route; live, the channel to Health Connect / HealthKit.
  Future<void> openHealth(RecordedFlags? flags) async {
    final s = store, l = log;
    if (s == null || l == null) return;
    final HealthClient client;
    if (flags == null || flags.health == 'device') {
      client = ChannelHealthClient();
    } else {
      client = SimulatedHealth(platform: flags.os, allows: flags.health != 'deny', status: switch (flags.health) { 'unsupported' => HealthAccess.unsupported, 'notinstalled' => HealthAccess.notInstalled, _ => HealthAccess.denied });
      await s.setHealthOn(flags.health == 'revoked'); // revoked: the switch is on and the OS no longer allows it
    }
    final fx = plateBoard(repo.now());
    health = await HealthBook.open(client: client, store: s, log: l, titleOf: (m) => mealTitle(m, fx, l.cafeIds), tracking: () => prefs.track, prefs: prefs, now: flags == null || flags.health == 'device' ? null : repo.now);
  }

  /// The database the repository caches in, and the user store over it (null when a newer build owns the file).
  @visibleForTesting
  static Future<(Database, UdineStore?)> openDb({required String dbPath}) async {
    final r = await openStore(dbPath);
    if (r is StoreReady) return (r.db, UdineStore(r.db));
    debugPrint('udine.db was written by a newer build: menus only, nothing is written to it');
    return ((await openStore(inMemoryDatabasePath) as StoreReady).db, null);
  }

  /// `?foods=seed` (recorded screenshot routes): M2's seeded Your foods, the recorded Clif Bar Chocolate Chip saved first, then Chobani (140 cal, 12 g protein).
  Future<void> seedFoods(Future<String> Function(String name)? read) async {
    if (store == null) return;
    final flow = jsonDecode(await (read ?? recordedAsset)('packaged-2026-10-13.json')) as Map<String, dynamic>;
    final clif = mapOffSearch({'products': [flow['product']]}).results.single;
    await store!.saveFood(clif.savedNow(DateTime.utc(2026, 10, 8, 12).millisecondsSinceEpoch));
    await store!.addCustomFood(customFromForm(id: SavedFood.newCustomId(DateTime.utc(2026, 10, 8, 12, 1), () => 'seed'), name: 'Chobani', m: const Macro(140, 12, 15, 0)));
  }

  /// `?history=today|full` (recorded screenshot routes): M2's seeded log in the throwaway store, so You has days to show.
  Future<void> seedLog(String route) async {
    final h = Uri.parse(route).queryParameters['history'];
    if (store == null || recordedFlags(route) == null || (h != 'today' && h != 'full' && h != 'bowl' && h != 'chai')) return;
    await store!.addEntries([...seedToday, if (h != 'today') ...seedEarlier, if (h == 'bowl') ...seedBowl, if (h == 'chai') ...seedChai]);
    await log!.reload();
  }

  /// `/plate?seed=` (screenshot routes), added the way Search adds them. `benchmark`: M2's plate, Beef Brisket Noodle Bowl x1 and Golden BBQ
  /// Chicken Thigh x2 (the brisket serves Worcester and Berkshire, the thigh only Worcester, which narrows the plate). `one`: the thigh
  /// alone. `choose`: the brisket alone, so Log asks Worcester or Berkshire. `split`: the benchmark plate and, as M2's `?state=split`,
  /// the first dish of Franklin's fourth lunch station, which starts a second plate. `bowls`: two bowls of one base and the plain dish, as M2's
  /// plate reads after two Adds in the builder: the brisket with Bean Sprouts and 2 x Chopped Cilantro, the brisket plain, the brisket with a Hard Boiled Egg.
  Future<void> seedPlate(String route) async {
    final u = Uri.parse(route), seed = u.queryParameters['seed'];
    if (u.path != '/plate' || !const {'benchmark', 'one', 'choose', 'split', 'bowls'}.contains(seed)) return;
    Future<List<MenuItem>> lunch(String place) async {
      final s = await repo.menu(halls.indexOf(place) + 1, repo.today).firstWhere((s) => s is Loaded<List<MenuItem>>);
      return [for (final d in (s as Loaded<List<MenuItem>>).value) if (d.mealPeriod == MealPeriod.lunch) d];
    }
    Future<MenuItem?> dish(String place, String name) async => (await lunch(place)).where((d) => d.key == dishKey(name)).firstOrNull;
    const brisket = 'Beef Brisket Noodle Bowl', thigh = 'Golden BBQ Chicken Thigh';
    final b = {for (final h in ['W', 'B']) h: ?await dish(h, brisket)}, t = {'W': ?await dish('W', thigh)};
    if (seed == 'one') {
      plate.add('lunch', thigh, t);
      return;
    }
    if (seed == 'bowls') {
      final base = b['W']!, st = mealsOfItems(await lunch('W'))['lunch']!.firstWhere((s) => s.dishes.any((d) => d.key == base.key));
      final spec = BowlSpec(head: 'Noodle Bowl', parts: [for (final d in st.dishes) if (d.key != base.key) d], base: base, place: 'W', meal: 'lunch');
      Bowl of(Map<String, num> sel) => bowlNow(spec, {for (final e in sel.entries) spec.parts.indexWhere((d) => d.dishName == e.key): e.value});
      plate.addBowl('lunch', spec, of({'Bean Sprouts': 1, 'Chopped Cilantro': 2}));
      plate.add('lunch', brisket, {'W': base});
      plate.addBowl('lunch', spec, of({'Hard Boiled Egg': 1}));
      return;
    }
    plate.add('lunch', brisket, b);
    if (seed == 'choose') return;
    plate.add('lunch', thigh, t);
    plate.add('lunch', thigh, t);
    if (seed == 'split') {
      final f = mealsOfItems(await lunch('F'))['lunch']![3].dishes.first;
      plate.add('lunch', f.dishName, {'F': f});
    }
  }

  Widget wrap(Widget child) => AppScope(repo: repo, store: store, log: log, foods: foods, health: health, packaged: packaged, lookup: lookup, prefs: prefs, alerts: alerts, hider: hider, plate: plate, pdfOpen: pdfOpen, share: share, shareFlyer: shareFlyer, child: child);
}
