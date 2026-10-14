import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'svg_path.dart';

enum ScoreKind { health, carbon }
enum ScoreSize { row, sheet, scale }

// M2 `tileSVG` (viewBox 24 x 30): a portrait rounded tile, a white pictogram, the value knocked into it in the tile's ink.
final _foot = svgPath('M4.2 12.4C4.2 8.9 7.6 7.4 12 7.4s7.8 1.5 7.8 5c0 3-1.4 4.6-1.4 8 0 4.4-2.6 7.4-6.4 7.4s-6.4-3-6.4-7.4c0-3.4-1.8-5-1.8-8Z');
final _heart = svgPath('M12 27.6C5.9 23.2 1.8 19.4 1.8 12.9 1.8 8.7 4.7 5.6 8.4 5.6c1.6 0 2.9.7 3.6 2 .7-1.3 2-2 3.6-2 3.7 0 6.6 3.1 6.6 7.3 0 6.5-4.1 10.3-10.2 14.7Z');
const _toes = [(Offset(15.6, 4.3), 2.0), (Offset(11.3, 3.4), 1.5), (Offset(7.6, 4.4), 1.25)];
const _edgeCarbon = {'B', 'C', 'D'}; // a light tile (under 3:1 on chalk) gets a 1 px edge in its ink
const _edgeBelow = 4; // healthfulness tiles below this value

class _TilePainter extends CustomPainter {
  final ScoreKind kind;
  final Object value;
  const _TilePainter(this.kind, this.value);
  @override
  void paint(Canvas canvas, Size s) {
    final carbon = kind == ScoreKind.carbon;
    final (bg, ink) = carbon ? M2Grade.carbon[value as String]! : (M2Grade.health[value as int], M2Grade.healthInk);
    final edge = carbon ? _edgeCarbon.contains(value) : (value as int) < _edgeBelow;
    canvas.scale(s.width / 24);
    final r = RRect.fromRectAndRadius(const Rect.fromLTWH(0.5, 0.5, 23, 29), const Radius.circular(4.5));
    canvas.drawRRect(r, Paint()..color = bg);
    if (edge) canvas.drawRRect(r, Paint()..color = ink.withValues(alpha: 0.55)..style = PaintingStyle.stroke..strokeWidth = 1);
    final white = Paint()..color = M2Color.white;
    if (carbon) {
      for (final (c, rad) in _toes) {
        canvas.drawCircle(c, rad, white);
      }
      canvas.drawPath(_foot, white);
    } else {
      canvas.drawPath(_heart, white);
    }
    final tp = TextPainter(
      text: TextSpan(text: '$value', style: M2Text.tile.style(ink).copyWith(height: 1)), textDirection: TextDirection.ltr, textAlign: TextAlign.center,
    )..layout();
    // the figure's baseline sits at y 22.9 (carbon) or 20.6 (health); SVG text anchors on the baseline
    final base = carbon ? 22.9 : 20.6;
    tp.paint(canvas, Offset(12 - tp.width / 2, base - tp.computeDistanceToActualBaseline(TextBaseline.alphabetic)));
  }

  @override
  bool shouldRepaint(_TilePainter o) => o.kind != kind || o.value != value;
}

/// A score tile (`.tile`): healthfulness 0..7 on a blue ramp, carbon A..E in UMass's own colours. An unscored dish (a null value)
/// draws nothing and takes no room, so no row or sheet leaves an empty slot.
class ScoreBadge extends StatelessWidget {
  final ScoreKind kind;
  final Object? value;
  final ScoreSize size;
  const ScoreBadge({super.key, required this.kind, required this.value, this.size = ScoreSize.row});
  @override
  Widget build(BuildContext context) {
    if (value == null) return const SizedBox.shrink();
    final (w, h) = switch (size) { ScoreSize.row => M2Size.tile, ScoreSize.sheet => M2Size.tileSheet, ScoreSize.scale => M2Size.tileScale };
    return Semantics(
      image: true, label: kind == ScoreKind.health ? 'Healthfulness $value of 7' : 'Carbon rating $value',
      child: ExcludeSemantics(child: CustomPaint(size: Size(w, h), painter: _TilePainter(kind, value!))),
    );
  }
}
