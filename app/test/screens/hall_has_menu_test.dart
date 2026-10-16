// HallController.hasMenu: whether a place draws a dish menu or a café's standing body, in each state the hours and menus can be in.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/core/hours.dart';
import 'package:udine/data/recorded/recorded.dart';
import 'package:udine/data/recorded/recorded_client.dart';
import 'package:udine/data/repository.dart';
import 'package:udine/data/source.dart';
import 'package:udine/data/supabase_source.dart';
import 'package:udine/screens/hall/hall_controller.dart';

Future<String> _read(String name) async => File('assets/recorded/$name').readAsString();
final _lunch = easternInstant(DateTime.utc(2026, 10, 8, 12, 41));
const _tamales = 'c4', _yum = 'c2', _paciugo = 'c0'; // dishes today; foodpro id but no dishes; (Paciugo's id is dropped from the feed below)

void main() {
  sqfliteFfiInit();
  late Database db;
  Future<Repository> repo(NetMode mode) async {
    final locations = (jsonDecode(await recordedLocations(_read)) as List).cast<Map<String, dynamic>>();
    locations.firstWhere((l) => l['location_title'] == 'Paciugo')['location_id'] = null; // a café that posts no dishes has no foodpro id
    final client = RecordedClient(menus: jsonDecode(await _read('menus-2026-10-08-to-22.json')) as Map<String, dynamic>, locations: jsonEncode(locations), events: await _read('events-raw.json'));
    final net = NetClient(client, mode, Duration.zero);
    return Repository(UmassSource(net), db, supabase: SupabaseSource(net), now: () => _lunch);
  }

  Future<void> until(bool Function() done) async {
    for (var i = 0; i < 400 && !done(); i++) {
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }
    expect(done(), isTrue, reason: 'never settled');
  }

  setUp(() async {
    db = await databaseFactoryFfi.openDatabase(inMemoryDatabasePath);
    await db.execute('CREATE TABLE preferences_kv (key TEXT PRIMARY KEY NOT NULL, value_json TEXT NOT NULL)');
  });
  tearDown(() => db.close());

  test('a hall always has a dish menu', () async {
    final c = HallController(await repo(NetMode.fail), 'W');
    addTearDown(c.dispose);
    expect(c.hasMenu, isTrue);
    await until(() => c.hours is! Loading<HoursData>);
    expect(c.hasMenu, isTrue);
  });

  test('loading: a café whose hours are not in yet is taken to have dishes', () async {
    final c = HallController(await repo(NetMode.ok), _paciugo);
    addTearDown(c.dispose);
    expect(c.hours, isA<Loading<HoursData>>());
    expect(c.hasMenu, isTrue);
    await until(() => c.hours is! Loading<HoursData>); // (its reads of the store finish before the database closes)
  });

  test('failed: with no hours the café stays on the dish layout', () async {
    final c = HallController(await repo(NetMode.fail), _paciugo);
    addTearDown(c.dispose);
    await until(() => c.hours is! Loading<HoursData>);
    expect(c.hours, isA<Failed<HoursData>>());
    expect(c.hasMenu, isTrue);
  });

  test('offline: with nothing saved the café stays on the dish layout', () async {
    final c = HallController(await repo(NetMode.offline), _paciugo);
    addTearDown(c.dispose);
    await until(() => c.hours is! Loading<HoursData>);
    expect(c.hours, isA<NotSaved<HoursData>>());
    expect(c.hasMenu, isTrue);
  });

  test('dishes today: true; no foodpro id: false; a foodpro id with nothing today: false', () async {
    final r = await repo(NetMode.ok);
    final t = HallController(r, _tamales)..load(0), y = HallController(r, _yum)..load(0), p = HallController(r, _paciugo)..load(0);
    addTearDown(t.dispose);
    addTearDown(y.dispose);
    addTearDown(p.dispose);
    await until(() => t.state(0) == MenuState.ok && y.state(0) == MenuState.ok && p.hours is Loaded<HoursData>);
    expect(t.items(0), isNotEmpty);
    expect(t.hasMenu, isTrue);
    expect(p.cafeLocationId, isNull);
    expect(p.hasMenu, isFalse);
    expect(y.cafeLocationId, isNotNull);
    expect(y.items(0), isEmpty);
    expect(y.hasMenu, isFalse);
  });

  test('dishes only on another day: today alone decides, so the café has its standing body', () async {
    final r = await repo(NetMode.ok);
    final t = HallController(r, _tamales)..load(0), y = HallController(r, _yum)..load(0);
    addTearDown(t.dispose);
    addTearDown(y.dispose);
    await until(() => t.state(0) == MenuState.ok && y.state(0) == MenuState.ok);
    y.menus[3] = Loaded(t.items(0)!);
    expect(y.items(3), isNotEmpty);
    expect(y.hasMenu, isFalse);
  });
}
