import 'hours.dart';
import 'types.dart';

export 'types.dart';

const halls = ['W', 'F', 'H', 'B'];
const mealLabel = {
  'breakfast': 'Breakfast', 'lunch': 'Lunch', 'dinner': 'Dinner', 'late': 'Late night', 'all': 'All day', 'grab': "Grab 'N Go",
};

/// M2's norm(): lower-case, apostrophes dropped, every other run of non-alphanumerics a single space.
String dishKey(String name) => name.toLowerCase().replaceAll(RegExp('[’\']'), '').replaceAll(RegExp('[^a-z0-9]+'), ' ').trim();

bool isCafe(String k) => k.startsWith('c');

/// Halls first (W F H B), then cafés in fixture order: M2's PORD.
int placeOrder(String k) => isCafe(k) ? 4 + int.parse(k.substring(1)) : halls.indexOf(k);

String placeName(Fixture fx, String k) => fx.places.firstWhere((p) => p.key == k).name;

/// The standard window the clock is in: M2's CLOCKMEAL (lunch at 12:41).
String clockMeal(DateTime instant) {
  final w = toEastern(instant), m = w.hour * 60 + w.minute;
  return m >= 420 && m < 660 ? 'breakfast' : m >= 660 && m < 990 ? 'lunch' : m >= 990 && m < 1260 ? 'dinner' : m >= 1260 && m < 1560 ? 'late' : 'lunch';
}

/// A dish's serving at a place on a day, for a plate meal; a café's all-day and Grab 'N Go menus count for the clock's meal.
Dish? servingOn(Fixture fx, String iso, String place, String meal, String key) {
  final cm = clockMeal(DateTime.parse(fx.clock));
  for (final MapEntry(key: m, value: stations) in (fx.days[iso]?[place] ?? const <String, List<Station>>{}).entries) {
    if ((isCafe(place) && (m == 'all' || m == 'grab') ? cm : m) != meal) continue;
    for (final st in stations) {
      for (final d in st.dishes) {
        if (d.key == key) return d;
      }
    }
  }
  return null;
}

/// The dish sheet's price line: café servings only, and only when the feed carries one.
String? shownPrice(String place, Dish d) => isCafe(place) && d.price != null ? '\$${d.price!.toStringAsFixed(2)}' : null;
