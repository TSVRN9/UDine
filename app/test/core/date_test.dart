// Port of shared/src/date.test.ts. Dates are built from local components, so the suite passes in any host zone,
// except the two DST cases which only bite in a zone that observes US DST (they still hold elsewhere).
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/date.dart';

void main() {
  const today = '2026-08-19';

  group('resolveMenuDate', () {
    test('absent, empty, past and garbage fall back to today', () {
      for (final p in [null, '', '2026-08-01', 'banana', '2026-08-19']) {
        expect(resolveMenuDate(p, today), today, reason: '$p');
      }
    });
    test('impossible dates fall back instead of sorting after today', () {
      for (final p in ['2026-13-99', '9999-99-99', '2026-02-30']) {
        expect(resolveMenuDate(p, today), today, reason: p);
      }
    });
    test('a valid future date passes through', () => expect(resolveMenuDate('2026-08-20', today), '2026-08-20'));
  });

  group('nowLocalIso', () {
    test('local components with milliseconds, no zone suffix', () {
      expect(nowLocalIso(DateTime(2026, 8, 20, 23, 15, 42, 123)), '2026-08-20T23:15:42.123');
    });
    test('parses back as the same local wall clock', () {
      final back = DateTime.parse(nowLocalIso(DateTime(2026, 8, 20, 23, 15, 42, 123)));
      expect((back.hour, back.minute), (23, 15));
    });
  });

  group('effectiveTodayIso', () {
    String at(int y, int mo, int d, int h, int mi, [int s = 0, int ms = 0, int rollover = defaultRolloverHour]) =>
        effectiveTodayIso(DateTime(y, mo, d, h, mi, s, ms), rollover);

    test('the rollover is 2 AM', () => expect(defaultRolloverHour, 2));
    test('before the boundary is still the day that is ending', () {
      expect(at(2026, 8, 20, 23, 59), '2026-08-20');
      expect(at(2026, 8, 21, 0, 1), '2026-08-20');
      expect(at(2026, 8, 21, 1, 59), '2026-08-20');
      expect(at(2026, 8, 21, 1, 59, 59, 999), '2026-08-20');
    });
    test('at and after the boundary is the new day', () {
      expect(at(2026, 8, 21, 2, 0), '2026-08-21');
      expect(at(2026, 8, 21, 2, 1), '2026-08-21');
    });
    test('another rollover hour is honored', () {
      expect(at(2026, 8, 21, 3, 30, 0, 0, 4), '2026-08-20');
      expect(at(2026, 8, 21, 4, 30, 0, 0, 4), '2026-08-21');
    });
    test('month and year boundaries', () {
      expect(at(2026, 3, 1, 0, 30), '2026-02-28');
      expect(at(2027, 1, 1, 0, 30), '2026-12-31');
    });
    test('DST days', () {
      expect(at(2026, 11, 1, 0, 30), '2026-10-31');
      expect(at(2026, 11, 1, 3, 0), '2026-11-01');
      expect(at(2026, 3, 9, 0, 30), '2026-03-08');
    });
  });

  group('effectiveDayOf', () {
    test('a 12:30 AM stamp belongs to the day that is ending', () => expect(effectiveDayOf('2026-08-21T00:30:00.000', defaultRolloverHour), '2026-08-20'));
    test('2:30 AM and 11:30 PM stamps keep their own day', () {
      expect(effectiveDayOf('2026-08-21T02:30:00.000', defaultRolloverHour), '2026-08-21');
      expect(effectiveDayOf('2026-08-20T23:30:00.000', defaultRolloverHour), '2026-08-20');
    });
    test('another rollover hour is honored', () => expect(effectiveDayOf('2026-08-21T03:30:00.000', 4), '2026-08-20'));
  });
}
