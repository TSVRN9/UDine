// M2 round 12's variant families (src.html `variantOf`, `famsAt`, `standing`, `phoAxes`; NOTES "Round 12" has the rule's whole output).
// UMass lists one item several times when only a size, a milk or a base differs ("16 oz Cappuccino" / "20 oz Cappuccino", "Boba Oat Milk" /
// "Boba Soy Milk"). Within one place, day, meal and station, two or more items whose names differ by that token alone are one family:
// one row, with a pick-one in its sheet. Add-ons and Toppings are a builder's parts, never a family.
import 'package:flutter/foundation.dart' show visibleForTesting;

import 'board.dart';

class Variant {
  const Variant(this.dish, this.v, this.chip, this.o);
  final MenuItem dish;

  /// the token as the feed spells it ("Oat Milk", "16 oz"); [chip] is the picker's word ("Oat")
  final String v, chip;
  final int o;
}

class Family {
  Family(this.key, this.name, this.axis);
  final String key, name, axis;
  final List<Variant> vars = [];
}

const _milks = 'Almond|Maple|Oat|Skim|Soy|Whole|1%', _bases = 'Coconut|Yogurt';
final _size1 = RegExp(r'^(\d+) ?oz (.+)$', caseSensitive: false), _size2 = RegExp(r'^(.+?) \((\d+) ?oz\)$', caseSensitive: false);
final _milk = RegExp('^(.*?) ?($_milks) Milk\$', caseSensitive: false);
final _smoothie = RegExp('^(.+) ($_bases) Smoothie\$', caseSensitive: false), _with = RegExp('^(.+) w/($_bases)\$', caseSensitive: false);

typedef Token = ({String axis, String name, String v, String chip, int o});

/// The token a name carries, or null. A milk with nothing left of the name ("1% Milk") reads with an empty name and is no family.
Token? variantOf(String n) {
  RegExpMatch? m;
  if ((m = _size1.firstMatch(n)) != null) return (axis: 'size', name: m![2]!, v: '${m[1]} oz', chip: '${m[1]} oz', o: int.parse(m[1]!));
  if ((m = _size2.firstMatch(n)) != null) return (axis: 'size', name: m![1]!, v: '${m[2]} oz', chip: '${m[2]} oz', o: int.parse(m[2]!));
  if ((m = _milk.firstMatch(n)) != null) return (axis: 'milk', name: m![1]!, v: '${m[2]} Milk', chip: m[2]!, o: 0);
  if ((m = _smoothie.firstMatch(n)) != null) return (axis: 'base', name: '${m![1]} Smoothie', v: m[2]!, chip: m[2]!, o: 0);
  if ((m = _with.firstMatch(n)) != null) return (axis: 'base', name: m![1]!, v: m[2]!, chip: m[2]!, o: 0);
  return null;
}

final _parts = RegExp(r'^(Add-ons|Toppings)$');
final _famCache = Expando<List<Family>>('families');

/// The families among one station's dishes. Sizes run smallest first; milks and bases keep the feed's order; the first is the default.
List<Family> famsAt(List<MenuItem> ds, String station) {
  if (_parts.hasMatch(station.trim())) return const [];
  final g = <String, Family>{};
  for (final d in ds) {
    final t = variantOf(d.dishName);
    if (t == null || t.name.isEmpty) continue;
    final f = g.putIfAbsent('${t.axis}:${dishKey(t.name)}', () => Family('f:${dishKey(t.name)}', t.name, t.axis));
    if (!f.vars.any((x) => x.v == t.v)) f.vars.add(Variant(d, t.v, t.chip, t.o));
  }
  return [
    for (final f in g.values)
      if (f.vars.length >= 2) f..vars.sort((a, b) => f.axis == 'size' ? a.o - b.o : 0),
  ];
}

/// [famsAt] for a station, once (Station objects are shared by every Board copy of a day).
List<Family> stationFamilies(Station s) => _famCache[s] ??= famsAt(s.dishes, s.name);

/// M2's `VARN`: every member name any board has shown this session, for the places that have only a name (a past meal). A name no board has
/// shown as a family's member reads as the feed spells it.
final _shownNames = <String, String>{};
String shownName(String feedName) => _shownNames[feedName] ?? feedName;

/// Fills the names from stations already in hand (the menus saved on the device at launch), as M2 fills VARN at load.
void primeShownNames(Iterable<Station> stations) {
  for (final s in stations) {
    for (final f in stationFamilies(s)) {
      for (final x in f.vars) {
        _shownNames[x.dish.dishName] = '${f.name}, ${x.v}';
      }
    }
  }
}

@visibleForTesting
void forgetShownNames() => _shownNames.clear();

/// Every family on a board by the dish that is a member (by identity: one dish object is one serving), M2's `FAM`.
class FamilyIndex {
  FamilyIndex(Board b) {
    for (final places in b.days.values) {
      for (final meals in places.values) {
        for (final sts in meals.values) {
          for (final s in sts) {
            for (final f in stationFamilies(s)) {
              names[f.key] = f.name;
              for (final x in f.vars) {
                _of[x.dish] = _everywhere[x.dish] = (f, x);
                shown[x.dish.dishName] = _shownNames[x.dish.dishName] = '${f.name}, ${x.v}';
              }
            }
          }
        }
      }
    }
  }
  final _of = Map<MenuItem, (Family, Variant)>.identity();

  /// every member's own key (Search lists their family instead)
  late final Set<String> memberKeys = {for (final d in _of.keys) dishKey(d.dishName)};

  /// family key -> the family's name; a member's feed name -> how it reads ("Boba, Oat Milk"). A name with no sibling is no key here.
  final names = <String, String>{}, shown = <String, String>{};
  // A dish any board has indexed is known to every board: a plate item remembers the dish it was added from, which the board its
  // sheet is given (a place's, with menus perhaps not yet in) need not hold.
  Family? familyOf(MenuItem d) => (_of[d] ?? _everywhere[d])?.$1;
  Variant? variantIn(MenuItem d) => (_of[d] ?? _everywhere[d])?.$2;
}

final _index = Expando<FamilyIndex>('familyIndex');
final _everywhere = Expando<(Family, Variant)>('familyMember');
FamilyIndex familiesOf(Board b) => _index[b] ??= FamilyIndex(b);

/// What a starred family is stored as in the favourites (M2's `favKey`): `f:` and the name, so it never meets a dish of the same name.
String favoriteOf(Family f) => 'f:${f.name}';

/// How an item reads on the sheet and the plate: "Cappuccino, 20 oz" (M2 `shown`).
String shownOf(FamilyIndex ix, MenuItem d) => switch ((ix.familyOf(d), ix.variantIn(d))) { (final f?, final x?) => '${f.name}, ${x.v}', _ => d.dishName };

/// M2 `standing`: the variant the row stands for. [at] is the plate stamp of a variant's own plain item (null: not on the plate); the latest
/// stamp wins, with none the first variant [ok] allows.
Variant? standing(List<Variant> vars, int? Function(Variant) at, bool Function(Variant) ok) {
  Variant? best;
  var bestAt = -1;
  for (final x in vars) {
    if (!ok(x)) continue;
    final a = at(x);
    if (a != null && a > bestAt) (best, bestAt) = (x, a);
  }
  return best ?? vars.where(ok).firstOrNull;
}

/// A café's pho grid: `<protein> Pho w/<broth> Broth` over a whole station, complete and at least 2 x 2.
class PhoAxes {
  PhoAxes(this.p, this.b, this.grid);
  /// (token, chip label): ("Beef", "Beef Pho"), ("Spicy Green Curry", "Spicy Green Curry Broth")
  final List<(String, String)> p, b;
  final Map<String, MenuItem> grid;
  MenuItem? dish(String p, String b) => grid['$p|$b'];
}

final _pho = RegExp(r'^(.+?) Pho w/(.+) Broth$');
PhoAxes? phoAxes(List<MenuItem> ds) {
  final g = <String, MenuItem>{}, p = <String>[], b = <String>[];
  for (final d in ds) {
    final m = _pho.firstMatch(d.dishName);
    if (m == null) return null;
    if (!p.contains(m[1])) p.add(m[1]!);
    if (!b.contains(m[2])) b.add(m[2]!);
    g['${m[1]}|${m[2]}'] = d;
  }
  return p.length >= 2 && b.length >= 2 && g.length == p.length * b.length && g.length == ds.length
      ? PhoAxes([for (final x in p) (x, '$x Pho')], [for (final x in b) (x, '$x Broth')], g)
      : null;
}
