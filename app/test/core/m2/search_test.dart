// M2's Search groups (renderSearch, results, cafeResults, placeHits, laterHits) over the bake-off fixture's 15 days.
// The first groups assert M2's rules (read from src.html); the last group runs M2's own `search` cases from vectors.json.
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/m2/board.dart';
import 'package:udine/core/m2/plate.dart';
import 'package:udine/core/m2/search.dart';
import 'package:udine/core/m2/where.dart';
import 'package:udine/core/m2/menu_view.dart' show noPrefs;
import 'package:udine/core/search.dart';
import 'package:udine/screens/search/search_entries.dart';
import 'support.dart';

final now = DateTime.parse('2026-10-08T12:41:00-04:00');
SearchResult run(String q, {Set<Lens> lenses = const {}, bool newton = false, Set<String> favorites = const {}, PlateState plate = emptyPlates}) =>
    runSearch(SearchIndex(board, now, charlesRiver: newton), query: q, lenses: lenses, favorites: favorites, plate: plate);

void main() {
  test('searchWords is the normalizer matchesQuery reads', () {
    expect(searchWords("Peet’s  Coffee & Tea"), ['peet', 's', 'coffee', 'tea']);
    expect(searchWords('   '), isEmpty);
  });

  test('wherePlan keeps every group; whereAnswer is its first two', () {
    final plan = wherePlan(board, 'Golden BBQ Chicken Thigh', now);
    expect(plan, isNotEmpty);
    expect(whereAnswer(board, 'Golden BBQ Chicken Thigh', now).length, lessThanOrEqualTo(2));
  });

  test('wouldSplit: a plate exists and none can take the dish', () {
    final w = addDish(emptyPlates, 'lunch', 'A', {'W': dishes.first});
    expect(wouldSplit(emptyPlates, 'lunch', ['W']), isFalse);
    expect(wouldSplit(w, 'lunch', ['W', 'F']), isFalse);
    expect(wouldSplit(w, 'lunch', ['F']), isTrue);
    expect(wouldSplit(w, 'dinner', ['W']), isTrue);
  });

  group('idle and lens-only', () {
    test('idle lists the halls\' lunch of 40 cal or more: no places, cafés or later', () {
      final r = run('');
      expect(r.places, isEmpty);
      expect(r.cafes, isEmpty);
      expect(r.later, isEmpty);
      expect(r.now, isNotEmpty);
      expect(r.now.every((x) => x.d.nutrition.calories >= 40), isTrue);
      expect(r.now.every((x) => x.g.refs.keys.every((p) => !isCafe(p))), isTrue);
    });
    test('a lens alone also fills the café group, and idle (no lens) never does', () {
      expect(run('', lenses: {Lens.protein}).cafes, isNotEmpty);
    });
    test('High protein keeps 15 g or more, most protein first', () {
      final r = run('', lenses: {Lens.protein}).now;
      expect(r.every((x) => x.d.nutrition.proteinG >= 15), isTrue);
      for (var i = 1; i < r.length; i++) {
        expect(r[i - 1].d.nutrition.proteinG, greaterThanOrEqualTo(r[i].d.nutrition.proteinG));
      }
    });
    test('Light keeps 40 to 250 cal, fewest calories first', () {
      final r = run('', lenses: {Lens.light}).now;
      expect(r, isNotEmpty);
      expect(r.every((x) => x.d.nutrition.calories >= 40 && x.d.nutrition.calories <= 250), isTrue);
      for (var i = 1; i < r.length; i++) {
        expect(r[i - 1].d.nutrition.calories, lessThanOrEqualTo(r[i].d.nutrition.calories));
      }
    });
    test('diet and carbon lenses', () {
      expect(run('', lenses: {Lens.veg}).now.every((x) => x.d.diet & 3 != 0), isTrue);
      expect(run('', lenses: {Lens.plant}).now.every((x) => x.d.diet & 2 != 0), isTrue);
      expect(run('', lenses: {Lens.halal}).now.every((x) => x.d.diet & 4 != 0), isTrue);
      expect(run('', lenses: {Lens.lowc}).now.every((x) => x.d.carbon == 'A' || x.d.carbon == 'B'), isTrue);
      expect(run('', lenses: {Lens.lowc}).now, isNotEmpty);
    });
    test('Favorites with none starred is empty; with one, only it', () {
      expect(run('', lenses: {Lens.fav}).now, isEmpty);
      final r = run('', lenses: {Lens.fav}, favorites: {'Golden BBQ Chicken Thigh'});
      expect([for (final x in r.now) x.g.name], ['Golden BBQ Chicken Thigh']);
    });
  });

  group('typing', () {
    test('token-AND over the name: "white pizza" finds "White Cheese Pizza"-style names, ranked by where the query starts', () {
      final r = run('pizza');
      expect(r.now, isNotEmpty);
      expect(r.now.every((x) => matchesQuery(x.g.name, 'pizza')), isTrue);
      int rank(String n) { final k = dishKey(n); return k.startsWith('pizza') ? 0 : k.split(' ').any((w) => w.startsWith('pizza')) ? 1 : 2; }
      for (var i = 1; i < r.now.length; i++) {
        expect(rank(r.now[i - 1].g.name), lessThanOrEqualTo(rank(r.now[i].g.name)));
      }
    });
    test('a café group never shares a row with a hall group, and carries only cafés', () {
      final r = run('fries');
      expect(r.cafes.every((x) => x.g.refs.keys.every(isCafe)), isTrue);
      expect(r.now.every((x) => x.g.refs.keys.every((p) => !isCafe(p))), isTrue);
    });
    test('Later rows: not served now anywhere, soonest first, at most 8, none with a control group', () {
      final r = run('a');
      final nowKeys = {for (final x in [...r.now, ...r.cafes]) dishKey(x.g.name)};
      expect(r.later.length, lessThanOrEqualTo(8));
      for (final l in r.later) {
        expect(l.g.st, isNot('now'));
        expect(nowKeys, isNot(contains(dishKey(l.d.dishName))));
      }
      const rank = {'later': 0, 'tomorrow': 1};
      for (var i = 1; i < r.later.length; i++) {
        expect(rank[r.later[i - 1].g.st]!, lessThanOrEqualTo(rank[r.later[i].g.st]!));
      }
    });
    test('no query, no later rows, even with a lens', () => expect(run('', lenses: {Lens.protein}).later, isEmpty));
    test('Places: the hall by word-prefix, a café by name', () {
      expect([for (final p in run('worcester').places) if (p is HallHit) p.key], ['W']);
      expect(run('hal').places.whereType<HallHit>().length, 4);
      expect(run('wasabi').places.whereType<CafeHit>().map((c) => c.key), ['c5']);
      expect(run('worcester grab').places.whereType<GrabHit>().map((c) => c.key), ['W']);
    });
    test('Charles River places and servings follow the toggle', () {
      expect(run('charles').places.whereType<CafeHit>(), isEmpty);
      expect(run('charles', newton: true).places.whereType<CafeHit>().map((c) => c.key), contains('c28'));
      final q = 'Chorizo Jalapeno Quesadilla';
      expect(run(q).cafes.expand((x) => x.g.refs.keys), isNot(contains('c28')));
      expect(run(q, newton: true).cafes.expand((x) => x.g.refs.keys).followedBy(run(q, newton: true).later.expand((l) => l.g.halls)), contains('c28'));
    });
    test('order is a function of query, lenses and the plate it was computed with, nothing else', () {
      final a = run('chicken'), b = run('chicken');
      expect([for (final x in a.now) x.g.name], [for (final x in b.now) x.g.name]);
    });
  });

  test('representative serving: the front plate\'s hall first, else the first by place order', () {
    final r = run('brisket');
    final g = r.now.firstWhere((x) => x.g.refs.length > 1);
    expect(g.d, same(g.g.refs[(g.g.refs.keys.toList()..sort((a, b) => placeOrder(a) - placeOrder(b))).first]));
    final b = g.g.refs.keys.last;
    final plate = addDish(emptyPlates, 'lunch', 'x', {b: g.g.refs[b]!});
    final r2 = run('brisket', plate: plate);
    expect(r2.now.firstWhere((x) => x.g.name == g.g.name).d, same(g.g.refs[b]));
  });

  group('M2 vectors.json search cases', () {
    for (final v in vectors['search'] as List) {
      final lenses = {for (final l in (v['lens'] as List? ?? const [])) Lens.values.byName(l)};
      test('${v['q'].isEmpty ? '(idle)' : v['q']}${lenses.isEmpty ? '' : ' ${lenses.map((l) => l.name).join('+')}'}${v['newton'] == true ? ' (Charles River on)' : ''}', () {
        final e = searchEntries(
          raw: run(v['q'], lenses: lenses, newton: v['newton'] == true), query: v['q'], lenses: lenses, meal: 'lunch', prefs: noPrefs, reveal: false, track: false);
        final groups = <Map<String, Object?>>[];
        Map<String, Object?> cur = {'title': null, 'rows': <String>[]};
        for (final x in e) {
          final rows = cur['rows']! as List<String>;
          switch (x) {
            case GroupHead(:final title):
              groups.add(cur);
              cur = {'title': title, 'rows': <String>[]};
            case HallCardsEntry(:final keys):
              rows.addAll([for (final k in keys) 'hall:$k']);
            case PlaceEntry(:final hit):
              rows.add(hit is GrabHit ? 'grab:${hit.key}' : 'cafe:${hit.key}');
            case NowEntry(:final row, :final cafe):
              rows.add('${cafe ? 'cafe-dish' : 'dish'}:${row.g.key}');
            case LaterEntry(:final row):
              rows.add('later:${row.d.key}');
            case EmptyEntry(:final text):
              rows.add('empty:$text');
            case DietLine() || CustomEntry() || FoodEntry() || PackWaitEntry() || PackFailEntry() || LookupButtonEntry() || LookupStateEntry():
              break;
          }
        }
        groups.add(cur);
        expect([for (final g in groups) if (g['title'] != null || (g['rows']! as List).isNotEmpty) g], v['groups']);
      });
    }
  });

// After midnight the board still leads with yesterday (the rollover is 2 AM), while wherePlan counts from the calendar date.
group('later rows between midnight and the rollover', () {
  final isos = board.days.keys.toList();
  // the board as the app builds it at `lead`: its first day is `lead`, then the next
  Board boardLeading(int lead) => Board(clock: board.clock, places: board.places, hours: board.hours, grab: board.grab,
      days: {isos[lead]: board.days[isos[lead]]!, isos[lead + 1]: board.days[isos[lead + 1]]!}, events: board.events);
  // 2026-10-09 is the calendar date; at 00:40 and 01:30 the board still leads with the 8th
  DateTime at(String hhmm) => DateTime.parse('2026-10-09T$hhmm:00-04:00');
  final calendarToday = isos[1];

  LaterRow? laterFor(Board b, DateTime t, String name) =>
      runSearch(SearchIndex(b, t), query: name, lenses: const {}, favorites: const {}, plate: emptyPlates).later.where((r) => r.d.dishName == name).firstOrNull;

  // a dish on the 9th's breakfast menu and not on the 8th's late menu, so it is a "later" row at 00:40
  String? breakfastOnlyOn(String iso, String other) {
    final on = {for (final p in board.days[iso]!.values) for (final s in p['breakfast'] ?? const <Station>[]) for (final d in s.dishes) d.dishName};
    final off = {for (final p in board.days[other]!.values) for (final ss in p.values) for (final s in ss) for (final d in s.dishes) d.dishName};
    return on.difference(off).firstOrNull;
  }

  for (final hhmm in ['00:40', '01:30']) {
    test('$hhmm: a later row names the calendar day\'s menu and opens on its board index', () {
      final b = boardLeading(0);
      final name = breakfastOnlyOn(calendarToday, isos[0])!;
      final r = laterFor(b, at(hhmm), name);
      expect(r, isNotNull);
      expect(r!.g.st, 'later');
      expect(r.d.date, calendarToday);
      expect(boardDay(b, r.g), 1);
    });
  }

  test('2:00: the board leads with the calendar day and a later row is unchanged', () {
    final b = boardLeading(1);
    final name = breakfastOnlyOn(isos[1], isos[0])!;
    final r = laterFor(b, at('02:00'), name);
    expect(r, isNotNull);
    expect(r!.d.date, isos[1]);
    expect(boardDay(b, r.g), 0);
  });
});
}
