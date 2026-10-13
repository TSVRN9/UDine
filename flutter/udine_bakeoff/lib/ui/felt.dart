import 'dart:ui' as ui;
import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';

/// `border: 1px dashed` drawn evenly round a path: the dash count is whole, so the pattern closes without a stub (as Chrome's).
ui.Path dashed(ui.Path src, double on, double off) {
  final out = ui.Path();
  for (final m in src.computeMetrics()) {
    final n = (m.length / (on + off)).round().clamp(1, 1 << 20), step = m.length / n, dash = step * on / (on + off);
    for (var i = 0; i < n; i++) {
      out.addPath(m.extractPath(i * step, i * step + dash), Offset.zero);
    }
  }
  return out;
}

class _FeltPainter extends CustomPainter {
  final Color color, stitch;
  final double radius, inset, innerRadius, stitchWidth;
  const _FeltPainter(this.color, this.stitch, this.radius, this.inset, this.innerRadius, this.stitchWidth);
  @override
  void paint(Canvas canvas, Size s) {
    canvas.drawRRect(RRect.fromRectAndRadius(Offset.zero & s, Radius.circular(radius)), Paint()..color = color);
    final r = RRect.fromRectAndRadius(Rect.fromLTWH(inset, inset, s.width - 2 * inset, s.height - 2 * inset), Radius.circular(innerRadius));
    canvas.drawPath(dashed(ui.Path()..addRRect(r.deflate(stitchWidth / 2)), M2Layout.dashOn, M2Layout.dashOff), Paint()..color = stitch..style = PaintingStyle.stroke..strokeWidth = stitchWidth);
  }

  @override
  bool shouldRepaint(_FeltPainter o) => o.color != color || o.stitch != stitch || o.radius != radius || o.inset != inset || o.innerRadius != innerRadius || o.stitchWidth != stitchWidth;
}

/// The stitched patch (`.tg`, `.mk`, `.hchip .hl`): gold felt under a dashed maroon stitch, the one look every diet badge, mark and
/// hall letter chip shares. Sized by `width`/`height` or by its child and `padding`.
class Felt extends StatelessWidget {
  final double? width, height;
  final double radius, inset, innerRadius, stitchWidth;
  final Color color, stitch;
  final EdgeInsetsGeometry padding;
  final Widget? child;
  const Felt({super.key, this.width, this.height, this.radius = M2Felt.patchRadius, this.inset = M2Felt.patchInset, this.innerRadius = M2Felt.patchStitchRadius, this.stitchWidth = M2Felt.patchStitchWidth,
      this.color = M2Color.gold, this.stitch = M2Color.stitch, this.padding = EdgeInsets.zero, this.child});
  @override
  Widget build(BuildContext context) => CustomPaint(
        painter: _FeltPainter(color, stitch, radius, inset, innerRadius, stitchWidth),
        child: Container(width: width, height: height, padding: padding, child: Align(alignment: Alignment.center, widthFactor: width == null ? 1 : null, heightFactor: height == null ? 1 : null, child: child)),
      );
}
