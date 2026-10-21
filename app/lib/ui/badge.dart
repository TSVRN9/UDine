import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'boxes.dart';
import 'felt.dart';
import 'hall_letter.dart';
import 'mark_glyph.dart';

/// The diet patch (`.tg`): gold felt, maroon stitch, a 12 dp glyph. Plant based is a sprout, vegetarian a leaf.
class Badge extends StatelessWidget {
  final Glyph glyph;
  final String label;
  const Badge(this.glyph, {super.key, required this.label});
  @override
  Widget build(BuildContext context) => Semantics(
        image: true, label: label,
        child: Felt(width: M2Layout.patch, height: M2Layout.patch, child: MarkGlyph(glyph, color: M2Color.dm, size: M2Layout.patchGlyph)),
      );

  /// The diet patch a row shows: plant based wins over vegetarian; other diets show on the sheet only.
  static Badge? forDiet(int diet) =>
      diet & 2 != 0 ? const Badge(Glyph.plant, label: 'Plant based') : diet & 1 != 0 ? const Badge(Glyph.veg, label: 'Vegetarian') : null;

  /// A name with its patch and favourite star: the last word and its marks never parted (M2 `nameHTML` puts them in a nowrap span), the patch's
  /// baseline [M2Layout.patchBaseline] from its top, so it hangs 7 dp below the text's baseline.
  static InlineSpan name(String text, TextStyle style, {Widget? badge, Widget? star}) {
    text = text.replaceAll('/', '/\u2060'); // the browser never breaks after a slash (`w/Bacon`); ICU does, so a word joiner holds it
    if (badge == null && star == null) return TextSpan(text: text, style: style);
    final i = text.lastIndexOf(' ');
    return TextSpan(style: style, children: [
      TextSpan(text: text.substring(0, i + 1)),
      WidgetSpan(
        alignment: PlaceholderAlignment.baseline, baseline: TextBaseline.alphabetic,
        child: Row(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
          Text(text.substring(i + 1), style: style, textScaler: TextScaler.noScaling), // (the paragraph already scales a placeholder's child: scaled here too, the word grows twice)
          if (badge != null)
            Padding(padding: const EdgeInsets.only(left: M2Layout.patchLeft), child: BaselineAt(baseline: M2Layout.patchBaseline, child: badge)),
          if (star != null) BaselineAt(baseline: M2Layout.starBaseline, child: star),
        ]),
      ),
    ]);
  }
}

/// A mark on the dish sheet (`.mk`): glyph and label on a stitched felt patch.
class MarkPatch extends StatelessWidget {
  final Glyph glyph;
  final String label;
  const MarkPatch(this.glyph, this.label, {super.key});
  @override
  Widget build(BuildContext context) => Semantics(
        label: label,
        child: ExcludeSemantics(
          child: Felt(
            height: M2Layout.markH, radius: M2Felt.markRadius, inset: M2Felt.markInset, innerRadius: M2Felt.markStitchRadius,
            padding: const EdgeInsets.only(left: M2Layout.markPadL, right: M2Layout.markPadR),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              MarkGlyph(glyph, color: M2Color.dm, size: M2Layout.markGlyph),
              const SizedBox(width: M2Layout.markGap),
              Text(label, style: M2Text.mark.style(M2Color.dm)),
            ]),
          ),
        ),
      );
}

/// A hall's varsity-letter chip (`.hchip`): deep maroon, the letter on a stitched gold patch, then the hall's name. A café has no
/// letter: its name alone.
class HallChip extends StatelessWidget {
  final String? letter;
  final String name;
  const HallChip({super.key, this.letter, required this.name});
  @override
  Widget build(BuildContext context) => Container(
        height: M2Layout.hchipH,
        padding: EdgeInsets.only(left: letter == null ? M2Layout.hchipPadR : M2Layout.hchipPadL, right: M2Layout.hchipPadR),
        decoration: const BoxDecoration(color: M2Color.dm, borderRadius: BorderRadius.all(Radius.circular(M2Radius.button))),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (letter != null) ...[
            Felt(width: M2Layout.hl, height: M2Layout.hl, child: PatchLetter(letter!, size: M2Layout.hl, font: M2Text.letter.size, color: M2Color.dm)),
            const SizedBox(width: M2Layout.hchipGap),
          ],
          Text(name, style: M2Text.chip.style(M2Color.white)),
        ]),
      );
}
