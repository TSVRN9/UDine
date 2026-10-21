// The seam between the repository's per-day streams and the book `core/m2` reads (HallController.board): checked against M2's own
// recording, and against M2's `vectors.json` `saved` cases, so the screen's states follow what the phone has saved.
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
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
import 'package:udine/core/m2/where.dart';
import 'package:udine/screens/dish/where_book.dart';
import 'package:udine/screens/hall/hall_controller.dart';

const _flows = '../docs/design/explorations/2026-10-ui-overhaul/flows';
Future<String> _read(String name) async => File(name.startsWith('menus') || name.startsWith('locations') || name == 'events-raw.json' ? 'assets/recorded/$name' : '$_flows/$name').readAsString();
final lunch = easternInstant(DateTime.utc(2026, 10, 8, 12, 41));

/// A NetClient that counts what it is asked, and how many are in flight at once.
class CountingNet extends NetClient {
  CountingNet(http.Client inner) : super(inner, NetMode.ok, Duration.zero);
  int sends = 0, inFlight = 0, peak = 0;
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    sends++;
    if (++inFlight > peak) peak = inFlight;
    try {
      await Future<void>.delayed(const Duration(milliseconds: 5));
      return await super.send(request);
    } finally {
      inFlight--;
    }
  }
}

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
  late CountingNet net, counting;
  late Repository repo;
  setUp(() async {
    db = await databaseFactoryFfi.openDatabase(inMemoryDatabasePath);
    await db.execute('CREATE TABLE preferences_kv (key TEXT PRIMARY KEY NOT NULL, value_json TEXT NOT NULL)');
    final client = RecordedClient(menus: jsonDecode(await _read('menus-2026-10-08-to-22.json')) as Map<String, dynamic>, locations: await recordedLocations(_read), events: await _read('events-raw.json'));
    net = counting = CountingNet(client);
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
          final want = [for (final s in stations as List) (normalizeStationName(s[0] as String).replaceFirst(RegExp(r"^Grab n'Go\s+"), ''), [for (final i in s[1] as List) (dishes[i]['dish-name'] as String).trim()]), if (wire[m] != 'grab') ('Beverages', ['Fountain Drink'])]; // (round 12d)
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

  /// A Worcester controller whose hours and today and tomorrow have landed.
  Future<HallController> worcester() async {
    final c = HallController(repo, 'W')..load(0)..load(1);
    await settled(c, [0, 1]);
    for (var i = 0; i < 400 && c.placeHours == null; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }
    return c;
  }

  test('the board carries every hall\'s Grab \'N Go window, not only the place being viewed (where a dish is served needs them all)', () async {
    final c = await worcester();
    expect(c.board.grab.keys.toSet(), halls.toSet());
    c.dispose();
  });

  test('WhereBook adds every hall\'s menus for today and tomorrow to the place\'s board: a dish served at all four halls answers with all four', () async {
    final c = await worcester();
    expect(c.board.days[c.isos[0]]!.keys, ['W'], reason: 'the controller itself only has its own place');
    final book = WhereBook(repo, c.board);
    for (var i = 0; i < 400 && book.board == null; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }
    final answer = whereAnswer(book.board!, 'Black Bean Burger', lunch);
    expect(answer.expand((g) => g.halls).toSet(), halls.toSet());
    book.dispose();
    c.dispose();
  });

  Future<WhereBook> bookOf(HallController c) async {
    final book = WhereBook(repo, c.board, c.cafeIds);
    for (var i = 0; i < 1500 && !book.complete; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }
    expect(book.complete, isTrue);
    return book;
  }

  test('only a dining commons gets the synthetic Fountain Drink: a café\'s own board and the book\'s café days never do (round 12d)', () async {
    final w = await worcester();
    final book = await bookOf(w);
    // (cafés have Beverages stations of their own, and a priced Fountain Drink; the synthetic one has no price)
    bool bev(Board b, String p) => [for (final d in b.days.values) ...?d[p]?.values.expand((s) => s.expand((x) => x.dishes))].any((d) => d.key == 'fountain drink' && d.price == null);
    expect(bev(book.board!, 'W'), isTrue);
    final cafes = {for (final d in book.board!.days.values) ...d.keys.where(isCafe)};
    expect(cafes, isNotEmpty);
    for (final k in cafes) {
      expect(bev(book.board!, k), isFalse, reason: k);
    }
    final c = HallController(repo, 'c12')..load(0);
    await settled(c, [0]);
    expect(c.board.days[c.isos[0]]!['c12'], isNotNull, reason: 'the café has a menu to check');
    expect(bev(c.board, 'c12'), isFalse);
    c.dispose();
    book.dispose();
    w.dispose();
  });

  test('a second dish sheet asks for no place-day the first had (halls and cafés), and never more than four requests are in flight', () async {
    final c = await worcester();
    expect(c.cafeIds, isNotEmpty);
    await Future<void>.delayed(const Duration(milliseconds: 100)); // (the controller's own events call, if still going)
    counting.peak = 0;
    final first = await bookOf(c);
    expect(first.board!.days[c.isos[0]]!.keys, containsAll(['W', 'B']));
    final before = counting.sends;
    expect(counting.peak, lessThanOrEqualTo(4));
    final second = await bookOf(c);
    expect(counting.sends, before, reason: 'the second sheet reads what the first fetched');
    expect(second.board!.days[c.isos[0]]!.keys.length, first.board!.days[c.isos[0]]!.keys.length);
    first.dispose();
    second.dispose();
    c.dispose();
  });

  test('WhereBook loads only while the sheet rests: nothing until `settled` resolves, the halls publish, then no café request until it resolves again', () async {
    final c = await worcester();
    await Future<void>.delayed(const Duration(milliseconds: 100)); // (the controller's own events call, if still going)
    final gates = <Completer<void>>[];
    Future<void> settled() {
      gates.add(Completer<void>());
      return gates.last.future;
    }
    final book = WhereBook(repo, c.board, c.cafeIds, false)..start(settled: settled);
    final sends0 = counting.sends;
    await Future<void>.delayed(const Duration(milliseconds: 100));
    expect(gates.length, 1, reason: 'the halls wait for the sheet to rest');
    expect(counting.sends, sends0, reason: 'nothing is asked while the sheet moves');
    expect(book.board, isNull);
    gates[0].complete();
    for (var i = 0; i < 400 && book.board == null; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }
    expect(book.board!.days[c.isos[0]]!.keys, containsAll(['W', 'B']), reason: 'the halls are published first');
    expect(counting.sends, greaterThan(sends0));
    await Future<void>.delayed(const Duration(milliseconds: 100));
    expect(gates.length, 2, reason: 'the cafés wait for the sheet to rest again (its height changes when the halls land)');
    expect(book.complete, isFalse);
    final sends1 = counting.sends;
    await Future<void>.delayed(const Duration(milliseconds: 100));
    expect(counting.sends, sends1, reason: 'no café is asked while the sheet re-snaps');
    gates[1].complete();
    for (var i = 0; i < 1500 && !book.complete; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }
    expect(book.complete, isTrue);
    expect(counting.sends, greaterThan(sends1));
    book.dispose();
    c.dispose();
  });

  test('offline, once the hall found the network down, a dish sheet asks for nothing more and answers from what is saved', () async {
    final warm = await worcester();
    (await bookOf(warm)).dispose(); // today and tomorrow, saved
    warm.dispose();
    net.mode = NetMode.offline;
    final fresh = Repository(UmassSource(net), db, supabase: SupabaseSource(net), now: () => lunch);
    final c = HallController(fresh, 'W')..load(5); // a day never saved: the hall's own ask finds the network down
    await settled(c, [5]);
    for (var i = 0; i < 400 && c.placeHours == null; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }
    final sends = counting.sends;
    final book = WhereBook(fresh, c.board, c.cafeIds);
    for (var i = 0; i < 1500 && !book.complete; i++) {
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }
    expect(counting.sends, sends, reason: 'no request once the network is known to be down');
    expect(book.board!.days[c.isos[0]]!.keys, containsAll(['W', 'B']), reason: 'what is saved still answers');
    book.dispose();
    c.dispose();
  });

  test('menuView on the live board: halal keeps the halal dishes, an avoided allergen hides and counts, Show all reveals', () async {
    final c = HallController(repo, 'W')..load(0);
    await settled(c, [0]);
    final b = c.board, iso = c.isos[0], all = b.days[iso]!['W']!['lunch']!.expand((s) => s.dishes).toList();
    expect(all, hasLength(62)); // 61 and the Fountain Drink; M2's 74 list rows are these and 12 station heads
    final halal = menuView(b, iso, 'W', 'lunch', const Prefs(halal: true), false);
    expect(halal.sections.expand((s) => s.dishes).toList(), all.where((d) => d.diet & 4 != 0 || d.always).toList()); // (the Fountain Drink is no diet's to hide)
    expect(halal.hidden, 0);
    final milk = menuView(b, iso, 'W', 'lunch', const Prefs(avoid: ['Milk']), false), n = all.where((d) => d.allergens.contains('Milk')).length;
    expect(n, greaterThan(0));
    expect(milk.hidden, n);
    expect(milk.line, 'Hiding $n dishes that list milk');
    expect(menuView(b, iso, 'W', 'lunch', const Prefs(avoid: ['Milk']), true).sections.expand((s) => s.dishes), hasLength(all.length));
    c.dispose();
  });

  test('a hall\'s place on the board carries its street address and map_address, which the schedule\'s Directions needs', () async {
    final c = HallController(repo, 'W')..load(0);
    await settled(c, [0]);
    final w = c.board.places.firstWhere((p) => p.key == 'W');
    expect(w.address, isNotEmpty);
    expect(w.mapAddress, matches(RegExp(r'^-?\d+\.\d+,\s*-?\d+\.\d+$')));
    c.dispose();
  });

  test('Try again asks the network at once, not after the offline window (a fixed clock never ends it)', () async {
    net.mode = NetMode.offline;
    final c = HallController(repo, 'W')..load(5);
    await settled(c, [5]);
    expect(c.state(5), MenuState.offline);
    net.mode = NetMode.ok;
    c.retry(5);
    await settled(c, [5]);
    expect(c.state(5), MenuState.ok);
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
