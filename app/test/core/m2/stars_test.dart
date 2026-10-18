// M2 R13 §2: the hall-card star. `vectors.json` `stars` is M2's own six cases (favourites, clock, halls with a star, the meal per
// hall); the rest is the board's day: before 02:00 the board leads with yesterday.
import 'package:flutter_test/flutter_test.dart';
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
        expect([for (final h in halls) if (hallStar(board, h, favs, today, now)) h], List<String>.from(v['halls']));
        expect({for (final h in halls) h: hallMeal(board, h, today, now)}, Map<String, dynamic>.from(v['meals']));
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
      expect(hallMeal(open, 'W', today, now), 'late');
      expect(hallStar(open, 'W', {late}, today, now), isTrue);
      expect(hallStar(open, 'W', {only9}, today, now), isFalse);
    });
    test('00:40 after the hall closed at 11:59 PM: no meal ahead on the 8th, so no star for the 9th', () {
      expect(hallMeal(board, 'W', today, now), isNull);
      expect(hallStar(board, 'W', {only9, late}, today, now), isFalse);
    });
    test("00:40: a dish on the 9th's late night and not the 8th's does not star, a dish on the 8th's and not the 9th's does", () {
      Set<String> lateKeys(String iso) => {for (final st in open.days[iso]!['W']!['late']!) for (final d in st.dishes) d.key};
      final l8 = lateKeys(today), l9 = lateKeys('2026-10-09');
      final on8 = l8.difference(l9), on9 = l9.difference(l8);
      expect(on8, isNotEmpty);
      expect(on9, isNotEmpty);
      expect(hallStar(open, 'W', {on8.first}, today, now), isTrue);
      expect(hallStar(open, 'W', {on9.first}, today, now), isFalse);
    });
    test('the menus are the board day the caller names, not the Eastern calendar day (a device in another zone keys its board by its own day)', () {
      // 11:30 PM Eastern on the 8th is the 9th in Tokyo, where repo.today, and so the board's key, is '2026-10-09'
      final tokyo = DateTime.parse('2026-10-08T23:30:00-04:00');
      final l9 = {for (final st in board.days['2026-10-09']!['W']!['late']!) for (final d in st.dishes) d.key};
      final l8 = {for (final st in board.days[today]!['W']!['late']!) for (final d in st.dishes) d.key};
      final on9 = l9.difference(l8).first;
      expect(hallMeal(board, 'W', '2026-10-09', tokyo), 'late');
      expect(hallStar(board, 'W', {on9}, '2026-10-09', tokyo), isTrue);
    });
    test('the minutes are the board\'s: 00:40 is 1480, 02:00 is 120', () {
      expect(boardMinute(now), 24 * 60 + 40);
      expect(boardMinute(at('2:00 AM', day: '2026-10-09')), 120);
    });
    test('02:00 is the 9th again: breakfast is ahead and its dish stars', () {
      final at2 = at('2:00 AM', day: '2026-10-09');
      expect(hallMeal(board, 'W', '2026-10-09', at2), 'breakfast');
      expect(hallStar(board, 'W', {only9}, '2026-10-09', at2), isTrue);
    });
  });
}