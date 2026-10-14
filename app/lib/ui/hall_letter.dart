import 'dart:ui' as ui;
import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'letter_paths.dart';

ui.Path _outline(String letter, double fontSize) {
  final p = ui.Path();
  final nums = RegExp(r'-?\d+\.\d+');
  for (final m in RegExp(r'([MLQZ])([^MLQZ]*)').allMatches(letterPaths[letter]!)) {
    final v = [for (final n in nums.allMatches(m[2]!)) double.parse(n[0]!) * fontSize];
    switch (m[1]) {
      case 'M': p.moveTo(v[0], v[1]);
      case 'L': p.lineTo(v[0], v[1]);
      case 'Q': p.quadraticBezierTo(v[0], v[1], v[2], v[3]);
      default: p.close();
    }
  }
  return p;
}

/// `stroke-dasharray` along every contour.
ui.Path _dashed(ui.Path src, double on, double off) {
  final out = ui.Path();
  for (final m in src.computeMetrics()) {
    for (var d = 0.0; d < m.length; d += on + off) {
      out.addPath(m.extractPath(d, (d + on).clamp(0, m.length)), Offset.zero);
    }
  }
  return out;
}

// The outline is parsed and its stitch laid out once per letter, box size and x, never per paint.
final _cache = <(String, double, double), (ui.Path, ui.Path)>{};
(ui.Path, ui.Path) _shapes(String letter, double x, double size) => _cache.putIfAbsent((letter, x, size), () {
      final path = _outline(letter, M2Layout.letterFont * (size / M2Layout.letterBox)).shift(Offset(x, size * M2Layout.letterBaseline));
      return (path, _dashed(path, M2Layout.stitchOn, M2Layout.stitchOff));
    });

/// How many times a hall letter has been painted (tests: a scroll or a fade must not repaint it).
int letterPaints = 0;

class _LetterPainter extends CustomPainter {
  final String letter;
  final double x, size;
  const _LetterPainter(this.letter, this.x, this.size);
  @override
  void paint(Canvas canvas, Size _) {
    letterPaints++;
    final (path, stitch) = _shapes(letter, x, size);
    canvas.drawPath(path, Paint()..color = M2Color.white);
    canvas.drawPath(path, Paint()..color = M2Color.white..style = PaintingStyle.stroke..strokeWidth = M2Layout.feltStroke..strokeJoin = StrokeJoin.round);
    canvas.drawPath(path, Paint()..color = M2Color.gold);
    canvas.drawPath(stitch, Paint()..color = M2Color.dm..style = PaintingStyle.stroke..strokeWidth = M2Layout.stitchStroke);
  }

  @override
  bool shouldRepaint(_LetterPainter o) => o.letter != letter || o.x != x || o.size != size;
}

/// The band's chenille varsity letter: felt (white, stroked) under a gold fill with a dashed maroon stitch. The box is
/// right-aligned to its parent Stack; `x` is the text's start x inside it (`hallLx`), so the letter keeps its distance from
/// the right edge at any width.
class HallLetter extends StatelessWidget {
  final String letter;
  final double x, top, size;
  const HallLetter({super.key, required this.letter, required this.x, this.top = M2Layout.letterBandTop, this.size = M2Layout.letterBox});
  @override
  Widget build(BuildContext context) => Positioned(
        right: 0, top: top, width: size, height: size,
        child: ExcludeSemantics(child: IgnorePointer(child: RepaintBoundary(child: CustomPaint(painter: _LetterPainter(letter, x, size))))),
      );
}
