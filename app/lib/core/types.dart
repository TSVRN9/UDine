// Field-for-field with shared/src/types.ts. JSON keys are the TS property names, so a blob written by the
// TS apps decodes here and re-encodes unchanged.

enum MealPeriod { breakfast, lunch, dinner, latenight, allday, grabngo }

/// The four periods a hall's own hours can be in (TS HallMealPeriod).
enum HallMealPeriod { breakfast, lunch, dinner, latenight }

/// TS MealStatus: HallMealPeriod | "closed".
enum MealStatus { breakfast, lunch, dinner, latenight, closed }

/// JSON.stringify prints 127.0 as 127; Dart prints 127.0. Integral doubles go out as ints.
num jsonNum(num v) => v.isFinite && v == v.truncate() ? v.toInt() : v;

/// A %DV value that is a number, present-but-blank (`Dv(null)`, JSON null) or absent (a null `Dv?`, key omitted).
class Dv {
  const Dv(this.value);
  final num? value;
  @override
  bool operator ==(Object other) => other is Dv && other.value == value;
  @override
  int get hashCode => value.hashCode;
}

Dv? _dv(Map<String, dynamic> j, String k) => j.containsKey(k) ? Dv(j[k] as num?) : null;

class DiningHall {
  const DiningHall({required this.tid, required this.slug, required this.name});
  final int tid;
  final String slug;
  final String name;
}

const diningHalls = [
  DiningHall(tid: 1, slug: 'worcester', name: 'Worcester'),
  DiningHall(tid: 2, slug: 'franklin', name: 'Franklin'),
  DiningHall(tid: 3, slug: 'hampshire', name: 'Hampshire'),
  DiningHall(tid: 4, slug: 'berkshire', name: 'Berkshire'),
];

class NutritionFacts {
  const NutritionFacts({
    required this.servingSize,
    required this.calories,
    required this.caloriesFromFat,
    required this.totalFatG,
    required this.satFatG,
    required this.transFatG,
    required this.cholesterolMg,
    required this.sodiumMg,
    required this.totalCarbG,
    required this.dietaryFiberG,
    required this.sugarsG,
    required this.proteinG,
    this.totalFatDv,
    this.satFatDv,
    this.cholesterolDv,
    this.sodiumDv,
    this.totalCarbDv,
    this.dietaryFiberDv,
    this.sugarsDv,
    this.proteinDv,
  });

  final String servingSize;
  final num calories, caloriesFromFat, totalFatG, satFatG, transFatG, cholesterolMg, sodiumMg;
  final num totalCarbG, dietaryFiberG, sugarsG, proteinG;
  final Dv? totalFatDv, satFatDv, cholesterolDv, sodiumDv, totalCarbDv, dietaryFiberDv, sugarsDv, proteinDv;

  factory NutritionFacts.fromJson(Map<String, dynamic> j) => NutritionFacts(
        servingSize: j['servingSize'] as String,
        calories: j['calories'] as num,
        caloriesFromFat: j['caloriesFromFat'] as num,
        totalFatG: j['totalFatG'] as num,
        satFatG: j['satFatG'] as num,
        transFatG: j['transFatG'] as num,
        cholesterolMg: j['cholesterolMg'] as num,
        sodiumMg: j['sodiumMg'] as num,
        totalCarbG: j['totalCarbG'] as num,
        dietaryFiberG: j['dietaryFiberG'] as num,
        sugarsG: j['sugarsG'] as num,
        proteinG: j['proteinG'] as num,
        totalFatDv: _dv(j, 'totalFatDv'),
        satFatDv: _dv(j, 'satFatDv'),
        cholesterolDv: _dv(j, 'cholesterolDv'),
        sodiumDv: _dv(j, 'sodiumDv'),
        totalCarbDv: _dv(j, 'totalCarbDv'),
        dietaryFiberDv: _dv(j, 'dietaryFiberDv'),
        sugarsDv: _dv(j, 'sugarsDv'),
        proteinDv: _dv(j, 'proteinDv'),
      );

  Map<String, dynamic> toJson() => {
        'servingSize': servingSize,
        'calories': jsonNum(calories),
        'caloriesFromFat': jsonNum(caloriesFromFat),
        'totalFatG': jsonNum(totalFatG),
        'satFatG': jsonNum(satFatG),
        'transFatG': jsonNum(transFatG),
        'cholesterolMg': jsonNum(cholesterolMg),
        'sodiumMg': jsonNum(sodiumMg),
        'totalCarbG': jsonNum(totalCarbG),
        'dietaryFiberG': jsonNum(dietaryFiberG),
        'sugarsG': jsonNum(sugarsG),
        'proteinG': jsonNum(proteinG),
        if (totalFatDv != null) 'totalFatDv': _dvOut(totalFatDv!),
        if (satFatDv != null) 'satFatDv': _dvOut(satFatDv!),
        if (cholesterolDv != null) 'cholesterolDv': _dvOut(cholesterolDv!),
        if (sodiumDv != null) 'sodiumDv': _dvOut(sodiumDv!),
        if (totalCarbDv != null) 'totalCarbDv': _dvOut(totalCarbDv!),
        if (dietaryFiberDv != null) 'dietaryFiberDv': _dvOut(dietaryFiberDv!),
        if (sugarsDv != null) 'sugarsDv': _dvOut(sugarsDv!),
        if (proteinDv != null) 'proteinDv': _dvOut(proteinDv!),
      };
}

Object? _dvOut(Dv d) => d.value == null ? null : jsonNum(d.value!);

class MenuItem {
  const MenuItem({
    required this.dishName,
    required this.category,
    required this.mealPeriod,
    required this.hallTid,
    required this.date,
    required this.nutrition,
    required this.allergens,
    required this.dietTags,
    this.price,
    this.ingredients,
    this.health,
    this.carbon,
  });

  final String dishName, category, date; // date: YYYY-MM-DD
  final MealPeriod mealPeriod;
  final int hallTid;
  final NutritionFacts nutrition;
  final List<String> allergens, dietTags;
  final String? price; // the feed's display string, "$3.00"
  final String? ingredients;

  /// Not in the TS type and not in toJson/fromJson: healthfulness grade H0..H7 from recipe-webcode (H0 is a real 0).
  final int? health;

  /// Not in the TS type or its JSON: carbon letter A-E from data-carbon-list.
  final String? carbon;

  factory MenuItem.fromJson(Map<String, dynamic> j) => MenuItem(
        dishName: j['dishName'] as String,
        category: j['category'] as String,
        mealPeriod: MealPeriod.values.byName(j['mealPeriod'] as String),
        hallTid: j['hallTid'] as int,
        date: j['date'] as String,
        nutrition: NutritionFacts.fromJson(j['nutrition'] as Map<String, dynamic>),
        allergens: List<String>.from(j['allergens'] as List),
        dietTags: List<String>.from(j['dietTags'] as List),
        price: j['price'] as String?,
        ingredients: j['ingredients'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'dishName': dishName,
        'category': category,
        'mealPeriod': mealPeriod.name,
        'hallTid': hallTid,
        'date': date,
        'nutrition': nutrition.toJson(),
        'allergens': allergens,
        'dietTags': dietTags,
        if (price != null) 'price': price,
        if (ingredients != null) 'ingredients': ingredients,
      };
}

/// TS LogEntry.source: a union discriminated by `type`.
sealed class LogSource {
  const LogSource();
  factory LogSource.fromJson(Map<String, dynamic> j) => switch (j['type']) {
        'umass-menu' => UmassMenuSource(dishName: j['dishName'] as String, hallTid: j['hallTid'] as int),
        'off' => OffSource(barcode: j['barcode'] as String, productName: j['productName'] as String),
        'usda' => UsdaSource(fdcId: j['fdcId'] as String, productName: j['productName'] as String),
        'custom' => CustomSource(customFoodId: j['customFoodId'] as String, productName: j['productName'] as String),
        final t => throw FormatException('unknown LogEntry source type $t'),
      };
  Map<String, dynamic> toJson();
}

class UmassMenuSource extends LogSource {
  const UmassMenuSource({required this.dishName, required this.hallTid});
  final String dishName;
  final int hallTid;
  @override
  Map<String, dynamic> toJson() => {'type': 'umass-menu', 'dishName': dishName, 'hallTid': hallTid};
}

class OffSource extends LogSource {
  const OffSource({required this.barcode, required this.productName});
  final String barcode, productName;
  @override
  Map<String, dynamic> toJson() => {'type': 'off', 'barcode': barcode, 'productName': productName};
}

class UsdaSource extends LogSource {
  const UsdaSource({required this.fdcId, required this.productName});
  final String fdcId, productName;
  @override
  Map<String, dynamic> toJson() => {'type': 'usda', 'fdcId': fdcId, 'productName': productName};
}

class CustomSource extends LogSource {
  const CustomSource({required this.customFoodId, required this.productName});
  final String customFoodId, productName;
  @override
  Map<String, dynamic> toJson() => {'type': 'custom', 'customFoodId': customFoodId, 'productName': productName};
}

/// One food-logging entry. Device-local only.
class LogEntry {
  const LogEntry({required this.id, required this.loggedAt, required this.source, required this.servings, required this.nutrition});
  final String id;
  final String loggedAt; // ISO 8601
  final LogSource source;
  final num servings;
  final NutritionFacts nutrition;

  factory LogEntry.fromJson(Map<String, dynamic> j) => LogEntry(
        id: j['id'] as String,
        loggedAt: j['loggedAt'] as String,
        source: LogSource.fromJson(j['source'] as Map<String, dynamic>),
        servings: j['servings'] as num,
        nutrition: NutritionFacts.fromJson(j['nutrition'] as Map<String, dynamic>),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'loggedAt': loggedAt,
        'source': source.toJson(),
        'servings': jsonNum(servings),
        'nutrition': nutrition.toJson(),
      };
}

class CustomFood {
  const CustomFood({required this.id, required this.name, required this.servingSize, required this.nutrition, this.ingredients});
  final String id, name, servingSize;
  final NutritionFacts nutrition;
  final String? ingredients;

  factory CustomFood.fromJson(Map<String, dynamic> j) => CustomFood(
        id: j['id'] as String,
        name: j['name'] as String,
        servingSize: j['servingSize'] as String,
        nutrition: NutritionFacts.fromJson(j['nutrition'] as Map<String, dynamic>),
        ingredients: j['ingredients'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'servingSize': servingSize,
        'nutrition': nutrition.toJson(),
        if (ingredients != null) 'ingredients': ingredients,
      };
}

class DailyMacroTotals {
  const DailyMacroTotals({required this.date, required this.calories, required this.proteinG, required this.totalCarbG, required this.totalFatG});
  final String date; // YYYY-MM-DD
  final num calories, proteinG, totalCarbG, totalFatG;

  factory DailyMacroTotals.fromJson(Map<String, dynamic> j) => DailyMacroTotals(
        date: j['date'] as String,
        calories: j['calories'] as num,
        proteinG: j['proteinG'] as num,
        totalCarbG: j['totalCarbG'] as num,
        totalFatG: j['totalFatG'] as num,
      );

  Map<String, dynamic> toJson() => {
        'date': date,
        'calories': jsonNum(calories),
        'proteinG': jsonNum(proteinG),
        'totalCarbG': jsonNum(totalCarbG),
        'totalFatG': jsonNum(totalFatG),
      };
}

enum MacroPreset {
  highProtein('high-protein'),
  lowSodium('low-sodium'),
  under300Cal('under-300-cal'),
  lowFat('low-fat'),
  highFiber('high-fiber');

  const MacroPreset(this.wire);
  final String wire;
}

class FoodPreferences {
  const FoodPreferences({required this.allergensToAvoid, required this.requiredDietTags, this.macroPresets});
  final List<String> allergensToAvoid, requiredDietTags;

  /// Wire strings, not MacroPreset: a stored blob can hold a stale preset name ("under-500-cal") that must survive
  /// a round trip (TS menuItemMacroBadges tolerates it). null = key absent.
  final List<String>? macroPresets;

  factory FoodPreferences.fromJson(Map<String, dynamic> j) => FoodPreferences(
        allergensToAvoid: List<String>.from(j['allergensToAvoid'] as List),
        requiredDietTags: List<String>.from(j['requiredDietTags'] as List),
        macroPresets: j['macroPresets'] == null ? null : List<String>.from(j['macroPresets'] as List),
      );

  Map<String, dynamic> toJson() => {
        'allergensToAvoid': allergensToAvoid,
        'requiredDietTags': requiredDietTags,
        if (macroPresets != null) 'macroPresets': macroPresets,
      };
}

/// TS Favorite: `{type:"dish", dishName}` | `{type:"location", hallTid}`.
sealed class Favorite {
  const Favorite();
  factory Favorite.fromJson(Map<String, dynamic> j) => switch (j['type']) {
        'dish' => DishFavorite(j['dishName'] as String),
        'location' => LocationFavorite(j['hallTid'] as int),
        final t => throw FormatException('unknown favorite type $t'),
      };
  String get key;
  Map<String, dynamic> toJson();
}

class DishFavorite extends Favorite {
  const DishFavorite(this.dishName);
  final String dishName;
  @override
  String get key => 'dish:$dishName';
  @override
  Map<String, dynamic> toJson() => {'type': 'dish', 'dishName': dishName};
}

class LocationFavorite extends Favorite {
  const LocationFavorite(this.hallTid);
  final int hallTid;
  @override
  String get key => 'location:$hallTid';
  @override
  Map<String, dynamic> toJson() => {'type': 'location', 'hallTid': hallTid};
}

class PressRelease {
  const PressRelease({required this.title, required this.url, required this.image, required this.date});
  final String title, url, image, date; // date: YYYY-MM-DD

  factory PressRelease.fromJson(Map<String, dynamic> j) =>
      PressRelease(title: j['title'] as String, url: j['url'] as String, image: j['image'] as String, date: j['date'] as String);
  Map<String, dynamic> toJson() => {'title': title, 'url': url, 'image': image, 'date': date};
}

class DiningEvent {
  const DiningEvent({
    required this.title,
    required this.featuredImage,
    required this.pdfLink,
    required this.externalLink,
    required this.expirationDate,
    required this.isFeatured,
  });
  final String title, featuredImage, pdfLink, externalLink;
  final String expirationDate; // ISO 8601, from the API's unix seconds
  final bool isFeatured;

  factory DiningEvent.fromJson(Map<String, dynamic> j) => DiningEvent(
        title: j['title'] as String,
        featuredImage: j['featuredImage'] as String,
        pdfLink: j['pdfLink'] as String,
        externalLink: j['externalLink'] as String,
        expirationDate: j['expirationDate'] as String,
        isFeatured: j['isFeatured'] as bool,
      );
  Map<String, dynamic> toJson() => {
        'title': title,
        'featuredImage': featuredImage,
        'pdfLink': pdfLink,
        'externalLink': externalLink,
        'expirationDate': expirationDate,
        'isFeatured': isFeatured,
      };
}

class NewsletterIssue {
  const NewsletterIssue({required this.period, required this.link, required this.content});
  final String period, link, content;

  factory NewsletterIssue.fromJson(Map<String, dynamic> j) =>
      NewsletterIssue(period: j['period'] as String, link: j['link'] as String, content: j['content'] as String);
  Map<String, dynamic> toJson() => {'period': period, 'link': link, 'content': content};
}

class RankedDish {
  const RankedDish({required this.dishName, required this.hallTid, required this.rating, required this.comparisonCount});
  final String dishName;
  final int hallTid, comparisonCount;
  final num rating;

  factory RankedDish.fromJson(Map<String, dynamic> j) => RankedDish(
      dishName: j['dishName'] as String, hallTid: j['hallTid'] as int, rating: j['rating'] as num, comparisonCount: j['comparisonCount'] as int);
  Map<String, dynamic> toJson() => {'dishName': dishName, 'hallTid': hallTid, 'rating': jsonNum(rating), 'comparisonCount': comparisonCount};
}

class RankedFood {
  const RankedFood({required this.dishName, required this.rating, required this.comparisonCount});
  final String dishName;
  final int comparisonCount;
  final num rating;

  factory RankedFood.fromJson(Map<String, dynamic> j) =>
      RankedFood(dishName: j['dishName'] as String, rating: j['rating'] as num, comparisonCount: j['comparisonCount'] as int);
  Map<String, dynamic> toJson() => {'dishName': dishName, 'rating': jsonNum(rating), 'comparisonCount': comparisonCount};
}

/// One open/close window in the feed's published Eastern wall-clock time ("H:MM AM/PM", as published).
class TimeWindow {
  const TimeWindow({required this.openTime, required this.closeTime});
  final String openTime, closeTime;

  static TimeWindow? fromJsonOrNull(Object? j) =>
      j == null ? null : TimeWindow(openTime: (j as Map)['openTime'] as String, closeTime: j['closeTime'] as String);
  Map<String, dynamic> toJson() => {'openTime': openTime, 'closeTime': closeTime};
}

class DiningHallHours {
  const DiningHallHours({
    required this.hallTid,
    this.breakfast,
    this.lunch,
    this.dinner,
    this.latenight,
    this.general,
    this.address,
    this.mapAddress,
  });
  final int hallTid;
  final TimeWindow? breakfast, lunch, dinner, latenight, general;

  final String? address, mapAddress; // street line / "lat,long"; null if absent or malformed

  TimeWindow? window(HallMealPeriod p) => switch (p) {
        HallMealPeriod.breakfast => breakfast,
        HallMealPeriod.lunch => lunch,
        HallMealPeriod.dinner => dinner,
        HallMealPeriod.latenight => latenight,
      };

  factory DiningHallHours.fromJson(Map<String, dynamic> j) => DiningHallHours(
        hallTid: j['hallTid'] as int,
        breakfast: TimeWindow.fromJsonOrNull(j['breakfast']),
        lunch: TimeWindow.fromJsonOrNull(j['lunch']),
        dinner: TimeWindow.fromJsonOrNull(j['dinner']),
        latenight: TimeWindow.fromJsonOrNull(j['latenight']),
        general: TimeWindow.fromJsonOrNull(j['general']),
        address: j['address'] as String?,
        mapAddress: j['mapAddress'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'hallTid': hallTid,
        'breakfast': breakfast?.toJson(),
        'lunch': lunch?.toJson(),
        'dinner': dinner?.toJson(),
        'latenight': latenight?.toJson(),
        'general': general?.toJson(),
        'address': address,
        'mapAddress': mapAddress,
      };
}

class RetailLocationHours {
  const RetailLocationHours({
    required this.name,
    this.hours,
    this.locationId,
    this.breakfastMenu,
    this.lunchMenu,
    this.dinnerMenu,
    this.description,
    this.address,
    this.mapAddress,
    this.acceptedPayment,
  });
  final String name;
  final TimeWindow? hours;
  final int? locationId;
  final String? breakfastMenu, lunchMenu, dinnerMenu; // raw HTML; null = none
  final String? description, address, mapAddress, acceptedPayment;

  Map<String, dynamic> toJson() => {
        'name': name,
        'hours': hours?.toJson(),
        if (locationId != null) 'locationId': locationId,
        'breakfastMenu': breakfastMenu,
        'lunchMenu': lunchMenu,
        'dinnerMenu': dinnerMenu,
        if (description != null) 'description': description,
        if (address != null) 'address': address,
        if (mapAddress != null) 'mapAddress': mapAddress,
        if (acceptedPayment != null) 'acceptedPayment': acceptedPayment,
      };
}

class DiningHoursFeed {
  const DiningHoursFeed({required this.halls, required this.retail});
  final List<DiningHallHours> halls;
  final List<RetailLocationHours> retail;

  Map<String, dynamic> toJson() => {
        'halls': [for (final h in halls) h.toJson()],
        'retail': [for (final r in retail) r.toJson()],
      };
}

/// TS OpenStatus: {open:true, closesAt} | {open:false, opensAt|null}. Instants are UTC.
sealed class OpenStatus {
  const OpenStatus();
}

class Open extends OpenStatus {
  const Open(this.closesAt);
  final DateTime closesAt;
}

class Closed extends OpenStatus {
  const Closed(this.opensAt);
  final DateTime? opensAt;
}
