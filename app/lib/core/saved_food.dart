import 'm2/board.dart' show Macro;
import 'm2/menu_view.dart' show allergens;
import 'packaged_food.dart';
import 'types.dart';

enum FoodKind { custom, pack, umass }

/// M2's diet bits from a lookup's tags (`MenuItem.diet`): 1 vegetarian, 2 plant based, 4 halal, 8 local.
int dietBits(Iterable<String> tags) => const [('Vegetarian', 1), ('Plant Based', 2), ('Halal', 4), ('Local', 8)].fold(0, (b, e) => tags.contains(e.$1) ? b | e.$2 : b);

num _r1(num x) => (x * 10).round() / 10;

/// OFF's allergen tags, title-cased by the mapping the vectors check ("Soybeans", "Nuts"), as M2's eleven (M2 `OFFALG`), in Dietary
/// preferences' order; a tag M2 has no row for is left out. A UMass lookup's own allergens already are the feed's and pass through.
List<String> m2Allergens(Iterable<String> tags) {
  const map = {
    'milk': 'Milk', 'eggs': 'Eggs', 'fish': 'Fish', 'crustaceans': 'Shellfish', 'molluscs': 'Shellfish', 'nuts': 'Tree Nuts', 'peanuts': 'Peanuts',
    'gluten': 'Gluten', 'soybeans': 'Soy', 'sesame seeds': 'Sesame',
  };
  final got = {for (final t in tags) ?map[t.trim().toLowerCase()]};
  return [for (final a in allergens) if (got.contains(a)) a];
}

/// A food in Your foods as the screens read it (M2's `S.foods` record): a custom food (RN's `custom_foods` row) or a packaged / UMass
/// Dining one (`saved_foods`), one shape for the row, the sheet, the plate and the log. The underlying model is kept so a save writes
/// exactly the row's own shape.
class SavedFood {
  const SavedFood._(this.kind, this.id, this.name, this.serving, this.nutrition, this.source, this.diet, this.allergens, this.ingredients, this.at, this.custom, this.packed);

  factory SavedFood.custom(CustomFood f) => SavedFood._(FoodKind.custom, f.id, f.name, f.servingSize, f.nutrition, CustomSource(customFoodId: f.id, productName: f.name), 0, const [], f.ingredients, _customAt(f.id), f, null);

  factory SavedFood.packed(PackagedFood f) => SavedFood._(
        f.source is UmassMenuSource ? FoodKind.umass : FoodKind.pack, f.id, f.displayName,
        f.nutrition.servingSize == per100 ? '100 g' : f.nutrition.servingSize, f.nutrition, f.source, f.diet,
        f.source is UmassMenuSource ? [for (final a in f.allergens ?? const <String>[]) a] : m2Allergens(f.allergens ?? const []), f.ingredients, f.savedAt ?? 0, null, f,
      );

  /// the serving a hit with only per-100 g figures carries (TS's own string)
  static const per100 = 'per 100g';

  final FoodKind kind;
  /// the custom food's id, or the packaged food's source key (`off:<barcode>`)
  final String id;
  final String name, serving;
  final NutritionFacts nutrition;
  /// what the log row's source is: custom, off, usda, or the UMass dish
  final LogSource source;
  final int diet;
  final List<String> allergens;
  final String? ingredients;
  /// when it was saved (epoch ms), 0 when unknown
  final int at;
  final CustomFood? custom;
  final PackagedFood? packed;

  /// M2's plate key (`'food:'+id`)
  String get key => 'food:$id';
  bool get per100g => nutrition.servingSize == per100;
  Macro get macro => Macro(nutrition.calories.round(), _r1(nutrition.proteinG), _r1(nutrition.totalCarbG), _r1(nutrition.totalFatG));

  /// The same food after the form's Save (M2 `Object.assign(f, {n, cal, p, c, f})`): name and the four figures, nothing else.
  SavedFood edited({required String name, required num cal, required num p, required num c, required num f}) {
    final n = nutrition;
    final next = NutritionFacts(
      servingSize: n.servingSize, calories: cal, caloriesFromFat: n.caloriesFromFat, totalFatG: f, satFatG: n.satFatG, transFatG: n.transFatG, cholesterolMg: n.cholesterolMg,
      sodiumMg: n.sodiumMg, totalCarbG: c, dietaryFiberG: n.dietaryFiberG, sugarsG: n.sugarsG, proteinG: p,
    );
    final cf = custom;
    if (cf != null) return SavedFood.custom(CustomFood(id: cf.id, name: name, servingSize: cf.servingSize, nutrition: next, ingredients: cf.ingredients));
    return SavedFood.packed(packed!.copyWith(productName: name, noBrand: true, nutrition: next));
  }

  /// RN's custom-food id (`CustomFoodForm`): the clock in base 36, then random.
  static String newCustomId(DateTime now, String Function() salt) => '${now.millisecondsSinceEpoch.toRadixString(36)}${salt()}';

  /// the millis RN's id starts with (8 base-36 digits to 2059); 0 for an id of any other shape
  static int _customAt(String id) => id.length > 8 ? int.tryParse(id.substring(0, 8), radix: 36) ?? 0 : 0;
}

/// A new custom food from the form: one serving, the four figures (RN's `buildCustomFood`).
CustomFood customFromForm({required String id, required String name, required Macro m}) => CustomFood(
      id: id, name: name, servingSize: '1 serving',
      nutrition: NutritionFacts(
        servingSize: '1 serving', calories: m.cal, caloriesFromFat: 0, totalFatG: m.f, satFatG: 0, transFatG: 0, cholesterolMg: 0, sodiumMg: 0,
        totalCarbG: m.c, dietaryFiberG: 0, sugarsG: 0, proteinG: m.p,
      ),
    );
