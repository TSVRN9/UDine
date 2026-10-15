import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/m2/events.dart';

void main() {
  const today = '2026-10-08'; // the recording's day; expiries are the recorded feed's
  test('evWhen: the day within a week, a run within two months, nothing past that', () {
    expect(eventWhen(today, 1791777600), 'Mon, Oct 12');
    expect(eventWhen(today, 1793419200), 'Through Oct 31');
    expect(eventWhen(today, 1806465600), '');
    expect(eventWhen(today, 1901073600), '');
  });
  test('evDay: days from today to the expiry', () {
    expect(eventDay(today, 1791777600), 4);
    expect(eventDay(today, 1793419200), 23);
  });
}
