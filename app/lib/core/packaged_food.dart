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
    this.diet = 0,
    this.savedAt,
  });
  final LogSource source; // OffSource or UsdaSource
  final String productName;
  final NutritionFacts nutrition;
  final String? ingredients;
  final List<String>? allergens;
  final String? brand;

  /// M2's diet bits (1 veg, 2 plant, 4 halal, 8 local, 16 sustainable): a UMass Dining lookup carries them, OFF and USDA do not.
  final int diet;

  /// When it was saved to Your foods (epoch ms): newest first across both tables. Additive key inside `food_json`, absent until saved.
  final int? savedAt;

  PackagedFood copyWith({String? productName, String? brand, bool noBrand = false, NutritionFacts? nutrition}) => PackagedFood(
        source: source,
        productName: productName ?? this.productName,
        brand: noBrand ? null : brand ?? this.brand,
        nutrition: nutrition ?? this.nutrition,
        ingredients: ingredients,
        allergens: allergens,
        diet: diet,
        savedAt: savedAt,
      );

  PackagedFood savedNow(int ms) => PackagedFood(source: source, productName: productName, brand: brand, nutrition: nutrition, ingredients: ingredients, allergens: allergens, diet: diet, savedAt: ms);

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
        if (diet != 0) 'diet': diet,
        if (savedAt != null) 'savedAt': savedAt,
      };

  factory PackagedFood.fromJson(Map<String, dynamic> j) => PackagedFood(
        source: LogSource.fromJson(j['source'] as Map<String, dynamic>),
        productName: j['productName'] as String,
        brand: j['brand'] as String?,
        nutrition: NutritionFacts.fromJson(j['nutrition'] as Map<String, dynamic>),
        ingredients: j['ingredients'] as String?,
        allergens: (j['allergens'] as List?)?.cast<String>(),
        diet: j['diet'] as int? ?? 0,
        savedAt: j['savedAt'] as int?,
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
