import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';

/// Tests that must not render UMass's photos (golden PNGs are committed) switch them off.
abstract final class Photos {
  static bool enabled = true;
}

const _aspect = 640 / 341;

// CSS `grayscale(1) contrast(1.12)`: luminance, then 1.12 about the middle (clamped by the filter's own output).
final _grayContrast = ColorFilter.matrix(<double>[
  for (final c in const [0.2126, 0.7152, 0.0722]) ...[c * 1.12, c * 1.12, c * 1.12, 0, 255 * 0.5 * (1 - 1.12)],
  0, 0, 0, 1, 0,
]);

/// A per-channel affine of the gray: `multiply #c4434b`, then `screen dm`: out = g * m * (1 - d) + d.
ColorFilter _tone() {
  const m = M2Color.duoMultiply, d = M2Color.dm;
  List<double> row(double mc, double dc) => [mc * (1 - dc), 0, 0, 0, 255 * dc]; // reads the gray from the R channel
  return ColorFilter.matrix(<double>[...row(m.r, d.r), ...row(m.g, d.g), ...row(m.b, d.b), 0, 0, 0, 1, 0]);
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
      final layer = Stack(fit: StackFit.expand, children: [
        ColorFiltered(colorFilter: _tone(), child: ColorFiltered(colorFilter: _grayContrast, child: Stack(fit: StackFit.expand, children: [img()]))),
      ]);
      return ClipRect(child: Stack(fit: StackFit.expand, children: [img(), duo == null ? layer : FadeTransition(opacity: duo!, child: layer)]));
    });
  }
}
