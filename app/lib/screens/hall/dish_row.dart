import 'dart:math' as math;
import 'package:flutter/widgets.dart';
import '../../core/m2/board.dart';
import '../../core/m2/menu_view.dart' show rowScores;
import '../../motion/track_lift.dart';
import '../../shell/app_scope.dart';
import '../../theme/tokens.dart';
import '../../motion/track_layer.dart';
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
  /// What the row is at rest when no tracking clock is mounted (a row built on its own): with tracking off it is a name and marks, a 48 high
  final bool track;
  /// a favourite dish carries a star after its name
  final bool favorite;
  /// a family's row (round 12): its name, and the token of the variant it stands for, leading the meta line
  final String? family, chip;
  final VoidCallback onOpen, onAdd, onInc, onDec;
  /// Search: where it is served now, under the control in its lane
  final Widget? tags;
  /// Search's Later rows: what follows the numbers on the meta line (when, and where), at the wider column gap
  final Widget? tail;
  const DishRow({super.key, required this.dish, required this.scores, this.contains = const [], this.code, this.here = false, this.track = true, this.favorite = false, this.family, this.chip, required this.onOpen, required this.onAdd, required this.onInc, required this.onDec, this.tags, this.tail});

  /// M2 `.lane`: the control over the tags, both at the right edge; the tags keep clear of it by `tagRight` (a café's name by less). The control
  /// is the layer's: it fades, then closes, and with tracking off it is gone from layout. [fold]: the tags rode a meta line that closes with the
  /// figures, so they settle to the lane's centre (the line's copy fades as the figures do, the lane's comes in as it goes).
  Widget? _lane(LiftFrame f, Widget control, {required bool fold}) {
    final gone = f.size == 0 && f.alpha == 0;
    final ctl = gone ? null : f.size == 1 && f.alpha == 1 ? control : ClipRect(child: Align(alignment: Alignment.topRight, heightFactor: f.size, child: Opacity(opacity: f.alpha, child: control)));
    if (tags == null) return ctl;
    final inLane = fold ? 1 - f.alpha : 0.0;
    return SizedBox(
      width: M2Layout.lane,
      child: Stack(alignment: Alignment.centerRight, children: [
        if (ctl != null) Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.end, children: [ctl, SizedBox(height: M2Layout.tagSize * f.size)]),
        if (inLane > 0) Opacity(opacity: inLane, child: Padding(padding: const EdgeInsets.only(right: M2Layout.tagRight), child: tags)),
      ]),
    );
  }

  /// Search's tiles ride the meta line, not the lane's bottom (flutter-motion-fixes Task 2, owner 2026-10-17): a zero-width slot at the line's
  /// right edge, its tiles centred on the line and, as one group, on the control (a café's name keeps the lane's right edge, as it was).
  Widget? _tagSlot(double alpha) {
    if (tags == null || alpha == 0) return null;
    final cafe = tags is HallTags && (tags as HallTags).cafe != null;
    final limit = M2Layout.rowGap + M2Layout.lane - M2Layout.tagRight; // the group's right edge never passes the lane's old one
    return SizedBox(
      width: 0, height: M2Layout.tagSize,
      child: OverflowBox(
        minWidth: 0, maxWidth: limit + (cafe ? M2Layout.tagCafeMax : 200), alignment: Alignment.centerLeft,
        child: Opacity(opacity: alpha, child: CustomSingleChildLayout(delegate: _TagsAt(cafe ? null : M2Layout.rowGap + M2Layout.lane - M2Layout.addSize / 2, limit), child: tags)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    builds++;
    return LiftBuilder(lift: AppScope.liftOf(context), rest: track, builder: (context, f, _) => _row(context, f));
  }

  Widget _row(BuildContext context, LiftFrame f) {
    final d = dish, sc = rowScores(d.health, d.carbon, scores), gone = f.size == 0 && f.alpha == 0;
    // a line that held only the figures closes with them (`.m:not(:has(> :not(.fig)))`)
    final figsOnly = contains.isEmpty && chip == null && sc == null && tail == null;
    final meta = Wrap(
      spacing: tail != null ? M2Layout.laterGapX : M2Layout.metaGapX, runSpacing: M2Layout.metaGapY, crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        if (contains.isNotEmpty) Text('Contains ${andList(contains.map((a) => a.toLowerCase()).toList())}', style: M2Text.meta.style(M2Color.vm).copyWith(fontWeight: FontWeight.w600)),
        // (`.vt` shares the line's baseline with the Oswald figures, which sits below the line's centre)
        if (chip != null) Transform.translate(offset: const Offset(0, M2Layout.tokenDrop), child: Text(chip!, style: M2Text.meta.style(M2Color.slate))),
        if (!gone) Opacity(opacity: f.alpha, child: CalProtein(cal: d.nutrition.knownCal, protein: d.nutrition.knownProtein)),
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
    final control = code == null ? null : _lane(f, RowControl(qty: code! > 0 ? code! : 0, ghost: code! < 0, onAdd: onAdd, onInc: onInc, onDec: onDec), fold: figsOnly);
    return ListRow(
      label: '${family ?? d.dishName}${chip == null ? '' : ', $chip'}${gone ? '' : ', ${d.nutrition.knownCal == null ? 'calories not listed' : '${fc(d.nutrition.knownCal)} calories'}, ${d.nutrition.knownProtein == null ? 'protein not listed' : '${f1(d.nutrition.knownProtein)} grams protein'}'}',
      here: here, onTap: () { Haptics.selection(); onOpen(); }, stands: chip == null ? null : d,
      name: Badge.name(family ?? d.dishName, M2Text.rowName.style(M2Color.ink), badge: badge, star: favorite ? const StarMark() : null),
      meta: meta, metaEnd: _tagSlot(figsOnly ? f.alpha : 1),
      minHeight: M2Size.rowOff + (M2Size.row - M2Size.rowOff) * f.size, metaOpen: figsOnly ? f.size : 1,
      control: control,
    );
  }
}

/// A row's "250 cal  6g protein" (M2 `meta`): the figures in Oswald, the words in slate.
class CalProtein extends StatelessWidget {
  const CalProtein({super.key, required this.cal, required this.protein});
  final num? cal, protein;
  @override
  Widget build(BuildContext context) {
    final num = M2Text.metaNum.style(M2Color.ink), unit = M2Text.meta.style(M2Color.slate);
    const gap = SizedBox(width: M2Layout.numSpace);
    return Row(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
      Text(fc(cal), style: num), gap, Text('cal', style: unit), gap, const SizedBox(width: M2Layout.numGap), gap, Text(fg(protein), style: num), gap, Text('protein', style: unit),
    ]);
  }
}

/// A per-100 g food's "368 cal per 100 g" (M2 `.mg`): says what the figure is for, and no protein.
class CalPer100 extends StatelessWidget {
  const CalPer100({super.key, required this.cal});
  final num? cal;
  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
        Text(fc(cal), style: M2Text.metaNum.style(M2Color.ink)),
        const SizedBox(width: M2Layout.numSpace),
        Text('cal per 100 g', style: M2Text.meta.style(M2Color.slate)),
      ]);
}

/// "a, b and c" (M2 `andList`)
String andList(List<String> l) => l.length < 2 ? l.join() : '${l.sublist(0, l.length - 1).join(', ')} and ${l.last}';

/// Where the tiles hang, from the meta line's right edge: centred on [centre] (the +) and no further right than [limit]; with no centre,
/// right-aligned to [limit].
class _TagsAt extends SingleChildLayoutDelegate {
  final double? centre;
  final double limit;
  const _TagsAt(this.centre, this.limit);
  @override
  Offset getPositionForChild(Size size, Size child) =>
      Offset(centre == null ? limit - child.width : math.min(centre! - child.width / 2, limit - child.width), (size.height - child.height) / 2);
  @override
  bool shouldRelayout(_TagsAt o) => o.centre != centre || o.limit != limit;
}

