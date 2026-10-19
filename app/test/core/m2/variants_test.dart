// M2 round 12's variant families (src.html `variantOf`, `famsAt`, `phoAxes`, `standing`) against vectors.json `variants`.
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/m2/board.dart';
import 'package:udine/core/m2/where.dart';
import 'package:udine/core/m2/plate.dart';
import 'package:udine/core/m2/search.dart';
import 'package:udine/core/m2/variants.dart';
import 'support.dart';

Iterable<({String iso, String place, String meal, int si, Station st})> stations() sync* {
  for (final MapEntry(key: iso, value: places) in board.days.entries) {
    for (final MapEntry(key: place, value: meals) in places.entries) {
      for (final MapEntry(key: meal, value: sts) in meals.entries) {
        for (var si = 0; si < sts.length; si++) {
          yield (iso: iso, place: place, meal: meal, si: si, st: sts[si]);
        }
      }
    }
  }
}

String _row(String iso, String place, String meal, String station, String name, String axis, List vars) => jsonEncode([iso, place, meal, station, name, axis, vars]);

void main() {
  final v = vectors['variants'] as Map<String, dynamic>;
  setUp(forgetShownNames);

  test('variantOf reads a size, a milk or a base, in that order', () {
    expect(variantOf('16 oz Cappuccino'), (axis: 'size', name: 'Cappuccino', v: '16 oz', chip: '16 oz', o: 16));
    expect(variantOf('Berry Acai Bowl (8oz)')?.name, 'Berry Acai Bowl');
    expect(variantOf('Boba Oat Milk'), (axis: 'milk', name: 'Boba', v: 'Oat Milk', chip: 'Oat', o: 0));
    expect(variantOf('1% Milk')?.name, '');
    expect(variantOf('Banana Berry Coconut Smoothie'), (axis: 'base', name: 'Banana Berry Smoothie', v: 'Coconut', chip: 'Coconut', o: 0));
    expect(variantOf('Matcha Strawberry w/Yogurt')?.name, 'Matcha Strawberry');
    expect(variantOf('Coconut Flavored Syrup'), isNull);
    expect(variantOf('Coconut Mango Acai Bowl'), isNull);
  });

  test('families: every station-meal of the 15 days is the vector\'s, and no other', () {
    final name = {for (final p in board.places) p.key: p.name};
    // (a blank calorie reads 0 until the missing-nutrients task parses it as null)
    final want = [for (final f in v['families'] as List) _row(f['day'], f['place'], f['meal'], f['station'], f['name'], f['axis'], [for (final x in f['variants']) [x[0], x[1], x[2] ?? 0]])]..sort();
    final got = <String>[];
    for (final s in stations()) {
      for (final f in famsAt(s.st.dishes, s.st.name)) {
        got.add(_row(s.iso, name[s.place]!, s.meal, s.st.name, f.name, f.axis, [for (final x in f.vars) [x.v, x.dish.dishName, x.dish.nutrition.calories]]));
      }
    }
    expect(want, hasLength(392));
    expect(got..sort(), want);
  });

  test('a family\'s key is f: and the normalised name; sizes run smallest first, the others keep the feed\'s order', () {
    final fs = [for (final s in stations()) ...famsAt(s.st.dishes, s.st.name)];
    expect(fs.map((f) => f.key).toSet(), contains('f:boba'));
    for (final f in fs) {
      expect(f.key, 'f:${dishKey(f.name)}');
      if (f.axis == 'size') expect([for (final x in f.vars) x.o], [for (final x in f.vars) x.o]..sort());
    }
  });

  test('near-misses stay rows: no set of names the vector lists is a family at its place and station', () {
    final name = {for (final p in board.places) p.key: p.name};
    String key(String place, String station, Iterable<String> names) => '$place|$station|${(names.toList()..sort()).join('|')}';
    final listed = {for (final m in v['nearMiss'] as List) if ((m['names'] as List).length > 1) key(m['place'], m['station'], (m['names'] as List).cast<String>())};
    expect(listed, isNotEmpty);
    for (final s in stations()) {
      for (final f in famsAt(s.st.dishes, s.st.name)) {
        expect(listed, isNot(contains(key(name[s.place]!, s.st.name, [for (final x in f.vars) x.dish.dishName]))));
      }
    }
  });

  test('shown: a member reads "Name, token"; a lone size, a milk with nothing left and an add-on keep the feed\'s name', () {
    final ix = familiesOf(board);
    for (final MapEntry(key: feed, value: shown) in {for (final p in v['shown'] as List) p[0] as String: p[1] as String}.entries) {
      // (the 15 days hold every name the vector lists, but a name that is a member only on some days is checked where it is one)
      final ds = [for (final s in stations()) for (final d in s.st.dishes) if (d.dishName == feed) d];
      if (ds.isEmpty) continue;
      if (ds.any((d) => ix.familyOf(d) != null)) {
        expect(shownOf(ix, ds.firstWhere((d) => ix.familyOf(d) != null)), shown, reason: feed);
      } else {
        expect(shown, feed, reason: feed);
      }
    }
    expect(ix.names['f:boba'], 'Boba');
  });

  test('phoAxes: the two café pho grids, a complete protein x broth grid of at least 2 x 2', () {
    final name = {for (final p in board.places) p.key: p.name};
    final found = <String, PhoAxes>{};
    for (final s in stations()) {
      if (s.st.name != 'Noodle Bowl') continue;
      final a = phoAxes(s.st.dishes);
      if (a != null) found[name[s.place]!] = a;
    }
    for (final w in v['phos'] as List) {
      final a = found[w['place']]!;
      expect([for (final (t, l) in a.p) [t, l]], w['proteins']);
      expect([for (final (t, l) in a.b) [t, l]], w['broths']);
      for (final g in w['grid'] as List) {
        expect(a.dish(g[0], g[1])?.dishName, g[2]);
      }
    }
    expect(found.keys.toSet(), {for (final w in v['phos'] as List) w['place']});
    expect(phoAxes([for (final d in found.values.first.grid.values.take(5)) d]), isNull, reason: 'an incomplete grid is one picker of whole dishes');
  });

  test('Search: a family is one row under its name, standing for what was typed, else the default', () {
    final ix = SearchIndex(board, DateTime.parse('2026-10-08T12:41:00-04:00'));
    for (final w in v['search'] as List) {
      final r = runSearch(ix, query: w['query']);
      final got = [
        for (final x in [...r.now, ...r.cafes])
          {'name': x.g.name, 'variant': x.g.vars?.firstWhere((y) => y.chip == x.chip).v, 'dish': x.d.dishName, 'places': x.g.places},
      ];
      expect(got, w['rows'], reason: w['query']);
    }
  });

  test('the row follows the plate: the latest variant touched upward, a minus never counts, then the next, then the default', () {
    final place = board.places.firstWhere((p) => p.name == 'Procrastination Station').key;
    final menu = board.days[today]![place]!;
    final meal = menu.keys.firstWhere((m) => menu[m]!.any((s) => famsAt(s.dishes, s.name).any((f) => f.key == 'f:boba')));
    final fam = [for (final s in menu[meal]!) ...famsAt(s.dishes, s.name)].firstWhere((f) => f.key == 'f:boba');
    final ix = familiesOf(board);
    var plate = emptyPlates;
    Variant byChip(String c) => fam.vars.firstWhere((x) => x.chip == c);
    void op(String o) {
      if (o == 'empty plate') return;
      final c = o.split(' ').last, x = byChip(c), at = findItem(plate, 'lunch', x.dish.key, place);
      plate = switch (o.split(' ').first) {
        'add' => addDish(plate, 'lunch', shownOf(ix, x.dish), {place: x.dish}, null, x.dish.key),
        'up' => stepItem(plate, at!.plate.id, x.dish.key, 1),
        'down' => stepItem(plate, at!.plate.id, x.dish.key, -1),
        _ => plate,
      };
    }

    for (final w in v['follow'] as List) {
      op(w['op']);
      final stands = standing(fam.vars, (x) => findItem(plate, 'lunch', x.dish.key, place)?.item.at, (_) => true)!;
      expect(stands.chip, w['stands'], reason: w['op']);
      expect(findItem(plate, 'lunch', stands.dish.key, place)?.item.qty ?? 0, w['counts'], reason: w['op']);
      expect([for (final p in plate.plates) for (final it in p.items) [it.name, it.qty]], w['plate'], reason: w['op']);
    }
  });

  test('an Update to another variant keeps the servings, merges into a twin, and is the latest touched', () {
    final menu = board.days[today]!['c12']!;
    final fam = [for (final ss in menu.values) for (final s in ss) ...famsAt(s.dishes, s.name)].firstWhere((f) => f.axis == 'size');
    final a = fam.vars[0].dish, b = fam.vars[1].dish;
    var p = addDish(emptyPlates, 'lunch', 'a', {'c12': a}, null, a.key);
    p = stepItem(p, p.plates.first.id, a.key, 1);
    p = updateDish(p, p.plates.first.id, a.key, 'b', b.key, {'c12': b});
    expect([for (final it in p.plates.first.items) (it.key, it.qty)], [(b.key, 2.0)]);
    p = addDish(p, 'lunch', 'a', {'c12': a}, null, a.key);
    expect(findItem(p, 'lunch', a.key)!.item.at, greaterThan(findItem(p, 'lunch', b.key)!.item.at));
    p = updateDish(p, p.plates.first.id, a.key, 'b', b.key, {'c12': b});
    expect([for (final it in p.plates.first.items) (it.key, it.qty)], [(b.key, 3.0)]);
  });

  test('alerts: a starred family is one notice by its name, its body the where sentence of any variant\'s serving; none once it is past', () {
    String andList(List<String> l) => l.length < 2 ? l.join() : '${l.sublist(0, l.length - 1).join(', ')} and ${l.last}';
    final name = {for (final p in board.places) p.key: p.name};
    for (final w in v['alerts'] as List) {
      final family = (w['favorite'] as String).substring(2);
      final at = DateTime.parse('2026-10-08T${_clock24(w['clock'])}:00-04:00');
      final a = whereAnswer(board, 'f:$family', at);
      // (round 13: the server's push is at about 7 AM, so a run outside 7:00 to 7:59 posts nothing)
      final posted = !_clock24(w['clock']).startsWith('07') || a.isEmpty || a.first.day != 0
          ? []
          : [[familiesOf(board).names['f:$family'], '${whenText(a.first)}${a.first.st == 'now' ? ',' : ''} at ${andList([for (final h in a.first.halls) name[h]!])}']];
      expect(posted, w['posted'], reason: w['clock']);
    }
  });

  test('a past meal reads a family\'s variant by its name once the menus have been read', () {
    primeShownNames([for (final s in stations()) s.st]);
    expect(shownName('20 oz Cappuccino'), 'Cappuccino, 20 oz');
    expect(shownName('Boba Oat Milk'), 'Boba, Oat Milk');
    expect(shownName('Beef Brisket Noodle Bowl'), 'Beef Brisket Noodle Bowl');
  });
}

String _clock24(String c) {
  final m = RegExp(r'^(\d+):(\d+) (AM|PM)$').firstMatch(c)!;
  return '${((int.parse(m[1]!) % 12) + (m[3] == 'PM' ? 12 : 0)).toString().padLeft(2, '0')}:${m[2]}';
}
