import 'package:flutter/widgets.dart';
import '../../core/m2/board.dart';
import '../../core/m2/menu_view.dart' show rowScores;
import '../../theme/tokens.dart';
import '../../ui/ui.dart';

/// What a row's control shows (`rowCode`): its quantity on the plate it would join, 0 for the plain +, -1 for the ghost +.
typedef RowCode = double;

/// A dish row on a hall menu: name with its diet patch, calories and protein, the scores You turned on, and the control lane. A
/// dish that is unscored draws no tile and no slot, so a row is the same size with every score toggle on or off (Review Focus 5).
class DishRow extends StatelessWidget {
  /// How many times a row's build has run (tests count what a flip or a day change builds).
  static int builds = 0;
  final MenuItem dish;
  final ({bool health, bool carbon}) scores;
  /// the avoided allergens a revealed row lists, said first
  final List<String> contains;
  /// null: another day's dish, which carries no control (it cannot go on today's plate)
  final RowCode? code;
  final bool here;
  /// Track what I eat is off: the lane is kept, empty, so the row is the size it was and its name wraps where it did (`visibility:hidden`); in Search
  /// the tags rise into the control's place
  final bool track;
  /// a favourite dish carries a star after its name
  final bool favorite;
  final VoidCallback onOpen, onAdd, onInc, onDec;
  /// Search: where it is served now, under the control in its lane
  final Widget? tags;
  /// Search's Later rows: what follows the numbers on the meta line (when, and where), at the wider column gap
  final Widget? tail;
  const DishRow({super.key, required this.dish, required this.scores, this.contains = const [], this.code, this.here = false, this.track = true, this.favorite = false, required this.onOpen, required this.onAdd, required this.onInc, required this.onDec, this.tags, this.tail});

  /// M2 `.lane`: the control over the tags, both at the right edge; the tags keep clear of it by `tagRight` (a café's name by less)
  Widget _lane(Widget control) => !track
      ? tags == null
          ? const SizedBox(width: M2Layout.lane, height: M2Layout.addSize)
          : ConstrainedBox(
              constraints: const BoxConstraints(minHeight: M2Layout.laneMin, minWidth: M2Layout.lane),
              child: Padding(padding: const EdgeInsets.only(top: M2Layout.laneOffTop), child: Align(alignment: Alignment.topRight, child: Padding(padding: const EdgeInsets.only(right: M2Layout.tagRight), child: tags))),
            )
      : tags == null
      ? control
      : Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.end, children: [control, Padding(padding: const EdgeInsets.only(right: M2Layout.tagRight), child: tags)]);

  @override
  Widget build(BuildContext context) {
    builds++;
    final d = dish, sc = rowScores(d.health, d.carbon, scores);
    final num = M2Text.metaNum.style(M2Color.ink), unit = M2Text.meta.style(M2Color.slate);
    Widget group(List<Widget> kids) => Row(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: kids);
    const gap = SizedBox(width: M2Layout.numSpace);
    final meta = Wrap(
      spacing: tail != null ? M2Layout.laterGapX : M2Layout.metaGapX, runSpacing: M2Layout.metaGapY, crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        if (contains.isNotEmpty) Text('Contains ${andList(contains.map((a) => a.toLowerCase()).toList())}', style: M2Text.meta.style(M2Color.vm).copyWith(fontWeight: FontWeight.w600)),
        group([
          Text(fc(d.nutrition.calories), style: num), gap, Text('cal', style: unit), gap, const SizedBox(width: M2Layout.numGap), gap, Text('${f1(d.nutrition.proteinG)}g', style: num), gap, Text('protein', style: unit),
        ]),
        if (sc != null)
          // `.row .m .sc{margin-block:-1px}`: a 22.5 tile rides in the 22 line without growing it
          NegMargin(
            top: -M2Layout.scoreRise, bottom: -M2Layout.scoreRise,
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              ScoreBadge(kind: ScoreKind.health, value: sc.health),
              if (sc.health != null && sc.carbon != null) const SizedBox(width: M2Layout.scoreGap),
              ScoreBadge(kind: ScoreKind.carbon, value: sc.carbon),
            ]),
          ),
        ?tail,
      ],
    );
    final badge = Badge.forDiet(d.diet);
    return ListRow(
      label: '${d.dishName}, ${fc(d.nutrition.calories)} calories, ${f1(d.nutrition.proteinG)} grams protein',
      here: here, onTap: onOpen,
      name: Badge.name(d.dishName, M2Text.rowName.style(M2Color.ink), badge: badge, star: favorite ? const StarMark() : null),
      meta: meta,
      control: code == null ? null : _lane(RowControl(qty: code! > 0 ? code! : 0, ghost: code! < 0, onAdd: onAdd, onInc: onInc, onDec: onDec)),
    );
  }
}

/// "a, b and c" (M2 `andList`)
String andList(List<String> l) => l.length < 2 ? l.join() : '${l.sublist(0, l.length - 1).join(', ')} and ${l.last}';
