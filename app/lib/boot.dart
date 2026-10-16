import 'dart:io' show Directory;

import 'package:flutter/foundation.dart' show debugPrint, visibleForTesting;
import 'package:flutter/widgets.dart' show Widget;
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';

import 'core/hours.dart';
import 'core/m2/board.dart' show dishKey, halls, MenuItem, M2MenuItem;
import 'core/types.dart' show MealPeriod;
import 'core/store/db.dart';
import 'core/store/log_book.dart';
import 'core/store/store.dart';
import 'data/flyer.dart';
import 'data/recorded/recorded.dart';
import 'dev/log_seed.dart';
import 'data/pdf_cache.dart';
import 'data/pdf_pages.dart';
import 'data/repository.dart';
import 'data/source.dart';
import 'data/supabase_source.dart';
import 'motion/routes.dart';
import 'screens/hall/hall_controller.dart' show mealsOfItems;
import 'shell/app_scope.dart';
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
  Boot(this.repo, this.store, this.prefs, {this.pdfOpen = pdfxOpen, FlyerShare? shareFlyer}) : shareFlyer = shareFlyer ?? shareFlyerFile;
  final PdfOpen pdfOpen;
  /// the OS share sheet Export hands its files to; a test replaces it
  @visibleForTesting
  ShareFiles share = shareFiles;
  final FlyerShare shareFlyer;
  final Repository repo;

  /// The device store; null when the file was written by a newer build (menus only, below).
  final UdineStore? store;
  final AppPrefs prefs;
  final hider = BandHider();
  /// The log You reads (null with no store: menus only). Held in memory, read once at launch and again after anything writes to it.
  late final LogBook? log = store == null ? null : LogBook(store!, now: repo.now);
  late final plate = PlateModel(write: store?.addEntries, readDay: store?.entriesForDay, now: repo.now, changed: log?.reload);

  /// The user's database was saved by a newer build (they installed an older one): the file is never opened for writing, tracking
  /// stays off, and nothing the user does is saved. Menus, hours and busy work as ever, cached in a throwaway in-memory database.
  bool get menusOnly => store == null;

  /// [dbPath] and [read] (the recordings' reader) are test seams (the device path and the app bundle by default).
  static Future<Boot> open(String route, {String? dbPath, Future<String> Function(String name)? read, TempDir tmp = getTemporaryDirectory}) async {
    await clearExports(tmp: tmp); // last session's exports: plaintext copies of the log, not kept past the next start
    if (photosOff(route)) Photos.enabled = false;
    final flags = recordedFlags(route);
    final pinsQuery = Uri.parse(route).queryParameters['pins'], pinsFlag = int.tryParse(pinsQuery ?? '');
    final (cache, store) = await openDb(dbPath: flags != null ? inMemoryDatabasePath : (dbPath ?? await udineDbPath()));
    if (flags != null) {
      await store?.setScores(healthfulness: flags.scores.health, carbon: flags.scores.carbon);
      if (flags.avoid.isNotEmpty) await store?.setAvoid(flags.avoid);
      if (flags.onlyShow.isNotEmpty) await store?.setOnlyShow(flags.onlyShow);
    }
    final prefs = await AppPrefs.load(store, pins: pinsFlag != null ? _fivePins.take(pinsFlag).toList() : flags != null && pinsQuery != null ? pinsQuery.split(',') : null);
    final Repository repo;
    if (flags != null) {
      // `at` is Eastern wall-clock time, as M2 reads it, wherever the device is
      final a = flags.at;
      repo = await recordedRepository(RecordedFlags(at: a == null ? null : easternInstant(DateTime.utc(a.year, a.month, a.day, a.hour, a.minute)), net: flags.net, savedPdfs: flags.savedPdfs, noEvents: flags.noEvents), cache, pins: prefs.pins, read: read);
    } else {
      final client = http.Client();
      repo = Repository(UmassSource(client), cache, supabase: SupabaseSource(client), pdfs: PdfCache(Directory('${(await getApplicationSupportDirectory()).path}/pdf'), client));
    }
    if (flags == null) repo.launch(pins: prefs.pins); // warm today and tomorrow; never throws
    final boot = Boot(repo, store, prefs);
    await boot.log?.reload();
    if (flags != null) await boot.seedLog(route);
    if (flags != null) await boot.seedPlate(route); // (recorded data only: a live menu might never arrive)
    return boot;
  }

  /// The database the repository caches in, and the user store over it (null when a newer build owns the file).
  @visibleForTesting
  static Future<(Database, UdineStore?)> openDb({required String dbPath}) async {
    final r = await openStore(dbPath);
    if (r is StoreReady) return (r.db, UdineStore(r.db));
    debugPrint('udine.db was written by a newer build: menus only, nothing is written to it');
    return ((await openStore(inMemoryDatabasePath) as StoreReady).db, null);
  }

  /// `?history=today|full` (recorded screenshot routes): M2's seeded log in the throwaway store, so You has days to show.
  Future<void> seedLog(String route) async {
    final h = Uri.parse(route).queryParameters['history'];
    if (store == null || recordedFlags(route) == null || (h != 'today' && h != 'full')) return;
    await store!.addEntries([...seedToday, if (h == 'full') ...seedEarlier]);
    await log!.reload();
  }

  /// `/plate?seed=` (screenshot routes), added the way Search adds them. `benchmark`: M2's plate, Beef Brisket Noodle Bowl x1 and Golden BBQ
  /// Chicken Thigh x2 (the brisket serves Worcester and Berkshire, the thigh only Worcester, which narrows the plate). `one`: the thigh
  /// alone. `choose`: the brisket alone, so Log asks Worcester or Berkshire. `split`: the benchmark plate and, as M2's `?state=split`,
  /// the first dish of Franklin's fourth lunch station, which starts a second plate.
  Future<void> seedPlate(String route) async {
    final u = Uri.parse(route), seed = u.queryParameters['seed'];
    if (u.path != '/plate' || !const {'benchmark', 'one', 'choose', 'split'}.contains(seed)) return;
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
    plate.add('lunch', brisket, b);
    if (seed == 'choose') return;
    plate.add('lunch', thigh, t);
    plate.add('lunch', thigh, t);
    if (seed == 'split') {
      final f = mealsOfItems(await lunch('F'))['lunch']![3].dishes.first;
      plate.add('lunch', f.dishName, {'F': f});
    }
  }

  Widget wrap(Widget child) => AppScope(repo: repo, store: store, log: log, prefs: prefs, hider: hider, plate: plate, pdfOpen: pdfOpen, share: share, shareFlyer: shareFlyer, child: child);
}
