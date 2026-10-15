import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'press.dart';

/// `.chip`: a 44 dp filter chip. Off: a 1.5 dp slate ring over chalk. On (`aria-pressed`): tonal, `tint` ground, maroon ring, bold, and a
/// check before the label (M3's selected filter chip, never a filled button).
class FilterChipButton extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback? onTap;
  const FilterChipButton({super.key, required this.label, required this.selected, this.onTap});

  static const _off = M2Type(15, null, 'LibreFranklin', FontWeight.w500), _on = M2Type(15, null, 'LibreFranklin', FontWeight.w600);

  @override
  Widget build(BuildContext context) => Semantics(
        container: true, button: true, selected: selected, label: label,
        child: Press(
          scale: true, onTap: onTap, semantics: false,
          child: ExcludeSemantics(
            child: Container(
              height: M2Size.tap,
              padding: const EdgeInsets.symmetric(horizontal: M2Layout.chipPadX),
              decoration: BoxDecoration(
                color: selected ? M2Color.tint : null,
                borderRadius: const BorderRadius.all(Radius.circular(M2Radius.button)),
                border: Border.all(color: selected ? M2Color.vm : M2Layout.chipRing, width: M2Layout.rule),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                if (selected) ...[const _Check(), const SizedBox(width: M2Layout.chipGap)],
                Text(label, style: (selected ? _on : _off).style(selected ? M2Color.dm : M2Color.ink), maxLines: 1),
              ]),
            ),
          ),
        ),
      );
}

class _Check extends StatelessWidget {
  const _Check();
  @override
  Widget build(BuildContext context) => const SizedBox(width: M2Layout.checkMarkW, height: M2Layout.checkMarkW, child: CustomPaint(painter: _CheckPainter()));
}

/// `border: solid; border-width: 0 0 2px 2px; transform: rotate(-45deg)` on a 10 x 5 box: a tick in the dark maroon.
class _CheckPainter extends CustomPainter {
  const _CheckPainter();
  @override
  void paint(Canvas canvas, Size s) {
    final p = Paint()..color = M2Color.dm..style = PaintingStyle.stroke..strokeWidth = M2Layout.checkMarkStroke..strokeJoin = StrokeJoin.miter;
    const w = M2Layout.checkMarkW, h = M2Layout.checkMarkH;
    canvas.drawPath(Path()..moveTo(0, h)..lineTo(w * 0.35, h * 1.8)..lineTo(w, 0), p);
  }

  @override
  bool shouldRepaint(_CheckPainter old) => false;
}
