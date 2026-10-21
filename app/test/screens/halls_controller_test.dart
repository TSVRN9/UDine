// Halls' stars read the four halls' menus once per load, after the screen says its arrival has settled; and a final saved menu is
// answered from memory afterwards, so neither this nor Search's book reads the DB for it twice.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/core/hours.dart' show easternInstant;
import 'package:udine/core/types.dart' show MenuItem;
import 'package:udine/data/recorded/flags.dart' show NetMode;
import 'package:udine/data/recorded/recorded_client.dart';
import 'package:udine/data/repository.dart';
import 'package:udine/data/source.dart';
import 'package:udine/data/supabase_source.dart';
import 'package:udine/screens/dish/where_book.dart' show WhereWarm;
import 'package:udine/screens/halls/halls_controller.dart';
import 'hall_data_test.dart' show CountingNet, lunch;

class _Spy extends Repository {
  _Spy(super.source, super.db, {super.supabase, super.now});
  int asks = 0;
  @override
  Future<Map<(int, String), List<MenuItem>>> prefetchMenus(Iterable<(int, String)> days, {bool Function()? stopped}) {
    asks++;
    return super.prefetchMenus(days, stopped: stopped);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  sqfliteFfiInit();
  late Database db;
  late CountingNet net;
  setUp(() async {
    db = await databaseFactoryFfi.openDatabase(inMemoryDatabasePath);
    await db.execute('CREATE TABLE preferences_kv (key TEXT PRIMARY KEY NOT NULL, value_json TEXT NOT NULL)');
    net = CountingNet(RecordedClient(
      menus: jsonDecode(File('assets/recorded/menus-2026-10-08-to-22.json').readAsStringSync()) as Map<String, dynamic>,
      locations: File('assets/recorded/locations-2026-10-08.json').readAsStringSync(), events: File('assets/recorded/events-raw.json').readAsStringSync(),
    ));
  });
  tearDown(() => db.close());

  Future<void> until(bool Function() done) async {
    for (var i = 0; i < 400 && !done(); i++) {
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }
    expect(done(), isTrue, reason: 'never settled');
  }

  test('the menus wait for loadMenus, and run once across a saved-then-live pair of hours', () async {
    // a first launch saves the hours; this one is answered from them, then by the network
    await Repository(UmassSource(net), db, supabase: SupabaseSource(net), now: () => lunch).hours('2026-10-08').drain<void>();
    final repo = _Spy(UmassSource(net), db, supabase: SupabaseSource(net), now: () => lunch);
    final c = HallsController(repo);
    var loaded = 0, asked = 0;
    c.addListener(() {
      if (c.state is Loaded<HoursData> || c.state is LoadedOffline<HoursData>) loaded++;
      if (asked++ < 20) c.loadMenus(); // the screen asks on every change once its arrival is at rest
    });
    c.loadMenus(); // before any hours: nothing to ask with
    expect(repo.asks, 0);
    await until(() => loaded >= 2 && c.board != null);
    c.loadMenus();
    expect(loaded, greaterThanOrEqualTo(2), reason: 'a saved emission and a live one');
    expect(repo.asks, 1);
    c.dispose();
  });

  test('with WhereWarm.auto, loadMenus starts the where warm-up once the halls\' menus are in; without it, nothing', () async {
    addTearDown(() => WhereWarm.auto = false);
    Future<bool> started(bool auto) async {
      WhereWarm.auto = auto;
      final repo = _Spy(UmassSource(net), db, supabase: SupabaseSource(net), now: () => lunch);
      final c = HallsController(repo);
      var asked = 0;
      c.addListener(() {
        if (asked++ < 20) c.loadMenus();
      });
      await until(() => c.board != null);
      await Future<void>.delayed(const Duration(milliseconds: 300));
      final warm = repo.asks > 1;
      if (warm) await until(() => WhereWarm.of(repo).done); // (the waves read the DB: let them finish before it closes)
      c.dispose();
      return warm; // the stars' own ask, then the warm-up's waves
    }

    expect(await started(false), isFalse);
    expect(await started(true), isTrue);
  });

  test('without loadMenus there is no board', () async {
    final repo = _Spy(UmassSource(net), db, supabase: SupabaseSource(net), now: () => lunch);
    final c = HallsController(repo);
    await until(() => c.reads.isNotEmpty); // (the live hours, then the busy reads)
    expect(repo.asks, 0);
    expect(c.board, isNull);
    c.dispose();
  });

  test('a final saved menu is recorded as had: a later prefetch answers from memory, not from the DB', () async {
    await Repository(UmassSource(net), db, supabase: SupabaseSource(net), now: () => lunch).menu(1, '2026-10-08').drain<void>();
    final relaunch = Repository(UmassSource(net), db, supabase: SupabaseSource(net), now: () => lunch);
    await relaunch.menu(1, '2026-10-08').drain<void>(); // read from the saved copy
    await db.delete('preferences_kv');
    final sends = net.sends;
    final got = await relaunch.prefetchMenus([(1, '2026-10-08')]);
    expect(got[(1, '2026-10-08')], isNotEmpty);
    expect(net.sends, sends, reason: 'with the saved row gone, only memory can answer');
  });

  test('a stale saved menu (fetched before the day began) is not recorded as had: a later prefetch refreshes it from the network', () async {
    final yesterday = easternInstant(DateTime.utc(2026, 10, 7, 12, 41));
    await Repository(UmassSource(net), db, supabase: SupabaseSource(net), now: () => yesterday).menu(1, '2026-10-08').drain<void>();
    final relaunch = Repository(UmassSource(net), db, supabase: SupabaseSource(net), now: () => lunch);
    net.mode = NetMode.fail;
    await relaunch.menu(1, '2026-10-08').drain<void>(); // the network fails, so the stale saved copy is what it had
    net.mode = NetMode.ok;
    final sends = net.sends;
    final got = await relaunch.prefetchMenus([(1, '2026-10-08')]);
    expect(got[(1, '2026-10-08')], isNotEmpty);
    expect(net.sends, greaterThan(sends), reason: 'a stale copy is refreshed, not answered from memory');
  });
}
