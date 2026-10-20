import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';

/// Tests that must not render UMass's photos (golden PNGs are committed) switch them off.
abstract final class Photos {
  static bool enabled = true;
}

const _aspect = 640 / 341;

// CSS `grayscale(1) contrast(1.12)` then `multiply #c4434b` and `screen dm`, as one matrix (one offscreen layer, not two): luminance,
// 1.12 about the middle, then the per-channel affine out = g * m * (1 - d) + d. (M2 clamps between the two steps; the clamp only matters
// for luminance under 5% or over 95%, where the one matrix reads a hair brighter.) `a` is the layer's own opacity, in the alpha row.
ColorFilter _duotone(double a) {
  const m = M2Color.duoTint, d = M2Color.dm;
  const k = 1.12, off = 0.5 * (1 - k); // contrast about the middle
  List<double> row(double mc, double dc) {
    final s = mc * (1 - dc) * k;
    return [s * 0.2126, s * 0.7152, s * 0.0722, 0, 255 * (mc * (1 - dc) * off + dc)];
  }
  return ColorFilter.matrix(<double>[...row(m.r, d.r), ...row(m.g, d.g), ...row(m.b, d.b), 0, 0, 0, a, 0]);
}

/// A UMass photo, cover-fitted to the box with horizontal focus `pos` (CSS background-position x), in full colour with M2's
/// grayscale duotone laid over it (`duo` is that layer's opacity; null shows it). The photo itself is never blurred, cropped
/// beyond the fit, or otherwise altered.
class Photo extends StatelessWidget {
  final String path;
  final double pos;
  final Animation<double>? duo;
  const Photo({super.key, required this.path, this.pos = 0.5, this.duo});

  @override
  Widget build(BuildContext context) {
    if (!Photos.enabled) return const SizedBox.expand();
    return LayoutBuilder(builder: (_, c) {
      final w = c.maxWidth > c.maxHeight * _aspect ? c.maxWidth : c.maxHeight * _aspect, h = w / _aspect;
      Widget img() => Positioned(
            left: (c.maxWidth - w) * pos, top: 0, width: w, height: h,
            child: Image.asset(path, fit: BoxFit.fill, gaplessPlayback: true, errorBuilder: (_, _, _) => const SizedBox.shrink()),
          );
      Widget layer(double a) => ColorFiltered(colorFilter: _duotone(a), child: Stack(fit: StackFit.expand, children: [img()]));
      return ClipRect(
        child: Stack(fit: StackFit.expand, children: [
          img(),
          duo == null ? layer(1) : AnimatedBuilder(animation: duo!, builder: (_, _) => layer(duo!.value.clamp(0.0, 1.0))),
        ]),
      );
    });
  }
}
