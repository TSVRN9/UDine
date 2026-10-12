import 'package:flutter_test/flutter_test.dart';
import 'package:udine_bakeoff/logic/hours.dart';
import 'support.dart';

DateTime wall(String hhmm) => toEastern(DateTime.parse('2026-10-08T$hhmm:00-04:00'));

void main() {
  test('effectiveMealWindow clamps the standard lunch to general', () {
    final h = fx.hours['F']!; // general 10 AM - 4 PM, no per-meal windows
    final lunch = effectiveMealWindow(h, 'lunch', wall('12:00'))!;
    expect([lunch.openTime, lunch.closeTime], ['11:00 AM', '4:00 PM']);
    expect(effectiveMealWindow(h, 'dinner', wall('12:00')), isNull);
    expect(effectiveMealWindow(h, 'lunch', wall('20:00')), isNull);
  });
  test('openStatus is half-open at close', () {
    final h = fx.hours['H']!; // general 7 AM - 11 AM
    expect(openStatus(h, wall('10:59')).open, isTrue);
    final s = openStatus(h, wall('11:00'));
    expect([s.open, s.opensAt?.hour], [false, 7]);
  });
  test('formatTimeOfDay and sortStationNames', () {
    expect(formatTimeOfDay(DateTime.utc(2026, 10, 8, 0, 5)), '12:05 AM');
    expect(formatTimeOfDay(DateTime.utc(2026, 10, 8, 16, 30)), '4:30 PM');
    expect(sortStationNames(['Desserts', 'Grill', 'Soups']), ['Grill', 'Soups', 'Desserts']);
  });
}
