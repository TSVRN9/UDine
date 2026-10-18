import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import '../../core/m2/board.dart';
import '../../motion/container_math.dart';
import '../../motion/container_transform.dart';
import '../../motion/travel.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';
import 'busy.dart';

double _clamp(double x) => x < 0
    ? 0
    : x > 1
    ? 1
    : x;

/// The hall screen's header (M2 `#mhead`): the photo window, its grades, the chenille letter, the name, the status line (the
/// schedule's door), the busy row and the board. Everything animated reads one `progress` (the container's open) and one
/// collapse `c` (scroll), as M2's `paint(p, y)`; a band's own copy rides on the photo while the container opens.
///
/// Built for the phone's frame budget: the heavy layers (photo, grades, letter, board, name) are made once and handed to small
/// builders that only set an opacity or an offset, so an animation or a scroll re-builds those wrappers, never the layers; the day
/// is a listenable that only the status text, the busy row and the board's visibility read, so a day change builds none of this
/// widget (test/screens/rebuild_test.dart counts).
class HallHeader extends StatefulWidget {
  final String place, name;
  final double top;
  /// the status line's text: '' while the hours are not known (the line keeps its room)
  final ValueListenable<String> status;
  /// today's busy at a hall; null (another day, offline, loading) keeps the row's room and draws nothing
  final ValueListenable<HallBusyView?>? busy;
  final Animation<double> progress;

  /// scroll offset d = clamp(y, 0, HH - CH)
  final ValueListenable<double> scroll;
  final Animation<double> dayFade;
  final BandRect? band;
  /// the band's own copy, drawn over the photo while the container opens (the caller builds it from what the band showed)
  final Widget? ghost;
  final BandParts? parts;
  final VoidCallback? onStatus;
  const HallHeader({
    super.key,
    required this.place,
    required this.name,
    required this.top,
    required this.status,
    required this.progress,
    required this.scroll,
    required this.dayFade,
    this.busy,
    this.band,
    this.ghost,
    this.parts,
    this.onStatus,
  });
  @override
  State<HallHeader> createState() => HallHeaderState();
}

class HallHeaderState extends State<HallHeader> {
  /// How many times this header's own build has run (tests).
  static int builds = 0;
  final _name = GlobalKey(), _head = GlobalKey(), _letterKey = GlobalKey(), _statusText = GlobalKey(), _meter = GlobalKey();
  // the reading was there when the page opened: its row and chart are part of the card, not news (they fade in only when they arrive late)
  bool _lateBusy = false, _lateBoard = false;
  double _drop = 0; // NB: how far the collapsed name falls into the compact bar
  double? _madeFor;
  late final _fin = _Fin(widget.progress);
  late Widget? _photo;
  Widget? _letter;
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

  void _remeasure() => WidgetsBinding.instance.addPostFrameCallback((_) => mounted ? _measure() : null);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => mounted ? _measure() : null);
  }

  @override
  void didUpdateWidget(HallHeader oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.band != widget.band) WidgetsBinding.instance.addPostFrameCallback((_) => mounted ? _measure() : null);
  }

  /// The layers, made once per width.
  void _make(double width) {
    final w = widget, place = w.place, compact = isCafe(place), name = w.name, top = w.top;
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
    _letter = compact ? null : IgnorePointer(child: Stack(children: [HallLetter(key: _letterKey, letter: place, x: hallLx[place]!, top: top + M2Layout.letterTop)]));
  }

  @override
  Widget build(BuildContext context) {
    builds++;
    final width = MediaQuery.sizeOf(context).width;
    if (_madeFor != width) _make(width);
    final w = widget, place = w.place, compact = isCafe(place), band = w.band, p = w.progress;
    final ns = M2Collapse.nameSize / _nameStyle.size;
    double c() => (w.scroll.value.clamp(0.0, r)) / r;
    // M2 R13: a band's letter, title, status line and busy meter are one card with the header's: each is drawn at full opacity along the
    // line from where the card drew it (the copy laid out, never painted, below) to where the header does (reduced motion crossfades).
    final travels = band != null && w.parts != null && w.ghost != null && !reducedMotion(context);
    Widget travel(GlobalKey? card, Widget child, {GlobalKey? anchor, bool scale = false}) =>
        travels ? Travel(progress: p, header: _head, card: card, anchor: anchor, scale: scale, lift: w.scroll, child: child) : child;
    // an element the card did not draw has nothing to travel from: it comes in with the page (M2 `sh && sh.k ? 1 : fin`)
    Widget own(bool onCard, Widget child) => !travels || onCard
        ? child
        : AnimatedBuilder(animation: p, child: child, builder: (_, ch) => Opacity(opacity: incomingOpacity(p.value), child: ch));
    // M2 `fade`: the status line, busy row and board leave with the scroll; what the card has no counterpart for (`fin`: the board) comes with the container
    Widget faded(Widget child, {bool fin = false}) => AnimatedBuilder(
          animation: Listenable.merge([if (fin) p, w.scroll, w.dayFade]), child: child,
          builder: (_, ch) {
            final o = (fin ? incomingOpacity(p.value) : 1.0) * (1 - _clamp(c() / M2Collapse.fadeEnd));
            return Opacity(opacity: (o * w.dayFade.value).clamp(0.0, 1.0), child: IgnorePointer(ignoring: o <= 0.5, child: ch));
          },
        );
    // The busy row's room: M2 keeps it (invisible) when there is no live reading, held at the 39 dp of a hall with its "Calmer around" line.
    const room = ExcludeSemantics(child: Opacity(opacity: 0, child: IgnorePointer(child: BusyRow(lamps: 0, word: 'Busy', extra: 'Calmer around', header: true))));
    final busy = w.busy ?? const AlwaysStoppedAnimation<HallBusyView?>(null);
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
          // (the grades fade by their colours' alpha: the same pixels as an Opacity, with no offscreen layer)
          Positioned.fill(
            child: AnimatedBuilder(
              animation: p,
              builder: (_, _) {
                final o = band != null ? p.value : 1.0;
                LinearGradient g(({List<Color> colors, List<double> stops}) x) =>
                    LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [for (final c in x.colors) c.withValues(alpha: c.a * o)], stops: x.stops);
                return IgnorePointer(
                  key: const ValueKey('fade-headerGrade'),
                  child: Stack(children: [
                    Positioned(left: 0, right: 0, top: 0, height: widget.top + M2Layout.topGradH, child: DecoratedBox(decoration: BoxDecoration(gradient: g(M2Gradient.headTop)))),
                    Positioned(left: 0, right: 0, bottom: 0, height: M2Layout.bottomGradH, child: DecoratedBox(decoration: BoxDecoration(gradient: g(M2Gradient.headBottom)))),
                  ]),
                );
              },
            ),
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
                animation: Listenable.merge([if (travels && !w.parts!.hasLetter) p, w.scroll]), child: travel(w.parts?.letter, _letter!, anchor: _letterKey, scale: true),
                builder: (_, ch) => Opacity(
                  key: const ValueKey('fade-headerLetter'),
                  opacity: ((travels && !w.parts!.hasLetter ? incomingOpacity(p.value) : 1) * (1 - _clamp(c() / M2Collapse.letterEnd))).clamp(0.0, 1.0),
                  child: ch,
                ),
              ),
            ),
          // the band's own grade fades with 1 - p; its copy is only laid out (below), for the shared elements to read
          if (band != null && w.ghost != null) ...[
            Positioned(
              left: 0, right: 0, top: band.off, height: band.height,
              child: AnimatedBuilder(animation: p, builder: (_, _) => BandGrade(key: const ValueKey('fade-bandGrade'), opacity: _clamp(1 - p.value))),
            ),
            Positioned(left: 0, right: 0, top: band.off, height: band.height, child: Offstage(child: w.ghost!)),
          ],
          if (!compact)
            Positioned(
              left: M2Space.gutter, right: M2Space.gutter, bottom: M2Layout.histBottom, height: M2Layout.histH,
              child: faded(ValueListenableBuilder<HallBusyView?>(
                valueListenable: busy,
                builder: (_, v, _) {
                  if (v == null || v.seed) _lateBoard = true;
                  return v?.board == null ? const SizedBox.shrink() : _lateBoard ? Arrive(key: const ValueKey('busy-board'), child: BusyBoard(view: v!)) : BusyBoard(key: const ValueKey('busy-board'), view: v!);
                },
              ), fin: true),
            ),
          // the title block: name (it travels into the bar), status line, busy row
          Positioned(
            left: M2Space.gutter, bottom: compact ? M2Layout.titleBottomCafe : M2Layout.titleBottom,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              AnimatedBuilder(
                animation: Listenable.merge([p, w.scroll, w.dayFade]),
                builder: (_, _) {
                  final cc = travels && p.value < 1 ? 0.0 : c(); // (M2: while it travels it is not also collapsing)
                  // the name fades by its colour's alpha (one run of text: the same pixels as an Opacity, no offscreen layer)
                  final o = w.dayFade.value.clamp(0.0, 1.0);
                  return IgnorePointer(
                    child: Transform(
                      key: _name, // measured on the Transform's own box, which its transform does not move
                      alignment: Alignment.bottomLeft,
                      transform: Matrix4.translationValues(M2Collapse.nameDx * cc, _drop * cc, 0)..scaleByDouble(1 - (1 - ns) * cc, 1 - (1 - ns) * cc, 1, 1),
                      child: Semantics(header: true, child: travel(w.parts?.name, scale: true, Text(w.name, key: const ValueKey('fade-title'), style: _nameStyle.style(M2Color.white.withValues(alpha: o)), maxLines: 1))),
                    ),
                  );
                },
              ),
              // the status line and the busy row take one fade between them (one layer, not one each)
              faded(Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                  // the status text is the only part of this row a day change touches
                  ValueListenableBuilder<String>(
                    valueListenable: w.status,
                    builder: (_, text, _) => own(w.parts?.hasStatus ?? true, travel(w.parts?.status, anchor: _statusText, _StatusLine(textKey: _statusText, chevronFade: _fin, text: text, onTap: w.onStatus))),
                  ),
                  // a café has no busy row, but the empty one keeps its margin (M2 `#mbz`, 0 tall, 8 under the status)
                  if (compact) const SizedBox(height: M2Layout.busyTopHeader),
                  if (!compact)
                    // the row takes its own height as it lands: the name settles over `settle` (at once under reduced motion) and the row fades in
                    ValueListenableBuilder<HallBusyView?>(
                      valueListenable: busy,
                      builder: (_, v, _) {
                        if (v == null) _lateBusy = true;
                        final live = own(w.parts?.hasMeter ?? true, travel(w.parts?.meter, anchor: _meter, BusyRow(lamps: v?.lamps ?? 0, word: v?.word ?? '', extra: v?.extra, header: true, meterKey: _meter, extraFade: _fin)));
                        // (the band's meter holds the room the second line will take)
                        final row = v == null ? room : v.seed ? Stack(children: [room, live]) : _lateBusy ? Arrive(key: const ValueKey('busy-live'), child: live) : KeyedSubtree(key: const ValueKey('busy-live'), child: live);
                        if (reducedMotion(context)) {
                          _remeasure(); // (AnimatedSize cannot run for no time)
                          return row;
                        }
                        return AnimatedSize(alignment: Alignment.topLeft, duration: M2Motion.settle.duration, curve: M2Motion.settle.curve, onEnd: _remeasure, child: row);
                      },
                    ),
              ])),
            ]),
          ),
        ]),
      ),
    );
  }
}

/// `fin` of the container's progress: what a shared element adds to the card's version of itself comes in over this.
class _Fin extends Animation<double> with AnimationWithParentMixin<double> {
  _Fin(this.parent);
  @override
  final Animation<double> parent;
  @override
  double get value => incomingOpacity(parent.value);
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
  final Key? textKey;
  final Animation<double> chevronFade;
  const _StatusLine({required this.text, required this.chevronFade, this.textKey, this.onTap});
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
          Text(has ? text : ' ', key: textKey, style: M2Text.status.style(M2Color.onDmSoft)),
          if (has) ...[
            const SizedBox(width: M2Layout.statusGapH),
            _StatusChevron(chevronFade),
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
  const _StatusChevron(this.fade);
  final Animation<double> fade;
  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: fade,
    builder: (_, _) => CustomPaint(
      size: const Size.square(M2Layout.statusChevron),
      painter: _ChevPainter(M2Color.onDmQuiet.withValues(alpha: M2Color.onDmQuiet.a * fade.value), M2Layout.statusChevronStroke),
    ),
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
