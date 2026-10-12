// The hand-written shapes the generated tokens (m2_tokens.g.dart) are made of.
import 'package:flutter/animation.dart';
import 'package:flutter/painting.dart';

/// Libre Franklin 700, which M2 draws bold text in (labels, `.btn`, Contains) and m2.json has no row for: Flutter-only.
const bold700 = FontWeight.w700;

/// A duration and its curve, always together: nothing animates with a bare duration.
class Anim {
  final int ms;
  final Curve curve;
  const Anim(this.ms, this.curve);
  Duration get duration => Duration(milliseconds: ms);
}

/// A type-scale row. `line` is null where M2 sets no line-height: the font's own normal line height (Flutter's null `height`).
class M2Type {
  final double size;
  final double? line;
  final String family;
  final FontWeight weight;
  final bool tabular;
  const M2Type(this.size, this.line, this.family, this.weight, {this.tabular = false});
  TextStyle style(Color color) => TextStyle(
        fontFamily: family, fontSize: size, height: line == null ? null : line! / size, color: color, fontWeight: weight,
        decoration: TextDecoration.none, leadingDistribution: TextLeadingDistribution.even,
        fontFeatures: tabular ? const [FontFeature.tabularFigures()] : null,
      );
  /// The same row in Libre Franklin 700 (`.btn`, `.gbtn`).
  M2Type bold() => M2Type(size, line, family, bold700, tabular: tabular);
  /// The same row at the font's own line height: where M2's CSS sets no `line-height` and the token file carries one anyway.
  M2Type normal() => M2Type(size, null, family, weight, tabular: tabular);
  M2Type withSize(double s) => M2Type(s, line == null ? null : line! * s / size, family, weight, tabular: tabular);
}

/// M2's `EMPH`: the emphasized easing, two bezier segments joined at x = 1/6 (not one cubic-bezier). `seg` is
/// [x0,y0,x1,y1,x2,y2,x3,y3] per segment, from the token file.
class Emphasized extends Curve {
  final List<List<double>> seg;
  const Emphasized(this.seg);
  static double _bez(double a, double b, double c, double d, double t) {
    final u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  }

  @override
  double transformInternal(double t) {
    final s = t <= seg[0][6] ? seg[0] : seg[1];
    var lo = 0.0, hi = 1.0, u = 0.5;
    for (var i = 0; i < 30; i++) {
      u = (lo + hi) / 2;
      if (_bez(s[0], s[2], s[4], s[6], u) < t) {
        lo = u;
      } else {
        hi = u;
      }
    }
    return _bez(s[1], s[3], s[5], s[7], u);
  }
}
