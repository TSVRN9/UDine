import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'press.dart';

/// M2's `.lgrad`: the deep-maroon left grade a band's text sits on.
class BandGrade extends StatelessWidget {
  const BandGrade({super.key});
  @override
  Widget build(BuildContext context) => IgnorePointer(
        child: DecoratedBox(
          position: DecorationPosition.background,
          decoration: BoxDecoration(gradient: LinearGradient(colors: M2Gradient.band.colors, stops: M2Gradient.band.stops)),
          child: const SizedBox.expand(),
        ),
      );
}

/// A hall band (112) or pinned café (84, `compact`): photo slot, M2's left grade, name and status. `letter` is a slot (see
/// HallLetter). `ghost` is the band's copy drawn over the screen it opens into: no ground, no margin, no touches, and its grade is
/// the caller's (M2 fades the grade with `1 - p`, the copy's text and letter with the early fade).
class Band extends StatelessWidget {
  final String name;
  final String? status;
  final Widget? busy, photo, letter;
  final bool compact, ghost;
  /// Search's hall card: a band at 76 dp, with no letter, its status and busy meter on one line
  final bool card;
  final VoidCallback? onTap;
  /// the status and busy fade in on this when they arrive late (a slow load or a retry)
  final Animation<double>? fade;
  const Band({super.key, required this.name, this.status, this.busy, this.photo, this.letter, this.compact = false, this.card = false, this.ghost = false, this.onTap, this.fade});

  @override
  Widget build(BuildContext context) {
    final h = card ? M2Layout.cardH : compact ? M2Layout.bandCompact : M2Size.band, small = compact || card;
    Widget late(Widget c) => fade == null ? c : FadeTransition(opacity: fade!, child: c);
    final body = SizedBox(
      height: h,
      child: ClipRect(
        child: Stack(children: [
          if (!ghost) const Positioned.fill(child: ColoredBox(color: M2Color.vm)),
          ?photo,
          if (!ghost) const Positioned.fill(child: BandGrade()),
          ?letter,
          Positioned(
            left: M2Space.gutter, top: card ? M2Layout.cardTextTop : compact ? M2Space.pinTextTop : M2Space.bandTextTop,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(name, style: (small ? M2Text.pinName : M2Text.bandName).style(M2Color.white)),
              if (card)
                if ((status != null && status!.isNotEmpty) || busy != null)
                  Padding(
                    padding: const EdgeInsets.only(top: M2Layout.statusGapPin),
                    child: late(Row(mainAxisSize: MainAxisSize.min, children: [
                      if (status != null && status!.isNotEmpty) Text(status!, style: M2Text.statusSm.style(M2Color.onDmSoft)),
                      if (status != null && status!.isNotEmpty && busy != null) const SizedBox(width: M2Layout.cardMeterGap),
                      ?busy,
                    ])),
                  )
              else ...[
                if (status != null && status!.isNotEmpty)
                  Padding(
                    padding: EdgeInsets.only(top: compact ? M2Layout.statusGapPin : M2Layout.statusGapBand),
                    child: late(Text(status!, style: (compact ? M2Text.statusSm : M2Text.status).style(M2Color.onDmSoft))),
                  ),
                if (busy != null) late(busy!),
              ],
            ]),
          ),
        ]),
      ),
    );
    if (ghost) return IgnorePointer(child: body);
    return Padding(
      padding: const EdgeInsets.only(top: M2Layout.seam),
      child: Semantics(
        container: true, button: true, label: [name, ?status].join(', '),
        child: Press(onTap: onTap, overlay: M2Color.pressBand, child: ExcludeSemantics(child: body)),
      ),
    );
  }
}
