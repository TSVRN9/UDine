import 'package:flutter_test/flutter_test.dart';
import 'package:udine_bakeoff/logic/fixture.dart';
import 'support.dart';

void main() {
  test('scores match M2 for every dish in the 15 days', () {
    final got = fx.dishes.map((d) => '${d.name}|${d.health}|${d.carbon}').toSet().toList()..sort();
    final want = (vectors['scores'] as List).map((s) => '${s['dish']}|${s['health']}|${s['carbon']}').toSet().toList()..sort();
    expect(got, want);
  });

  test('a healthfulness number without an H code is unscored, and H0 is a real 0', () {
    final scores = (vectors['scores'] as List);
    final unscored = scores.where((s) => s['rawHealthfulness'] != null && s['health'] == null).toList();
    expect(unscored.length, greaterThanOrEqualTo(16));
    for (final s in unscored) {
      expect(fx.dishes.where((d) => d.name == s['dish']).any((d) => d.health == null), isTrue);
    }
    expect(fx.dishes.any((d) => d.health == 0), scores.any((s) => s['health'] == 0));
  });

  test('price shows for a café serving only', () {
    final keyOf = {for (final e in (vectors['places'] as Map).entries) e.value as String: e.key as String};
    for (final p in vectors['price'] as List) {
      final place = keyOf[p['place']]!;
      final all = fx.days.values
          .expand((d) => (d[place] ?? {}).values.expand((sts) => sts))
          .expand((s) => s.dishes)
          .where((d) => d.key == dishKey(p['dish']))
          .toList();
      final d = all.firstWhere((x) => x.price != null, orElse: () => all.first);
      expect(shownPrice(place, d), p['shown']);
      expect(isCafe(place), place.startsWith('c'));
    }
  });

  test('the café list and keys match M2', () {
    final names = {for (final p in fx.places) p.key: p.name};
    for (final e in (vectors['places'] as Map).entries) {
      expect(names[e.key], e.value);
    }
    expect(fx.places.where((p) => p.key.startsWith('c')), hasLength(29));
    final c28 = fx.places.firstWhere((p) => p.key == 'c28');
    expect([c28.name, c28.area], ['Charles River Campus', 4]);
  });

  test('fixed clock, days and empty days', () {
    expect(fx.clock, '2026-10-08T12:41:00-04:00');
    expect(fx.days, hasLength(15));
    expect(fx.days['2026-10-10'], isEmpty);
    expect(fx.days[today]!['F']!['breakfast'], isNotNull);
  });

  test('benchmark plate dishes exist at Worcester lunch', () {
    final w = fx.days[today]!['W']!['lunch']!.expand((s) => s.dishes).map((d) => d.name).toList();
    expect(w, containsAll(['Beef Brisket Noodle Bowl', 'Golden BBQ Chicken Thigh']));
  });

  test('clockMeal reads Eastern wall time', () {
    expect(clockMeal(DateTime.parse('2026-10-08T12:41:00-04:00')), 'lunch');
    expect(clockMeal(DateTime.parse('2026-10-08T08:00:00-04:00')), 'breakfast');
    expect(clockMeal(DateTime.parse('2026-10-08T22:00:00-04:00')), 'late');
    expect(clockMeal(DateTime.parse('2026-10-08T22:00:00Z')), 'dinner'); // 6 PM Eastern
  });
}
