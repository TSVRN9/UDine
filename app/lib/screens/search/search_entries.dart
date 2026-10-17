import '../../core/m2/board.dart' show M2MenuItem, MenuItem, mealLabel;
import '../../core/packaged_food.dart';
import '../../core/saved_food.dart';
import '../../core/search.dart' show matchesQuery;
import '../../data/packaged.dart' show packagedGroup;
import '../../data/packaged_search.dart' show LookupPhase, PackPhase;
import '../../core/m2/menu_view.dart';
import '../../core/m2/search.dart';
import '../halls/halls_model.dart' show NetLine;

/// One thing in Search's list, before it is a widget: the groups in M2's order (`renderSearch`).
sealed class SearchEntry {
  const SearchEntry();
  /// stable across keystrokes, so a row that survives one keeps its element
  String get id;
}

class GroupHead extends SearchEntry {
  const GroupHead(this.title);
  final String title;
  @override
  String get id => 'g-$title';
}

/// The halls that match, as one stack under the Places title.
class HallCardsEntry extends SearchEntry {
  const HallCardsEntry(this.keys);
  final List<String> keys;
  @override
  String get id => 'g-halls';
}

class PlaceEntry extends SearchEntry {
  const PlaceEntry(this.hit);
  final PlaceHit hit;
  @override
  String get id => switch (hit) { GrabHit(:final key) => 'h$key-grab', CafeHit(:final key) => 'p$key', HallHit(:final key) => 'h$key' };
}

class DietLine extends SearchEntry {
  const DietLine(this.text, this.revealed);
  final String text;
  final bool revealed;
  @override
  String get id => 'diet';
}

class NowEntry extends SearchEntry {
  const NowEntry(this.row, {required this.cafe});
  final NowRow row;
  final bool cafe;
  @override
  String get id => '${cafe ? 'c' : 'k'}:${row.g.key}';
}

class LaterEntry extends SearchEntry {
  const LaterEntry(this.row);
  final LaterRow row;
  @override
  String get id => 'l:${row.d.key}';
}

class EmptyEntry extends SearchEntry {
  const EmptyEntry(this.text);
  final String text;
  @override
  String get id => 'empty';
}

/// A food in Your foods, the Packaged group or the UMass Dining group: its id is the food's own, so a row that is added glides from the
/// group it was in to Your foods.
class FoodEntry extends SearchEntry {
  const FoodEntry(this.food);
  final SavedFood food;
  @override
  String get id => 'f:${food.id}';
}

/// The Packaged group's wait (`pk-wait`: the indicator in the button's slot) and its failure, under its heading (`pk-fail`).
class PackWaitEntry extends SearchEntry {
  const PackWaitEntry();
  @override
  String get id => 'pk-wait';
}

class PackFailEntry extends SearchEntry {
  const PackFailEntry();
  @override
  String get id => 'pk-fail';
}

/// "Search UMass Dining for “x”": the lookup by hand, until it is asked.
class LookupButtonEntry extends SearchEntry {
  const LookupButtonEntry(this.query);
  final String query;
  @override
  String get id => 'lkb';
}

/// The lookup's answer in the button's slot: loading, none, failed or rate-limited (found is a group).
class LookupStateEntry extends SearchEntry {
  const LookupStateEntry(this.phase, this.query, this.resetsAt, [this.reason]);
  final String? reason;
  final LookupPhase phase;
  final String query;
  final DateTime? resetsAt;
  @override
  String get id => 'lk';
}

/// The Packaged group shows about 20 in all (owner, 2026-10-16): the merged list, after the repeats and the zero-calorie hits are gone.
const packagedShown = 20;

/// What Search offers past the menus (M2 `renderSearch`'s `more`), in order: Your foods, Packaged, then Search UMass Dining. Nothing at all
/// with tracking off, and neither Packaged nor the lookup offline (Your foods still answers). `foods` is all of Your foods; the ones the
/// query finds are the group, and a packaged hit with a name already there is not repeated.
List<SearchEntry> extraEntries({
  required bool track,
  required bool online,
  required String query,
  required List<SavedFood> foods,
  required PackPhase pack,
  required List<PackagedFood> packHits,
  required LookupPhase lookup,
  required List<PackagedFood> lookupFoods,
  DateTime? resetsAt,
  String? reason,
}) {
  final q = query.trim();
  if (!track || q.isEmpty) return const [];
  final yours = [for (final f in foods) if (matchesQuery(f.name, q)) f];
  return [
    if (yours.isNotEmpty) ...[const GroupHead('Your foods'), for (final f in yours) FoodEntry(f)],
    if (online) ...[
      if (pack == PackPhase.loading) const PackWaitEntry(),
      if (pack == PackPhase.fail) ...[const GroupHead('Packaged'), const PackFailEntry()],
      if (pack == PackPhase.ok)
        ...() {
          final group = packagedGroup(packHits, have: {for (final f in foods) f.name.trim().toLowerCase()}).take(packagedShown).toList();
          return [if (group.isNotEmpty) ...[const GroupHead('Packaged'), for (final f in group) FoodEntry(SavedFood.packed(f))]];
        }(),
      if (lookup == LookupPhase.found) ...[const GroupHead('UMass Dining'), for (final f in lookupFoods) FoodEntry(SavedFood.packed(f))]
      else if (lookup == LookupPhase.idle) LookupButtonEntry(q)
      else LookupStateEntry(lookup, q, resetsAt, reason),
    ],
  ];
}

class CustomEntry extends SearchEntry {
  const CustomEntry(this.query, {required this.solid});
  final String query;
  final bool solid;
  @override
  String get id => 'custom';
}

/// M2 `renderSearch`'s html as entries. `raw` is every group before Dietary preferences hide anything; `hasExtras` is whether the extras
/// slot has anything in it; [net] is what the network did to the menus (the custom button is the solid, only thing on offer when it has not, and no menu group does).
List<SearchEntry> searchEntries({
  required SearchResult raw,
  required String query,
  required Set<Lens> lenses,
  required String meal,
  required Prefs prefs,
  required bool reveal,
  required bool track,
  List<SearchEntry> extras = const [],
  NetLine net = NetLine.none,
}) {
  final shown = raw.where((d) => reveal || prefOK(prefs, d));
  final idle = query.trim().isEmpty && lenses.isEmpty;
  final out = <SearchEntry>[];
  if (raw.places.isNotEmpty) {
    out.add(const GroupHead('Places'));
    final cards = [for (final h in raw.places) if (h is HallHit) h.key];
    if (cards.isNotEmpty) out.add(HallCardsEntry(cards));
    for (final h in raw.places) {
      if (h is! HallHit) out.add(PlaceEntry(h));
    }
  }
  final all = <MenuItem>[...raw.dishes];
  final line = prefLine(prefs, all, reveal);
  if (line != null) out.add(DietLine(line, reveal));
  if (shown.now.isNotEmpty && (raw.places.isNotEmpty || shown.later.isNotEmpty || shown.cafes.isNotEmpty || idle)) out.add(GroupHead('${mealLabel[meal]} now'));
  out.addAll([for (final x in shown.now) NowEntry(x, cafe: false)]);
  if (shown.cafes.isNotEmpty) out.addAll([const GroupHead('At cafés'), for (final x in shown.cafes) NowEntry(x, cafe: true)]);
  if (shown.later.isNotEmpty) out.addAll([const GroupHead('Later today and tomorrow'), for (final x in shown.later) LaterEntry(x)]);
  final custom = query.trim().isNotEmpty && track;
  if (raw.isEmpty) {
    // (everything hidden by preferences still has the line, and is not a miss)
    final miss = query.trim().isNotEmpty
        ? 'Nothing called “${query.trim()}” is on ${net == NetLine.offline ? 'a saved menu' : 'any menu today or tomorrow'}.'
        : lenses.contains(Lens.fav)
            ? "Star a dish from its details and it shows up here whenever it's served."
            : 'No dishes match these filters at ${mealLabel[meal]!.toLowerCase()}.';
    if (net != NetLine.failed) out.add(EmptyEntry(miss)); // (failed: no menu was to be had, so nothing is said of one)
    out.addAll(extras);
    if (custom) out.add(CustomEntry(query.trim(), solid: extras.isEmpty));
  } else {
    out.addAll(extras);
    if (custom) out.add(CustomEntry(query.trim(), solid: false));
  }
  return out;
}
