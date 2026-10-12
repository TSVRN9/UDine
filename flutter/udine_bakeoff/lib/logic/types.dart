// Place and meal keys stay strings ('W', 'c12'; 'lunch', 'late'), as the fixture spells them.

class Macro {
  final num cal, p, c, f;
  const Macro(this.cal, this.p, this.c, this.f);
  factory Macro.fromJson(Map<String, dynamic> j) => Macro(j['cal'], j['p'], j['c'], j['f']);
}

class Dish extends Macro {
  final String key, name, station, serving, ingredients;
  final int diet; // 1 veg, 2 plant, 4 halal, 8 local, 16 sustainable
  final Map<String, dynamic> nutrition; // ponytail: raw until the dish sheet reads it
  final List<String> allergens;
  final int? health;
  final String? carbon; // 'A'..'E'
  final num? price;
  const Dish({
    required this.key, required this.name, required this.station, required num cal, required num p, required num c, required num f,
    required this.diet, required this.serving, required this.nutrition, required this.ingredients, required this.allergens,
    required this.health, required this.carbon, required this.price,
  }) : super(cal, p, c, f);
  factory Dish.fromJson(Map<String, dynamic> j, [String station = '']) => Dish(
        key: j['key'], name: j['name'], station: station, cal: j['cal'], p: j['p'], c: j['c'], f: j['f'], diet: j['diet'],
        serving: j['serving'], nutrition: j['nutrition'], ingredients: j['ingredients'],
        allergens: (j['allergens'] as List).cast<String>(), health: j['health'], carbon: j['carbon'], price: j['price'],
      );
  Dish at(String station) => Dish(
        key: key, name: name, station: station, cal: cal, p: p, c: c, f: f, diet: diet, serving: serving, nutrition: nutrition,
        ingredients: ingredients, allergens: allergens, health: health, carbon: carbon, price: price,
      );
}

class Station {
  final String name;
  final List<Dish> dishes;
  const Station(this.name, this.dishes);
}

class Place {
  final String key, name, building, description, payment;
  final int area;
  final String? address, mapAddress;
  Place.fromJson(Map<String, dynamic> j)
      : key = j['key'], name = j['name'], area = j['area'], building = j['building'], description = j['description'],
        payment = j['payment'], address = j['address'], mapAddress = j['mapAddress'];
}

class TimeWindow {
  final String openTime, closeTime;
  const TimeWindow(this.openTime, this.closeTime);
  static TimeWindow? from(dynamic j) => j == null ? null : TimeWindow(j['openTime'], j['closeTime']);
}

class DiningHallHours {
  final TimeWindow? breakfast, lunch, dinner, latenight, general;
  DiningHallHours.fromJson(Map<String, dynamic> j)
      : breakfast = TimeWindow.from(j['breakfast']), lunch = TimeWindow.from(j['lunch']), dinner = TimeWindow.from(j['dinner']),
        latenight = TimeWindow.from(j['latenight']), general = TimeWindow.from(j['general']);
  /// A per-meal window by HallMealPeriod name: breakfast, lunch, dinner or latenight.
  TimeWindow? window(String period) => switch (period) {
        'breakfast' => breakfast, 'lunch' => lunch, 'dinner' => dinner, _ => latenight,
      };
}

class FixtureEvent {
  final String title, scope;
  final int expires;
  final List<List<String>> links;
  final String? hoursTitle;
  FixtureEvent.fromJson(Map<String, dynamic> j)
      : title = j['title'], scope = j['scope'], expires = j['expires'], hoursTitle = j['hoursTitle'],
        links = (j['links'] as List).map((l) => (l as List).cast<String>()).toList();
}

class Busy {
  final int level, pct, usualPct;
  final String label, trend, vsUsual, confidence;
  final String? calmerAt;
  final List<({int inMinutes, int? pct})> outlook;
  Busy.fromJson(Map<String, dynamic> j)
      : level = j['level'], label = j['label'], pct = j['pct'], usualPct = j['usual_pct'], trend = j['trend'],
        vsUsual = j['vs_usual'], calmerAt = j['calmer_at'], confidence = j['confidence'],
        outlook = [for (final o in j['outlook'] as List) (inMinutes: o['in'] as int, pct: o['pct'] as int?)];
}

class Fixture {
  final String clock;
  final List<String> areas;
  final List<Place> places;
  final Map<String, DiningHallHours> hours;
  final Map<String, TimeWindow> grab;
  final Map<String, Busy> busy;
  /// [first hour, % per hour] per hall
  final Map<String, (int, List<int>)> typical;
  /// every distinct dish served in the 15 days (station is '' here; a serving's station is on `days`)
  final List<Dish> dishes;
  /// iso day -> place -> meal -> stations
  final Map<String, Map<String, Map<String, List<Station>>>> days;
  final List<FixtureEvent> events;

  Fixture.fromJson(Map<String, dynamic> j)
      : clock = j['clock'],
        areas = (j['areas'] as List).cast<String>(),
        places = [for (final p in j['places'] as List) Place.fromJson(p)],
        hours = {for (final e in (j['hours'] as Map).entries) e.key: DiningHallHours.fromJson(e.value)},
        grab = {for (final e in (j['grab'] as Map).entries) e.key: TimeWindow.from(e.value)!},
        busy = {for (final e in (j['busy'] as Map).entries) e.key: Busy.fromJson(e.value)},
        typical = {for (final e in (j['typical'] as Map).entries) e.key: (e.value[0] as int, (e.value[1] as List).cast<int>())},
        dishes = [for (final d in j['dishes'] as List) Dish.fromJson(d)],
        events = [for (final e in j['events'] as List) FixtureEvent.fromJson(e)],
        days = {} {
    for (final MapEntry(key: iso, value: places) in (j['days'] as Map).entries) {
      days[iso] = {
        for (final MapEntry(key: pk, value: meals) in (places as Map).entries)
          pk: {
            for (final MapEntry(key: mk, value: sts) in (meals as Map).entries)
              mk: [for (final s in sts as List) Station(s[0], [for (final i in s[1] as List) dishes[i].at(s[0])])],
          },
      };
    }
  }
}
