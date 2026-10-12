import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import '../logic/busy.dart';
import '../logic/fixture.dart';
import '../logic/hours.dart';
import '../logic/schedule.dart';
import '../motion/container_math.dart';
import '../motion/container_transform.dart';
import '../theme/tokens.dart';
import '../ui/ui.dart';

double _clamp(double x) => x < 0
    ? 0
    : x > 1
    ? 1
    : x;

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
    final n = typical.length,
        w = M2Layout.boardW,
        h = M2Layout.histH,
        gap = M2Layout.boardGap,
        bw = (w - gap * (n - 1)) / n;
    const lg = M2Layout.boardLampGap, lamps5 = 5;
    final lh = (h - lg * 4) / lamps5, nowI = nowHour - first;
    canvas.scale(size.width / w, size.height / h); // preserveAspectRatio none
    for (var i = 0; i < n; i++) {
      final o = i > nowI && i - nowI < busy.outlook.length
          ? busy.outlook[i - nowI]
          : null; // M2 reads outlook[i - nowI], index and all
      final val = i == nowI
          ? busy.pct
          : (o != null && o.pct != null ? o.pct! : typical[i]);
      final lit = lamps(val), x = i * (bw + gap);
      for (var k = 0; k < lamps5; k++) {
        final y = h - (k + 1) * lh - k * lg;
        canvas.drawRRect(
          RRect.fromRectAndRadius(
            Rect.fromLTWH(x, y, bw, lh),
            const Radius.circular(M2Layout.boardRadius),
          ),
          Paint()
            ..color = k >= lit
                ? M2Color.boardOff
                : i == nowI
                ? M2Color.gold
                : M2Color.boardOn,
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
///
/// Built for the phone's frame budget: the heavy layers (photo, grades, letter, board, name) are made once and handed to small
/// builders that only set an opacity or an offset, so an animation or a scroll re-builds those wrappers, never the layers; the day
/// is a listenable that only the status text, the busy row and the board's visibility read, so a day change builds none of this
/// widget (test/screens/rebuild_test.dart counts).
class HallHeader extends StatefulWidget {
  final Fixture fx;
  final String place;
  final double top;
  final ValueListenable<int> day;
  final Animation<double> progress;

  /// scroll offset d = clamp(y, 0, HH - CH)
  final ValueListenable<double> scroll;
  final Animation<double> dayFade;
  final BandRect? band;
  final bool bandOpen;
  final VoidCallback? onStatus;
  const HallHeader({
    super.key,
    required this.fx,
    required this.place,
    required this.top,
    required this.day,
    required this.progress,
    required this.scroll,
    required this.dayFade,
    this.band,
    this.bandOpen = true,
    this.onStatus,
  });
  @override
  State<HallHeader> createState() => HallHeaderState();
}

/// The board, a widget of its own so a test can count its builds.
class HallBoard extends StatelessWidget {
  static int builds = 0;
  final Fixture fx;
  final String place;
  const HallBoard({super.key, required this.fx, required this.place});
  @override
  Widget build(BuildContext context) {
    builds++;
    return RepaintBoundary(
      child: ExcludeSemantics(
        child: CustomPaint(painter: LampBoard(fx.busy[place]!, fx.typical[place]!.$1, fx.typical[place]!.$2, toEastern(DateTime.parse(fx.clock)).hour)),
      ),
    );
  }
}

class HallHeaderState extends State<HallHeader> {
  /// How many times this header's own build has run (tests).
  static int builds = 0;
  final _name = GlobalKey(), _head = GlobalKey();
  double _drop = 0; // NB: how far the collapsed name falls into the compact bar
  double? _madeFor;
  late Widget? _photo;
  late Widget _grades, _title, _busy, _ghost, _bandGrade;
  Widget? _letter, _board;
  late M2Type _nameStyle;

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
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => mounted ? _measure() : null);
  }

  @override
  void didUpdateWidget(HallHeader oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.bandOpen != widget.bandOpen || oldWidget.band != widget.band) WidgetsBinding.instance.addPostFrameCallback((_) => mounted ? _measure() : null);
  }

  /// The layers, made once per width.
  void _make(double width) {
    final w = widget, fx = w.fx, place = w.place, compact = isCafe(place), name = placeName(fx, place), top = w.top;
    _madeFor = width;
    // a long name is set smaller so it fits on one line; the compact bar always shows it at nameSize
    final maxW = width - 2 * M2Space.gutter;
    var nameStyle = M2Text.menuName;
    final tp = TextPainter(text: TextSpan(text: name, style: nameStyle.style(M2Color.white)), textDirection: TextDirection.ltr)..layout();
    if (tp.width > maxW) {
      nameStyle = nameStyle.withSize(math.max(M2Layout.nameMinFit, (nameStyle.size * maxW / tp.width).floorToDouble()));
    }
    _nameStyle = nameStyle;
    final path = photoOf(place, name);
    _photo = path == null
        ? null
        : IgnorePointer(child: Photo(path: path, pos: compact ? 0.5 : photoPos[place]!, duo: w.band != null ? _Reverse(w.progress) : const AlwaysStoppedAnimation(0.0)));
    LinearGradient g(({List<Color> colors, List<double> stops}) x) => LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: x.colors, stops: x.stops);
    _grades = IgnorePointer(
      child: Stack(children: [
        Positioned(left: 0, right: 0, top: 0, height: top + M2Layout.topGradH, child: DecoratedBox(decoration: BoxDecoration(gradient: g(M2Gradient.headTop)))),
        Positioned(left: 0, right: 0, bottom: 0, height: M2Layout.bottomGradH, child: DecoratedBox(decoration: BoxDecoration(gradient: g(M2Gradient.headBottom)))),
      ]),
    );
    _letter = compact ? null : IgnorePointer(child: Stack(children: [HallLetter(letter: place, x: hallLx[place]!, top: top + M2Layout.letterTop)]));
    final busy = compact ? null : busyView(fx.busy[place]!);
    _bandGrade = const IgnorePointer(child: BandGrade());
    _ghost = Band(
      ghost: true, compact: compact, name: name, status: statusLine(fx, place, 0),
      busy: busy == null ? null : BusyRow(lamps: busy.lamps, word: busy.word),
      letter: compact ? null : HallLetter(letter: place, x: hallLx[place]!),
    );
    _title = Semantics(header: true, child: Text(name, style: nameStyle.style(M2Color.white), maxLines: 1));
    _busy = busy == null ? const SizedBox.shrink() : ExcludeSemantics(child: BusyRow(lamps: busy.lamps, word: busy.word, extra: busy.extra, header: true));
    _board = compact ? null : HallBoard(fx: fx, place: place);
  }

  @override
  Widget build(BuildContext context) {
    builds++;
    final width = MediaQuery.sizeOf(context).width;
    if (_madeFor != width) _make(width);
    final w = widget, place = w.place, compact = isCafe(place), band = w.band, p = w.progress, day = w.day;
    final ns = M2Collapse.nameSize / _nameStyle.size;
    double c() => (w.scroll.value.clamp(0.0, r)) / r;
    return SizedBox(
      key: _head,
      height: hh,
      child: ClipRect(
        child: Stack(clipBehavior: Clip.none, children: [
          const Positioned.fill(child: IgnorePointer(child: ColoredBox(color: M2Color.vm))),
          if (_photo != null)
            AnimatedBuilder(
              animation: w.scroll, child: _photo,
              builder: (_, ch) => Positioned(left: 0, right: 0, top: w.scroll.value.clamp(0.0, r) * M2Collapse.parallax, height: hh, child: ch!),
            ),
          // the header's grades develop with the photo (dev = p from a band, whole from a push)
          Positioned.fill(
            child: AnimatedBuilder(animation: p, child: _grades, builder: (_, ch) => Opacity(key: const ValueKey('fade-headerGrade'), opacity: band != null ? p.value : 1, child: ch)),
          ),
          Positioned.fill(
            child: AnimatedBuilder(
              animation: w.scroll, child: const IgnorePointer(child: ColoredBox(color: M2Color.vm)),
              builder: (_, ch) => Opacity(opacity: _clamp((c() - M2Collapse.solidStart) / M2Collapse.solidSpan), child: ch),
            ),
          ),
          if (_letter != null)
            Positioned.fill(
              child: AnimatedBuilder(
                animation: Listenable.merge([p, w.scroll]), child: _letter,
                builder: (_, ch) => Opacity(key: const ValueKey('fade-headerLetter'), opacity: (incomingOpacity(p.value) * (1 - _clamp(c() / M2Collapse.letterEnd))).clamp(0.0, 1.0), child: ch),
              ),
            ),
          // the band's copy: its grade fades with 1 - p, its text and letter with the early fade
          if (band != null && !w.bandOpen) ...[
            Positioned(
              left: 0, right: 0, top: band.off, height: band.height,
              child: AnimatedBuilder(animation: p, child: _bandGrade, builder: (_, ch) => Opacity(key: const ValueKey('fade-bandGrade'), opacity: _clamp(1 - p.value), child: ch)),
            ),
            Positioned(
              left: 0, right: 0, top: band.off, height: band.height,
              child: AnimatedBuilder(animation: p, child: _ghost, builder: (_, ch) => Opacity(key: const ValueKey('fade-ghost'), opacity: outgoingOpacity(p.value).clamp(0.0, 1.0), child: ch)),
            ),
          ],
          // the title block: name (it travels into the bar), status line, busy row; all fade in after the container's early fade
          Positioned(
            left: M2Space.gutter, bottom: compact ? M2Layout.titleBottomCafe : M2Layout.titleBottom,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              AnimatedBuilder(
                animation: Listenable.merge([p, w.scroll, w.dayFade]), child: _title,
                builder: (_, ch) {
                  final cc = c();
                  return IgnorePointer(
                    child: Opacity(
                      key: const ValueKey('fade-title'), opacity: (incomingOpacity(p.value) * w.dayFade.value).clamp(0.0, 1.0),
                      child: Transform(
                        key: _name, // measured on the Transform's own box, which its transform does not move
                        alignment: Alignment.bottomLeft,
                        transform: Matrix4.translationValues(M2Collapse.nameDx * cc, _drop * cc, 0)..scaleByDouble(1 - (1 - ns) * cc, 1 - (1 - ns) * cc, 1, 1),
                        child: ch,
                      ),
                    ),
                  );
                },
              ),
              AnimatedBuilder(
                animation: Listenable.merge([p, w.scroll, w.dayFade]),
                // the status text is the only part of this row a day change touches
                child: ValueListenableBuilder<int>(
                  valueListenable: day,
                  builder: (_, d, _) => _StatusLine(text: statusLine(w.fx, place, d), onTap: w.onStatus),
                ),
                builder: (_, ch) {
                  final o = incomingOpacity(p.value) * (1 - _clamp(c() / M2Collapse.fadeEnd));
                  return Opacity(opacity: (o * w.dayFade.value).clamp(0.0, 1.0), child: IgnorePointer(ignoring: o <= 0.5, child: ch));
                },
              ),
              if (!compact)
                AnimatedBuilder(
                  animation: Listenable.merge([p, w.scroll, w.dayFade]),
                  // another day: no live data, but the room stays so the name never moves
                  child: ValueListenableBuilder<int>(valueListenable: day, builder: (_, d, ch) => ExcludeSemantics(excluding: d != 0, child: Opacity(opacity: d == 0 ? 1 : 0, child: ch)), child: IgnorePointer(child: _busy)),
                  builder: (_, ch) => Opacity(opacity: (incomingOpacity(p.value) * (1 - _clamp(c() / M2Collapse.fadeEnd)) * w.dayFade.value).clamp(0.0, 1.0), child: ch),
                ),
            ]),
          ),
          if (_board != null)
            Positioned(
              left: M2Space.gutter, right: M2Space.gutter, bottom: M2Layout.histBottom, height: M2Layout.histH,
              child: AnimatedBuilder(
                animation: Listenable.merge([p, w.scroll, w.dayFade]),
                child: ValueListenableBuilder<int>(valueListenable: day, builder: (_, d, ch) => Opacity(opacity: d == 0 ? 1 : 0, child: ch), child: IgnorePointer(child: _board)),
                builder: (_, ch) => Opacity(opacity: (incomingOpacity(p.value) * (1 - _clamp(c() / M2Collapse.fadeEnd)) * w.dayFade.value).clamp(0.0, 1.0), child: ch),
              ),
            ),
        ]),
      ),
    );
  }
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
      padding: const EdgeInsets.fromLTRB(
        0,
        M2Layout.statusPadV,
        M2Layout.statusPadR,
        M2Layout.statusPadV,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(has ? text : ' ', style: M2Text.status.style(M2Color.onDmSoft)),
          if (has) ...[
            const SizedBox(width: M2Layout.statusGapH),
            const _StatusChevron(),
          ],
        ],
      ),
    );
    return NegMargin(
      top: M2Layout.statusMarginTop,
      bottom: M2Layout.statusMarginBottom,
      child: has
          ? Press(
              label: '$text, hours and directions',
              onTap: onTap,
              child: line,
            )
          : ExcludeSemantics(child: Opacity(opacity: 0, child: line)),
    );
  }
}

class _StatusChevron extends StatelessWidget {
  const _StatusChevron();
  @override
  Widget build(BuildContext context) => CustomPaint(
    size: const Size.square(M2Layout.statusChevron),
    painter: _ChevPainter(M2Color.onDmQuiet, M2Layout.statusChevronStroke),
  );
}

class _ChevPainter extends CustomPainter {
  final Color color;
  final double stroke;
  const _ChevPainter(this.color, this.stroke);
  @override
  void paint(Canvas canvas, Size s) {
    canvas.scale(s.width / 18); // viewBox 18: M4 7l5 5 5-5
    canvas.drawPath(
      Path()
        ..moveTo(4, 7)
        ..relativeLineTo(5, 5)
        ..relativeLineTo(5, -5),
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
  }

  @override
  bool shouldRepaint(_ChevPainter o) => o.color != color || o.stroke != stroke;
}
