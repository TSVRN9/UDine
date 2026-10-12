import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';

class _ChevronPainter extends CustomPainter {
  final bool back;
  final Color color;
  const _ChevronPainter(this.back, this.color);
  @override
  void paint(Canvas canvas, Size s) {
    canvas.scale(s.width / 24); // both glyphs are drawn on a 24 viewBox
    final path = back
        ? (Path()..moveTo(15, 5)..relativeLineTo(-7, 7)..relativeLineTo(7, 7)) // M15 5l-7 7 7 7
        : (Path()..moveTo(9, 6)..relativeLineTo(6, 6)..relativeLineTo(-6, 6)); // M9 6l6 6-6 6
    canvas.drawPath(path, Paint()..color = color..style = PaintingStyle.stroke..strokeWidth = M2Layout.chevronStroke..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round);
  }

  @override
  bool shouldRepaint(_ChevronPainter old) => old.back != back || old.color != color;
}

/// The row chevron (`back: false`, slate, 18) and the page's back chevron (`back: true`, white, 24).
class Chevron extends StatelessWidget {
  final bool back;
  final Color color;
  final double size;
  const Chevron({super.key, this.back = false, this.color = M2Color.slate, this.size = M2Layout.chevron});
  @override
  Widget build(BuildContext context) => CustomPaint(size: Size(size, size), painter: _ChevronPainter(back, color));
}
