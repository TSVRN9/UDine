import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/m2/events.dart';

void main() {
  edges();
  const today = '2026-10-08'; // the recording's day; expiries are the recorded feed's
  test('evWhen: the day within a week, a run within two months, nothing past that', () {
    expect(eventWhen(today, 1791777600), 'Mon, Oct 12');
    expect(eventWhen(today, 1793419200), 'Through Oct 31');
    expect(eventWhen(today, 1806465600), '');
    expect(eventWhen(today, 1901073600), '');
  });
}

int at(String iso) => DateTime.parse(iso).millisecondsSinceEpoch ~/ 1000;

void edges() {
  const today = '2026-10-08'; // days are counted from its UTC midnight, as M2 does
  test('evWhen: exactly 7.0 days is still the day, a second more is a run', () {
    expect(eventWhen(today, at('2026-10-15T00:00:00Z')), 'Thu, Oct 15');
    expect(eventWhen(today, at('2026-10-15T00:00:01Z')), 'Through Oct 15');
  });
  test('evWhen: exactly 60.0 days is still a run, a second more is nothing', () {
    expect(eventWhen(today, at('2026-12-07T00:00:00Z')), 'Through Dec 7');
    expect(eventWhen(today, at('2026-12-07T00:00:01Z')), '');
  });
  test('evWhen: expiring today reads as today, an expired event as its own day', () {
    expect(eventWhen(today, at('2026-10-08T12:00:00Z')), 'Thu, Oct 8');
    expect(eventWhen(today, at('2026-10-07T12:00:00Z')), 'Wed, Oct 7');
  });
}
