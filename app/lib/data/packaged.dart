// Packaged foods: OpenFoodFacts and USDA FoodData Central search, mapped exactly as shared/src/openFoodFacts.ts and
// usdaFoodData.ts do (checked by shared/vectors/packaged.json), and the lookup-dish edge function. Device-side only; the
// searches send nothing but the query text.
import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../core/packaged_food.dart';
import '../core/types.dart';
import 'source.dart';
import 'supabase_source.dart';

/// A real key goes in with `--dart-define=USDA_FDC_API_KEY=...`; empty falls back to FDC's public DEMO_KEY, as TS does.
const usdaApiKey = String.fromEnvironment('USDA_FDC_API_KEY');

const _pageSize = 20;

class PackagedPage {
  const PackagedPage(this.results, this.hasMore);
  final List<PackagedFood> results;
  final bool hasMore;
}

/// The Packaged group: hits with no calories are left out, and a name shows once (case-insensitive, first wins), as does
/// nothing already in Your foods ([have], lowercased display names).
List<PackagedFood> packagedGroup(
  List<PackagedFood> hits, {
  Set<String> have = const {},
}) {
  final seen = {...have};
  return [
    for (final f in hits)
      if (f.nutrition.calories > 0 &&
          seen.add(f.displayName.trim().toLowerCase()))
        f,
  ];
}

num? _num(Map n, String k) => n[k] is num ? n[k] as num : null;

/// The figures a source gave no number for (the label draws "–" for them, M2's rule): by field name, as `NutritionFacts.blank`. Not part of the
/// vector-checked JSON; a saved food keeps them beside it (`PackagedFood.toJson`).
Set<String> _blanks(bool Function(String field) given) => {
      for (final f in const ['caloriesFromFat', 'totalFatG', 'satFatG', 'transFatG', 'cholesterolMg', 'sodiumMg', 'totalCarbG', 'dietaryFiberG', 'sugarsG', 'proteinG'])
        if (!given(f)) f,
    };

const _offKeys = {
  'totalFatG': 'fat', 'satFatG': 'saturated-fat', 'transFatG': 'trans-fat', 'cholesterolMg': 'cholesterol', 'sodiumMg': 'sodium',
  'totalCarbG': 'carbohydrates', 'dietaryFiberG': 'fiber', 'sugarsG': 'sugars', 'proteinG': 'proteins',
};

NutritionFacts _offNutrition(Map n, String servingSize) {
  num v(String k) => _num(n, '${k}_serving') ?? _num(n, '${k}_100g') ?? 0;
  final blank = _blanks((f) => _offKeys[f] != null && (_num(n, '${_offKeys[f]}_serving') != null || _num(n, '${_offKeys[f]}_100g') != null));
  return NutritionFacts(
    blank: blank,
    servingSize: servingSize,
    calories: v('energy-kcal'),
    caloriesFromFat: 0,
    totalFatG: v('fat'),
    satFatG: v('saturated-fat'),
    transFatG: v('trans-fat'),
    cholesterolMg: v('cholesterol'),
    sodiumMg: v('sodium') * 1000,
    totalCarbG: v('carbohydrates'),
    dietaryFiberG: v('fiber'),
    sugarsG: v('sugars'),
    proteinG: v('proteins'),
  );
}

/// OFF's `brands` is a comma string on some endpoints and a list on others; the first one, trimmed.
String? _brand(Object? b) {
  final first = b is List
      ? (b.isEmpty ? null : '${b.first}')
      : (b is String ? b.split(',').first : null);
  final t = first?.trim();
  return t == null || t.isEmpty ? null : t;
}

String _allergen(String tag) => tag
    .replaceFirst(RegExp(r'^[a-z]{2,3}:'), '')
    .split(RegExp(r'[-_]'))
    .where((w) => w.isNotEmpty)
    .map((w) => w[0].toUpperCase() + w.substring(1))
    .join(' ');

/// cgi/search.pl's JSON (searchProducts).
PackagedPage mapOffSearch(Object? response, {int page = 1}) {
  final data = response as Map;
  final results = <PackagedFood>[];
  for (final p in (data['products'] as List? ?? const []).cast<Map>()) {
    final code = p['code'], name = p['product_name'];
    if (code is! String || code.isEmpty || name is! String || name.isEmpty) {
      continue;
    }
    final n = (p['nutriments'] as Map?) ?? const {};
    final serving = n.containsKey('energy-kcal_serving')
        ? (p['serving_size'] as String? ?? '')
        : 'per 100g';
    final allergens = [
      for (final t in (p['allergens_tags'] as List? ?? const []))
        _allergen('$t'),
    ];
    final ingredients = p['ingredients_text'];
    results.add(
      PackagedFood(
        source: OffSource(barcode: code, productName: name),
        productName: name,
        nutrition: _offNutrition(n, serving),
        ingredients: ingredients is String && ingredients.isNotEmpty
            ? ingredients
            : null,
        allergens: allergens.isEmpty ? null : allergens,
        brand: _brand(p['brands']),
      ),
    );
  }
  final count = data['count'];
  return PackagedPage(
    results,
    count is num ? page * _pageSize < count : results.length == _pageSize,
  );
}

/// api/v2/product's JSON (lookupBarcode); null when OFF has no such product.
PackagedFood? mapOffProduct(String barcode, Object? response) {
  final data = response as Map;
  final p = data['product'];
  if (data['status'] != 1 || p is! Map) return null;
  final serving = p['serving_size'] as String? ?? '';
  final name = p['product_name'] as String? ?? 'Unknown product';
  return PackagedFood(
    source: OffSource(barcode: barcode, productName: name),
    productName: name,
    nutrition: _offNutrition((p['nutriments'] as Map?) ?? const {}, serving),
    brand: _brand(p['brands']),
  );
}

/// FDC /foods/search JSON (searchFoods / searchBrandedFoods): values are always per 100 g.
PackagedPage mapUsdaSearch(Object? response, {int page = 1}) {
  final data = response as Map;
  final results = <PackagedFood>[];
  for (final f in (data['foods'] as List? ?? const []).cast<Map>()) {
    final nutrients = (f['foodNutrients'] as List? ?? const []).cast<Map>();
    num find(String part, [String? unit]) {
      for (final n in nutrients) {
        if ('${n['nutrientName'] ?? ''}'.toLowerCase().contains(part) &&
            (unit == null || '${n['unitName'] ?? ''}'.toUpperCase() == unit)) {
          return n['value'] is num ? n['value'] as num : 0;
        }
      }
      return 0;
    }

    final name = f['description'] as String? ?? 'Unknown food';
    final ingredients = f['ingredients'];
    bool has(String part, [String? unit]) => nutrients.any((n) => '${n['nutrientName'] ?? ''}'.toLowerCase().contains(part) && (unit == null || '${n['unitName'] ?? ''}'.toUpperCase() == unit) && n['value'] is num);
    const usdaParts = {'totalFatG': 'total lipid', 'satFatG': 'saturated', 'transFatG': 'trans', 'cholesterolMg': 'cholesterol', 'sodiumMg': 'sodium', 'totalCarbG': 'carbohydrate', 'dietaryFiberG': 'fiber', 'sugarsG': 'sugars', 'proteinG': 'protein'};
    results.add(
      PackagedFood(
        source: UsdaSource(fdcId: '${f['fdcId']}', productName: name),
        productName: name,
        ingredients: ingredients is String && ingredients.isNotEmpty
            ? ingredients
            : null,
        nutrition: NutritionFacts(
          blank: _blanks((f) => usdaParts[f] != null && has(usdaParts[f]!)),
          servingSize: 'per 100g',
          calories: find('energy', 'KCAL'),
          caloriesFromFat: 0,
          totalFatG: find('total lipid'),
          satFatG: find('saturated'),
          transFatG: find('trans'),
          cholesterolMg: find('cholesterol'),
          sodiumMg: find('sodium'),
          totalCarbG: find('carbohydrate'),
          dietaryFiberG: find('fiber'),
          sugarsG: find('sugars'),
          proteinG: find('protein'),
        ),
      ),
    );
  }
  final current = data['currentPage'] is num
      ? data['currentPage'] as num
      : page;
  final total = data['totalPages'] is num ? data['totalPages'] as num : 1;
  return PackagedPage(results, current < total);
}

/// OpenFoodFacts and USDA over the injected [client].
class PackagedSource {
  PackagedSource(
    this.client, {
    this.usdaKey = usdaApiKey,
    this.timeout = const Duration(seconds: 6),
    this.retryDelay = const Duration(milliseconds: 600),
  });
  final http.Client client;
  final String usdaKey;
  final Duration timeout, retryDelay;

  static const _off = {
    'User-Agent': 'UDine/1.0 (+https://github.com/TSVRN9/UDine)',
  };

  /// The endpoint and fields RN calls, plus `brands`.
  Future<PackagedPage> offSearch(
    String query, {
    int page = 1,
  }) async => mapOffSearch(
    await _offGet(
      Uri.https('world.openfoodfacts.org', 'cgi/search.pl', {
        'search_terms': query,
        'search_simple': '1',
        'action': 'process',
        'json': '1',
        'page': '$page',
        'page_size': '$_pageSize',
        'fields':
            'code,product_name,serving_size,nutriments,ingredients_text,allergens_tags,brands',
      }),
    ),
    page: page,
  );

  Future<PackagedFood?> offProduct(String barcode) async => mapOffProduct(
    barcode,
    await _offGet(
      Uri.https('world.openfoodfacts.org', 'api/v2/product/$barcode.json'),
    ),
  );

  Future<PackagedPage> usdaGeneric(String query, {int page = 1}) =>
      _usda(query, 'Foundation,SR Legacy', page);

  Future<PackagedPage> usdaBranded(String query, {int page = 1}) =>
      _usda(query, 'Branded', page);

  Future<PackagedPage> _usda(String query, String dataType, int page) async =>
      mapUsdaSearch(
        await sendJson(
          client,
          timeout,
          'GET',
          Uri.https('api.nal.usda.gov', 'fdc/v1/foods/search', {
            'api_key': usdaKey.isEmpty ? 'DEMO_KEY' : usdaKey,
            'query': query,
            'dataType': dataType,
            'pageNumber': '$page',
            'pageSize': '$_pageSize',
          }),
        ),
        page: page,
      );

  /// One retry after a short pause on OFF's transient 503, as TS does.
  Future<Object?> _offGet(Uri uri) async {
    try {
      return await sendJson(client, timeout, 'GET', uri, headers: _off);
    } on BadStatus catch (e) {
      if (e.status != 503) rethrow;
      await Future<void>.delayed(retryDelay);
      return sendJson(client, timeout, 'GET', uri, headers: _off);
    }
  }
}

class LookupCandidate {
  const LookupCandidate({
    required this.dishName,
    required this.location,
    required this.hallTid,
    required this.nutrition,
    required this.allergens,
    required this.dietTags,
  });
  final String dishName, location;
  final int hallTid;
  final NutritionFacts nutrition;
  final List<String> allergens, dietTags;

  factory LookupCandidate.fromJson(Map<String, dynamic> j) => LookupCandidate(
    dishName: j['dishName'] as String,
    location: j['location'] as String,
    hallTid: j['hallTid'] as int,
    nutrition: NutritionFacts.fromJson(j['nutrition'] as Map<String, dynamic>),
    allergens: List<String>.from(j['allergens'] as List),
    dietTags: List<String>.from(j['dietTags'] as List),
  );
}

sealed class LookupResult {
  const LookupResult();
}

class LookupHit extends LookupResult {
  const LookupHit(this.candidates);
  final List<LookupCandidate> candidates;
}

class LookupMiss extends LookupResult {
  const LookupMiss();
}

/// The server's budget is global and resets on the UTC hour, so [resetsAt] is the next one. [reason] is the server's
/// ("budget_exhausted", "in_progress"), null when it sent none.
class LookupRateLimited extends LookupResult {
  const LookupRateLimited(this.resetsAt, this.reason);
  final DateTime resetsAt;
  final String? reason;
}

/// Anything that isn't a hit, a miss or the server's own rate-limit answer: no route, a non-200, a body of the wrong shape.
class LookupFailed extends LookupResult {
  const LookupFailed();
}

/// The `lookup-dish` edge function, anonymous: the publishable key as `apikey` and bearer, as supabase-js sends it.
class LookupDishSource {
  LookupDishSource(
    this.client, {
    this.url = supabaseUrl,
    this.key = supabasePublishableKey,
    this.timeout = const Duration(seconds: 30),
    DateTime Function()? now,
  }) : now = now ?? DateTime.now;
  final http.Client client;
  final String url, key;
  final Duration timeout;
  final DateTime Function() now;

  Future<LookupResult> lookup(String query) async {
    try {
      final data =
          await sendJson(
                client,
                timeout,
                'POST',
                Uri.parse('$url/functions/v1/lookup-dish'),
                headers: {
                  'apikey': key,
                  'Authorization': 'Bearer $key',
                  'Content-Type': 'application/json',
                },
                body: jsonEncode({'query': query}),
              )
              as Map<String, dynamic>;
      switch (data['status']) {
        case 'hit':
          return LookupHit([
            for (final c in data['candidates'] as List)
              LookupCandidate.fromJson(c as Map<String, dynamic>),
          ]);
        case 'miss':
          return const LookupMiss();
        case 'rate_limited':
          final t = now().toUtc();
          return LookupRateLimited(
            DateTime.utc(t.year, t.month, t.day, t.hour + 1),
            data['reason'] as String?,
          );
        default:
          return const LookupFailed();
      }
    } on Object {
      return const LookupFailed();
    }
  }
}
