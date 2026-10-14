import 'package:flutter/widgets.dart';
import 'label_model.dart';
import '../theme/tokens.dart';
import 'score_badge.dart';

// M2 `.facts`, `.label`, `.grades`: the FDA-style box in the plate-totals treatment (white, a 2 dp deep-maroon frame, thick and thin
// rules). Rule widths are M2's: 7 under the serving row and the last row, 4 under Calories, 1 between rows.
const _frame = 2.0, _padX = 12.0, _padTop = 4.0, _padBottom = 6.0;
const _thick = 7.0, _calRule = 4.0, _hair = 1.0;
const _rowTop = 5.0, _rowBottom = 4.0, _subIndent = 16.0, _rowGap = 12.0;
const _footTop = 6.0, _footBottom = 2.0, _footLine = 1.35; // `.lf` line-height 1.35

Widget _rule(Widget child, double w) => Container(decoration: BoxDecoration(border: Border(bottom: BorderSide(color: M2Color.dm, width: w))), child: child);

class NutritionLabel extends StatelessWidget {
  final Label label;
  final Key? calKey;
  const NutritionLabel({super.key, required this.label, this.calKey});

  @override
  Widget build(BuildContext context) {
    
    final lbl = M2Text.lblRow.style(M2Color.dm), bold = lbl.copyWith(fontWeight: bold700);
    Widget row(LabelRow r) {
      // an empty %DV is an empty span in M2: it keeps its width and adds no height, so a row without one is 28 dp, not 34
      final dv = SizedBox(width: M2Layout.dvMin, child: r.right.isEmpty ? null : Text(r.right, textAlign: TextAlign.right, style: M2Text.dv.style(M2Color.dm)));
      if (r.kind == LabelKind.thin) {
        final st = M2Text.lblThin.style(M2Color.dm).copyWith(fontWeight: bold700);
        return _rule(Padding(padding: const EdgeInsets.only(top: _rowTop, bottom: _rowBottom), child: Align(alignment: Alignment.centerRight, child: Text(r.right, style: st))), _hair);
      }
      final sub = r.kind == LabelKind.sub;
      final trans = r.name.startsWith('Trans ');
      final left = Text.rich(TextSpan(style: lbl, children: [
        if (trans) ...[TextSpan(text: 'Trans', style: const TextStyle(fontStyle: FontStyle.italic)), TextSpan(text: r.left.substring(5))]
        else if (sub) TextSpan(text: r.left)
        else ...[TextSpan(text: r.name, style: bold), TextSpan(text: r.left.substring(r.name.length))],
      ]));
      return _rule(
        Padding(
          padding: EdgeInsets.fromLTRB(sub ? _subIndent : 0, _rowTop, 0, _rowBottom),
          child: Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Flexible(child: left), const SizedBox(width: _rowGap), dv]),
        ),
        r.last ? _thick : _hair,
      );
    }

    return Container(
      color: M2Color.white,
      padding: const EdgeInsets.fromLTRB(_frame + _padX, _frame + _padTop, _frame + _padX, _frame + _padBottom),
      foregroundDecoration: const BoxDecoration(border: Border.fromBorderSide(BorderSide(color: M2Color.dm, width: _frame))),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _rule(Padding(padding: const EdgeInsets.only(top: M2Layout.labelTitleTop, bottom: M2Layout.labelTitleBottom), child: Text('Nutrition Facts', style: M2Text.labelTitle.style(M2Color.dm))), _hair),
        if (label.serving != null)
          _rule(
            Padding(
              padding: const EdgeInsets.symmetric(vertical: M2Layout.servingPad),
              child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text('Serving size', style: bold), Flexible(child: Text(label.serving!, style: bold, textAlign: TextAlign.right))]),
            ),
            _thick,
          ),
        // keyed with its rule: M2's `.cal` box (54) includes its 4 dp border, and the dish sheet rests on its bottom
        KeyedSubtree(
          key: calKey,
          child: _rule(
          Padding(
            padding: const EdgeInsets.only(top: M2Layout.calPadTop, bottom: M2Layout.calPadBottom),
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text('Calories', style: M2Text.lblLg.style(M2Color.dm).copyWith(fontWeight: bold700)),
              Text(label.cal, style: M2Text.calNum.style(M2Color.dm)),
            ]),
          ),
          _calRule,
        )),
        for (final r in label.rows) row(r),
        Padding(padding: const EdgeInsets.only(top: _footTop, bottom: _footBottom), child: Text('*Percent Daily Values are based on a 2,000 calorie diet.', style: M2Text.lblFoot.style(M2Color.ink).copyWith(height: _footLine))),
      ]),
    );
  }
}

/// The ratings panel: its own box beside the label with its own rules (one 1 dp rule between ratings, none after the last, no thick
/// bar). Each rating is its whole scale: every step a figure over its colour, the dish's step the full tile.
class RatingsPanel extends StatelessWidget {
  final int? health;
  final String? carbon;
  const RatingsPanel({super.key, required this.health, required this.carbon});

  /// "CO₂e" with the 2 drawn as a subscript: U+2082 is in neither bundled font, so a literal one falls back to the system font mid-word.
  /// M2's browser draws the character itself, so m2.json has no value for these; they are the usual subscript proportions.
  static const _subSize = 0.65, _subDrop = 0.2;
  Widget _carbonNote(String band) {
    const t = M2Text.lblThin;
    final style = t.style(M2Color.ink), sub = M2Type(t.size * _subSize, null, t.family, t.weight).style(M2Color.ink);
    return Text.rich(TextSpan(style: style, children: [
      TextSpan(text: '$band kg CO'),
      WidgetSpan(alignment: PlaceholderAlignment.baseline, baseline: TextBaseline.alphabetic, child: Transform.translate(offset: Offset(0, t.size * _subDrop), child: Text('2', style: sub))),
      const TextSpan(text: 'e per kg of food'),
    ]));
  }

  Widget _scale(ScoreKind kind, List<Object> steps, Object value, double stepW) => Row(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.end, children: [
        for (var i = 0; i < steps.length; i++) ...[
          if (i > 0) const SizedBox(width: M2Layout.scaleGap),
          if (steps[i] == value)
            Padding(padding: const EdgeInsets.symmetric(horizontal: M2Layout.scaleOnPad), child: ScoreBadge(kind: kind, value: value, size: ScoreSize.scale))
          else
            SizedBox(
              width: stepW,
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Text('${steps[i]}', style: M2Text.scaleNum.style(M2Color.slate)),
                const SizedBox(height: M2Layout.scaleNumBar - M2Layout.scaleBar),
                Container(height: M2Layout.scaleBar, margin: const EdgeInsets.symmetric(horizontal: M2Layout.scaleBarInset), decoration: BoxDecoration(color: kind == ScoreKind.carbon ? M2Grade.carbon[steps[i]]!.$1 : M2Grade.health[steps[i] as int], borderRadius: const BorderRadius.all(Radius.circular(M2Layout.scaleBar / 2)))),
              ]),
            ),
        ],
      ]);

  @override
  Widget build(BuildContext context) {
    if (health == null && carbon == null) return const SizedBox.shrink();
    final b = M2Text.lblRow.style(M2Color.dm).copyWith(fontWeight: bold700);
    final rows = <Widget>[
      if (health != null)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: M2Layout.ratingPad),
          child: Semantics(
            label: 'Healthfulness $health of 7',
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text('Healthfulness', style: b), const SizedBox(width: _rowGap), _scale(ScoreKind.health, [for (var i = 0; i < 8; i++) i], health!, M2Layout.hscaleW)]),
          ),
        ),
      if (carbon != null)
        Container(
          decoration: health == null ? null : const BoxDecoration(border: Border(top: BorderSide(color: M2Color.dm, width: _hair))),
          padding: const EdgeInsets.symmetric(vertical: M2Layout.ratingPad),
          child: Semantics(
            label: 'Carbon rating $carbon',
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text('Carbon rating', style: b), const SizedBox(width: _rowGap), _scale(ScoreKind.carbon, const ['A', 'B', 'C', 'D', 'E'], carbon!, M2Layout.cscaleW)]),
              Padding(padding: const EdgeInsets.only(top: M2Layout.gradeNoteTop), child: _carbonNote(carbonBand[carbon]!)),
            ]),
          ),
        ),
    ];
    return Container(
      color: M2Color.white,
      padding: const EdgeInsets.symmetric(horizontal: _frame + _padX, vertical: _frame),
      foregroundDecoration: const BoxDecoration(border: Border.fromBorderSide(BorderSide(color: M2Color.dm, width: _frame))),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: rows),
    );
  }
}
