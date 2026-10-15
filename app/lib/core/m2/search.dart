// M2's Search (`renderSearch`, `results`, `cafeResults`, `placeHits`, `laterHits`): the groups, their order and the lenses, as pure
// functions of the board. The screen draws them; matching is core/search.dart's, the one rule main shipped.
import '../search.dart';
import 'board.dart';
import 'menu_view.dart' show dayIsos;
import 'places.dart';
import 'plate.dart';
import 'where.dart';

/// Search's lens chips, in M2's order.
enum Lens { protein, light, veg, plant, halal, lowc, fav }

const lensLabel = {
  Lens.protein: 'High protein', Lens.light: 'Light', Lens.veg: 'Vegetarian', Lens.plant: 'Plant based', Lens.halal: 'Halal', Lens.lowc: 'Low carbon', Lens.fav: 'Favorites',
};

/// A dish as Search groups it: its places and the serving at each (today, the clock's meal).
class DishGroup {
  const DishGroup(this.key, this.name, this.refs);
  final String key, name;
  final Map<String, MenuItem> refs;
  List<String> get places => refs.keys.toList()..sort((a, b) => placeOrder(a) - placeOrder(b));
}

/// A row of the "now" group or "At cafés": `d` is the serving whose numbers it shows (M2 `rep`).
class NowRow {
  const NowRow(this.g, this.d);
  final DishGroup g;
  final MenuItem d;
}

/// A dish not served now: when it is next served (`g`), and the serving that names it.
class LaterRow {
  const LaterRow(this.g, this.d);
  final WhereGroup g;
  final MenuItem d;
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
    final hall = <String, DishGroup>{}, cafe = <String, DishGroup>{};
    void add(Map<String, DishGroup> into, String place, Iterable<Station> sts) {
      for (final s in sts) {
        for (final d in s.dishes) {
          into.putIfAbsent(d.key, () => DishGroup(d.key, d.dishName, {})).refs.putIfAbsent(place, () => d);
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
    hallGroups = hall.values.toList();
    cafeGroups = cafe.values.toList();
    final seen = <String, String>{};
    for (final iso in isos.take(2)) {
      for (final MapEntry(key: place, value: meals) in (fx.days[iso] ?? const <String, Map<String, List<Station>>>{}).entries) {
        if (newton.contains(place)) continue;
        for (final sts in meals.values) {
          for (final s in sts) {
            for (final d in s.dishes) {
              seen.putIfAbsent(d.key, () => d.dishName);
            }
          }
        }
      }
    }
    final inNow = {...hall.keys, ...cafe.keys};
    laterCandidates = [for (final e in seen.entries) if (!inNow.contains(e.key)) (e.key, e.value)];
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
  late final Set<String> hasMenu;
}

const _hallWords = ' dining commons hall', _grabWords = " grab n go grab and go";

/// M2's results for the typed text and lenses. `favorites` are dish names; `plate` decides which hall a row speaks for (`rep`) and
/// which rows sort after the ones that would split the plate (`join`): the screen computes this when the query, lenses or data
/// change, never on a plate change, so rows never move under a finger that has just added one.
SearchResult runSearch(SearchIndex ix, {required String query, Set<Lens> lenses = const {}, Set<String> favorites = const {}, PlateState plate = emptyPlates}) {
  final toks = searchWords(query), favKeys = {for (final f in favorites) dishKey(f)};
  final front = plate.front < plate.plates.length ? plate.plates[plate.front] : null;
  final ph = front != null && front.meal == ix.meal ? plateHalls(front) : null;

  MenuItem? rep(DishGroup g) {
    final h = ph?.where(g.refs.containsKey).firstOrNull ?? g.places.firstOrNull;
    return h == null ? null : g.refs[h];
  }

  List<NowRow> results(List<DishGroup> groups) {
    final out = <({NowRow row, int rank, int join})>[];
    for (final g in groups) {
      if (toks.isNotEmpty && !matchesQuery(g.name, query)) continue;
      final d = rep(g);
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
      out.add((row: NowRow(g, d), rank: rank, join: wouldSplit(plate, ix.meal, g.refs.keys.toList()) ? 1 : 0));
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
      final item = byName || ix.hasMenu.contains(p.key) ? null : ix.standing[p.key]?.where((n) => hit(searchWords(n))).firstOrNull;
      if (byName || item != null) places.add(CafeHit(p.key, item));
    }
  }

  final later = <LaterRow>[];
  if (toks.isNotEmpty) {
    final cafeKeys = {for (final g in ix.cafeGroups) g.key};
    for (final (key, name) in ix.laterCandidates) {
      if (cafeKeys.contains(key) || !matchesQuery(name, query)) continue;
      final g = wherePlan(ix.fx, name, ix.now, newton: ix.charlesRiver).where((g) => g.st != 'now' && g.halls.isNotEmpty).firstOrNull;
      final d = g == null ? null : _serving(ix.fx, g, key);
      if (g != null && d != null) later.add(LaterRow(g, d));
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

/// The serving that names a group: its first place's dish on the group's day and meal.
MenuItem? _serving(Board fx, WhereGroup g, String key) {
  final iso = dayIsos(fx)[g.day];
  for (final s in fx.days[iso]?[g.halls.first]?[g.meal] ?? const <Station>[]) {
    for (final d in s.dishes) {
      if (d.key == key) return d;
    }
  }
  return null;
}
