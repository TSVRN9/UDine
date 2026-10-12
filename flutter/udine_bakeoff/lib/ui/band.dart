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
  final VoidCallback? onTap;
  const Band({super.key, required this.name, this.status, this.busy, this.photo, this.letter, this.compact = false, this.ghost = false, this.onTap});

  @override
  Widget build(BuildContext context) {
    final h = compact ? M2Layout.bandCompact : M2Size.band;
    final body = SizedBox(
      height: h,
      child: ClipRect(
        child: Stack(children: [
          if (!ghost) const Positioned.fill(child: ColoredBox(color: M2Color.vm)),
          ?photo,
          if (!ghost) const Positioned.fill(child: BandGrade()),
          ?letter,
          Positioned(
            left: M2Space.gutter, top: compact ? M2Space.pinTextTop : M2Space.bandTextTop,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(name, style: (compact ? M2Text.pinName : M2Text.bandName).style(M2Color.white)),
              if (status != null && status!.isNotEmpty)
                Padding(
                  padding: EdgeInsets.only(top: compact ? M2Layout.statusGapPin : M2Layout.statusGapBand),
                  child: Text(status!, style: (compact ? M2Text.statusSm : M2Text.status).style(M2Color.onDmSoft)),
                ),
              ?busy,
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
