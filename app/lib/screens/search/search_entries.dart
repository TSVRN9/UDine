import '../../core/m2/board.dart' show M2MenuItem, MenuItem, mealLabel;
import '../../core/m2/menu_view.dart';
import '../../core/m2/search.dart';

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

/// Where the groups past the menus go (packaged foods, `flutter-port-packaged-foods` Task 3): after Later, before the custom button.
class ExtrasSlot extends SearchEntry {
  const ExtrasSlot();
  @override
  String get id => 'extras';
}

class CustomEntry extends SearchEntry {
  const CustomEntry(this.query, {required this.solid});
  final String query;
  final bool solid;
  @override
  String get id => 'custom';
}

/// M2 `renderSearch`'s html as entries. `raw` is every group before Dietary preferences hide anything; `hasExtras` is whether the extras
/// slot has anything in it (the custom button is the solid, only thing on offer when it has not, and no menu group does).
List<SearchEntry> searchEntries({
  required SearchResult raw,
  required String query,
  required Set<Lens> lenses,
  required String meal,
  required Prefs prefs,
  required bool reveal,
  required bool track,
  required bool hasExtras,
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
    out.add(EmptyEntry(query.trim().isNotEmpty
        ? 'Nothing called “${query.trim()}” is on any menu today or tomorrow.'
        : lenses.contains(Lens.fav)
            ? "Star a dish from its details and it shows up here whenever it's served."
            : 'No dishes match these filters at ${mealLabel[meal]!.toLowerCase()}.'));
    if (hasExtras) out.add(const ExtrasSlot());
    if (custom) out.add(CustomEntry(query.trim(), solid: !hasExtras));
  } else {
    if (hasExtras) out.add(const ExtrasSlot());
    if (custom) out.add(CustomEntry(query.trim(), solid: false));
  }
  return out;
}
