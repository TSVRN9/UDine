@Tags(['live'])
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:udine/core/date.dart';
import 'package:udine/core/foodpro.dart';
import 'package:udine/core/hours.dart';
import 'package:udine/core/types.dart';
import 'package:udine/data/source.dart';

// Real umassdining.com. Skipped by default (dart_test.yaml); run:
//   flutter test --run-skipped -t live test/data/live_test.dart
void main() {
  test('today for all four halls and one café', () async {
    final src = UmassSource(http.Client());
    final now = DateTime.now();
    final today = effectiveTodayIso(now, defaultRolloverHour);
    for (final h in diningHalls) {
      final items = parseMenuResponse(h.tid, today, _map(await src.menu(h.tid, today)));
      // ignore: avoid_print
      print('${h.name} $today: ${items.length} items, ${items.map((i) => i.mealPeriod.name).toSet().join('/')}');
      expect(items, isNotEmpty, reason: h.name);
    }
    final raw = await src.infoV2() as List;
    final feed = mapInfoV2([for (final l in raw) l as Map<String, dynamic>]);
    final cafe = feed.retail.firstWhere((r) => r.locationId != null);
    final cafeItems = parseMenuResponse(cafe.locationId!, today, _map(await src.menu(cafe.locationId!, today)));
    // ignore: avoid_print
    print(
      '${cafe.name} (location ${cafe.locationId}) $today: ${cafeItems.length} foodpro items; standing html ${cafe.lunchMenu ?? cafe.breakfastMenu ?? cafe.dinnerMenu}'
          .replaceAll('\n', ' '),
    );
    // ignore: avoid_print
    print(
      'get_infov2: ${feed.halls.length} halls, ${feed.retail.length} retail, busy triples for ${raw.where((l) => parseSensorLevels(l as Map<String, dynamic>) != null).length}',
    );
    expect(feed.halls, hasLength(4));
  });
}

Map<String, dynamic> _map(Object? raw) => raw is Map<String, dynamic> ? raw : const {};
