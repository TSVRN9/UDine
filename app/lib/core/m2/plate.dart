import '../saved_food.dart';
import 'board.dart';
import 'bowl.dart';
import 'bowl_builder.dart';

class PlateItem {
  final String key, name;
  final double qty;
  final Map<String, MenuItem> refs;
  final Macro? custom;

  /// a bowl: `refs` hold its summed dish, this the parts and what it was built from
  final PlateBowl? bowl;

  /// a saved food (Your foods, a packaged hit, a lookup): what Log writes is its own source and full nutrition; `custom` holds its macros
  final SavedFood? food;

  /// M2's `it.at`: when it was last touched upward (added, stepped up, updated); a family's row follows the latest. A higher number is later.
  final int at;
  const PlateItem(this.key, this.name, this.qty, this.refs, this.custom, [this.bowl, this.food, this.at = 0]);
  PlateItem withQty(double q, [int? at]) => PlateItem(key, name, q, refs, custom, bowl, food, at ?? this.at);
}

class Plate {
  final int id;
  final String meal;
  final List<PlateItem> items;
  const Plate(this.id, this.meal, this.items);
}

class PlateState {
  final List<Plate> plates;
  final int front, nextId;
  const PlateState(this.plates, this.front, this.nextId);
}

const emptyPlates = PlateState([], 0, 1);

/// The places that serve everything on the plate (custom items serve anywhere), halls first; null for an all-custom plate.
List<String>? plateHalls(Plate p) {
  List<String>? s;
  for (final it in p.items) {
    if (it.custom != null) continue;
    final h = it.refs.keys.toList();
    s = s != null ? s.where(h.contains).toList() : (h..sort((a, b) => placeOrder(a) - placeOrder(b)));
  }
  return s;
}

/// The stamp the next upward touch takes: later than every item on any plate.
int _stamp(Iterable<Plate> ps) => 1 + ps.expand((p) => p.items).fold(0, (a, it) => it.at > a ? it.at : a);

bool _canJoin(Plate p, String meal, List<String>? hs) {
  if (p.meal != meal) return false;
  final ph = plateHalls(p);
  return ph == null || hs == null || ph.any(hs.contains);
}

/// A custom food's plate key (and so its log row's `customFoodId`): its name plus a short digest of its macros (FNV-1a, base 36), so the
/// same name with other macros is another food, and an identical one is the same.
String customKey(String name, Macro m) {
  var h = 0x811c9dc5;
  for (final u in '${m.cal?.toDouble()}|${m.p?.toDouble()}|${m.c?.toDouble()}|${m.f?.toDouble()}'.codeUnits) {
    h = ((h ^ u) * 0x01000193) & 0xffffffff;
  }
  return 'custom:${dishKey(name)}:${h.toRadixString(36)}';
}

/// M2 `wouldSplit`: a plate exists and none of them can take the dish (its + would start another).
bool wouldSplit(PlateState s, String meal, List<String> places) => s.plates.isNotEmpty && !s.plates.any((p) => _canJoin(p, meal, places));

/// [key0] is a bowl's own (`Bowl.key`); otherwise a custom food's is [customKey], a dish's its name's.
PlateState addDish(PlateState s, String meal, String name, Map<String, MenuItem> refs, [Macro? custom, String? key0, PlateBowl? bowl, SavedFood? food]) {
  final key = key0 ?? (custom != null ? customKey(name, custom) : dishKey(name));
  final hs = custom != null ? null : refs.keys.toList();
  final front = s.front < s.plates.length ? s.plates[s.front] : null;
  var plates = s.plates, nextId = s.nextId;
  var idx = front != null && _canJoin(front, meal, hs) ? s.front : plates.indexWhere((p) => _canJoin(p, meal, hs));
  if (idx < 0) {
    plates = [...plates, Plate(nextId++, meal, const [])];
    idx = plates.length - 1;
  }
  final pl = plates[idx], at = pl.items.indexWhere((x) => x.key == key), stamp = _stamp(plates);
  final items = at < 0
      ? [...pl.items, PlateItem(key, name, 1, {...refs}, custom, bowl, food, stamp)]
      : [
          for (var i = 0; i < pl.items.length; i++)
            if (i != at) pl.items[i] else PlateItem(key, pl.items[i].name, pl.items[i].qty == 0.5 ? 1 : pl.items[i].qty + 1,
                custom != null ? pl.items[i].refs : {for (final e in pl.items[i].refs.entries) if (refs.containsKey(e.key)) e.key: e.value}, pl.items[i].custom, pl.items[i].bowl, pl.items[i].food, stamp),
        ];
  return PlateState([for (var i = 0; i < plates.length; i++) i == idx ? Plate(pl.id, pl.meal, items) : plates[i]], idx, nextId);
}

/// M2 `badd`: a builder's Add. A base with nothing chosen is the plain dish (its row's +); otherwise the bowl is its own item.
///
/// [name] is how the item reads when that is not the feed's ("Cappuccino, 20 oz" for a family's variant).
PlateState addBowl(PlateState s, String meal, BowlSpec spec, Bowl bowl, String place, {String? name}) => spec.base != null && bowl.parts.isEmpty
    ? addDish(s, meal, name ?? spec.base!.dishName, {place: spec.base!}, null, spec.base!.key)
    : addDish(s, meal, name ?? bowl.name, {place: bowl.item}, null, bowl.key, PlateBowl(bowl, spec));

/// M2 `badd` with an item being edited (Update): the item becomes the new bowl where it is, with its servings; a twin already on the plate
/// takes those servings instead.
PlateState updateBowl(PlateState s, int plateId, String oldKey, Bowl bowl, BowlSpec spec, String place, {String? name}) {
  final pi = s.plates.indexWhere((p) => p.id == plateId);
  if (pi < 0) return s;
  final pl = s.plates[pi], at = pl.items.indexWhere((x) => x.key == oldKey);
  if (at < 0) return s;
  final it = pl.items[at], twin = pl.items.indexWhere((x) => x.key == bowl.key && x != it), stamp = _stamp(s.plates);
  final items = <PlateItem>[
    for (var i = 0; i < pl.items.length; i++)
      if (i == at && twin >= 0) ...const <PlateItem>[]
      else if (i == at) PlateItem(bowl.key, name ?? bowl.name, it.qty, {place: bowl.item}, null, PlateBowl(bowl, spec), null, stamp)
      else if (i == twin) pl.items[i].withQty(pl.items[i].qty + it.qty, stamp)
      else pl.items[i],
  ];
  return PlateState([for (var i = 0; i < s.plates.length; i++) i == pi ? Plate(pl.id, pl.meal, items) : s.plates[i]], s.front, s.nextId);
}

/// M2 `vupd`: a plain dish's Update to another variant of its family. The item becomes that variant where it is, with its servings; a twin
/// already on the plate takes those servings instead. Either way it is the latest touched.
PlateState updateDish(PlateState s, int plateId, String oldKey, String name, String key, Map<String, MenuItem> refs) {
  final pi = s.plates.indexWhere((p) => p.id == plateId);
  if (pi < 0) return s;
  final pl = s.plates[pi], at = pl.items.indexWhere((x) => x.key == oldKey);
  if (at < 0) return s;
  final it = pl.items[at], twin = pl.items.indexWhere((x) => x.key == key && x != it), stamp = _stamp(s.plates);
  final items = <PlateItem>[
    for (var i = 0; i < pl.items.length; i++)
      if (i == at && twin >= 0) ...const <PlateItem>[]
      else if (i == at) PlateItem(key, name, it.qty, {...refs}, null, null, null, stamp)
      else if (i == twin) pl.items[i].withQty(pl.items[i].qty + it.qty, stamp)
      else pl.items[i],
  ];
  return PlateState([for (var i = 0; i < s.plates.length; i++) i == pi ? Plate(pl.id, pl.meal, items) : s.plates[i]], s.front, s.nextId);
}

/// +1: 1/2 -> 1, n -> n+1. -1: n -> n-1 down to 1, 1 -> 1/2, 1/2 -> removed; an emptied plate goes with it.
PlateState stepItem(PlateState s, int plateId, String key, int dir) {
  final pi = s.plates.indexWhere((p) => p.id == plateId);
  if (pi < 0) return s;
  final pl = s.plates[pi], at = pl.items.indexWhere((x) => x.key == key);
  if (at < 0) return s;
  final it = pl.items[at];
  final qty = dir > 0 ? (it.qty == 0.5 ? 1.0 : it.qty + 1) : it.qty > 1 ? it.qty - 1 : it.qty == 1 ? 0.5 : 0.0;
  final items = [for (var i = 0; i < pl.items.length; i++) if (i != at) pl.items[i] else if (qty != 0) it.withQty(qty, dir > 0 ? _stamp(s.plates) : null)];
  if (items.isNotEmpty) return PlateState([for (var i = 0; i < s.plates.length; i++) i == pi ? Plate(pl.id, pl.meal, items) : s.plates[i]], s.front, s.nextId);
  final plates = [...s.plates]..removeAt(pi);
  return PlateState(plates, s.front.clamp(0, plates.isEmpty ? 0 : plates.length - 1), s.nextId);
}

Macro macroOf(PlateItem it, [String? hall]) => it.custom ?? (hall != null ? it.refs[hall] : null)?.macro ?? it.refs.values.first.macro;

/// M2 `tally` / `totals`: each figure is the sum of what the items know, and null only when every item leaves it unknown.
({double? cal, double? p, double? c, double? f, double n}) totals(Plate p, [String? hall]) {
  hall ??= plateHalls(p)?.firstOrNull;
  double? cal, pr, c, f;
  double n = 0;
  double? add(double? a, num? x, double q) => x == null ? a : (a ?? 0) + x * q;
  for (final it in p.items) {
    final m = macroOf(it, hall);
    cal = add(cal, m.cal, it.qty); pr = add(pr, m.p, it.qty); c = add(c, m.c, it.qty); f = add(f, m.f, it.qty); n += it.qty;
  }
  return (cal: cal, p: pr, c: c, f: f, n: n);
}

String hallLabel(Board fx, List<String>? hs) {
  if (hs == null) return '';
  final n = hs.map((h) => placeName(fx, h)).toList();
  return n.length == 1 ? n[0] : n.length == 4 && !hs.any(isCafe) ? 'Any hall' : '${n.sublist(0, n.length - 1).join(', ')} or ${n.last}';
}

String plateLabel(Board fx, Plate p) {
  final hs = plateHalls(p);
  return hs != null ? '${hallLabel(fx, hs)} ${mealLabel[p.meal]!.toLowerCase()}' : mealLabel[p.meal]!;
}

/// M2 `plateMeal`: a café's all-day or Grab 'N Go menu goes on the plate of the meal the clock is in.
String plateMeal(Board fx, String place, String meal, DateTime now) =>
    isCafe(place) && (meal == 'all' || meal == 'grab') ? clockMeal(now) : meal;

/// M2 `findItem`: the plate item for a dish, the front plate first; a place's menu only sees plates that place can serve.
({Plate plate, PlateItem item})? findItem(PlateState s, String meal, String key, [String? place]) {
  for (final i in [s.front, for (var i = 0; i < s.plates.length; i++) i]) {
    if (i < 0 || i >= s.plates.length) continue;
    final plate = s.plates[i];
    if (plate.meal != meal) continue;
    final at = plate.items.indexWhere((x) => x.key == key);
    if (at < 0) continue;
    final ph = plateHalls(plate);
    if (place != null && ph != null && !ph.contains(place)) continue;
    return (plate: plate, item: plate.items[at]);
  }
  return null;
}

/// What a menu row's control shows: its quantity on the plate it would join, 0 for the plain +, -1 for the ghost +.
double rowCode(PlateState s, String meal, String key, String place) {
  final f = findItem(s, meal, key, place);
  if (f != null) return f.item.qty;
  return wouldSplit(s, meal, [place]) ? -1 : 0;
}

/// M2's plate-sheet mid detent (`psheet`'s sizer): where the sheet's top edge rests, measured down from the frame's top. It is
/// the 36% line, or higher when the content (the bar, the plate and 16) needs more room, and never above the top detent
/// (`top`, the status inset + 8). `tabTop` is where the tab bar starts.
double plateMidTop({required double frameH, required double tabTop, required double top, required double content, required double frac}) =>
    (frameH * frac < tabTop - content ? frameH * frac : tabTop - content).clamp(top, double.infinity);
