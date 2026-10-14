import 'package:flutter/foundation.dart' show debugPrint;
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

/// `?pins=N` (screenshots; M2's own flag): the first N of M2's five, held in memory and never saved.
const _fivePins = ['Wasabi', 'Tamales', "Peet's Coffee & Tea", 'Harvest Market', 'Procrastination Station'];

/// What the app runs on: the device store, the repository (UMass and Supabase live, or M2's recordings with a fixed clock and
/// network from the route's `?data=recorded&at=&net=`), and the preferences. Recorded mode keeps everything in a throwaway
/// in-memory store so a capture never reads or leaves anything on the device.
class Boot {
  Boot(this.repo, this.store, this.prefs);
  final Repository repo;
  final UdineStore store;
  final AppPrefs prefs;
  final hider = BandHider();

  static Future<Boot> open(String route) async {
    final flags = recordedFlags(route);
    final pinsFlag = int.tryParse(Uri.parse(route).queryParameters['pins'] ?? '');
    final db = await _db(memory: flags != null);
    final store = UdineStore(db);
    final Repository repo;
    if (flags != null) {
      // `at` is Eastern wall-clock time, as M2 reads it, wherever the device is
      final a = flags.at;
      repo = await recordedRepository(RecordedFlags(at: a == null ? null : easternInstant(DateTime.utc(a.year, a.month, a.day, a.hour, a.minute)), net: flags.net), db);
    } else {
      final client = http.Client();
      repo = Repository(UmassSource(client), db, supabase: SupabaseSource(client));
    }
    final prefs = await AppPrefs.load(store, pins: pinsFlag == null ? null : _fivePins.take(pinsFlag).toList());
    if (flags == null) repo.launch(); // warm today and tomorrow; never throws
    return Boot(repo, store, prefs);
  }

  static Future<Database> _db({required bool memory}) async {
    final path = memory ? inMemoryDatabasePath : await udineDbPath();
    final r = await openStore(path);
    if (r is StoreReady) return r.db;
    // A newer build wrote this file: touch nothing, run on a throwaway store (the device-data brief owns what the user sees).
    debugPrint('udine.db was written by a newer build; running on an in-memory store');
    return (await openStore(inMemoryDatabasePath) as StoreReady).db;
  }

  Widget wrap(Widget child) => AppScope(repo: repo, store: store, prefs: prefs, hider: hider, child: child);
}
