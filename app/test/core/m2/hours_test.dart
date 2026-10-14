// M2's café hours run through core/hours.dart (the one implementation), at the fixture's cafés.
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/hours.dart';
import 'package:udine/core/types.dart';
import 'support.dart';

DateTime at(String hhmm) => DateTime.parse('2026-10-08T$hhmm:00-04:00');

void main() {
  test('effectiveMealWindow clamps the standard lunch to general', () {
    final h = board.hours['c12']!; // general 8 AM - 4 PM, no per-meal windows
    final lunch = effectiveMealWindow(h, HallMealPeriod.lunch, at('12:00'))!;
    expect([lunch.openTime, lunch.closeTime], ['11:00 AM', '4:00 PM']);
    expect(effectiveMealWindow(h, HallMealPeriod.dinner, at('12:00')), isNull);
    expect(effectiveMealWindow(h, HallMealPeriod.lunch, at('20:00')), isNull);
  });
  test('openStatus is half-open at close', () {
    final h = board.hours['c12']!; // general 8 AM - 4 PM
    expect(openStatus(h, at('15:59')), isA<Open>());
    expect(openStatus(h, at('16:00')), isA<Closed>());
    expect(((openStatus(h, at('06:00')) as Closed).opensAt), at('08:00'));
  });
}
