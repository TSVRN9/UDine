// What M2's screens read: a day-by-place-by-meal book of core MenuItems, plus the places, their hours and the hours events.
// Built by the menu loader (flutter-port-menu-data); tests build it from the bake-off fixture.
// Place and meal keys stay strings ('W', 'c12'; 'lunch', 'late'), as M2 spells them.
import '../hours.dart';
import '../types.dart';

export '../types.dart' show MenuItem, DiningHallHours, TimeWindow;

class Macro {
  final num cal, p, c, f;
  const Macro(this.cal, this.p, this.c, this.f);
}

num _r1(num x) => (x * 10).round() / 10;

/// A name the way M2 matches dishes: lower-case, apostrophes dropped, every other run of non-alphanumerics a single space.
String dishKey(String name) => name.toLowerCase().replaceAll(RegExp('[’\']'), '').replaceAll(RegExp('[^a-z0-9]+'), ' ').trim();

extension M2MenuItem on MenuItem {
  String get key => dishKey(dishName);

  /// 1 veg, 2 plant, 4 halal, 8 local, 16 sustainable, from the feed's diet tags.
  /// ponytail: 'Sustainable' is not a tag the feed's data-clean-diet-str emits (M2 reads SUS from recipe-webcode);
  /// flutter-port-menu-data must add it when it builds MenuItems from the live feed.
  int get diet => const {'Vegetarian': 1, 'Plant Based': 2, 'Halal': 4, 'Local': 8, 'Sustainable': 16}
      .entries.fold(0, (bits, e) => dietTags.contains(e.key) ? bits | e.value : bits);

  /// The plate's per-serving macros as M2 sums them: calories whole, grams to a tenth.
  Macro get macro => Macro(nutrition.calories.round(), _r1(nutrition.proteinG), _r1(nutrition.totalCarbG), _r1(nutrition.totalFatG));
}

class Station {
  final String name;
  final List<MenuItem> dishes;
  const Station(this.name, this.dishes);
}

class Place {
  final String key, name, building, description, payment;
  final int area;
  final String? address, mapAddress;
  const Place({
    required this.key, required this.name, required this.area, this.building = '', this.description = '', this.payment = '',
    this.address, this.mapAddress,
  });
}

/// The hours event that replaces some halls' windows on one day (a holiday).
class HoursEvent {
  final String title, scope;
  final int expires; // unix seconds
  final List<List<String>> links;
  final String? hoursTitle;
  const HoursEvent({required this.title, required this.scope, required this.expires, required this.links, this.hoursTitle});
}

class Board {
  final DateTime clock;
  final List<Place> places;
  /// A café has only `general`.
  final Map<String, DiningHallHours> hours;
  final Map<String, TimeWindow> grab;
  /// iso day -> place -> meal -> stations
  final Map<String, Map<String, Map<String, List<Station>>>> days;
  final List<HoursEvent> events;
  const Board({required this.clock, required this.places, required this.hours, required this.grab, required this.days, required this.events});
}

const halls = ['W', 'F', 'H', 'B'];
const mealLabel = {
  'breakfast': 'Breakfast', 'lunch': 'Lunch', 'dinner': 'Dinner', 'late': 'Late night', 'all': 'All day', 'grab': "Grab 'N Go",
};

bool isCafe(String k) => k.startsWith('c');

/// Halls first (W F H B), then cafés in book order: M2's PORD.
int placeOrder(String k) => isCafe(k) ? 4 + int.parse(k.substring(1)) : halls.indexOf(k);

String placeName(Board b, String k) => b.places.firstWhere((p) => p.key == k).name;

/// The standard window the clock is in: M2's CLOCKMEAL (lunch at 12:41).
String clockMeal(DateTime instant) {
  final w = easternWall(instant), m = w.hour * 60 + w.minute;
  return m >= 420 && m < 660 ? 'breakfast' : m >= 660 && m < 990 ? 'lunch' : m >= 990 && m < 1260 ? 'dinner' : m >= 1260 && m < 1560 ? 'late' : 'lunch';
}

/// A dish's serving at a place on a day, for a plate meal; a café's all-day and Grab 'N Go menus count for the clock's meal.
MenuItem? servingOn(Board b, String iso, String place, String meal, String key) {
  final cm = clockMeal(b.clock);
  for (final MapEntry(key: m, value: stations) in (b.days[iso]?[place] ?? const <String, List<Station>>{}).entries) {
    if ((isCafe(place) && (m == 'all' || m == 'grab') ? cm : m) != meal) continue;
    for (final st in stations) {
      for (final d in st.dishes) {
        if (d.key == key) return d;
      }
    }
  }
  return null;
}

/// The dish sheet's price line: café servings only, and only when the feed carries one. The feed's own string ("$3.00").
String? shownPrice(String place, MenuItem d) => isCafe(place) ? d.price : null;
