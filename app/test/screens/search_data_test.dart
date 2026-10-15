// Search's one load: today's hours, then every place's cached days through the repository's prefetch. Typing only filters.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/core/hours.dart';
import 'package:udine/core/m2/search.dart';
import 'package:udine/data/recorded/recorded.dart';
import 'package:udine/data/recorded/recorded_client.dart';
import 'package:udine/data/repository.dart';
import 'package:udine/data/source.dart';
import 'package:udine/data/supabase_source.dart';
import 'package:udine/screens/search/search_controller.dart';
import 'package:udine/shell/plate_model.dart';
import 'package:udine/shell/prefs.dart';

import 'hall_data_test.dart' show CountingNet;

const _flows = '../docs/design/explorations/2026-10-ui-overhaul/flows';
Future<String> _read(String name) async => File(name.startsWith('menus') || name.startsWith('locations') || name == 'events-raw.json' ? 'assets/recorded/$name' : '$_flows/$name').readAsString();
final lunch = easternInstant(DateTime.utc(2026, 10, 8, 12, 41));

Future<void> ready(SearchController c) async {
  for (var i = 0; i < 600 && !c.complete; i++) {
    await Future<void>.delayed(const Duration(milliseconds: 10));
  }
  expect(c.complete, isTrue, reason: 'never loaded');
}

void main() {
  sqfliteFfiInit();
  late CountingNet net;
  late Repository repo;
  late AppPrefs prefs;
  late Database db;
  late PlateModel plate;
  setUp(() async {
    db = await databaseFactoryFfi.openDatabase(inMemoryDatabasePath);
    await db.execute('CREATE TABLE preferences_kv (key TEXT PRIMARY KEY NOT NULL, value_json TEXT NOT NULL)');
    final client = RecordedClient(menus: jsonDecode(await _read('menus-2026-10-08-to-22.json')) as Map<String, dynamic>, locations: await recordedLocations(_read), events: await _read('events-raw.json'));
    net = CountingNet(client);
    repo = Repository(UmassSource(net), db, supabase: SupabaseSource(net), now: () => lunch);
    prefs = await AppPrefs.load(null);
    plate = PlateModel();
    addTearDown(db.close);
  });

  test('opening Search loads the hours and every place\'s today and tomorrow once; typing five letters asks for nothing', () async {
    final c = SearchController(repo, prefs, plate);
    addTearDown(c.dispose);
    await ready(c);
    expect(c.index, isNotNull);
    await Future<void>.delayed(const Duration(milliseconds: 200));
    final sends = net.sends;
    // the hours, the four halls' busy curves, and today and tomorrow of every hall and café that has a menu: each once, nothing else
    expect(sends, 1 + 4 + 2 * (4 + c.cafeIds.length));
    for (final q in ['p', 'pi', 'piz', 'pizz', 'pizza']) {
      c.setQuery(q);
    }
    await Future<void>.delayed(const Duration(milliseconds: 50));
    expect(net.sends, sends);
    expect(c.result.now.every((x) => x.g.name.toLowerCase().contains('pizza')), isTrue);
  });

  test('nothing is fetched until a controller exists (the tab being launched is not Search opening)', () {
    expect(net.sends, 0);
  });

  test('a lens, or the Charles River toggle, re-reads the same index and asks for nothing', () async {
    final c = SearchController(repo, prefs, plate);
    addTearDown(c.dispose);
    await ready(c);
    final sends = net.sends;
    c.toggleLens(Lens.protein);
    expect(c.lenses, {Lens.protein});
    await prefs.setCharlesRiver(true);
    expect(net.sends, sends);
    expect(c.index!.charlesRiver, isTrue);
  });

  test('a plate change moves no row: the result object is the one the query made', () async {
    final c = SearchController(repo, prefs, plate);
    addTearDown(c.dispose);
    await ready(c);
    c.setQuery('chicken');
    final before = c.result;
    plate.add('lunch', before.now.first.g.name, before.now.first.g.refs);
    expect(identical(c.result, before), isTrue);
    c.setQuery('chicken ');
    expect(identical(c.result, before), isFalse, reason: 'a keystroke recomputes, with the plate as it is now');
  });

  test('no hours (offline, nothing saved): nothing to search, no throw, no message of its own', () async {
    final off = Repository(UmassSource(NetClient(RecordedClient(menus: const {}, locations: '[]', events: '{}'), NetMode.offline, Duration.zero)), db, now: () => lunch);
    final c = SearchController(off, prefs, plate);
    addTearDown(c.dispose);
    await Future<void>.delayed(const Duration(milliseconds: 300));
    expect(c.index, isNull);
    c.setQuery('pizza');
    expect(c.result.isEmpty, isTrue);
  });
}
