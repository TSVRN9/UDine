// get_infov2 headcount triple, against the captured location lists in
// docs/design/explorations/2026-10-ui-overhaul/flows/locations-2026-10-08.json and -10-11.json.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/hours.dart';

const _flows = '../docs/design/explorations/2026-10-ui-overhaul/flows';

Map<String, SensorLevels?> levels(String file) {
  final list = jsonDecode(File('$_flows/$file').readAsStringSync()) as List;
  return {for (final l in list) (l as Map<String, dynamic>)['location_title'] as String: parseSensorLevels(l)};
}

void main() {
  test('2026-10-08 capture carries only business_level, so no location has a usable triple', () {
    final got = levels('locations-2026-10-08.json');
    expect(got, hasLength(40));
    expect(got.values.every((s) => s == null), isTrue);
  });

  test('2026-10-11 capture: thresholds read through, 999999 means no sensor', () {
    final got = levels('locations-2026-10-11.json');
    expect(got, hasLength(39));
    expect(got.values.where((s) => s != null), hasLength(35)); // 4 of 39 report 999999
    expect(got.entries.where((e) => e.value == null).map((e) => e.key), unorderedEquals(['UMass Store', 'Charles River Campus of UMass Amherst', 'The Commonwealth Restaurant', 'Terrace']));
    final w = got['Worcester Commons']!;
    expect((w.count, w.notBusy, w.moderate), (348, 661, 711));
    final b = got['Berkshire Dining Commons']!;
    expect((b.count, b.notBusy, b.moderate), (253, 554, 588));
    final blueWall = got['Tavola']!; // the Blue Wall cafés share one sensor
    expect((blueWall.count, blueWall.notBusy, blueWall.moderate), (0, 469, 696));
  });

  test('a lone 999999 threshold or a non-integer count is no sensor', () {
    expect(parseSensorLevels({'business_level': 3, 'notbusy_level': 999999, 'moderate_level': 999999}), isNull);
    expect(parseSensorLevels({'business_level': 3, 'notbusy_level': 5, 'moderate_level': 999999}), isNull);
    expect(parseSensorLevels({'business_level': '3', 'notbusy_level': 5, 'moderate_level': 9}), isNull);
    expect(parseSensorLevels({'business_level': 3, 'notbusy_level': 5, 'moderate_level': 9})!.count, 3);
  });
}
