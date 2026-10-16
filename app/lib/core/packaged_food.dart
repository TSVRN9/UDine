import 'types.dart';

/// One OFF or USDA hit. [productName] is the source's own name; [displayName] leads with the brand when the name lacks it.
class PackagedFood {
  const PackagedFood({
    required this.source,
    required this.productName,
    required this.nutrition,
    this.ingredients,
    this.allergens,
    this.brand,
  });
  final LogSource source; // OffSource or UsdaSource
  final String productName;
  final NutritionFacts nutrition;
  final String? ingredients;
  final List<String>? allergens;
  final String? brand;

  /// The saved_foods key: stable per source, so saving the same food twice is one row.
  String get id => switch (source) {
        OffSource(:final barcode) => 'off:$barcode',
        UsdaSource(:final fdcId) => 'usda:$fdcId',
        UmassMenuSource(:final dishName, :final hallTid) => 'umass:$dishName|$hallTid',
        final other => throw ArgumentError('not a packaged source: $other'),
      };

  Map<String, dynamic> toJson() => {
        'source': source.toJson(),
        'productName': productName,
        if (brand != null) 'brand': brand,
        'nutrition': nutrition.toJson(),
        if (ingredients != null) 'ingredients': ingredients,
        if (allergens != null) 'allergens': allergens,
      };

  factory PackagedFood.fromJson(Map<String, dynamic> j) => PackagedFood(
        source: LogSource.fromJson(j['source'] as Map<String, dynamic>),
        productName: j['productName'] as String,
        brand: j['brand'] as String?,
        nutrition: NutritionFacts.fromJson(j['nutrition'] as Map<String, dynamic>),
        ingredients: j['ingredients'] as String?,
        allergens: (j['allergens'] as List?)?.cast<String>(),
      );

  String get displayName {
    final b = brand;
    if (b == null ||
        b.isEmpty ||
        productName.toLowerCase().contains(b.toLowerCase())) {
      return productName;
    }
    return '$b $productName';
  }
}
