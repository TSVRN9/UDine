// Runs shared/vectors/where.json (the file Deno's _shared/where.ts reads too) against core/m2/where.dart.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import '../../../tool/where_vectors.dart';

void main() {
  lateNight();
  final doc = jsonDecode(File('../shared/vectors/where.json').readAsStringSync()) as Map<String, dynamic>;
  for (final c in doc['cases'] as List) {
    test(c['name'], () => expect(jsonDecode(jsonEncode(whereOutput(c['input']))), c['expected']));
  }
  test('the file holds exactly the generator\'s cases', () {
    expect([for (final c in doc['cases'] as List) c['name']], [for (final c in cases) c['name']]);
  });
}

/// A hall whose late-night window runs 9 PM to 2 AM, with its late menu keyed on the days `keys` count from the clock's calendar day.
List<String> lateSentences(String now, List<int> keys) {
  final d = DateTime.parse(now.substring(0, 10));
  String iso(int k) => d.add(Duration(days: k)).toIso8601String().substring(0, 10);
  return (whereOutput({
    'now': now, 'dish': 'Pizza', 'newton': false,
    'places': [{'key': 'W', 'area': 1}],
    'hours': {'W': {'hallTid': 1, 'latenight': {'openTime': '9:00 PM', 'closeTime': '2:00 AM'}, 'general': {'openTime': '7:00 AM', 'closeTime': '2:00 AM'}}},
    'days': {for (final k in keys) iso(k): {'W': {'late': ['Pizza']}}},
  })['sentences'] as List).cast<String>();
}

void lateNight() {
  const now = 'Late night now, until 2 AM', from = 'Late night from 9 PM', tmrw = 'Tomorrow, late night from 9 PM';
  // [clock, menu day relative to the clock's calendar day -> sentences]
  final table = <String, Map<List<int>, List<String>>>{
    '2026-10-08T20:00:00-04:00': {[0]: [from], [1]: [tmrw], [0, 1]: [from, tmrw]},
    '2026-10-08T21:30:00-04:00': {[0]: [now], [1]: [tmrw], [0, 1]: [now, tmrw]},
    '2026-10-08T23:00:00-04:00': {[0]: [now], [1]: [tmrw], [0, 1]: [now, tmrw]},
    '2026-10-09T00:30:00-04:00': {[-1]: [now], [0]: [from], [1]: [tmrw], [-1, 0]: [now, from]},
    '2026-10-09T01:30:00-04:00': {[-1]: [now], [0]: [from], [-1, 0]: [now, from]},
    '2026-10-09T02:30:00-04:00': {[-1]: [], [0]: [from], [-1, 0]: [from]},
  };
  group('late-night window crossing midnight', () {
    for (final t in table.entries) {
      for (final k in t.value.entries) {
        test('${t.key.substring(11, 16)} menu on ${k.key}', () => expect(lateSentences(t.key, k.key), k.value));
      }
    }
  });
}
