// Build-your-own bowls: M2's rules in src.html (`stName`, `baseOf`, `phoOf`, `synOf`, `buildOf`, `bowlDish`, `withLine`).
// The feed links no base to its add-ins, so the stations decide (NOTES "Round 10", "Round 11"). Station-days are addressed
// as board.days[iso][place][meal][si]; a dish by its index in that station.
import '../export.dart' show jsNum;
import '../../ui/label_model.dart' show fq;
import '../types.dart';
import 'board.dart';
import 'menu_view.dart' show allergens;

/// A station's name as M2 shows it: "Salad Bar $11.50/LB" -> "Salad Bar", "Cold Bar Items" -> "Cold Bar".
String stName(String st) => st.replaceFirst(RegExp(r'\s*\$.*$'), '').replaceFirst(RegExp(r'\s+Items$'), '').replaceFirst('Salad Bar/Dressings', 'Salad Bar').trim();

List<MenuItem> stDishes(Board b, String iso, String place, String meal, int si) => b.days[iso]![place]![meal]![si].dishes;

const _natural = {'Noodle Bowl', 'Pasta Bar', 'Omelet'};
final _partName = RegExp('sauce|topping|broth|dressing', caseSensitive: false);
final _part = RegExp(r'\b(sauce|toppings?|broth|base|dressing)\b', caseSensitive: false);
final _brothOrBase = RegExp(r'\b(broth|base)\b', caseSensitive: false);
final _dishWord = RegExp('ramen|noodle|soup|stew|congee|bowl|curry|katsu', caseSensitive: false);
final _addOns = RegExp(r'^(Add-ons|Toppings)$');

/// A part is named as one outside its parentheses ("Shrimp Tom Yum Soup (Chicken Broth)" is a soup).
String _outside(String n) => n.replaceAll(RegExp(r'\([^)]*\)'), '');
bool _isBroth(MenuItem d) => _brothOrBase.hasMatch(_outside(d.dishName));
bool _isBaseAt(String st, MenuItem d) => st == 'Omelet' ? RegExp('omelet', caseSensitive: false).hasMatch(d.dishName) : d.nutrition.calories >= 120 && !_partName.hasMatch(d.dishName);

/// A hall Noodle Bowl's one base: the station's only dish; none for a pho bar (two or more broths); otherwise the
/// highest-calorie non-part whose name says it's a dish, else the highest-calorie non-part. The first of equals wins.
MenuItem? baseOf(Board b, String iso, String place, String meal, int si) {
  final ds = stDishes(b, iso, place, meal, si);
  if (ds.length == 1) return ds[0];
  if (ds.where(_isBroth).length >= 2) return null;
  final c = [for (final d in ds) if (!_part.hasMatch(_outside(d.dishName))) d], w = c.where((d) => _dishWord.hasMatch(d.dishName)).toList();
  MenuItem? best;
  for (final d in w.isNotEmpty ? w : c) {
    if (best == null || d.nutrition.calories > best.nutrition.calories) best = d;
  }
  return best;
}

/// A synthetic base: a station with no dish of its own to build on. [label] names the bowl until a pho's base is chosen.
class Syn {
  const Syn({required this.label, required this.head, required this.iso, required this.place, required this.meal, required this.si,
      required this.parts, this.pho = false, this.choices = const [], this.topHead});
  final String label, head, iso, place, meal;
  final int si;
  final List<MenuItem> parts;
  final bool pho;

  /// A pho builder's bases (a bar's broths, or a café's phos): one is picked and names the bowl.
  final List<MenuItem> choices;

  /// A café pho builder's add-ons heading ("Add-ons"), where the choices are the station's own heading.
  final String? topHead;
}

Syn? _phoOf(Board b, String iso, String place, String meal, int si, List<MenuItem> ds) {
  Syn mk(List<MenuItem> choices, List<MenuItem> parts, [String? topHead]) =>
      Syn(label: 'Noodle Bowl', head: 'Noodle Bowl', iso: iso, place: place, meal: meal, si: si, pho: true, choices: choices, parts: parts, topHead: topHead);
  final br = ds.where(_isBroth).toList();
  final bar = br.length >= 2 ? mk(br, [...br, ...ds.where((d) => !_isBroth(d))]) : null;
  if (!isCafe(place)) return baseOf(b, iso, place, meal, si) != null ? null : bar;
  // a café's add-ons first: Whitmore's "Beef Pho w/Spicy Green Curry Broth" names a broth but is a whole pho
  final ss = b.days[iso]![place]![meal]!;
  final add = [for (var j = 0; j < ss.length; j++) if (_addOns.hasMatch(ss[j].name.trim())) j];
  final tops = [for (final j in add) ...ss[j].dishes.where((x) => x.nutrition.calories > 0)];
  return tops.isNotEmpty ? mk(ds, [...ds, ...tops], {for (final j in add) ss[j].name.trim()}.join(' and ')) : bar;
}

/// The synthetic base of a station-day, or null: an unpriced Salad Bar or Deli Bar named for the station (never a
/// by-the-pound bar: Harvest Market, Roots), a pho bar, or a café's pho builder.
Syn? synOf(Board b, String iso, String place, String meal, int si) {
  final st = b.days[iso]![place]![meal]![si].name, nm = stName(st), ds = stDishes(b, iso, place, meal, si);
  if (nm == 'Noodle Bowl') return _phoOf(b, iso, place, meal, si, ds);
  if ((nm != 'Salad Bar' && nm != 'Deli Bar') || RegExp(r'/\s*LB\b', caseSensitive: false).hasMatch(st)) return null;
  if (ds.where((d) => d.price != null && d.price!.isNotEmpty).length > ds.length * .1) return null; // finished, priced dishes aren't a build
  return Syn(label: nm, head: nm, iso: iso, place: place, meal: meal, si: si, parts: ds);
}

/// What a natural or café dish builds with: the add-ins under [head].
class Build {
  const Build({required this.head, required this.parts, required this.base});
  final String head;
  final List<MenuItem> parts;
  final MenuItem base;
}

/// The builder a dish opens, or null (the row's + still adds the plain dish).
Build? buildOf(Board b, String iso, String place, String meal, int si, int di) {
  final ss = b.days[iso]?[place]?[meal];
  if (ss == null) return null;
  final d = ss[si].dishes[di], st = stName(ss[si].name);
  if (synOf(b, iso, place, meal, si) != null) return null; // a bar's dishes are its synthetic base's parts
  if (!isCafe(place)) {
    if (!_natural.contains(st)) return null;
    final ds = ss[si].dishes;
    if (st == 'Noodle Bowl') {
      if (!identical(d, baseOf(b, iso, place, meal, si))) return null;
      final parts = [for (final x in ds) if (!identical(x, d)) x];
      return parts.isEmpty ? null : Build(head: st, parts: parts, base: d);
    }
    if (!_isBaseAt(st, d)) return null;
    final parts = [for (final x in ds) if (!identical(x, d) && !_isBaseAt(st, x)) x];
    return parts.isEmpty ? null : Build(head: st, parts: parts, base: d);
  }
  if (_addOns.hasMatch(ss[si].name.trim())) return null;
  final adds = [for (final s2 in ss) if (_addOns.hasMatch(s2.name.trim())) s2];
  final parts = [for (final s2 in adds) ...s2.dishes.where((x) => x.nutrition.calories > 0)];
  return parts.isEmpty ? null : Build(head: {for (final s2 in adds) s2.name.trim()}.join(' and '), parts: parts, base: d);
}

typedef Qty = (MenuItem, num);

/// One dish-like object for a bowl: what the plate, the label, the log and Health read.
class Bowl {
  const Bowl({required this.key, required this.name, required this.item, required this.base, required this.syn, required this.parts});

  /// The plate item's key: the base plus its parts, so two different bowls are two items and a plain dish is a third.
  final String key, name;

  /// The summed dish.
  final MenuItem item;
  final MenuItem? base;
  final Syn? syn;
  final List<Qty> parts;
}

double _cents(String? s) => s == null || s.isEmpty ? 0 : double.tryParse(s.replaceAll(RegExp(r'[^\d.]'), '')) ?? 0;

/// [base] and [parts] at their servings, summed: calories whole, grams as they add, %DV left to the label (FDA values).
/// A synthetic bowl has no [base] and no nutrition of its own: only its parts.
Bowl bowlDish(MenuItem? base, List<Qty> parts, {Syn? syn, required String place}) {
  final all = <Qty>[if (base != null) (base, 1), ...parts];
  assert(base != null || syn != null); // (a synthetic bowl with nothing chosen is the sheet's 0 cal foot)
  num sum(num Function(NutritionFacts) f) => all.fold<num>(0, (a, e) => a + f(e.$1.nutrition) * e.$2);
  final blank = <String>{
    for (final f in const ['caloriesFromFat', 'totalFatG', 'satFatG', 'transFatG', 'cholesterolMg', 'sodiumMg', 'totalCarbG', 'dietaryFiberG', 'sugarsG', 'proteinG'])
      if (all.every((e) => e.$1.nutrition.blank.contains(f))) f,
  };
  final pr = all.fold<double>(0, (a, e) => a + _cents(e.$1.price) * e.$2);
  final algs = {for (final e in all) ...e.$1.allergens}.toList()..sort((a, b) => allergens.indexOf(a) - allergens.indexOf(b));
  final key = '${base != null ? base.key : 'syn:${syn!.label}:$place'}+${([for (final (x, q) in parts) '${x.key}*${jsNum(q)}']..sort()).join('+')}';
  final src = base ?? (all.isNotEmpty ? all.first.$1 : syn!.parts.first), name = base?.dishName ?? syn!.label;
  final item = MenuItem(
    dishName: name, category: base?.category ?? syn!.head, mealPeriod: src.mealPeriod, hallTid: src.hallTid, date: src.date,
    nutrition: NutritionFacts(
      servingSize: '', calories: sum((n) => n.calories).round(), caloriesFromFat: sum((n) => n.caloriesFromFat), totalFatG: sum((n) => n.totalFatG),
      satFatG: sum((n) => n.satFatG), transFatG: sum((n) => n.transFatG), cholesterolMg: sum((n) => n.cholesterolMg), sodiumMg: sum((n) => n.sodiumMg),
      totalCarbG: sum((n) => n.totalCarbG), dietaryFiberG: sum((n) => n.dietaryFiberG), sugarsG: sum((n) => n.sugarsG), proteinG: sum((n) => n.proteinG),
      blank: blank,
    ),
    allergens: algs, dietTags: base?.dietTags ?? const [], price: pr > 0 ? '\$${pr.toStringAsFixed(2)}' : null, ingredients: base?.ingredients ?? '',
    health: base?.health, carbon: base?.carbon, dietCodes: base?.dietCodes ?? const {},
  );
  return Bowl(key: 'bowl:$key', name: name, item: item, base: base, syn: syn, parts: parts);
}

/// A synthetic bowl from what's chosen: a pho takes its chosen base's name; a bar has none.
Bowl synBowl(Syn y, List<Qty> sel, {required String place}) {
  final c = y.pho ? sel.where((e) => y.choices.any((x) => identical(x, e.$1))).firstOrNull : null;
  return bowlDish(c?.$1, [for (final e in sel) if (e != c) e], syn: y, place: place);
}

/// The plate's second line: "with Hard Boiled Egg, ½ × Steamed Bok Choy". [withNames] is the same for a logged bowl's parts.
String withLine(List<Qty> parts) => withNames([for (final (x, q) in parts) (x.dishName, q)]);

String withNames(List<(String, num)> parts) => parts.isEmpty ? '' : 'with ${parts.map((e) => '${e.$2 != 1 ? '${fq(e.$2.toDouble())} × ' : ''}${e.$1}').join(', ')}';
