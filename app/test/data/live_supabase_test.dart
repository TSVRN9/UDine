@Tags(['live'])
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:udine/core/occupancy.dart';
import 'package:udine/data/repository.dart';
import 'package:udine/data/supabase_source.dart';

// Real Supabase, anonymous. Skipped by default (dart_test.yaml); run:
//   flutter test --run-skipped -t live test/data/live_supabase_test.dart
void main() {
  test('one catalog page and Worcester\'s curve for today\'s weekday', () async {
    final src = SupabaseSource(http.Client());
    final page = await src.dishPage(0);
    final first = DishCatalogEntry.fromRow(page.first);
    // ignore: avoid_print
    print('dishes page 0: ${page.length} rows (page size $dishPageSize); first ${first.dishName}, ${first.nutrition.calories} cal, updated ${first.updatedAt}');
    expect(page, isNotEmpty);
    final dow = occupancyDow(DateTime.now());
    final curve = [for (final b in await src.occupancyTypical(1, dow)) OccupancyBucket.fromJson(b as Map<String, dynamic>)];
    // ignore: avoid_print
    print('occupancy_typical(1, $dow): ${curve.length} buckets, samples ${curve.isEmpty ? '-' : '${curve.map((b) => b.samples).reduce((a, b) => a < b ? a : b)}..${curve.map((b) => b.samples).reduce((a, b) => a > b ? a : b)}'}');
  });
}
