import 'package:flutter/widgets.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';

/// `#bfoot`: the builder's action pinned to the sheet's foot, in the plate bar's material: the bowl's calories and protein live, a gold
/// Add (Update for a bowl already on the plate), off at 0. The figures settle (0.4 to 1) each time the bowl changes.
class BowlFoot extends StatelessWidget {
  const BowlFoot({super.key, required this.cal, required this.protein, required this.update, required this.off, required this.onTap});
  final num? cal;
  final num? protein;
  final bool update, off;
  final VoidCallback onTap;

  /// 8 above the 48 dp button, 8 and the bottom inset below it.
  static double heightFor(BuildContext c) => M2Layout.btnM + 2 * M2Layout.barPadTop + safeBottom(c);

  @override
  Widget build(BuildContext context) {
    final num_ = M2Text.barNum.style(M2Color.white), unit = M2Text.meta.style(M2Color.onDm);
    return Container(
      height: heightFor(context),
      color: M2Color.dm,
      padding: EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.barPadTop, M2Layout.barPadRight, M2Layout.barPadTop + safeBottom(context)),
      child: Row(children: [
        Expanded(
          child: Align(
            alignment: Alignment.centerLeft,
            child: SettleFade(
              value: '${fc(cal)}|${fg(protein)}',
              child: Row(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
                Text(fc(cal), style: num_), const SizedBox(width: M2Layout.barNumGap), Text('cal', style: unit),
                const SizedBox(width: M2Layout.barUnitGap),
                Text(fg(protein), style: num_), const SizedBox(width: M2Layout.barNumGap), Text('protein', style: unit),
              ]),
            ),
          ),
        ),
        const SizedBox(width: M2Layout.barGap),
        Opacity(opacity: off ? M2Opacity.footDisabled : 1, child: Button(kind: ButtonKind.gold, label: update ? 'Update' : 'Add', onTap: off ? null : onTap)),
      ]),
    );
  }
}
