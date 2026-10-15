import 'package:flutter/widgets.dart';

import '../../core/m2/busy.dart';
import '../../core/occupancy.dart';
import '../../theme/tokens.dart';

/// What the hall header draws for busy (M2 `busyRow(h, true)` and `histSVG`) from one [OccupancyRead]: the meter's lamps, the word, the
/// second line and the board's columns. The word is the hour's level, hedged when the curve is thin; the lamps and the board never are.
class HallBusyView {
  final int lamps, nowHour;
  final String word, extra;
  final List<({int hour, int lamps})>? board;
  const HallBusyView({required this.lamps, required this.word, required this.extra, required this.board, required this.nowHour});

  factory HallBusyView.of(OccupancyRead r) => HallBusyView(
        lamps: r.lamps,
        word: busyWord(r.level, low: r.confidence == Confidence.low),
        extra: busyExtra(r.calmerAt, switch (r.vsUsual) { VsUsual.busier => 'busier', VsUsual.quieter => 'quieter', _ => null }),
        board: r.board,
        nowHour: r.nowHour,
      );
}

/// M2's `histSVG`: one column of five lamps per hour, lit like the meter, the live hour's in gold. Drawn in M2's 350 x 30 viewBox and
/// stretched to the width (`preserveAspectRatio="none"`).
class BusyBoard extends StatelessWidget {
  final HallBusyView view;
  const BusyBoard({super.key, required this.view});
  @override
  Widget build(BuildContext context) => ExcludeSemantics(child: CustomPaint(painter: _BoardPainter(view)));
}

class _BoardPainter extends CustomPainter {
  final HallBusyView v;
  const _BoardPainter(this.v);
  @override
  void paint(Canvas canvas, Size size) {
    final cols = v.board;
    if (cols == null || cols.isEmpty) return;
    const lh = (M2Layout.histH - 4 * M2Layout.boardLampGap) / 5;
    final bw = (M2Layout.boardW - M2Layout.boardGap * (cols.length - 1)) / cols.length;
    canvas.scale(size.width / M2Layout.boardW, size.height / M2Layout.histH);
    for (var i = 0; i < cols.length; i++) {
      final now = cols[i].hour == v.nowHour;
      for (var k = 0; k < 5; k++) {
        final y = M2Layout.histH - (k + 1) * lh - k * M2Layout.boardLampGap;
        // the live hour's column shows the live lamps, as M2's now column does
        final lit = now ? v.lamps : cols[i].lamps;
        canvas.drawRRect(
          RRect.fromRectAndRadius(Rect.fromLTWH(i * (bw + M2Layout.boardGap), y, bw, lh), const Radius.circular(M2Layout.boardRadius)),
          Paint()..color = k >= lit ? M2Color.boardOff : now ? M2Color.gold : M2Color.boardOn,
        );
      }
    }
  }

  @override
  bool shouldRepaint(_BoardPainter o) => o.v != v;
}
