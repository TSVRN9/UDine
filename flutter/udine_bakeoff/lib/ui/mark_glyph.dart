import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'svg_path.dart';

/// M2's drawn marks (`GL`, 16 x 16): never emoji. Plant based is a sprout, vegetarian a single leaf, halal a ringed H-like glyph,
/// local a pin, sustainable a cycle arrow.
enum Glyph { plant, veg, halal, local, sus }

final _plantStem = svgPath('M8 15.2V8');
final _plantLeaves = svgPath('M7.6 9.6C7.6 5.6 5.4 3.4 1 3.4 1 7.6 3.4 9.6 7.6 9.6Z M8.4 8.2C8.4 4.2 10.8 1.4 15 1.4 15 5.6 12.6 8.2 8.4 8.2Z');
final _vegLeaf = svgPath('M3 13C3 6 7 3 13.5 2.5 13.5 9 10 13 3 13Z');
final _vegVein = svgPath('M3 13 9 7');
final _halalBars = svgPath('M5.5 5v6M10.5 5v6M5.5 8h5');
final _localPin = svgPath('M8 14.5S3 9.6 3 6.5a5 5 0 0 1 10 0c0 3.1-5 8-5 8Z');
final _susCycle = svgPath('M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.5h-2.5');

class _GlyphPainter extends CustomPainter {
  final Glyph g;
  final Color color;
  const _GlyphPainter(this.g, this.color);
  @override
  void paint(Canvas canvas, Size s) {
    canvas.scale(s.width / 16);
    Paint stroke(double w, [Color? c]) => Paint()..color = c ?? color..style = PaintingStyle.stroke..strokeWidth = w..strokeCap = StrokeCap.butt;
    final fill = Paint()..color = color;
    switch (g) {
      case Glyph.plant:
        canvas.drawPath(_plantStem, stroke(2)..strokeCap = StrokeCap.round);
        canvas.drawPath(_plantLeaves, fill);
      case Glyph.veg:
        canvas.drawPath(_vegLeaf, fill);
        canvas.drawPath(_vegVein, stroke(1.2, M2Color.white)); // the vein is white in M2 (stroke="#fff")
      case Glyph.halal:
        canvas.drawCircle(const Offset(8, 8), 6, stroke(1.5));
        canvas.drawPath(_halalBars, stroke(1.5));
      case Glyph.local:
        canvas.drawPath(_localPin, stroke(1.5));
        canvas.drawCircle(const Offset(8, 6.5), 1.6, fill);
      case Glyph.sus:
        canvas.drawPath(_susCycle, stroke(1.5));
    }
  }

  @override
  bool shouldRepaint(_GlyphPainter o) => o.g != g || o.color != color;
}

class MarkGlyph extends StatelessWidget {
  final Glyph glyph;
  final Color color;
  final double size;
  const MarkGlyph(this.glyph, {super.key, required this.color, required this.size});
  @override
  Widget build(BuildContext context) => ExcludeSemantics(child: CustomPaint(size: Size.square(size), painter: _GlyphPainter(glyph, color)));
}
