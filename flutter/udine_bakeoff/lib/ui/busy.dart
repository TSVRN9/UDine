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
            if (i > 0) const SizedBox(width: 2),
            Container(width: 5, height: 12, decoration: BoxDecoration(color: i < lit ? M2Color.gold : M2Color.lampOff, borderRadius: BorderRadius.circular(1))),
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
        padding: EdgeInsets.only(top: header ? 8 : 6),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: header ? 230 : double.infinity),
          child: Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 8, runSpacing: 5, children: [
            Meter(lit: lamps),
            Text(word, style: M2Text.statusSm.style(M2Color.white)),
            if (header && extra != null && extra!.isNotEmpty)
              SizedBox(width: double.infinity, child: Text(extra!, style: M2Text.statusSm.style(M2Color.onDmSoft))),
          ]),
        ),
      );
}
