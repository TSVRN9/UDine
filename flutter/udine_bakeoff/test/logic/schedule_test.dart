import 'package:flutter_test/flutter_test.dart';
import 'package:udine_bakeoff/logic/schedule.dart';
import 'support.dart';

void main() {
  test('lists the 15 days in date order, the chosen one open with each meal\'s window', () {
    final s = schedule(fx, 'W', 0);
    expect(s.days, hasLength(15));
    expect(s.days.take(3).map((d) => d.label).toList(), ['Today', 'Tomorrow', 'Saturday, October 10']);
    expect((s.days[0].current, s.days[0].right), (true, '7 AM to midnight'));
    expect(s.days[0].meals.map((m) => (m.label, m.window)).toList(), [
      ('Breakfast', '7 AM to 11 AM'), ('Lunch', '11 AM to 4:30 PM'), ('Dinner', '4:30 PM to 9 PM'), ('Late night', '9 PM to midnight'), ("Grab 'N Go", '7 AM to 8 PM'),
    ]);
    expect(s.days.where((d) => d.meals.isNotEmpty), hasLength(1));
  });
  test('opens another day in place and closes today', () {
    final s = schedule(fx, 'W', 9);
    expect((s.days[9].current, s.days[9].label, s.days[9].right), (true, 'Saturday, October 17', '7 AM to midnight'));
    expect(s.days[9].meals.map((m) => m.label).toList(), ['Breakfast', 'Lunch', 'Dinner', 'Late night']);
    expect((s.days[0].current, s.days[0].right, s.days[0].meals.length), (false, '', 0));
  });
  test('Oct 10 says No menu posted; Oct 12 is a holiday row carrying the hours event', () {
    expect(schedule(fx, 'W', 0).days[2].right, 'No menu posted');
    final s = schedule(fx, 'W', 4);
    expect(s.days[4].right, 'Holiday hours');
    expect(s.days[4].event, (title: 'Indigenous Peoples Day Hours', href: 'https://www.umassdining.com/hours'));
    expect(s.days[4].meals, isEmpty);
    expect(schedule(fx, 'W', 0).days[4].right, 'Holiday hours');
  });
  test('a café has no holiday row and carries its building, payment and description; empty café days say so', () {
    final wasabi = fx.places.firstWhere((p) => p.name == 'Wasabi').key;
    final s = schedule(fx, wasabi, 0);
    expect(s.days[0].meals.map((m) => (m.label, m.window)).toList(), [('Lunch', '11 AM to 4:30 PM'), ('Dinner', '4:30 PM to 9 PM')]);
    expect(s.days[0].right, '11 AM to 9 PM');
    expect(s.days[3].right, 'No menu posted');
    expect(s.days[4].right, isNot('Holiday hours'));
    expect(s.address, '1 Campus Center Way');
    expect(s.mapAddress, startsWith('42.'));
    expect(s.payment, contains('Cash'));
  });
  test('the status line is today\'s status, or the span on a day with a menu, or nothing', () {
    expect(statusLine(fx, 'W', 0), 'Open until midnight');
    expect(statusLine(fx, 'W', 9), '7 AM to midnight');
    expect(statusLine(fx, 'W', 2), '');
  });
  test('Directions hands the phone the café\'s lat,long', () => expect(mapsUri('42.39,-72.52').toString(), 'https://www.google.com/maps/search/?api=1&query=42.39%2C-72.52'));
}
