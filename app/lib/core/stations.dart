// Port of shared/src/stations.ts.

/// Trims, collapses whitespace runs, then strips a trailing " WOR" / " FRK HMP" hall-code token.
String normalizeStationName(String raw) => raw.trim().replaceAll(RegExp(r'\s+'), ' ').replaceFirst(RegExp(r' (WOR|FRK HMP)$'), '');

const _keywords = [
  'grill', 'display station', 'tandoor', 'stir fry', 'street food', 'noodle', 'pasta', 'pizza', 'sushi', 'latino',
  'mediterranean', 'international', 'vegetarian', 'seasons', 'express', 'gluten free', 'entree', 'omelet', 'vegetable',
  'starch', 'topping', 'salad', 'soup', 'deli', 'bread', 'pastr', 'dessert', 'grab', //
];

int _rank(String name) {
  final lower = name.toLowerCase();
  if (lower.startsWith('gf ')) return _keywords.indexOf('gluten free');
  final i = _keywords.indexWhere(lower.contains);
  return i == -1 ? _keywords.length : i;
}

// CLDR root order for ASCII punctuation (what ICU's localeCompare, hence the TS sort, uses).
const _punct = " _-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~\$";

int _primary(int c) {
  final ch = String.fromCharCode(c);
  final p = _punct.indexOf(ch);
  if (p != -1) return 1 + p;
  if (c >= 0x30 && c <= 0x39) return 100 + c - 0x30;
  final lower = ch.toLowerCase().codeUnitAt(0);
  if (lower >= 0x61 && lower <= 0x7a) return 200 + lower - 0x61;
  return 1000 + lower;
}

/// ICU-style compare: letters ignoring case first, then lowercase before uppercase.
// ponytail: ASCII ordering only (accents, non-Latin scripts fall back to code-point order). Station names are ASCII;
// add package:intl's Collator-equivalent if UMass ever ships others.
int localeCompare(String a, String b) {
  final ar = a.runes.toList(), br = b.runes.toList();
  for (var i = 0; i < ar.length && i < br.length; i++) {
    final d = _primary(ar[i]).compareTo(_primary(br[i]));
    if (d != 0) return d;
  }
  if (ar.length != br.length) return ar.length.compareTo(br.length);
  for (var i = 0; i < ar.length; i++) {
    if (ar[i] == br[i]) continue;
    final aLower = String.fromCharCode(ar[i]) == String.fromCharCode(ar[i]).toLowerCase();
    return aLower ? -1 : 1;
  }
  return 0;
}

/// Known station kinds in food-journey order, unrecognized names alphabetically after them. Stable.
List<String> sortStationNames(List<String> names) {
  final idx = [for (var i = 0; i < names.length; i++) i];
  idx.sort((x, y) {
    final d = _rank(names[x]) - _rank(names[y]);
    if (d != 0) return d;
    final c = localeCompare(names[x], names[y]);
    return c != 0 ? c : x.compareTo(y);
  });
  return [for (final i in idx) names[i]];
}
