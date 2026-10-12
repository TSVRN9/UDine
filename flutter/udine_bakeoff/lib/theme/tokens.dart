// M2 round 9c tokens, copied value for value from the RN branch (mobile/src/lib/theme.ts `m2` and
// mobile/src/lib/motion.ts `M2Motion`), which copied them from M2's src.html. Sizes are M2's px as dp.
import 'package:flutter/animation.dart';
import 'package:flutter/painting.dart';

Color _c(int rgb, [double a = 1]) => Color.fromRGBO((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, a);

abstract final class M2Color {
  static const dm = Color(0xFF3B0A0F);
  static const vm = Color(0xFF881C1C);
  static const gold = Color(0xFFC99A2E);
  static const chalk = Color(0xFFF8F9FB);
  static const ink = Color(0xFF24171A);
  static const slate = Color(0xFF6E6266);
  static const tint = Color(0xFFF3E4E4);
  static final hair = _c(0x24171A, 0.12);
  static const field = Color(0xFFECEEF2);
  static const white = Color(0xFFFFFFFF);
  static final onDm = _c(0xFFFFFF, 0.8);
  static final onDmSoft = _c(0xFFFFFF, 0.86);
  static final divider = _c(0xFFFFFF, 0.14);
  static final pressRow = _c(0x24171A, 0.06);
  static final here = _c(0x881C1C, 0.07);
  static final pressDark = _c(0xFFFFFF, 0.08);
  static final ghost = _c(0x881C1C, 0.45);
  static final dotOff = _c(0xFFFFFF, 0.35);
  static final outline = _c(0xFFFFFF, 0.7);
  static final spinTrack = _c(0x881C1C, 0.18);
  static final stitchGold = _c(0xC99A2E, 0.95);
  static const felt = Color(0xFF5A1820);
  static const scrim = Color(0xFF240A0E); // rgba(36,10,14,1)
  static const plateScrim = Color(0xFF240A0E);
  /// [tile, ink]
  static const carbon = {
    'A': (Color(0xFF0D6D3A), Color(0xFF0D6D3A)),
    'B': (Color(0xFF9BCB3B), Color(0xFF3D5C0A)),
    'C': (Color(0xFFDBE11D), Color(0xFF4F5208)),
    'D': (Color(0xFFBCBDC0), Color(0xFF45464A)),
    'E': (Color(0xFF818285), Color(0xFF2F3033)),
  };
  static const health = [
    Color(0xFFCFE0F2), Color(0xFFB4CBE3), Color(0xFF98B5D4), Color(0xFF7DA0C5),
    Color(0xFF618AB7), Color(0xFF4675A8), Color(0xFF2A5F99), Color(0xFF0F4A8A),
  ];
  static const healthInk = Color(0xFF0F3A66);
  // the band's grades and the header's (RN Band.tsx / Header.tsx)
  static final bandGrade = [_c(0x3B0A0F, 0.82), _c(0x3B0A0F, 0.55), _c(0x3B0A0F, 0)];
  static final topGrade = [_c(0x3B0A0F, 0.6), _c(0x3B0A0F, 0)];
  static final bottomGrade = [_c(0x3B0A0F, 0), _c(0x3B0A0F, 0.5), _c(0x3B0A0F, 0.93)];
  static const duoMultiply = Color(0xFFC4434B);
  static final lampOff = _c(0xFFFFFF, 0.22);
}

abstract final class M2Font {
  static const body = 'LibreFranklin'; // 400; bodyMd 500, bodySb 600
  static const num = 'Oswald'; // 500; numSb 600, numB 700
}

/// A type-scale row: size and line height in dp, the family and weight M2's CSS rule uses.
class M2Type {
  final double size, line;
  final String family;
  final FontWeight weight;
  final bool tabular;
  const M2Type(this.size, this.line, this.family, this.weight, {this.tabular = false});
  TextStyle style(Color color) => TextStyle(
        fontFamily: family, fontSize: size, height: line / size, color: color, fontWeight: weight, decoration: TextDecoration.none,
        leadingDistribution: TextLeadingDistribution.even,
        fontFeatures: tabular ? const [FontFeature.tabularFigures()] : null,
      );
}

const _b4 = M2Font.body, _nu = M2Font.num;
const _w4 = FontWeight.w400, _w5 = FontWeight.w500, _w6 = FontWeight.w600;

abstract final class M2Text {
  static const mealTab = M2Type(14, 17, _b4, _w5);
  static const tabBar = M2Type(12, 15, _b4, _w6);
  static const brand = M2Type(22, 26, _nu, _w6, tabular: true);
  static const date = M2Type(15, 20, _b4, _w4);
  static const hallTitle = M2Type(52, 55, _nu, _w6, tabular: true);
  static const bandName = M2Type(32, 32, _nu, _w6, tabular: true);
  static const pinName = M2Type(24, 24, _nu, _w6, tabular: true);
  static const menuName = M2Type(40, 40, _nu, _w6, tabular: true);
  static const status = M2Type(15, 20, _b4, _w4);
  static const statusSm = M2Type(14, 18, _b4, _w4);
  static const section = M2Type(22, 26, _nu, _w6, tabular: true);
  static const rowName = M2Type(16, 20, _b4, _w6);
  static const meta = M2Type(13, 17, _b4, _w4);
  static const link = M2Type(15, 20, _b4, _w6);
  static const button = M2Type(16, 20, _b4, _w6);
  static const empty = M2Type(16, 23, _b4, _w4);
}

abstract final class M2Space {
  static const s = [4.0, 8.0, 12.0, 16.0, 20.0, 24.0, 32.0];
}

abstract final class M2Radius {
  static const patch = 4.0, thumb = 5.0, card = 6.0, button = 8.0, sheet = 16.0, pill = 999.0;
}

abstract final class M2Size {
  static const tabBar = 56.0, row = 64.0, tabs = 48.0, stationRow = 50.0, band = 112.0, bandCompact = 84.0, tap = 44.0;
}

/// M2's `EMPH`: the emphasized easing, two bezier segments joined at x = 1/6 (not one cubic-bezier).
class Emphasized extends Curve {
  const Emphasized();
  static const _seg = [
    [0.0, 0.0, 0.05, 0.0, 0.133333, 0.06, 0.166666, 0.4],
    [0.166666, 0.4, 0.208333, 0.82, 0.25, 1.0, 1.0, 1.0],
  ];
  static double _bez(double a, double b, double c, double d, double t) {
    final u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  }

  @override
  double transformInternal(double t) {
    final x = t;
    final s = x <= 0.166666 ? _seg[0] : _seg[1];
    var lo = 0.0, hi = 1.0, u = 0.5;
    for (var i = 0; i < 30; i++) {
      u = (lo + hi) / 2;
      if (_bez(s[0], s[2], s[4], s[6], u) < x) {
        lo = u;
      } else {
        hi = u;
      }
    }
    return _bez(s[1], s[3], s[5], s[7], u);
  }
}

const emphasized = Emphasized();
const standardM2 = Cubic(0.2, 0, 0, 1);

/// M2's `MO`, `SPRING` and `PUSH_E` (src.html). Durations in ms.
abstract final class M2Motion {
  static const pressD = 90, pressScale = 0.97;
  static const settleD = 200;
  static const contD = 500; // container transform, enter; easing `emphasized`
  static const contFade = 0.3; // outgoing content is gone by this progress, incoming starts here (src.html paint: fout/fin)
  static const contBackD = 400; // same frames reversed
  static const scrim = 0.32;
  static const dragBackDist = 480.0, dragBackCommit = 0.82, dragBackFlick = 0.5; // px of drag for the whole way; commit below p .82 or a flick > .5 px/ms
  static const edge = 24.0; // M2 `edge`: a touch that starts within this many dp of the left edge may swipe in
}
