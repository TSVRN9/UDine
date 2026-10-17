// shared/vectors/where.json: the "where" sentence, Dart as the source. `dart run tool/where_vectors.dart` rewrites the file;
// test/core/m2/where_vectors_test.dart re-derives every case and compares. Deno's _shared/where.ts runs the same file.
import 'dart:convert';
import 'dart:io';

import 'package:udine/core/m2/board.dart';
import 'package:udine/core/m2/where.dart';
import 'package:udine/core/types.dart';

const _nutrition = NutritionFacts(
  servingSize: '', calories: 0, caloriesFromFat: 0, totalFatG: 0, satFatG: 0, transFatG: 0, cholesterolMg: 0, sodiumMg: 0,
  totalCarbG: 0, dietaryFiberG: 0, sugarsG: 0, proteinG: 0,
);

/// A vector's `input` run through wherePlan and whenText: {groups, sentences}.
Map<String, dynamic> whereOutput(Map<String, dynamic> i) {
  if (i['newton'] != false) throw StateError('the server never turns Charles River on');
  Map<String, dynamic> m(Object? o) => (o as Map).cast<String, dynamic>();
  final days = <String, Map<String, Map<String, List<Station>>>>{
    for (final d in m(i['days']).entries)
      d.key: {
        for (final p in m(d.value).entries)
          p.key: {
            for (final meal in m(p.value).entries)
              meal.key: [
                Station('', [
                  for (final name in meal.value as List)
                    MenuItem(dishName: name, category: '', mealPeriod: MealPeriod.lunch, hallTid: 1, date: d.key, nutrition: _nutrition, allergens: const [], dietTags: const []),
                ]),
              ],
          },
      },
  };
  final fx = Board(
    clock: DateTime.parse(i['now']),
    places: [for (final p in i['places'] as List) Place(key: p['key'], name: p['key'], area: p['area'])],
    hours: {for (final h in m(i['hours']).entries) h.key: DiningHallHours.fromJson(m(h.value))},
    grab: {for (final g in m(i['grab'] ?? {}).entries) g.key: TimeWindow.fromJsonOrNull(g.value)!},
    days: days,
    events: const [],
  );
  final plan = wherePlan(fx, i['dish'], DateTime.parse(i['now']), newton: false);
  return {
    'groups': [for (final g in plan) g.toJson()],
    'sentences': [for (var k = 0; k < plan.length; k++) whenText(plan[k], k > 0 ? plan[k - 1] : null)],
  };
}

const _hall = {
  'breakfast': {'openTime': '7:00 AM', 'closeTime': '10:00 AM'},
  'lunch': {'openTime': '11:00 AM', 'closeTime': '4:00 PM'},
  'dinner': {'openTime': '4:30 PM', 'closeTime': '9:00 PM'},
  'general': {'openTime': '7:00 AM', 'closeTime': '9:00 PM'},
};
Map<String, dynamic> _h(int tid, [Map<String, dynamic> over = const {}]) => {'hallTid': tid, ..._hall, ...over};
const _places = [
  {'key': 'W', 'area': 1}, {'key': 'F', 'area': 1}, {'key': 'H', 'area': 1}, {'key': 'B', 'area': 1},
  {'key': 'c12', 'area': 2}, {'key': 'c28', 'area': 4},
];
const _day = '2026-10-08', _next = '2026-10-09';

Map<String, dynamic> _case(String name, String now, String dish, Map<String, Object> days, {Map<String, dynamic>? hours, Map<String, dynamic>? grab}) => {
  'kind': 'where',
  'name': name,
  'input': {
    'now': now,
    'dish': dish,
    'newton': false,
    'places': _places,
    'hours': hours ?? {'W': _h(1), 'F': _h(2), 'H': _h(3), 'B': _h(4)},
    'grab': ?grab,
    'days': days,
  },
};

Map<String, Object> _on(String iso, Map<String, Map<String, List<String>>> d) => {iso: d};

final cases = [
  _case('now, until: lunch at one hall, mid-lunch', '$_day' 'T12:41:00-04:00', 'Chicken Tenders', _on(_day, {'W': {'lunch': ['Chicken Tenders']}})),
  _case('from: dinner is later today', '$_day' 'T08:00:00-04:00', 'Chicken Tenders', _on(_day, {'W': {'dinner': ['Chicken Tenders']}})),
  _case('two halls in the same meal share one group, halls in W F H B order', '$_day' 'T12:00:00-04:00', 'Chicken Tenders',
      _on(_day, {'H': {'lunch': ['Chicken Tenders']}, 'W': {'lunch': ['Chicken Tenders']}})),
  _case('several groups: lunch now at W, F closes earlier (Until), dinner from, tomorrow', '$_day' 'T12:00:00-04:00', 'Chicken Tenders', {
    _day: {'W': {'lunch': ['Chicken Tenders'], 'dinner': ['Chicken Tenders']}, 'F': {'lunch': ['Chicken Tenders']}},
    _next: {'W': {'lunch': ['Chicken Tenders']}},
  }, hours: {'W': _h(1), 'F': _h(2, {'lunch': {'openTime': '11:00 AM', 'closeTime': '3:00 PM'}}), 'H': _h(3), 'B': _h(4)}),
  _case('several groups: breakfast and lunch later, same state different meal', '$_day' 'T06:00:00-04:00', 'Scrambled Eggs',
      _on(_day, {'W': {'breakfast': ['Scrambled Eggs'], 'lunch': ['Scrambled Eggs']}, 'F': {'lunch': ['Scrambled Eggs']}})),
  _case('last serving ended: no group, no sentence', '$_day' 'T16:30:00-04:00', 'Chicken Tenders', _on(_day, {'W': {'lunch': ['Chicken Tenders']}})),
  _case('window is half-open at close: 4:00 PM is past', '$_day' 'T16:00:00-04:00', 'Chicken Tenders', _on(_day, {'W': {'lunch': ['Chicken Tenders']}})),
  _case('only tomorrow is left', '$_day' 'T21:30:00-04:00', 'Chicken Tenders', _on(_next, {'W': {'lunch': ['Chicken Tenders']}})),
  _case('dish key: case, curly apostrophe and & fold', '$_day' 'T12:00:00-04:00', "chef's mac & cheese", _on(_day, {'W': {'lunch': ['Chef’s Mac & Cheese']}})),
  _case('a dish not on the menu', '$_day' 'T12:00:00-04:00', 'Nothing', _on(_day, {'W': {'lunch': ['Chicken Tenders']}})),
  _case('late night, own window 9 PM to 2 AM: 8 PM reads from 9 PM', '$_day' 'T20:00:00-04:00', 'Pizza', _on(_day, {'W': {'late': ['Pizza']}}), hours: {'W': _h(1, {'latenight': {'openTime': '9:00 PM', 'closeTime': '2:00 AM'}})}),
  _case('late night, own window: 9:30 PM is now, until 2 AM', '$_day' 'T21:30:00-04:00', 'Pizza', _on(_day, {'W': {'late': ['Pizza']}}), hours: {'W': _h(1, {'latenight': {'openTime': '9:00 PM', 'closeTime': '2:00 AM'}})}),
  _case('late night, own window: 11 PM is now, until 2 AM', '$_day' 'T23:00:00-04:00', 'Pizza', _on(_day, {'W': {'late': ['Pizza']}}), hours: {'W': _h(1, {'latenight': {'openTime': '9:00 PM', 'closeTime': '2:00 AM'}})}),
  _case('late night, own window: 12:30 AM, yesterday\'s late menu is still open until 2 AM', '$_next' 'T00:30:00-04:00', 'Pizza', _on(_day, {'W': {'late': ['Pizza']}}), hours: {'W': _h(1, {'latenight': {'openTime': '9:00 PM', 'closeTime': '2:00 AM'}})}),
  _case('late night, own window: 1:30 AM, tonight\'s late menu is from 9 PM', '$_next' 'T01:30:00-04:00', 'Pizza', _on(_next, {'W': {'late': ['Pizza']}}), hours: {'W': _h(1, {'latenight': {'openTime': '9:00 PM', 'closeTime': '2:00 AM'}})}),
  _case('late night, own window: 1:30 AM with yesterday\'s and today\'s menus, now first then from', '$_next' 'T01:30:00-04:00', 'Pizza',
      {_day: {'W': {'late': ['Pizza']}}, _next: {'W': {'late': ['Pizza']}}}, hours: {'W': _h(1, {'latenight': {'openTime': '9:00 PM', 'closeTime': '2:00 AM'}})}),
  _case('late night, own window: 2:30 AM, yesterday\'s late menu has closed', '$_next' 'T02:30:00-04:00', 'Pizza', _on(_day, {'W': {'late': ['Pizza']}}), hours: {'W': _h(1, {'latenight': {'openTime': '9:00 PM', 'closeTime': '2:00 AM'}})}),
  _case('late night, own window: 9:30 PM with tonight\'s and tomorrow\'s menus', '$_day' 'T21:30:00-04:00', 'Pizza',
      {_day: {'W': {'late': ['Pizza']}}, _next: {'W': {'late': ['Pizza']}}}, hours: {'W': _h(1, {'latenight': {'openTime': '9:00 PM', 'closeTime': '2:00 AM'}})}),
  _case('late night synthesized from the standard clock and general to 2 AM: 11 PM is now, until 2 AM', '$_day' 'T23:00:00-04:00', 'Pizza', _on(_day, {'W': {'late': ['Pizza']}}), hours: {'W': _h(1, {'general': {'openTime': '7:00 AM', 'closeTime': '2:00 AM'}})}),
  _case('late night synthesized: 12:30 AM, yesterday\'s late menu is still open', '$_next' 'T00:30:00-04:00', 'Pizza', _on(_day, {'W': {'late': ['Pizza']}}), hours: {'W': _h(1, {'general': {'openTime': '7:00 AM', 'closeTime': '2:00 AM'}})}),
  _case('late night synthesized: 1:30 AM, tonight\'s menu is from 9 PM', '$_next' 'T01:30:00-04:00', 'Pizza', _on(_next, {'W': {'late': ['Pizza']}}), hours: {'W': _h(1, {'general': {'openTime': '7:00 AM', 'closeTime': '2:00 AM'}})}),
  _case('noon and midnight read as words', '$_day' 'T10:00:00-04:00', 'Chicken Tenders', {
    _day: {'W': {'lunch': ['Chicken Tenders'], 'dinner': ['Chicken Tenders']}},
  }, hours: {'W': _h(1, {'lunch': {'openTime': '12:00 PM', 'closeTime': '4:00 PM'}, 'dinner': {'openTime': '5:00 PM', 'closeTime': '11:59 PM'}})}),
  _case('hours not known for a hall: it serves nothing', '$_day' 'T12:00:00-04:00', 'Chicken Tenders',
      _on(_day, {'W': {'lunch': ['Chicken Tenders']}, 'F': {'lunch': ['Chicken Tenders']}}), hours: {'F': _h(2)}),
  _case('a hall with no general hours has no synthesized meal', '$_day' 'T12:00:00-04:00', 'Pizza',
      _on(_day, {'W': {'late': ['Pizza']}}), hours: {'W': _h(1, {'general': null})}),
  _case('newton false: a Charles River place is left out', '$_day' 'T12:00:00-04:00', 'Quesadilla',
      _on(_day, {'c28': {'all': ['Quesadilla']}}), hours: {'c28': {'hallTid': 0, 'general': {'openTime': '8:00 AM', 'closeTime': '4:00 PM'}}}),
  _case('newton false: the halls still answer when a Charles River place serves it too', '$_day' 'T12:00:00-04:00', 'Quesadilla',
      _on(_day, {'c28': {'all': ['Quesadilla']}, 'W': {'lunch': ['Quesadilla']}}),
      hours: {'W': _h(1), 'c28': {'hallTid': 0, 'general': {'openTime': '8:00 AM', 'closeTime': '4:00 PM'}}}),
  _case('a cafe all-day menu', '$_day' 'T12:00:00-04:00', 'Latte',
      _on(_day, {'c12': {'all': ['Latte']}}), hours: {'c12': {'hallTid': 0, 'general': {'openTime': '8:00 AM', 'closeTime': '4:00 PM'}}}),
  _case('a hall Grab N Go window', '$_day' 'T12:00:00-04:00', 'Wrap',
      _on(_day, {'W': {'grab': ['Wrap']}}), grab: {'W': {'openTime': '10:00 AM', 'closeTime': '3:00 PM'}}),
  _case('now == open: 11:00 AM lunch is now', '$_day' 'T11:00:00-04:00', 'Chicken Tenders', _on(_day, {'W': {'lunch': ['Chicken Tenders']}})),
  _case('until midnight is printed: a dinner closing 11:59 PM', '$_day' 'T20:00:00-04:00', 'Chicken Tenders',
      _on(_day, {'W': {'dinner': ['Chicken Tenders']}}), hours: {'W': _h(1, {'dinner': {'openTime': '5:00 PM', 'closeTime': '11:59 PM'}})}),
  _case('general with close == open: no window, no synthesized meal', '$_day' 'T12:00:00-04:00', 'Chicken Tenders',
      _on(_day, {'W': {'lunch': ['Chicken Tenders']}}), hours: {'W': _h(1, {'lunch': null, 'general': {'openTime': '8:00 AM', 'closeTime': '8:00 AM'}})}),
  _case('all-day cafe, later: From', '$_day' 'T06:00:00-04:00', 'Latte',
      _on(_day, {'c12': {'all': ['Latte']}}), hours: {'c12': {'hallTid': 0, 'general': {'openTime': '8:00 AM', 'closeTime': '4:00 PM'}}}),
  _case('all-day cafe, tomorrow: Tomorrow, from', '$_day' 'T18:00:00-04:00', 'Latte',
      _on(_next, {'c12': {'all': ['Latte']}}), hours: {'c12': {'hallTid': 0, 'general': {'openTime': '8:00 AM', 'closeTime': '4:00 PM'}}}),
  _case('a cafe Grab N Go menu uses general', '$_day' 'T12:00:00-04:00', 'Wrap',
      _on(_day, {'c12': {'grab': ['Wrap']}}), hours: {'c12': {'hallTid': 0, 'general': {'openTime': '8:00 AM', 'closeTime': '4:00 PM'}}}),
  _case('a hall Grab N Go, tomorrow', '$_day' 'T12:00:00-04:00', 'Wrap',
      _on(_next, {'W': {'grab': ['Wrap']}}), grab: {'W': {'openTime': '10:00 AM', 'closeTime': '3:00 PM'}}),
];

void main() {
  final out = [for (final c in cases) {...c, 'expected': whereOutput(c['input'] as Map<String, dynamic>)}];
  final header = {
    'format': 'The "where" sentence a notification carries. kind=where: input {now, dish, newton, places [{key, area}], hours {place: DiningHallHours}, '
        'grab? {place: window}, days {isoDate: {place: {meal: [dish names]}}}} -> expected {groups, sentences}. now is an absolute instant (ISO 8601 with offset), '
        'read as Eastern wall time. groups is wherePlan (app/lib/core/m2/where.dart) as WhereGroup.toJson, soonest first; sentences[k] is whenText(groups[k], groups[k-1]). '
        'newton is always false: the server never answers for the Charles River places (area 4). The source is Dart: regenerate with '
        '`cd app && dart run tool/where_vectors.dart`; never hand-edit expected.',
    'cases': out,
  };
  File('../shared/vectors/where.json').writeAsStringSync('${const JsonEncoder.withIndent('  ').convert(header)}\n');
}
