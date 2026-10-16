// The bowl builder's state in the dish sheet (M2 src.html `stepPart`, `bowlNow`, `footHTML`, `buildMid`, `openBowl`). The rules of which dish
// builds and what a bowl is live in bowl.dart; this is what a sheet holds while one is being built, and what a plate keeps to reopen it.
import 'board.dart';
import 'bowl.dart';

/// What a builder offers: the add-ins under [head], over a natural [base] (a hall dish, a café dish) or a synthetic [syn].
class BowlSpec {
  const BowlSpec({required this.head, required this.parts, required this.place, required this.meal, this.base, this.syn});
  factory BowlSpec.build(Build b, {required String place, required String meal}) => BowlSpec(head: b.head, parts: b.parts, base: b.base, place: place, meal: meal);
  factory BowlSpec.syn(Syn y) => BowlSpec(head: y.head, parts: y.parts, syn: y, place: y.place, meal: y.meal);
  final String head, place, meal;
  final List<MenuItem> parts;
  final MenuItem? base;
  final Syn? syn;
}

/// A bowl on the plate with what it was built from, so the plate row reopens its builder (M2 `openBowl`) without the menu.
class PlateBowl {
  const PlateBowl(this.bowl, this.spec);
  final Bowl bowl;
  final BowlSpec spec;
}

/// The chosen add-ins: part index -> servings, in the order they were chosen (the plate's "with" line reads in that order).
typedef Sel = Map<int, num>;

bool _isChoice(BowlSpec s, int i) => s.syn != null && s.syn!.pho && s.syn!.choices.any((x) => identical(x, s.parts[i]));

/// A part's stepper: + goes 0, 1, 2 ... (1/2 goes to 1); - goes back to 1/2 and off. A pho's base is one of its choices, one at a time:
/// + picks it (and puts the last one back), - puts it back.
Sel stepPart(BowlSpec s, Sel sel, int i, int dir) {
  final q = sel[i] ?? 0, ch = _isChoice(s, i);
  final n = ch ? (dir > 0 ? 1 : 0) : dir > 0 ? (q == .5 ? 1 : q + 1) : q > 1 ? q - 1 : q == 1 ? .5 : 0;
  final out = {...sel};
  if (ch && n > 0) out.removeWhere((k, _) => k != i && _isChoice(s, k));
  if (n > 0) {
    out[i] = n;
  } else {
    out.remove(i);
  }
  return out;
}

Bowl bowlNow(BowlSpec s, Sel sel) {
  final chosen = <Qty>[for (final e in sel.entries) if (e.value > 0) (s.parts[e.key], e.value)];
  return s.syn != null ? synBowl(s.syn!, chosen, place: s.place) : bowlDish(s.base, chosen, place: s.place);
}

/// The chosen add-ins of a bowl already built (a pho's base is chosen too).
Sel selOf(BowlSpec s, Bowl b) {
  int at(MenuItem x) => s.parts.indexWhere((p) => identical(p, x));
  return {if (s.syn != null && b.base != null) at(b.base!): 1, for (final (x, q) in b.parts) at(x): q};
}

/// The foot's Add is off for a synthetic base with nothing in it, and for a pho until a base is picked.
bool addOff(BowlSpec s, Bowl b) => s.syn != null && s.syn!.pho ? b.base == null : s.base == null && b.parts.isEmpty;

/// M2 `buildMid`: the sheet rests with its name, the add-ins heading and four add-ins above the foot. [rowsBottom] are the add-in rows'
/// bottoms measured from the body's top.
double buildMid({required double grab, required List<double> rowsBottom, required double foot, required double winH, required double top}) {
  final last = rowsBottom.isEmpty ? 200.0 : rowsBottom[rowsBottom.length < 4 ? rowsBottom.length - 1 : 3];
  final want = grab + last + foot + 8, cap = winH - top - 8;
  return want < cap ? want : cap;
}
