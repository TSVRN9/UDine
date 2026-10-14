// Runs shared/vectors/{foodpro,hours}.json (the same files the TS and Deno suites read) against core/.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/foodpro.dart';
import 'package:udine/core/hours.dart';
import 'package:udine/core/types.dart';

List<Map<String, dynamic>> cases(String file) {
  final doc = jsonDecode(File('../shared/vectors/$file.json').readAsStringSync()) as Map<String, dynamic>;
  return [for (final c in doc['cases'] as List) c as Map<String, dynamic>];
}

/// Round-trips through JSON text so a Dart int/double and absent/null keys compare the way the vector file means them.
Object? wire(Object? v) => jsonDecode(jsonEncode(v));

MealPeriod period(String s) => MealPeriod.values.byName(s);

void main() {
  group('foodpro.json', () {
    for (final c in cases('foodpro')) {
      test('${c['kind']}: ${c['name']}', () {
        final i = c['input'] as Map<String, dynamic>;
        final List<MenuItem> got = switch (c['kind']) {
          'parse' => parseCategoryItems(i['html'], i['category'], period(i['mealPeriod']), i['hallTid'], i['isoDate']),
          'menu' => parseMenuResponse(i['hallTid'], i['isoDate'], i['response']),
          final k => throw StateError('unknown kind $k'),
        };
        expect(wire([for (final m in got) m.toJson()]), c['expected']);
      });
    }
  });

  group('hours.json', () {
    for (final c in cases('hours')) {
      test('${c['kind']}: ${c['name']}', () {
        final i = c['input'];
        final Object? got = switch (c['kind']) {
          'map_info_v2' => mapInfoV2(List<Map<String, dynamic>>.from(i as List)).toJson(),
          'street_address' => parseStreetAddress(i as String?),
          'map_address' => parseMapAddress(i as String?),
          'status' => statusJson(DiningHallHours.fromJson(i['hours']), DateTime.parse(i['now'])),
          final k => throw StateError('unknown kind $k'),
        };
        expect(wire(got), c['expected']);
      });
    }
  });
}
