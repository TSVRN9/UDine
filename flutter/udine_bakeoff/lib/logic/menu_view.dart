import 'fixture.dart';

/// Dietary preferences as You holds them. `avoid` holds allergen names as `Dish.allergens` spells them.
class Prefs {
  final bool veg, plant, halal;
  final List<String> avoid;
  const Prefs({this.veg = false, this.plant = false, this.halal = false, this.avoid = const []});
  Prefs copyWith({bool? veg, bool? plant, bool? halal, List<String>? avoid}) =>
      Prefs(veg: veg ?? this.veg, plant: plant ?? this.plant, halal: halal ?? this.halal, avoid: avoid ?? this.avoid);
  @override
  bool operator ==(Object other) => other is Prefs && other.veg == veg && other.plant == plant && other.halal == halal && other.avoid.length == avoid.length && [for (var i = 0; i < avoid.length; i++) other.avoid[i] == avoid[i]].every((b) => b);
  @override
  int get hashCode => Object.hash(veg, plant, halal, Object.hashAll(avoid));
}

const noPrefs = Prefs();
/// The feed's allergens in Dietary preferences' order (M2's ALG).
const allergens = ['Milk', 'Eggs', 'Fish', 'Shellfish', 'Tree Nuts', 'Peanuts', 'Wheat', 'Soy', 'Sesame', 'Gluten', 'Corn'];
/// M2's MEALS: the order a place's tabs run in.
const mealOrder = ['breakfast', 'lunch', 'dinner', 'late', 'all', 'grab'];

bool _dietOn(Prefs p) => p.veg || p.plant || p.halal;
bool _dietOK(Prefs p, Dish d) => (!p.veg || d.diet & 3 != 0) && (!p.plant || d.diet & 2 != 0) && (!p.halal || d.diet & 4 != 0);
/// The avoided allergens a dish lists. A blank list is "not listed", never "none": such a dish has no hits.
List<String> hits(Prefs p, Dish d) => p.avoid.where(d.allergens.contains).toList();
String _orList(List<String> l) => l.length < 2 ? l.join() : l.length <= 3 ? '${l.sublist(0, l.length - 1).join(', ')} or ${l.last}' : '${l.take(3).join(', ')} or ${l.length - 3} more';
String _dietWords(Prefs p) => [if (p.plant) 'plant based', if (p.veg && !p.plant) 'vegetarian', if (p.halal) 'halal'].join(', ');

/// The Dietary preferences row's second line: the diet, then what is avoided, or Everything.
String prefSummary(Prefs p) {
  final t = [_dietWords(p), if (p.avoid.isNotEmpty) 'no ${_orList(p.avoid.map((a) => a.toLowerCase()).toList())}'].where((s) => s.isNotEmpty).join(', ');
  return t.isEmpty ? 'Everything' : t[0].toUpperCase() + t.substring(1);
}

class MenuView {
  final List<Station> sections;
  /// how many dishes an avoided allergen hides (diet-hidden dishes aren't counted)
  final int hidden;
  /// the one line over the list, or null
  final String? line;
  const MenuView(this.sections, this.hidden, this.line);
}

/// M2's renderMenuList: a place's meal on a day after diet and allergen filtering. `showAll` only reveals; it never writes back.
MenuView menuView(Fixture fx, String day, String place, String meal, Prefs prefs, bool showAll) {
  final stations = fx.days[day]?[place]?[meal] ?? const <Station>[];
  final byAllergen = stations.expand((s) => s.dishes).where((d) => _dietOK(prefs, d) && hits(prefs, d).isNotEmpty).toList();
  final sections = [
    for (final s in stations)
      if (showAll ? s.dishes.isNotEmpty : s.dishes.any((d) => _dietOK(prefs, d) && hits(prefs, d).isEmpty))
        Station(s.name, showAll ? s.dishes : s.dishes.where((d) => _dietOK(prefs, d) && hits(prefs, d).isEmpty).toList()),
  ];
  return MenuView(sections, showAll ? 0 : byAllergen.length, _line(prefs, byAllergen, showAll));
}

String? _line(Prefs p, List<Dish> byAllergen, bool revealed) {
  if (!_dietOn(p) && p.avoid.isEmpty) return null;
  if (!_dietOn(p) && byAllergen.isEmpty) return null;
  if (revealed) return 'Showing all dishes';
  final al = allergens.where((a) => byAllergen.any((d) => hits(p, d).contains(a))).map((a) => a.toLowerCase()).toList();
  final n = byAllergen.length, dw = _dietOn(p) ? 'Showing ${_dietWords(p)} dishes' : '';
  final aw = n > 0 ? '${dw.isNotEmpty ? ', hiding $n' : 'Hiding $n ${n == 1 ? 'dish' : 'dishes'}'} that list${n == 1 ? 's' : ''} ${_orList(al)}' : '';
  return dw + aw;
}

/// What a row draws as scores, or null for nothing at all. Unscored kinds never draw.
({int? health, String? carbon})? rowScores(int? health, String? carbon, ({bool health, bool carbon}) on) {
  final h = on.health ? health : null, c = on.carbon ? carbon : null;
  return h == null && c == null ? null : (health: h, carbon: c);
}

List<String> mealsOf(Fixture fx, String day, String place) => mealOrder.where((m) => fx.days[day]?[place]?[m] != null).toList();

/// Keep the meal if the day has it, else the clock's, else all day, else the first (M2 renderMenu).
String defaultMeal(Fixture fx, String day, String place, String meal) {
  final ms = mealsOf(fx, day, place);
  if (ms.isEmpty || ms.contains(meal)) return meal;
  final cm = clockMeal(DateTime.parse(fx.clock));
  return ms.contains(cm) ? cm : ms.contains('all') ? 'all' : ms.first;
}

/// A café that never has more than one menu a day has no tab row: its day cell leads the station row.
bool isOneMeal(Fixture fx, String place) => isCafe(place) && fx.days.values.every((d) => d[place] == null || d[place]!.length <= 1);

/// Whether a place posts dishes on any day: halls and most cafés do, 11 cafés only describe themselves.
bool hasMenu(Fixture fx, String place) => fx.days.values.any((d) => d[place] != null);
List<String> dayIsos(Fixture fx) => fx.days.keys.toList();

const _wd = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const _mo = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
DateTime _noon(String iso) => DateTime.parse('${iso}T12:00:00Z');

/// The day cell: "Today", "Fri 9".
String dayCell(Fixture fx, int i) {
  if (i == 0) return 'Today';
  final d = _noon(dayIsos(fx)[i]);
  return '${_wd[d.weekday - 1].substring(0, 3)} ${d.day}';
}

/// "Saturday, October 10".
String dayFull(Fixture fx, int i) {
  final d = _noon(dayIsos(fx)[i]);
  return '${_wd[d.weekday - 1]}, ${_mo[d.month - 1]} ${d.day}';
}

/// The schedule's rows: "Today", "Tomorrow", then the full date.
String dayLong(Fixture fx, int i) => i == 0 ? 'Today' : i == 1 ? 'Tomorrow' : dayFull(fx, i);

/// One row of the flat list a hall screen scrolls: t is note | head | dish | empty.
/// ponytail: one class with nullable fields, not a sealed union; the TS event and cafe rows come with the screens that draw them.
class Item {
  final String t;
  final String? line, name, text;
  final bool revealed;
  final int si;
  final Dish? dish;
  final List<String> contains;
  const Item(this.t, {this.line, this.name, this.text, this.revealed = false, this.si = 0, this.dish, this.contains = const []});
}

/// The one flat list a hall screen scrolls. A revealed row that lists an avoided allergen carries it as `contains`.
List<Item> menuItems(MenuView v, Prefs prefs, bool showAll, String emptyText) {
  if (v.sections.isEmpty && v.line == null) return emptyText.isNotEmpty ? [Item('empty', text: emptyText)] : [];
  return [
    if (v.line != null) Item('note', line: v.line, revealed: showAll),
    for (var si = 0; si < v.sections.length; si++) ...[
      Item('head', name: v.sections[si].name, si: si),
      for (final d in v.sections[si].dishes) Item('dish', dish: d, contains: showAll ? hits(prefs, d) : const []),
    ],
  ];
}
