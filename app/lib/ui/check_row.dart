import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'press.dart';

class _CheckPainter extends CustomPainter {
  final bool on;
  const _CheckPainter(this.on);
  @override
  void paint(Canvas canvas, Size s) {
    final r = RRect.fromRectAndRadius(Offset.zero & s, const Radius.circular(M2Layout.checkRadius));
    if (!on) {
      canvas.drawRRect(r.deflate(M2Layout.checkRing / 2), Paint()..color = M2Color.slate..style = PaintingStyle.stroke..strokeWidth = M2Layout.checkRing);
      return;
    }
    canvas.drawRRect(r, Paint()..color = M2Color.vm);
    // `::after`: a 12 x 7 L with a 2.5 left and bottom border, rotated -45deg and lifted 2 dp
    canvas.save();
    canvas.translate(s.width / 2, s.height / 2 - M2Layout.checkLift);
    canvas.rotate(-0.7853981633974483);
    final p = Paint()..color = M2Color.white..style = PaintingStyle.stroke..strokeWidth = M2Layout.checkStroke;
    canvas.drawPath(Path()..moveTo(-M2Layout.checkW / 2 + M2Layout.checkStroke / 2, -M2Layout.checkH / 2)..lineTo(-M2Layout.checkW / 2 + M2Layout.checkStroke / 2, M2Layout.checkH / 2 - M2Layout.checkStroke / 2)..lineTo(M2Layout.checkW / 2, M2Layout.checkH / 2 - M2Layout.checkStroke / 2), p);
    canvas.restore();
  }

  @override
  bool shouldRepaint(_CheckPainter o) => o.on != on;
}

/// `.check`: a 56 dp checkbox row. The 26 dp box is a ring when off and filled maroon with a white tick when on. `lead` sits before
/// the label (a score tile on "Show on dishes"); `line` is the quiet line under the label.
class CheckRow extends StatelessWidget {
  final String label;
  final String? line;
  final Widget? lead;
  final bool on, last;
  final ValueChanged<bool> onChanged;
  const CheckRow({super.key, required this.label, required this.on, required this.onChanged, this.line, this.lead, this.last = false});
  @override
  Widget build(BuildContext context) => Semantics(
        checked: on, label: label, inMutuallyExclusiveGroup: false,
        child: Press(
          overlay: M2Color.pressRow, semantics: false, onTap: () => onChanged(!on),
          child: Container(
            constraints: const BoxConstraints(minHeight: M2Layout.areaRowMin),
            decoration: BoxDecoration(border: last ? null : const Border(bottom: BorderSide(color: M2Color.hair))),
            child: ExcludeSemantics(
              child: Row(children: [
                Expanded(
                  child: Row(children: [
                    if (lead != null) ...[lead!, const SizedBox(width: M2Space.panel)],
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(label, style: M2Text.rowName.style(M2Color.ink)),
                        if (line != null) Padding(padding: const EdgeInsets.only(top: M2Layout.areaMetaGap), child: Text(line!, style: M2Text.meta.style(M2Color.slate))),
                      ]),
                    ),
                  ]),
                ),
                CustomPaint(size: const Size.square(M2Layout.checkSize), painter: _CheckPainter(on)),
              ]),
            ),
          ),
        ),
      );
}
