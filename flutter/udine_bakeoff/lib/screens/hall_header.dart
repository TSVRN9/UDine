import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import '../logic/busy.dart';
import '../logic/fixture.dart';
import '../logic/schedule.dart';
import '../motion/container_math.dart';
import '../motion/container_transform.dart';
import '../theme/tokens.dart';
import '../ui/ui.dart';

double _clamp(double x) => x < 0 ? 0 : x > 1 ? 1 : x;

/// M2's scoreboard lamp board (`histSVG`): one column of five lamps per hour from opening, lit like the band meter; this hour
/// gold; the next hours from the live forecast when there is one, else the typical Thursday.
class LampBoard extends CustomPainter {
  final Busy busy;
  final int first;
  final List<int> typical;
  final int nowHour;
  const LampBoard(this.busy, this.first, this.typical, this.nowHour);
  @override
  void paint(Canvas canvas, Size size) {
    final n = typical.length, w = M2Layout.boardW, h = M2Layout.histH, gap = M2Layout.boardGap, bw = (w - gap * (n - 1)) / n;
    const lg = M2Layout.boardLampGap, lamps5 = 5;
    final lh = (h - lg * 4) / lamps5, nowI = nowHour - first;
    canvas.scale(size.width / w, size.height / h); // preserveAspectRatio none
    for (var i = 0; i < n; i++) {
      final o = i > nowI && i - nowI < busy.outlook.length ? busy.outlook[i - nowI] : null; // M2 reads outlook[i - nowI], index and all
      final val = i == nowI ? busy.pct : (o != null && o.pct != null ? o.pct! : typical[i]);
      final lit = lamps(val), x = i * (bw + gap);
      for (var k = 0; k < lamps5; k++) {
        final y = h - (k + 1) * lh - k * lg;
        canvas.drawRRect(
          RRect.fromRectAndRadius(Rect.fromLTWH(x, y, bw, lh), const Radius.circular(M2Layout.boardRadius)),
          Paint()..color = k >= lit ? M2Color.boardOff : i == nowI ? M2Color.gold : M2Color.boardOn,
        );
      }
    }
  }

  @override
  bool shouldRepaint(LampBoard o) => o.busy != busy || o.nowHour != nowHour;
}

/// The hall screen's header (M2 `#mhead`): the photo window, its grades, the chenille letter, the name, the status line (the
/// schedule's door), the busy row and the board. Everything animated reads one `progress` (the container's open) and one
/// collapse `c` (scroll), as M2's `paint(p, y)`; a band's own copy rides on the photo while the container opens.
class HallHeader extends StatefulWidget {
  final Fixture fx;
  final String place;
  final double top;
  final int day;
  final Animation<double> progress;
  /// scroll offset d = clamp(y, 0, HH - CH)
  final ValueListenable<double> scroll;
  final Animation<double> dayFade;
  final BandRect? band;
  final bool bandOpen;
  final VoidCallback? onStatus;
  const HallHeader({
    super.key, required this.fx, required this.place, required this.top, required this.day, required this.progress, required this.scroll, required this.dayFade,
    this.band, this.bandOpen = true, this.onStatus,
  });
  @override
  State<HallHeader> createState() => _HallHeaderState();
}

class _HallHeaderState extends State<HallHeader> {
  final _name = GlobalKey(), _head = GlobalKey();
  double _drop = 0; // NB: how far the collapsed name falls into the compact bar

  double get hh => headerHeight(widget.top);
  double get r => hh - (widget.top + M2Layout.barH); // R = HH - CH

  void _measure() {
    final n = _name.currentContext?.findRenderObject() as RenderBox?, h = _head.currentContext?.findRenderObject() as RenderBox?;
    if (n == null || h == null || !n.hasSize) return;
    final bottom = n.localToGlobal(Offset(0, n.size.height), ancestor: h).dy; // the name's bottom in the header
    final drop = widget.top + M2Layout.nameBarTop - (bottom - r);
    if ((drop - _drop).abs() > 0.05) setState(() => _drop = drop);
  }

  @override
  void didUpdateWidget(HallHeader oldWidget) {
    super.didUpdateWidget(oldWidget);
    WidgetsBinding.instance.addPostFrameCallback((_) => mounted ? _measure() : null);
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => mounted ? _measure() : null);
  }

  @override
  Widget build(BuildContext context) {
    final w = widget, fx = w.fx, place = w.place, compact = isCafe(place), name = placeName(fx, place), top = w.top;
    final status = statusLine(fx, place, w.day);
    final live = !compact && w.day == 0;
    final busy = compact ? null : busyView(fx.busy[place]!);
    final path = photoOf(place, name);
    final band = w.band;
    final p = w.progress;
    // a long name is set smaller so it fits on one line; the compact bar always shows it at nameSize
    final maxW = MediaQuery.sizeOf(context).width - 2 * M2Space.gutter;
    var nameStyle = M2Text.menuName;
    final tp = TextPainter(text: TextSpan(text: name, style: nameStyle.style(M2Color.white)), textDirection: TextDirection.ltr)..layout();
    if (tp.width > maxW) nameStyle = nameStyle.withSize(math.max(M2Layout.nameMinFit, (nameStyle.size * maxW / tp.width).floorToDouble()));
    final ns = M2Collapse.nameSize / nameStyle.size;
    final photo = path == null
        ? null
        : Photo(path: path, pos: compact ? 0.5 : photoPos[place]!, duo: band != null ? _Reverse(p) : const AlwaysStoppedAnimation(0.0));
    return AnimatedBuilder(
      animation: Listenable.merge([p, w.scroll, w.dayFade]),
      builder: (context, _) {
        final pv = p.value, d = w.scroll.value.clamp(0.0, r), c = d / r;
        final fin = incomingOpacity(pv), fade = 1 - _clamp(c / M2Collapse.fadeEnd), df = w.dayFade.value;
        return SizedBox(
          key: _head, height: hh,
          child: ClipRect(
            child: Stack(clipBehavior: Clip.none, children: [
              const Positioned.fill(child: ColoredBox(color: M2Color.vm)),
              if (photo != null) Positioned(left: 0, right: 0, top: d * M2Collapse.parallax, height: hh, child: photo),
              // the header's grades develop with the photo (dev = p from a band, whole from a push)
              Positioned.fill(
                child: Opacity(
                  opacity: band != null ? pv : 1,
                  child: Stack(children: [
                    Positioned(left: 0, right: 0, top: 0, height: top + M2Layout.topGradH, child: DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: M2Gradient.headTop.colors, stops: M2Gradient.headTop.stops)))),
                    Positioned(left: 0, right: 0, bottom: 0, height: M2Layout.bottomGradH, child: DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: M2Gradient.headBottom.colors, stops: M2Gradient.headBottom.stops)))),
                  ]),
                ),
              ),
              Positioned.fill(child: Opacity(opacity: _clamp((c - M2Collapse.solidStart) / M2Collapse.solidSpan), child: const ColoredBox(color: M2Color.vm))),
              if (!compact) Positioned.fill(child: Opacity(opacity: (fin * (1 - _clamp(c / M2Collapse.letterEnd))).clamp(0.0, 1.0), child: Stack(children: [HallLetter(letter: place, x: hallLx[place]!, top: top + M2Layout.letterTop)]))),
              // the band's copy: its grade fades with 1 - p, its text and letter with the early fade
              if (band != null && !w.bandOpen) ...[
                Positioned(left: 0, right: 0, top: band.off, height: band.height, child: Opacity(key: const ValueKey('fade-bandGrade'), opacity: _clamp(1 - pv), child: const BandGrade())),
                Positioned(
                  left: 0, right: 0, top: band.off, height: band.height,
                  child: Opacity(
                    key: const ValueKey('fade-ghost'), opacity: outgoingOpacity(pv).clamp(0.0, 1.0),
                    child: Band(
                      ghost: true, compact: compact, name: name, status: statusLine(fx, place, 0),
                      busy: busy == null ? null : BusyRow(lamps: busy.lamps, word: busy.word),
                      letter: compact ? null : HallLetter(letter: place, x: hallLx[place]!),
                    ),
                  ),
                ),
              ],
              // the title block: name (it travels into the bar), status line, busy row; all fade in after the container's early fade
              Positioned(
                left: M2Space.gutter, bottom: compact ? M2Layout.titleBottomCafe : M2Layout.titleBottom,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                  Opacity(
                    key: const ValueKey('fade-title'), opacity: (fin * df).clamp(0.0, 1.0),
                    child: Transform(
                      key: _name, // measured on the Transform's own box, which its transform does not move
                      alignment: Alignment.bottomLeft,
                      transform: Matrix4.translationValues(M2Collapse.nameDx * c, _drop * c, 0)..scaleByDouble(1 - (1 - ns) * c, 1 - (1 - ns) * c, 1, 1),
                      child: Semantics(header: true, child: Text(name, style: nameStyle.style(M2Color.white), maxLines: 1)),
                    ),
                  ),
                  Opacity(
                    opacity: (fin * fade * df).clamp(0.0, 1.0),
                    child: _StatusLine(text: status, onTap: fin * fade > 0.5 ? w.onStatus : null),
                  ),
                  if (busy != null)
                    Opacity(
                      opacity: live ? (fin * fade * df).clamp(0.0, 1.0) : 0, // another day: no live data, but the room stays so the name never moves
                      child: ExcludeSemantics(excluding: !live, child: BusyRow(lamps: busy.lamps, word: busy.word, extra: busy.extra, header: true)),
                    ),
                ]),
              ),
              if (live)
                Positioned(
                  left: M2Space.gutter, right: M2Space.gutter, bottom: M2Layout.histBottom, height: M2Layout.histH,
                  child: Opacity(opacity: (fin * fade * df).clamp(0.0, 1.0), child: ExcludeSemantics(child: CustomPaint(painter: LampBoard(fx.busy[place]!, fx.typical[place]!.$1, fx.typical[place]!.$2, _nowHour(fx))))),
                ),
            ]),
          ),
        );
      },
    );
  }

  int _nowHour(Fixture fx) => (DateTime.parse(fx.clock).toUtc().subtract(const Duration(hours: 4))).hour;
}

class _Reverse extends Animation<double> with AnimationWithParentMixin<double> {
  _Reverse(this.parent);
  @override
  final Animation<double> parent;
  @override
  double get value => 1 - parent.value;
}

/// `#mts`: the status line, the schedule's other door. A chevron quieter than the gold ones in the rows below; the button's hit
/// box is padded 12 above and below (and pulled back by its negative margins) so a 18 dp line is a 42 dp target.
class _StatusLine extends StatelessWidget {
  final String text;
  final VoidCallback? onTap;
  const _StatusLine({required this.text, this.onTap});
  @override
  Widget build(BuildContext context) {
    final has = text.isNotEmpty;
    final line = Container(
      constraints: const BoxConstraints(minHeight: M2Layout.statusMin),
      padding: const EdgeInsets.fromLTRB(0, M2Layout.statusPadV, M2Layout.statusPadR, M2Layout.statusPadV),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Text(has ? text : ' ', style: M2Text.status.style(M2Color.onDmSoft)),
        if (has) ...[const SizedBox(width: M2Layout.statusGapH), const _StatusChevron()],
      ]),
    );
    return NegMargin(
      top: M2Layout.statusMarginTop, bottom: M2Layout.statusMarginBottom,
      child: has ? Press(label: '$text, hours and directions', onTap: onTap, child: line) : ExcludeSemantics(child: Opacity(opacity: 0, child: line)),
    );
  }
}

class _StatusChevron extends StatelessWidget {
  const _StatusChevron();
  @override
  Widget build(BuildContext context) => CustomPaint(size: const Size.square(M2Layout.statusChevron), painter: _ChevPainter(M2Color.onDmQuiet, M2Layout.statusChevronStroke));
}

class _ChevPainter extends CustomPainter {
  final Color color;
  final double stroke;
  const _ChevPainter(this.color, this.stroke);
  @override
  void paint(Canvas canvas, Size s) {
    canvas.scale(s.width / 18); // viewBox 18: M4 7l5 5 5-5
    canvas.drawPath(Path()..moveTo(4, 7)..relativeLineTo(5, 5)..relativeLineTo(5, -5), Paint()..color = color..style = PaintingStyle.stroke..strokeWidth = stroke..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round);
  }

  @override
  bool shouldRepaint(_ChevPainter o) => o.color != color || o.stroke != stroke;
}
