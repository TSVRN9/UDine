import 'package:flutter/widgets.dart';
import '../logic/dish_sheet.dart';
import '../theme/tokens.dart';

/// `.facts`: plate and day totals in the label's frame: Calories big over a thick rule, then Protein, Carbs and Fat.
class Facts extends StatelessWidget {
  final double cal, p, c, f;
  final String big;
  const Facts({super.key, required this.cal, required this.p, required this.c, required this.f, this.big = 'Calories'});

  Widget _nr(String name, double v, {bool last = false}) => Container(
        padding: const EdgeInsets.only(top: M2Layout.factRowTop, bottom: M2Layout.factRowBottom),
        decoration: BoxDecoration(border: last ? null : const Border(bottom: BorderSide(color: M2Color.dm))),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
          Text(name, style: M2Text.factRow.normal().style(M2Color.dm)),
          Text('${f1(v)}g', style: M2Text.factNum.normal().style(M2Color.dm)),
        ]),
      );

  @override
  Widget build(BuildContext context) => Container(
        color: M2Color.white,
        padding: const EdgeInsets.fromLTRB(2 + 12, 2 + 4, 2 + 12, 2 + 6),
        foregroundDecoration: const BoxDecoration(border: Border.fromBorderSide(BorderSide(color: M2Color.dm, width: 2))),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Container(
            padding: const EdgeInsets.only(top: M2Layout.calPadTop, bottom: M2Layout.calPadBottom),
            decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: M2Color.dm, width: M2Layout.factCalBottom))),
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(big, style: M2Text.lblLg.normal().style(M2Color.dm).copyWith(fontWeight: bold700)),
              Text(fc(cal), style: M2Text.calNum.style(M2Color.dm)),
            ]),
          ),
          _nr('Protein', p),
          _nr('Carbs', c),
          _nr('Fat', f, last: true),
        ]),
      );
}
