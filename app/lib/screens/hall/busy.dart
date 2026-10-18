import 'package:flutter/widgets.dart';

import '../../core/m2/busy.dart' as m2;
import '../../core/occupancy.dart';
import '../../theme/tokens.dart';

/// What the hall header draws for busy (M2 `busyRow(h, true)` and `histSVG`) from one [OccupancyRead]: the meter's lamps, the word, the
/// second line and the board's columns. The word is the hour's level, hedged when the curve is thin; the lamps and the board never are.
class HallBusyView {
  final int lamps, nowHour;
  final String word, extra;
  final List<({int hour, int lamps})>? board;
  const HallBusyView({required this.lamps, required this.word, required this.extra, required this.board, required this.nowHour});

  /// What the band the page opened from already showed (the meter and its word), until the page's own reading lands: the meter is part of
  /// the card that travels, so it is there from the first frame. It has no second line and no board.
  const HallBusyView.seed({required this.lamps, required this.word})
      : extra = '',
        board = null,
        nowHour = -1;
  bool get seed => nowHour < 0;

  /// [span] (whole hours [start, end) from [openSpan]) lays the board across the opening hours, as M2's `TYPICAL` does; an hour the curve has no usable
  /// bucket for (absent, or under the sample floor) is an unlit column, which is not a measured quiet hour. Without a span the board is the hours the curve holds.
  factory HallBusyView.of(OccupancyRead r, {(int, int)? span}) => HallBusyView(
        lamps: r.lamps,
        word: m2.busyWord(r.level, low: r.confidence == Confidence.low),
        extra: m2.busyExtra(r.calmerAt, switch (r.vsUsual) { VsUsual.busier => 'busier', VsUsual.quieter => 'quieter', _ => null }),
        board: span == null || r.board == null
            ? r.board
            : [for (var h = span.$1; h < span.$2; h++) (hour: h, lamps: r.board!.where((c) => c.hour == h).firstOrNull?.lamps ?? 0)],
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
