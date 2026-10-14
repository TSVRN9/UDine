// The seam between the repository's per-day streams and the book `core/m2` reads (HallController.board): checked against M2's own
// recording, and against M2's `vectors.json` `saved` cases, so the screen's states follow what the phone has saved.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/core/hours.dart';
import 'package:udine/core/stations.dart';
import 'package:udine/core/m2/board.dart';
import 'package:udine/core/m2/menu_view.dart';
import 'package:udine/data/recorded/recorded.dart';
import 'package:udine/data/recorded/recorded_client.dart';
import 'package:udine/data/repository.dart';
import 'package:udine/data/source.dart';
import 'package:udine/data/supabase_source.dart';
import 'package:udine/screens/hall/hall_controller.dart';

const _flows = '../docs/design/explorations/2026-10-ui-overhaul/flows';
Future<String> _read(String name) async => File(name.startsWith('menus') || name.startsWith('locations') || name == 'events-raw.json' ? 'assets/recorded/$name' : '$_flows/$name').readAsString();
final lunch = easternInstant(DateTime.utc(2026, 10, 8, 12, 41));

/// Waits (real time) until every day asked of [c] has stopped loading.
Future<void> settled(HallController c, Iterable<int> days) async {
  for (var i = 0; i < 400 && days.any((d) => c.state(d) == MenuState.loading); i++) {
    await Future<void>.delayed(const Duration(milliseconds: 10));
  }
  expect(days.any((d) => c.state(d) == MenuState.loading), isFalse, reason: 'never settled');
}

void main() {
  sqfliteFfiInit();
  late Database db;
  late NetClient net;
  late Repository repo;
  setUp(() async {
    db = await databaseFactoryFfi.openDatabase(inMemoryDatabasePath);
    await db.execute('CREATE TABLE preferences_kv (key TEXT PRIMARY KEY NOT NULL, value_json TEXT NOT NULL)');
    final client = RecordedClient(menus: jsonDecode(await _read('menus-2026-10-08-to-22.json')) as Map<String, dynamic>, locations: await recordedLocations(_read), events: await _read('events-raw.json'));
    net = NetClient(client, NetMode.ok, Duration.zero);
    repo = Repository(UmassSource(net), db, supabase: SupabaseSource(net), now: () => lunch);
  });
  tearDown(() => db.close());

  const wire = {'breakfast': 'breakfast', 'lunch': 'lunch', 'dinner': 'dinner', 'late night': 'late', 'daily offerings': 'all', 'grabngo': 'grab'};

  test('every hall, day and meal of the recording comes through as M2 keeps it: meals, stations in feed order, dishes in order', () async {
    final rec = jsonDecode(await _read('menus-2026-10-08-to-22.json')) as Map<String, dynamic>;
    final dishes = rec['dishes'] as List, days = rec['days'] as Map<String, dynamic>;
    const names = {'W': 'Worcester', 'F': 'Franklin', 'H': 'Hampshire', 'B': 'Berkshire'};
    for (final place in halls) {
      final c = HallController(repo, place);
      for (var d = 0; d < 15; d++) {
        c.load(d);
      }
      await settled(c, [for (var d = 0; d < 15; d++) d]);
      final board = c.board;
      for (var d = 0; d < 15; d++) {
        final iso = c.isos[d], meals = ((days[iso] as Map<String, dynamic>)[names[place]] as Map<String, dynamic>?) ?? {};
        final got = board.days[iso]![place] ?? {};
        expect(got.keys.toSet(), {for (final m in meals.keys) wire[m]}, reason: '$place $iso meals');
        for (final MapEntry(key: m, value: stations) in meals.entries) {
          final want = [for (final s in stations as List) (normalizeStationName(s[0] as String), [for (final i in s[1] as List) (dishes[i]['dish-name'] as String).trim()])];
          final have = [for (final s in got[wire[m]]!) (s.name, [for (final x in s.dishes) x.dishName])];
          expect(have.length, want.length, reason: '$place $iso $m stations');
          for (var i = 0; i < want.length; i++) {
            expect(have[i].$1, want[i].$1, reason: '$place $iso $m station $i');
            expect(have[i].$2, want[i].$2, reason: '$place $iso $m ${want[i].$1}');
          }
        }
      }
      c.dispose();
    }
  });

  test('menuView on the live board: halal keeps the halal dishes, an avoided allergen hides and counts, Show all reveals', () async {
    final c = HallController(repo, 'W')..load(0);
    await settled(c, [0]);
    final b = c.board, iso = c.isos[0], all = b.days[iso]!['W']!['lunch']!.expand((s) => s.dishes).toList();
    expect(all, hasLength(61)); // M2's 72 list rows are these and 11 station heads
    final halal = menuView(b, iso, 'W', 'lunch', const Prefs(halal: true), false);
    expect(halal.sections.expand((s) => s.dishes).toList(), all.where((d) => d.diet & 4 != 0).toList());
    expect(halal.hidden, 0);
    final milk = menuView(b, iso, 'W', 'lunch', const Prefs(avoid: ['Milk']), false), n = all.where((d) => d.allergens.contains('Milk')).length;
    expect(n, greaterThan(0));
    expect(milk.hidden, n);
    expect(milk.line, 'Hiding $n dishes that list milk');
    expect(menuView(b, iso, 'W', 'lunch', const Prefs(avoid: ['Milk']), true).sections.expand((s) => s.dishes), hasLength(all.length));
    c.dispose();
  });

  group('vectors.json `saved`: what the phone has saved decides what the page says', () {
    final cases = (jsonDecode(File('$_flows/M2/vectors.json').readAsStringSync()) as Map<String, dynamic>)['saved'] as List;
    for (final v in cases) {
      test('${v['net']}, ${v['place']}, day ${v['day']}, opened before: ${v['savedCafes']} -> ${v['saved'] ? 'saved' : 'not'}', () async {
        final place = v['place'] as String, day = v['day'] as int;
        if (v['net'] == 'fail') {
          net.mode = NetMode.fail;
        } else {
          if ((v['savedCafes'] as List).isNotEmpty) {
            final seen = HallController(repo, place)..load(0); // opened online earlier
            await settled(seen, [0]);
            seen.dispose();
          }
          await repo.launch(); // the halls, today and tomorrow, and today's hours
          net.mode = NetMode.offline;
        }
        final c = HallController(repo, place)..load(day);
        await settled(c, [day]);
        expect(c.state(day) == MenuState.ok, v['saved'] as bool, reason: '${c.state(day)}');
        c.dispose();
      });
    }
  });
}
