// foodpro-menu-ajax parsing. Port of shared/src/umassDining.ts (parseCategoryItems, fetchMenu's flatten step),
// checked against shared/vectors/foodpro.json. No network: the fetch lives with the data layer.
import 'types.dart';

// Wire key -> period, in the order fetchMenu walks them. "late night" has a literal space.
const _wireKeys = [
  ('breakfast', MealPeriod.breakfast),
  ('lunch', MealPeriod.lunch),
  ('dinner', MealPeriod.dinner),
  ('late night', MealPeriod.latenight),
  ('daily offerings', MealPeriod.allday),
  ('grabngo', MealPeriod.grabngo),
];

const _entities = {'&amp;': '&', '&#039;': "'", '&quot;': '"', '&lt;': '<', '&gt;': '>'};

String _decode(String s) => s.replaceAllMapped(RegExp(r'&(amp|#039|quot|lt|gt);'), (m) => _entities[m[0]!] ?? m[0]!);

/// null when the attribute isn't in the tag; "" when present but empty (data-sat-fat-dv="").
String? _attrRaw(String attrs, String name) {
  final m = RegExp('$name="([^"]*)"').firstMatch(attrs);
  return m == null ? null : _decode(m[1]!).trim();
}

String _attr(String attrs, String name) => _attrRaw(attrs, name) ?? '';

// Known TS quirk, matched on purpose: first number anywhere, so "<1g" -> 1 and "1,074mg" -> 1.
num _num(String s) {
  final m = RegExp(r'-?\d+(\.\d+)?').firstMatch(s);
  return m == null ? 0 : double.parse(m[0]!);
}

Dv? _dv(String attrs, String name) {
  final raw = _attrRaw(attrs, name);
  return raw == null ? null : Dv(raw.isEmpty ? null : _num(raw));
}

List<String> _csv(String s) => [
      for (final x in s.split(',').map((x) => x.trim()))
        if (x.isNotEmpty) x,
    ];

/// Retail only: the price span sits after the dish's own </a>, so look between this item and the next.
String? _priceAfter(String html, int from) {
  final next = html.indexOf('data-dish-name="', from);
  final m = RegExp(r'<span class="meal-price">([^<]*)</span>').firstMatch(html.substring(from, next == -1 ? html.length : next));
  final p = m?[1]!.trim();
  return p == null || p.isEmpty ? null : p;
}

const _dietCodes = {'VGT', 'VGN', 'H', 'LPR', 'SUS'};

Set<String> _codes(String webcode) => {for (final c in webcode.split(RegExp(r'\s+'))) if (_dietCodes.contains(c)) c};

bool _blank(String s) => !RegExp(r'-?\d').hasMatch(s);

/// H0..H7 from recipe-webcode. data-healthfulness alone is not trusted; H0 is a real 0.
int? _grade(String webcode) {
  for (final c in webcode.split(RegExp(r'\s+'))) {
    if (RegExp(r'^H[0-7]$').hasMatch(c)) return int.parse(c[1]);
  }
  return null;
}

List<MenuItem> parseCategoryItems(String html, String category, MealPeriod mealPeriod, int hallTid, String isoDate) {
  final items = <MenuItem>[];
  for (final m in RegExp(r'<a\s+([^>]*data-dish-name="[^"]*"[^>]*)>([^<]*)</a>').allMatches(html)) {
    final a = m[1]!;
    final name = _attr(a, 'data-dish-name');
    final ingredients = _attrRaw(a, 'data-ingredient-list');
    final price = _priceAfter(html, m.end);
    final carbon = _attr(a, 'data-carbon-list');
    items.add(MenuItem(
      dishName: name.isNotEmpty ? name : _decode(m[2]!).trim(),
      category: category,
      mealPeriod: mealPeriod,
      hallTid: hallTid,
      date: isoDate,
      nutrition: NutritionFacts(
        servingSize: _attr(a, 'data-serving-size'),
        calories: _num(_attr(a, 'data-calories')),
        caloriesFromFat: _num(_attr(a, 'data-calories-from-fat')),
        totalFatG: _num(_attr(a, 'data-total-fat')),
        satFatG: _num(_attr(a, 'data-sat-fat')),
        transFatG: _num(_attr(a, 'data-trans-fat')),
        cholesterolMg: _num(_attr(a, 'data-cholesterol')),
        sodiumMg: _num(_attr(a, 'data-sodium')),
        totalCarbG: _num(_attr(a, 'data-total-carb')),
        dietaryFiberG: _num(_attr(a, 'data-dietary-fiber')),
        sugarsG: _num(_attr(a, 'data-sugars')),
        proteinG: _num(_attr(a, 'data-protein')),
        // Every -dv attribute is hyphenated except cholesterol: data-cholesterol_dv. Not a typo.
        totalFatDv: _dv(a, 'data-total-fat-dv'),
        satFatDv: _dv(a, 'data-sat-fat-dv'),
        cholesterolDv: _dv(a, 'data-cholesterol_dv'),
        sodiumDv: _dv(a, 'data-sodium-dv'),
        totalCarbDv: _dv(a, 'data-total-carb-dv'),
        dietaryFiberDv: _dv(a, 'data-dietary-fiber-dv'),
        sugarsDv: _dv(a, 'data-sugars-dv'),
        proteinDv: _dv(a, 'data-protein-dv'),
        blank: {
          for (final (field, attr) in const [
            ('caloriesFromFat', 'data-calories-from-fat'), ('totalFatG', 'data-total-fat'), ('satFatG', 'data-sat-fat'),
            ('transFatG', 'data-trans-fat'), ('cholesterolMg', 'data-cholesterol'), ('sodiumMg', 'data-sodium'),
            ('totalCarbG', 'data-total-carb'), ('dietaryFiberG', 'data-dietary-fiber'), ('sugarsG', 'data-sugars'),
            ('proteinG', 'data-protein'),
          ])
            if (_blank(_attr(a, attr))) field,
        },
      ),
      allergens: _csv(_attr(a, 'data-allergens')),
      dietTags: _csv(_attr(a, 'data-clean-diet-str')),
      price: price,
      ingredients: ingredients == null || ingredients.isEmpty ? null : ingredients,
      health: _grade(_attr(a, 'data-recipe-webcode')),
      dietCodes: _codes(_attr(a, 'data-recipe-webcode')),
      carbon: const ['A', 'B', 'C', 'D', 'E'].contains(carbon) ? carbon : null,
    ));
  }
  return items;
}

/// The feed's JSON (period wire key -> category -> html) flattened as fetchMenu does: wire-key order, then
/// categories in object order. Unknown keys are ignored.
List<MenuItem> parseMenuResponse(int hallTid, String isoDate, Map<String, dynamic> response) => [
      for (final (key, period) in _wireKeys)
        if (response[key] case final Map<String, dynamic> cats)
          for (final MapEntry(key: category, value: html) in cats.entries) ...parseCategoryItems(html as String, category, period, hallTid, isoDate),
    ];
