import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';

/// M2's `.meter`: five 5x12 lamps, lit ones gold, on a hall band or header.
class Meter extends StatelessWidget {
  final int lit;
  const Meter({super.key, required this.lit});
  @override
  Widget build(BuildContext context) => ExcludeSemantics(
        child: Row(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.end, children: [
          for (var i = 0; i < 5; i++) ...[
            if (i > 0) const SizedBox(width: M2Layout.lampGap),
            Container(width: M2Layout.lampW, height: M2Layout.lampH, decoration: BoxDecoration(color: i < lit ? M2Color.gold : M2Color.lampOff, borderRadius: BorderRadius.circular(M2Layout.lampRadius))),
          ],
        ]),
      );
}

/// M2's `.bz`: the meter and the word; in the header `extra` ("Calmer around 1:30 PM") is a second line.
class BusyRow extends StatelessWidget {
  final int lamps;
  final String word;
  final String? extra;
  final bool header;
  const BusyRow({super.key, required this.lamps, required this.word, this.extra, this.header = false});
  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.only(top: header ? M2Layout.busyTopHeader : M2Layout.busyTopBand),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: header ? M2Layout.busyMaxHeader : double.infinity),
          child: Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: M2Layout.busyGap, runSpacing: M2Layout.busyRunGap, children: [
            Meter(lit: lamps),
            Text(word, style: M2Text.statusSm.style(M2Color.white)),
            if (header && extra != null && extra!.isNotEmpty)
              SizedBox(width: double.infinity, child: Text(extra!, style: M2Text.statusSm.style(M2Color.onDmSoft))),
          ]),
        ),
      );
}
