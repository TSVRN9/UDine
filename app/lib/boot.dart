import 'package:flutter/foundation.dart' show debugPrint, visibleForTesting;
import 'package:flutter/widgets.dart' show Widget;
import 'package:http/http.dart' as http;
import 'package:sqflite/sqflite.dart';

import 'core/hours.dart';
import 'core/store/db.dart';
import 'core/store/store.dart';
import 'data/recorded/recorded.dart';
import 'data/repository.dart';
import 'data/source.dart';
import 'data/supabase_source.dart';
import 'motion/routes.dart';
import 'shell/app_scope.dart';
import 'shell/prefs.dart';
import 'ui/photos.dart' show Photos;

/// `?pins=N` (screenshots; M2's own flag): the first N of M2's five, held in memory and never saved.
const _fivePins = ['Wasabi', 'Tamales', "Peet's Coffee & Tea", 'Harvest Market', 'Procrastination Station'];

/// What the app runs on: the device store, the repository (UMass and Supabase live, or M2's recordings with a fixed clock and
/// network from the route's `?data=recorded&at=&net=`), and the preferences. Recorded mode keeps everything in a throwaway
/// in-memory store so a capture never reads or leaves anything on the device.
class Boot {
  Boot(this.repo, this.store, this.prefs);
  final Repository repo;

  /// The device store; null when the file was written by a newer build (menus only, below).
  final UdineStore? store;
  final AppPrefs prefs;
  final hider = BandHider();

  /// The user's database was saved by a newer build (they installed an older one): the file is never opened for writing, tracking
  /// stays off, and nothing the user does is saved. Menus, hours and busy work as ever, cached in a throwaway in-memory database.
  bool get menusOnly => store == null;

  /// [dbPath] is a test seam (the device path by default).
  static Future<Boot> open(String route, {String? dbPath}) async {
    if (photosOff(route)) Photos.enabled = false;
    final flags = recordedFlags(route);
    final pinsFlag = int.tryParse(Uri.parse(route).queryParameters['pins'] ?? '');
    final (cache, store) = await openDb(dbPath: flags != null ? inMemoryDatabasePath : (dbPath ?? await udineDbPath()));
    final Repository repo;
    if (flags != null) {
      // `at` is Eastern wall-clock time, as M2 reads it, wherever the device is
      final a = flags.at;
      repo = await recordedRepository(RecordedFlags(at: a == null ? null : easternInstant(DateTime.utc(a.year, a.month, a.day, a.hour, a.minute)), net: flags.net), cache);
    } else {
      final client = http.Client();
      repo = Repository(UmassSource(client), cache, supabase: SupabaseSource(client));
    }
    final prefs = await AppPrefs.load(store, pins: pinsFlag == null ? null : _fivePins.take(pinsFlag).toList());
    if (flags == null) repo.launch(); // warm today and tomorrow; never throws
    return Boot(repo, store, prefs);
  }

  /// The database the repository caches in, and the user store over it (null when a newer build owns the file).
  @visibleForTesting
  static Future<(Database, UdineStore?)> openDb({required String dbPath}) async {
    final r = await openStore(dbPath);
    if (r is StoreReady) return (r.db, UdineStore(r.db));
    debugPrint('udine.db was written by a newer build: menus only, nothing is written to it');
    return ((await openStore(inMemoryDatabasePath) as StoreReady).db, null);
  }

  Widget wrap(Widget child) => AppScope(repo: repo, store: store, prefs: prefs, hider: hider, child: child);
}
