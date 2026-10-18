// M2 R13 §2: the hall-card star. `vectors.json` `stars` is M2's own six cases (favourites, clock, halls with a star, the meal per
// hall); the rest is the board's day: before 02:00 the board leads with yesterday.
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/date.dart' show defaultRolloverHour;
import 'package:udine/core/m2/board.dart';
import 'package:udine/core/m2/stars.dart';
import 'support.dart';

DateTime at(String clock, {String day = today}) {
  final m = RegExp(r'^(\d+):(\d+) (AM|PM)$').firstMatch(clock)!;
  final h = int.parse(m[1]!) % 12 + (m[3] == 'PM' ? 12 : 0);
  return DateTime.parse('${day}T${h.toString().padLeft(2, '0')}:${m[2]}:00-04:00');
}

Set<String> keys(Iterable<String> names) => {for (final n in names) dishKey(n)};

void main() {
  group('M2 vectors.json stars', () {
    for (final (i, v) in (vectors['stars'] as List).indexed) {
      test('case $i: ${v['favorites']} at ${v['clock']}', () {
        final now = at(v['clock']), favs = keys(List<String>.from(v['favorites']));
        expect([for (final h in halls) if (hallStar(board, h, favs, now, defaultRolloverHour)) h], List<String>.from(v['halls']));
        expect({for (final h in halls) h: hallMeal(board, h, now, defaultRolloverHour)}, Map<String, dynamic>.from(v['meals']));
      });
    }
  });

  group('the board leads with yesterday until 02:00', () {
    final now = at('12:40 AM', day: '2026-10-09');
    final w = board.days[today]!['W']!, next = board.days['2026-10-09']!['W']!;
    final late = w['late']!.expand((s) => s.dishes).first.key;
    // a dish on the 9th's breakfast and not on the 8th at all: only a calendar-day reading could star it
    final only9 = next['breakfast']!.expand((s) => s.dishes).map((d) => d.key).firstWhere((k) => !w.values.expand((x) => x).expand((s) => s.dishes).any((d) => d.key == k));
    // Worcester's late night running to 2 AM, so Oct 8's meal is still on at 00:40
    final open = Board(clock: board.clock, places: board.places, grab: board.grab, days: board.days, events: board.events, hours: {
      ...board.hours,
      'W': DiningHallHours(hallTid: 1, general: board.hours['W']!.general, latenight: const TimeWindow(openTime: '9:00 PM', closeTime: '2:00 AM')),
    });

    test("00:40: Oct 8's late night is the meal and its dish stars; Oct 9's breakfast does not", () {
      expect(hallMeal(open, 'W', now, defaultRolloverHour), 'late');
      expect(hallStar(open, 'W', {late}, now, defaultRolloverHour), isTrue);
      expect(hallStar(open, 'W', {only9}, now, defaultRolloverHour), isFalse);
    });
    test('00:40 after the hall closed at 11:59 PM: no meal ahead on the 8th, so no star for the 9th', () {
      expect(hallMeal(board, 'W', now, defaultRolloverHour), isNull);
      expect(hallStar(board, 'W', {only9, late}, now, defaultRolloverHour), isFalse);
    });
    test('02:00 is the 9th again: breakfast is ahead and its dish stars', () {
      final at2 = at('2:00 AM', day: '2026-10-09');
      expect(hallMeal(board, 'W', at2, defaultRolloverHour), 'breakfast');
      expect(hallStar(board, 'W', {only9}, at2, defaultRolloverHour), isTrue);
    });
  });
}
