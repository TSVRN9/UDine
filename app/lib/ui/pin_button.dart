import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'press.dart';

class _PinPainter extends CustomPainter {
  final bool on;
  const _PinPainter(this.on);
  @override
  void paint(Canvas canvas, Size s) {
    canvas.scale(s.width / 24); // drawn on a 24 viewBox: M9 3h6l-1 6.5 3.5 3.5h-11L10 9.5 9 3z, and M12 13v8
    final head = Path()..moveTo(9, 3)..relativeLineTo(6, 0)..relativeLineTo(-1, 6.5)..relativeLineTo(3.5, 3.5)..relativeLineTo(-11, 0)..lineTo(10, 9.5)..close();
    final stem = Path()..moveTo(12, 13)..relativeLineTo(0, 8);
    Paint stroke(Color c) => Paint()..color = c..style = PaintingStyle.stroke..strokeWidth = M2Layout.pinGlyphStroke..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round;
    final blur = MaskFilter.blur(BlurStyle.normal, M2Layout.chevronShadowSigma);
    canvas.save();
    canvas.translate(0, M2Layout.chevronShadowDy);
    if (on) canvas.drawPath(head, Paint()..color = M2Layout.chevronShadow..maskFilter = blur);
    canvas.drawPath(head, stroke(M2Layout.chevronShadow)..maskFilter = blur);
    canvas.drawPath(stem, stroke(M2Layout.chevronShadow)..maskFilter = blur);
    canvas.restore();
    if (on) canvas.drawPath(head, Paint()..color = M2Color.white);
    canvas.drawPath(head, stroke(M2Color.white));
    canvas.drawPath(stem, stroke(M2Color.white));
  }

  @override
  bool shouldRepaint(_PinPainter old) => old.on != on;
}

/// `.icon.pinb` in the page's controls (`#mctl`): a 48 dp target, a white pin that fills when the place is pinned, with the same
/// drop shadow as the back chevron so it reads on any photo.
class PinButton extends StatelessWidget {
  final bool pinned;
  final VoidCallback? onTap;
  const PinButton({super.key, required this.pinned, this.onTap});
  @override
  Widget build(BuildContext context) => Semantics(
        button: true, toggled: pinned, label: pinned ? 'Unpin from Halls' : 'Pin to Halls',
        child: Press(
          scale: true, onTap: onTap, semantics: false,
          child: ExcludeSemantics(
            child: SizedBox(width: M2Layout.backBtn, height: M2Layout.backBtn, child: Center(child: CustomPaint(size: const Size.square(M2Layout.backSize), painter: _PinPainter(pinned)))),
          ),
        ),
      );
}
