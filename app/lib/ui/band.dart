import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'press.dart';

/// M2's `.lgrad`: the deep-maroon left grade a band's text sits on.
class BandGrade extends StatelessWidget {
  /// A gradient fades by scaling its colours' alpha, which is the same pixels as an `Opacity` over it without an offscreen layer.
  final double opacity;
  const BandGrade({super.key, this.opacity = 1});
  @override
  Widget build(BuildContext context) => IgnorePointer(
        child: DecoratedBox(
          position: DecorationPosition.background,
          decoration: BoxDecoration(gradient: LinearGradient(colors: [for (final c in M2Gradient.band.colors) c.withValues(alpha: c.a * opacity)], stops: M2Gradient.band.stops)),
          child: const SizedBox.expand(),
        ),
      );
}

/// The parts of a band that a hall's header draws again, by key: the card's copy of each shared element, which the header reads to
/// carry it (`Travel`). `letter` and `meter` go on the caller's own widgets; `name` and `status` are the band's texts.
class BandParts {
  BandParts({this.hasLetter = true, this.hasStatus = true, this.hasMeter = true});
  final letter = GlobalKey(), name = GlobalKey(), status = GlobalKey(), meter = GlobalKey();
  /// which of them the card drew: what it did not draw has nothing to travel from, and fades in with the page instead (M2 `sh && sh.k ? 1 : fin`)
  final bool hasLetter, hasStatus, hasMeter;
}

/// A hall band (112) or pinned café (84, `compact`): photo slot, M2's left grade, name and status. `letter` is a slot (see
/// HallLetter). `ghost` is the band's copy laid out, never painted, in the page it opens into, so the page can read where the card
/// drew each part (`parts`); the page's own elements travel from there.
class Band extends StatelessWidget {
  final String name;
  final String? status;
  final Widget? busy, photo, letter;
  final bool compact, ghost;
  /// a favourite is served here (M2 `.bstar`); named for a screen reader, never captioned
  final bool star;
  /// Search's hall card: a band at 76 dp, with no letter, its status and busy meter on one line
  final bool card;
  final VoidCallback? onTap;
  final BandParts? parts;
  /// the status and busy fade in on this when they arrive late (a slow load or a retry)
  final Animation<double>? fade;
  const Band({super.key, required this.name, this.status, this.busy, this.photo, this.letter, this.compact = false, this.card = false, this.ghost = false, this.star = false, this.onTap, this.fade, this.parts});

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
              if (star && !ghost)
                Row(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(name, key: parts?.name, style: (small ? M2Text.pinName : M2Text.bandName).style(M2Color.white)),
                  Padding(
                    padding: EdgeInsets.only(left: M2Layout.starGap, top: card ? M2Layout.starTopCard : M2Layout.starTopBand),
                    child: const Text('★', style: TextStyle(fontSize: M2Layout.starSize, height: 1, color: M2Color.gold)),
                  ),
                ])
              else
                Text(name, key: parts?.name, style: (small ? M2Text.pinName : M2Text.bandName).style(M2Color.white)),
              if (card) ...[
                if ((status != null && status!.isNotEmpty) || busy != null)
                  Padding(
                    padding: const EdgeInsets.only(top: M2Layout.statusGapPin),
                    child: late(Row(mainAxisSize: MainAxisSize.min, children: [
                      if (status != null && status!.isNotEmpty) Text(status!, key: parts?.status, style: M2Text.statusSm.style(M2Color.onDmSoft)),
                      if (status != null && status!.isNotEmpty && busy != null) const SizedBox(width: M2Layout.cardMeterGap),
                      ?busy,
                    ])),
                  ),
              ] else ...[
                if (status != null && status!.isNotEmpty)
                  Padding(
                    padding: EdgeInsets.only(top: compact ? M2Layout.statusGapPin : M2Layout.statusGapBand),
                    child: late(Text(status!, key: parts?.status, style: (compact ? M2Text.statusSm : M2Text.status).style(M2Color.onDmSoft))),
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
        container: true, button: true, label: [name, if (star) 'serves a favorite', ?status].join(', '),
        child: Press(onTap: onTap, overlay: M2Color.pressBand, child: ExcludeSemantics(child: body)),
      ),
    );
  }
}
