// M2's Search (`renderSearch`, `results`, `cafeResults`, `placeHits`, `laterHits`): the groups, their order and the lenses, as pure
// functions of the board. The screen draws them; matching is core/search.dart's, the one rule main shipped.
import '../search.dart';
import 'board.dart';
import 'menu_view.dart' show dayIsos;
import 'places.dart';
import 'plate.dart';
import 'variants.dart';
import 'where.dart';

/// Search's lens chips, in M2's order.
enum Lens { protein, light, veg, plant, halal, lowc, fav }

const lensLabel = {
  Lens.protein: 'High protein', Lens.light: 'Light', Lens.veg: 'Vegetarian', Lens.plant: 'Plant based', Lens.halal: 'Halal', Lens.lowc: 'Low carbon', Lens.fav: 'Favorites',
};

/// A dish as Search groups it: its places and the serving at each (today, the clock's meal).
class DishGroup {
  DishGroup(this.key, this.name, this.refs, {this.vars});
  final String key, name;

  /// the serving at each place the row stands for by default; a family's is its default variant's
  final Map<String, MenuItem> refs;

  /// a family's variants, each with its own serving at each place (a variant's + adds that variant); null for a dish
  final List<VarGroup>? vars;

  /// what the typed words are matched on: a family also answers to its members' names ("oat" finds Boba)
  String get hay => vars == null ? name : '$name ${vars!.map((v) => v.name).join(' ')}';
  List<String> get places => refs.keys.toList()..sort((a, b) => placeOrder(a) - placeOrder(b));
}

/// One variant of a family as Search groups it: its chip's word, its own feed name, and the serving at each place.
class VarGroup {
  VarGroup(this.v, this.chip, this.name);
  final String v, chip, name;
  final Map<String, MenuItem> refs = {};
  String get key => dishKey(name);
}

/// A row of the "now" group or "At cafés": `d` is the serving whose numbers it shows (M2 `rep`).
class NowRow {
  const NowRow(this.g, this.d, [this.chip]);
  final DishGroup g;
  final MenuItem d;

  /// a family row's token ("Oat"): the variant it stands for
  final String? chip;
}

/// A dish not served now: when it is next served (`g`), and the serving that names it.
class LaterRow {
  const LaterRow(this.g, this.d, [this.family]);
  final WhereGroup g;
  final MenuItem d;

  /// the family `d` is the default of, when the row stands for one
  final Family? family;
}

sealed class PlaceHit {
  const PlaceHit(this.key);
  final String key;
}

class HallHit extends PlaceHit {
  const HallHit(super.key);
}

class GrabHit extends PlaceHit {
  const GrabHit(super.key);
}

/// `item`: the café's own listed item the query found, shown in place of its building.
class CafeHit extends PlaceHit {
  const CafeHit(super.key, [this.item]);
  final String? item;
}

class SearchResult {
  const SearchResult({this.places = const [], this.now = const [], this.cafes = const [], this.later = const []});
  final List<PlaceHit> places;
  final List<NowRow> now, cafes;
  final List<LaterRow> later;
  bool get isEmpty => places.isEmpty && now.isEmpty && cafes.isEmpty && later.isEmpty;

  /// The same groups under a keep rule (Dietary preferences hide dishes here too); places are never hidden.
  SearchResult where(bool Function(MenuItem d) keep) => SearchResult(
        places: places, now: [for (final x in now) if (keep(x.d)) x], cafes: [for (final x in cafes) if (keep(x.d)) x], later: [for (final x in later) if (keep(x.d)) x]);
  Iterable<MenuItem> get dishes => [for (final x in now) x.d, for (final x in cafes) x.d, for (final x in later) x.d];
}

/// What a board offers Search, built once per board (every keystroke only filters it): the halls' groups for the clock's meal, the
/// cafés' (their meal, all day and Grab 'N Go, merged), and every dish served today or tomorrow.
class SearchIndex {
  SearchIndex(this.fx, this.now, {this.charlesRiver = false, this.standing = const {}}) : meal = clockMeal(now) {
    final isos = dayIsos(fx), today = isos.isEmpty ? '' : isos.first;
    final newton = {for (final p in fx.places) if (!placeOn(p, charlesRiver: charlesRiver)) p.key};
    final hall = <String, DishGroup>{}, cafe = <String, DishGroup>{}, fam = familiesOf(fx);
    void add(Map<String, DishGroup> into, String place, Iterable<Station> sts) {
      for (final s in sts) {
        for (final d in s.dishes) {
          final f = fam.familyOf(d);
          if (f == null) {
            into.putIfAbsent(d.key, () => DishGroup(d.key, d.dishName, {})).refs.putIfAbsent(place, () => d);
            continue;
          }
          // a family is one group under its key: the default's serving speaks for it, each variant keeps its own (a member is no group of its own here)
          final g = into.putIfAbsent(f.key, () => DishGroup(f.key, f.name, {}, vars: []));
          g.refs.putIfAbsent(place, () => f.vars.first.dish);
          final x = fam.variantIn(d)!;
          var v = g.vars!.where((v) => v.v == x.v).firstOrNull;
          if (v == null) g.vars!.add(v = VarGroup(x.v, x.chip, d.dishName));
          v.refs.putIfAbsent(place, () => d);
        }
      }
    }

    for (final MapEntry(key: place, value: meals) in (fx.days[today] ?? const <String, Map<String, List<Station>>>{}).entries) {
      if (newton.contains(place)) continue;
      if (!isCafe(place)) {
        add(hall, place, meals[meal] ?? const []);
      }
    }
    // a café's groups merge its meal, all day and Grab 'N Go (in that order), as M2 walks CBYK
    for (final m in [meal, 'all', 'grab']) {
      for (final MapEntry(key: place, value: meals) in (fx.days[today] ?? const <String, Map<String, List<Station>>>{}).entries) {
        if (isCafe(place) && !newton.contains(place)) add(cafe, place, meals[m] ?? const []);
      }
    }
    for (final g in [...hall.values, ...cafe.values]) {
      if (g.vars != null && fam.names.containsKey(g.key) && g.vars!.every((v) => v.chip.endsWith(' oz'))) g.vars!.sort((a, b) => int.parse(a.chip.split(' ').first) - int.parse(b.chip.split(' ').first));
    }
    hallGroups = hall.values.toList();
    cafeGroups = cafe.values.toList();
    final seen = <String, String>{}, members = <String, String>{};
    for (final iso in isos.take(2)) {
      for (final MapEntry(key: place, value: meals) in (fx.days[iso] ?? const <String, Map<String, List<Station>>>{}).entries) {
        if (newton.contains(place)) continue;
        for (final sts in meals.values) {
          for (final s in sts) {
            for (final d in s.dishes) {
              final f = fam.familyOf(d);
              // a family is listed once, by its name; its members' own keys are never rows
              if (f == null) {
                seen.putIfAbsent(d.key, () => d.dishName);
              } else {
                seen.putIfAbsent(f.key, () => f.name);
                members[d.key] = f.key;
              }
            }
          }
        }
      }
    }
    final inNow = {...hall.keys, ...cafe.keys};
    laterCandidates = [for (final e in seen.entries) if (!inNow.contains(e.key) && !fam.memberKeys.contains(e.key)) (e.key, e.value)];
    // (a family answers to its members' names too)
    laterHay = {for (final k in members.values.toSet()) k: '${seen[k]} ${[for (final m in members.entries) if (m.value == k) m.key].join(' ')}'};
    hasMenu = {for (final iso in isos.take(2)) ...?fx.days[iso]?.keys};
  }
  final Board fx;
  final DateTime now;
  final bool charlesRiver;
  /// café place key -> the names it lists when it has no dish menu (its standing menu), found by name too
  final Map<String, List<String>> standing;
  final String meal;
  late final List<DishGroup> hallGroups, cafeGroups;
  late final List<(String, String)> laterCandidates;
  late final Map<String, String> laterHay;
  late final Set<String> hasMenu;

  /// every dish on a menu today or tomorrow, as `dishKey` spells it: what Search UMass Dining's answer leaves out, because it is not new
  late final Set<String> served = {for (final g in hallGroups) g.key, for (final g in cafeGroups) g.key, for (final c in laterCandidates) c.$1, ...familiesOf(fx).memberKeys};
}

/// A standing-menu line longer than this is a comma-separated list the café wrote as one line ("Hot Beverages: Coffee, Tea, ..."),
/// not an item to find a café by.
const maxItemName = 40;

const _hallWords = ' dining commons hall', _grabWords = " grab n go grab and go";

/// M2's results for the typed text and lenses. `favorites` are dish names; `plate` decides which hall a row speaks for (`rep`) and
/// which rows sort after the ones that would split the plate (`join`): the screen computes this when the query, lenses or data
/// change, never on a plate change, so rows never move under a finger that has just added one.
SearchResult runSearch(SearchIndex ix,
    {required String query, Set<Lens> lenses = const {}, Set<String> favorites = const {}, PlateState plate = emptyPlates, bool Function(MenuItem d)? allow}) {
  final toks = searchWords(query), favKeys = {for (final f in favorites) favKey(f)};
  final front = plate.front < plate.plates.length ? plate.plates[plate.front] : null;
  final ph = front != null && front.meal == ix.meal ? plateHalls(front) : null;

  MenuItem? repOf(Map<String, MenuItem> refs) {
    final h = ph?.where(refs.containsKey).firstOrNull ?? (refs.keys.toList()..sort((a, b) => placeOrder(a) - placeOrder(b))).firstOrNull;
    return h == null ? null : refs[h];
  }

  MenuItem? rep(DishGroup g) => repOf(g.refs);

  List<NowRow> results(List<DishGroup> groups) {
    final out = <({NowRow row, int rank, int join})>[];
    for (final g in groups) {
      if (toks.isNotEmpty && !matchesQuery(g.hay, query)) continue;
      final vi = g.vars == null ? null : varFor(g, toks, plate, ix.meal, allow: allow);
      final d = vi == null ? rep(g) : repOf(g.vars![vi].refs);
      if (d == null) continue;
      final n = d.nutrition;
      if (toks.isEmpty && lenses.isEmpty && n.calories < 40) continue;
      if (lenses.contains(Lens.protein) && n.proteinG < 15) continue;
      if (lenses.contains(Lens.light) && !(n.calories <= 250 && n.calories >= 40)) continue;
      if (lenses.contains(Lens.veg) && d.diet & 3 == 0) continue;
      if (lenses.contains(Lens.plant) && d.diet & 2 == 0) continue;
      if (lenses.contains(Lens.halal) && d.diet & 4 == 0) continue;
      if (lenses.contains(Lens.fav) && !favKeys.contains(g.key)) continue;
      if (lenses.contains(Lens.lowc) && !(d.carbon == 'A' || d.carbon == 'B')) continue;
      final t0 = dishKey(toks.firstOrNull ?? '');
      final rank = t0.isEmpty ? 0 : g.key.startsWith(t0) ? 0 : g.key.split(' ').any((w) => w.startsWith(t0)) ? 1 : 2;
      out.add((row: NowRow(g, d, vi == null ? null : g.vars![vi].chip), rank: rank, join: wouldSplit(plate, ix.meal, g.refs.keys.toList()) ? 1 : 0));
    }
    final light = lenses.contains(Lens.light);
    int by(({NowRow row, int rank, int join}) a, ({NowRow row, int rank, int join}) b) {
      final c = a.join - b.join != 0 ? a.join - b.join : a.rank - b.rank != 0 ? a.rank - b.rank : 0;
      if (c != 0) return c;
      final da = a.row.d.nutrition, db = b.row.d.nutrition;
      final m = light ? da.calories.compareTo(db.calories) : db.proteinG.compareTo(da.proteinG);
      if (m != 0) return m;
      final x = a.row.g.name.toLowerCase().compareTo(b.row.g.name.toLowerCase());
      return x != 0 ? x : a.row.g.name.compareTo(b.row.g.name); // (Dart's sort is not stable: the name decides)
    }
    return [for (final e in out..sort(by)) e.row];
  }

  final now = results(ix.hallGroups);
  // the cafés' groups only once something is typed or a lens is on: idle, Search is the halls' lunch
  final cafes = toks.isEmpty && lenses.isEmpty ? const <NowRow>[] : results(ix.cafeGroups);

  final places = <PlaceHit>[];
  if (toks.isNotEmpty) {
    bool hit(Iterable<String> words) => toks.every((t) => words.any((w) => w.startsWith(t)));
    for (final h in halls) {
      final name = placeName(ix.fx, h);
      if (hit(searchWords('$name$_hallWords'))) places.add(HallHit(h));
    }
    for (final h in halls) {
      if (ix.fx.grab[h] != null && hit(searchWords('${placeName(ix.fx, h)}$_grabWords'))) places.add(GrabHit(h));
    }
    for (final p in ix.fx.places) {
      if (!isCafe(p.key) || !placeOn(p, charlesRiver: ix.charlesRiver)) continue;
      final byName = hit(searchWords('${p.name} ${p.building} ${areaNames[p.area]}'));
      final item = byName || ix.hasMenu.contains(p.key) ? null : ix.standing[p.key]?.where((n) => n.length <= maxItemName && hit(searchWords(n))).firstOrNull;
      if (byName || item != null) places.add(CafeHit(p.key, item));
    }
  }

  final later = <LaterRow>[];
  if (toks.isNotEmpty) {
    final cafeKeys = {for (final g in ix.cafeGroups) g.key};
    for (final (key, name) in ix.laterCandidates) {
      if (cafeKeys.contains(key) || !matchesQuery(ix.laterHay[key] ?? name, query)) continue;
      final g = wherePlan(ix.fx, name, ix.now, newton: ix.charlesRiver).where((g) => g.st != 'now' && g.halls.isNotEmpty).firstOrNull;
      final d = g == null ? null : _serving(ix.fx, g, key);
      if (g != null && d != null) later.add(LaterRow(g, d, familiesOf(ix.fx).familyOf(d)));
    }
    const r = {'later': 0, 'tomorrow': 1};
    later.sort((a, b) {
      final c = r[a.g.st]! - r[b.g.st]!;
      if (c != 0) return c;
      final t = _min(a.g.open) - _min(b.g.open);
      if (t != 0) return t;
      final x = a.d.dishName.toLowerCase().compareTo(b.d.dishName.toLowerCase());
      return x != 0 ? x : a.d.dishName.compareTo(b.d.dishName);
    });
    if (later.length > 8) later.removeRange(8, later.length);
  }
  return SearchResult(places: places, now: now, cafes: cafes, later: later);
}

int _min(String t) {
  final m = RegExp(r'^(\d+):(\d+)\s*(AM|PM)$').firstMatch(t)!;
  return (int.parse(m[1]!) % 12 + (m[3] == 'PM' ? 12 : 0)) * 60 + int.parse(m[2]!);
}

/// The serving that names a group: its first place's dish on the group's day and meal; for a family, its default variant's.
MenuItem? _serving(Board fx, WhereGroup g, String key) {
  final iso = dayIsos(fx)[g.day], fam = familiesOf(fx);
  for (final s in fx.days[iso]?[g.halls.first]?[g.meal] ?? const <Station>[]) {
    for (final d in s.dishes) {
      final f = fam.familyOf(d);
      if (f == null ? d.key == key : f.key == key && identical(f.vars.first.dish, d)) return d;
    }
  }
  return null;
}

/// How a favourite is spelled to compare: a dish's by its normalised name, a family's (`f:Boba`) by the family key (`f:boba`).
String favKey(String stored) => stored.startsWith('f:') ? 'f:${dishKey(stored.substring(2))}' : dishKey(stored);

/// M2 `varFor`: the variant a family's row stands for. What was typed narrows first (the variants whose names fit every word), then the
/// plate's latest among them, else the first. A variant [allow] hides is never the one. Returns the index into `g.vars`.
int varFor(DishGroup g, List<String> toks, PlateState plate, String meal, {bool Function(MenuItem d)? allow}) {
  final vars = g.vars!;
  MenuItem repr(VarGroup v) => (v.refs.keys.toList()..sort((a, b) => placeOrder(a) - placeOrder(b))).map((h) => v.refs[h]!).first;
  bool ok(VarGroup v) => allow == null || allow(repr(v));
  bool hit(VarGroup v) => toks.every((t) => v.key.split(' ').any((w) => w.startsWith(t)) || v.key.contains(t));
  final fit = vars.where((v) => hit(v) && ok(v)).toList(), pool = fit.isNotEmpty ? fit : vars.where(ok).toList();
  final v = standing([for (final x in pool) Variant(repr(x), x.v, x.chip, 0)], (x) {
    final hs = vars.firstWhere((y) => y.v == x.v).refs.keys.toList()..sort((a, b) => placeOrder(a) - placeOrder(b));
    return findItem(plate, meal, dishKey(x.dish.dishName), hs.any(isCafe) ? hs.first : null)?.item.at;
  }, (_) => true);
  return v == null ? 0 : vars.indexWhere((y) => y.v == v.v).clamp(0, vars.length - 1);
}
