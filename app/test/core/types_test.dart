// LogEntry / NutritionFacts JSON as the TS apps write it (source_json / nutrition_json): decode, re-encode, unchanged.
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/types.dart';

const _nutrition =
    '{"servingSize":"1 each","calories":127,"caloriesFromFat":26,"totalFatG":2.9,"satFatG":0.5,"transFatG":0,"cholesterolMg":50.9,"sodiumMg":237.2,'
    '"totalCarbG":20.4,"dietaryFiberG":1,"sugarsG":3.4,"proteinG":5.3,"totalFatDv":4,"satFatDv":null,"sodiumDv":10}';

String entry(String source) => '{"id":"e1","loggedAt":"2026-08-20T23:15:42.123","source":$source,"servings":1.5,"nutrition":$_nutrition}';

void main() {
  final sources = {
    'umass-menu': '{"type":"umass-menu","dishName":"French Toast","hallTid":3}',
    'off': '{"type":"off","barcode":"0123456789012","productName":"Oat Milk"}',
    'usda': '{"type":"usda","fdcId":"170379","productName":"Broccoli"}',
    'custom': '{"type":"custom","customFoodId":"c1","productName":"Mom\'s Chili"}',
  };
  for (final MapEntry(:key, :value) in sources.entries) {
    test('LogEntry with a $key source round-trips byte-for-byte', () {
      final text = entry(value);
      expect(jsonEncode(LogEntry.fromJson(jsonDecode(text)).toJson()), text);
    });
  }

  test('%DV keeps absent, blank and numeric apart', () {
    final n = NutritionFacts.fromJson(jsonDecode(_nutrition));
    expect(n.totalFatDv, const Dv(4));
    expect(n.satFatDv, const Dv(null));
    expect(n.proteinDv, isNull);
  });

  test('an unknown source type is rejected, not guessed', () {
    expect(() => LogEntry.fromJson(jsonDecode(entry('{"type":"mystery"}'))), throwsFormatException);
  });

  test('stored blobs round-trip: custom food, preferences (with a stale preset), favorites, ranks', () {
    final blobs = [
      '{"id":"c1","name":"Chili","servingSize":"1 cup","nutrition":$_nutrition,"ingredients":"beans"}',
      '{"allergensToAvoid":["Milk"],"requiredDietTags":["Vegan"],"macroPresets":["high-protein","under-500-cal"]}',
      '{"allergensToAvoid":[],"requiredDietTags":[]}',
    ];
    expect(jsonEncode(CustomFood.fromJson(jsonDecode(blobs[0])).toJson()), blobs[0]);
    expect(jsonEncode(FoodPreferences.fromJson(jsonDecode(blobs[1])).toJson()), blobs[1]);
    expect(jsonEncode(FoodPreferences.fromJson(jsonDecode(blobs[2])).toJson()), blobs[2]);
    expect(jsonEncode(Favorite.fromJson({'type': 'dish', 'dishName': 'Pizza'}).toJson()), '{"type":"dish","dishName":"Pizza"}');
    expect(Favorite.fromJson({'type': 'location', 'hallTid': 2}).key, 'location:2');
    const rd = '{"dishName":"Pizza","hallTid":1,"rating":1512.5,"comparisonCount":3}';
    expect(jsonEncode(RankedDish.fromJson(jsonDecode(rd)).toJson()), rd);
  });
}
