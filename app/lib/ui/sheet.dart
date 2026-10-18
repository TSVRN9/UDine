import 'dart:async' show scheduleMicrotask;
import 'dart:math' as math;

import 'package:flutter/gestures.dart';
import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'haptics.dart';
import 'insets.dart';
import 'motion.dart';

/// What a sheet knows when it works out its resting height.
class SheetMetrics {
  /// the frame the sheet sits in
  final double height;
  /// the scrolled content, header included, laid out in full
  final double content;
  /// the content's own box, for a caller that measures a row of it
  final BuildContext? body;
  const SheetMetrics(this.height, this.content, this.body);
}

/// Drives a sheet from outside: open it, close it, run something once it is half-way out.
class SheetHandle {
  _M2SheetState? _s;
  bool get attached => _s != null;
  /// The sheet's height now, in dp.
  double get px => _s?._px ?? 0;
  /// Springs the sheet shut. `halfway` runs once it is half-way out, so what follows starts while it finishes leaving (M2
  /// `isheet.away`): never on dismissal, which for a dragged sheet comes much later.
  void away([VoidCallback? halfway]) => _s?._away(halfway);
  void close() => _s?._away(null);
  /// Heading for its lowest height (or already there), though still in the tree until its spring settles: a back must not land on it.
  bool get closing => _s?._closing ?? false;
  /// Springs to a height in dp (a detent).
  void to(double px, {double v0 = 0}) => _s?._springTo(px, v0: v0);

  /// Android's predictive back: the sheet lowers by the gesture's distance from where it was, then closes (to its lowest height) or
  /// springs back up as Android decides.
  void backStart() => _s?._backStart();
  void backMove(double dist) => _s?._backMove(dist);
  void backEnd({required bool commit}) => _s?._backEnd(commit);
}

/// M2's `rubber(x, d)`: how far a drag `x` past the top detent moves the sheet, for a frame `d` tall; it approaches `d` and never reaches it.
double sheetRubber(double x, double d) => (1 - 1 / (x * M2Motion.sheetReleaseRubber / d + 1)) * d;

/// The inverse of [sheetRubber]: the drag that has moved the sheet `y` past the top.
double _unrubber(double y, double d) => y <= 0 ? 0 : d / M2Motion.sheetReleaseRubber * (1 / (1 - y / d) - 1);

/// M2 `release`: the height (dp) a sheet released at `px` going `v` dp/s upward settles at. The finger's velocity is projected
/// `sheetReleaseProject` seconds ahead and the nearest detent wins (top, then mid, then closed on a tie, as M2 loops them); a mid
/// within `sheetReleaseMidTop` of the top is no detent, and short of the top by more than `sheetReleaseCloseBelowTop` it closes.
double sheetReleaseTarget({required double px, required double v, required double min, required double max, double? mid}) {
  final proj = px + v.clamp(-M2Motion.sheetReleaseVMax, M2Motion.sheetReleaseVMax) * M2Motion.sheetReleaseProject;
  final detents = [max, ?mid, min]; // M2's loop order: the first of equals wins
  var best = 0;
  for (var i = 1; i < detents.length; i++) {
    if ((detents[i] - proj).abs() < (detents[best] - proj).abs()) best = i;
  }
  if (mid != null && best == 1 && mid >= max - M2Motion.sheetReleaseMidTop) return proj < max - M2Motion.sheetReleaseCloseBelowTop ? min : max;
  return detents[best];
}

/// Holds the body still while the sheet is being pulled past its top (the finger belongs to the rubber band then, not the scroll).
class _HoldPhysics extends ScrollPhysics {
  const _HoldPhysics(this.held, {super.parent});
  final bool Function() held;
  @override
  _HoldPhysics applyTo(ScrollPhysics? ancestor) => _HoldPhysics(held, parent: buildParent(ancestor));
  @override
  double applyPhysicsToUserOffset(ScrollMetrics position, double offset) => held() ? 0 : super.applyPhysicsToUserOffset(position, offset);
}

/// M2's `Sheet()` on Flutter's `DraggableScrollableSheet`: a bottom sheet with detents closed / mid / top, a scrim that follows it,
/// and the body's scroll handed to the drag at the top. Opening and closing run M2's spring (k 300, ζ .84) through the
/// controller, and so does a drag's release: the finger's velocity is projected and the sheet springs to the nearest detent (M2
/// `release`), where the framework would snap linearly. A drag that starts below the top and goes past it rubber-bands (M2 `drag`),
/// which the framework clamps; the overshoot is drawn here, as a shift of the whole sheet.
class M2Sheet extends StatefulWidget {
  final SheetHandle handle;
  /// the top detent's distance from the frame's top (status inset + 8)
  final double top;
  /// the resting height; null sizes it to its content, as M2 does for every sheet that is not the dish sheet
  final double Function(SheetMetrics m)? mid;
  /// the smallest height: 0 for a sheet that closes, the bar's height for the plate sheet (which never closes)
  final double min;
  final bool startOpen;
  final VoidCallback? onClosed;
  final ValueChanged<double>? onSize;
  final double radius;
  final bool scrim;
  final Widget? header;
  final List<Widget> slivers;
  /// room under the content inside the scroll (`.sbody` padding-bottom: 24 plus the bottom inset; the plate sheet clears its bar with 84)
  final double? bottomPad;
  final ScrollPhysics? physics;
  /// Where the body starts (scroll offset), from the first layout and before the sheet is visible: the hours sheet opens at the
  /// chosen day. Gets the metrics and the resting height; null leaves it at the top.
  final double? Function(SheetMetrics m, double mid)? landing;
  /// the ground of the sheet
  final Color color;
  /// the sheet's own shadow (a sheet that sits over a live screen rather than over a scrim)
  final List<BoxShadow>? shadow;
  const M2Sheet({
    super.key, required this.handle, required this.top, required this.slivers, this.mid, this.min = 0, this.startOpen = true, this.onClosed, this.onSize,
    this.radius = M2Radius.sheet, this.scrim = true, this.header, this.physics, this.landing, this.bottomPad, this.color = M2Color.chalk, this.shadow,
  });
  @override
  State<M2Sheet> createState() => _M2SheetState();
}

class _M2SheetState extends State<M2Sheet> with TickerProviderStateMixin {
  final _dsc = DraggableScrollableController();
  late final Spring _spring = Spring(this);
  final _bodyKey = GlobalKey();
  double _h = 0, _midPx = 0, _px = 0, _target = 0;
  bool _opened = false, _closed = false, _measured = false;
  double? _leaveBelow;
  VoidCallback? _leave;
  // the finger on the sheet: M2's one pointer stream, kept beside the framework's drag (which moves the sheet) for the two things it cannot do
  int? _pointer;
  VelocityTracker? _vt;
  double _g0 = 0, _lastY = 0, _pastTop = 0, _y = 0;
  bool _below = false, _owned = false;
  /// How far the sheet is drawn above the framework's height, in dp: the rubber band's overshoot, and what the framework's drag took
  /// off the sheet while the finger was still unwinding that overshoot (the sheet is drawn at `_y` then, whatever the framework did).
  final _over = ValueNotifier<double>(0);

  @override
  void initState() {
    super.initState();
    widget.handle._s = this;
    _dsc.addListener(_onSize);
    WidgetsBinding.instance.addPostFrameCallback((_) => _measure());
  }

  @override
  void didUpdateWidget(M2Sheet old) {
    super.didUpdateWidget(old);
    if (old.handle != widget.handle) widget.handle._s = this;
    WidgetsBinding.instance.addPostFrameCallback((_) => _measure());
  }

  @override
  void dispose() {
    if (widget.handle._s == this) widget.handle._s = null;
    _spring.dispose();
    _dsc.removeListener(_onSize);
    _dsc.dispose();
    _over.dispose();
    super.dispose();
  }

  double get _max => (_h - widget.top);
  double _clampPx(double v) => v.clamp(widget.min, _max);

  double get _pad => widget.bottomPad ?? (M2Layout.sheetBottom + safeBottom(context));
  double _defaultMid(SheetMetrics m) => (m.content + _pad).clamp(0, m.height * M2Layout.sheetMaxFrac);

  void _measure() {
    if (!mounted || _h == 0 || !_dsc.isAttached) return;
    final box = _bodyKey.currentContext;
    final sc = _scrollMetrics();
    final content = sc == null ? 0.0 : sc.maxScrollExtent + sc.viewportDimension - _pad; // (the room under the content is not part of what the resting height fits)
    final m = SheetMetrics(_h, content, box);
    final mid = _clampPx((widget.mid ?? _defaultMid)(m));
    if (!_measured && widget.landing != null) {
      final off = widget.landing!(m, mid);
      if (off != null && _sc!.hasClients) _sc!.jumpTo(off.clamp(0.0, _sc!.position.maxScrollExtent));
    }
    final changed = (mid - _midPx).abs() > 0.5, oldMid = _midPx;
    _midPx = mid;
    if (!_measured) {
      _measured = true;
      if (widget.startOpen) _springTo(mid);
      setState(() {});
    } else if (changed) {
      // the content changed under a resting sheet: ease to the new resting height; a sheet being dragged or closing is left alone
      final headingToMid = (_target - oldMid).abs() < 1 && _target > widget.min + 1;
      if (_spring.running && headingToMid && !_closed) {
        _springTo(mid, v0: _spring.v);
      } else if (!_spring.running && headingToMid && (_px - _target).abs() < 1) {
        _springTo(mid);
      }
      setState(() {});
    }
  }

  ScrollMetrics? _scrollMetrics() => _sc?.hasClients == true ? _sc!.position : null;
  ScrollController? _sc;

  void _jump(double px) {
    if (_dsc.isAttached && _h > 0) _dsc.jumpTo((px.clamp(0.0, _max) / _h).clamp(0.0, 1.0));
    _px = px; // (after the jump: its listener writes the clamped height)
    _over.value = px > _max ? px - _max : 0;
    widget.onSize?.call(px);
  }

  void _springTo(double px, {double v0 = 0}) {
    if (_h == 0) return;
    _closed = false;
    _target = _clampPx(px);
    _spring.run(
      from: _px, to: _target, v0: v0, snap: reducedMotion(context),
      onTick: _jump,
      onDone: () {
        if (_target <= widget.min + 0.5 && widget.min == 0) _finishClose();
      },
    );
  }

  bool get _closing => _closed || (_spring.running && _target <= widget.min + 0.5);

  void _away(VoidCallback? halfway) {
    if (_closed) {
      halfway?.call();
      return;
    }
    _leave = halfway;
    _leaveBelow = _px * 0.5;
    if (reducedMotion(context)) {
      final f = _leave;
      _leave = null;
      f?.call();
    }
    _springTo(widget.min, v0: _spring.running ? _spring.v : 0);
  }

  double? _back0;

  void _backStart() {
    if (_closed) return; // (already leaving: the gesture leaves it be)
    _spring.stop();
    _back0 = _px;
  }

  // (1 dp short of a shut sheet: Android may still cancel, and at 0 the sheet would count itself closed)
  void _backMove(double dist) {
    final b = _back0;
    if (b != null) _jump((b - dist).clamp(math.min(b, widget.min + 1), b));
  }

  void _backEnd(bool commit) {
    final b = _back0;
    _back0 = null;
    if (b == null) return;
    commit ? _away(null) : _springTo(b);
  }

  void _finishClose() {
    if (_closed) return;
    _closed = true;
    final f = _leave;
    _leave = null;
    f?.call();
    widget.onClosed?.call();
  }

  void _onSize() {
    if (!_dsc.isAttached) return;
    final px = _dsc.size * _h;
    if (!_spring.running) {
      _px = px;
      widget.onSize?.call(px);
    }
    if (_owned) _over.value = _y - px;
    if (px > 1) _opened = true;
    final lb = _leaveBelow;
    if (lb != null && px <= lb && _leave != null) {
      final f = _leave;
      _leave = null;
      _leaveBelow = null;
      f?.call();
    }
    // a drag (or its snap) that ended at the bottom: the sheet is shut
    if (widget.min == 0 && _opened && !_spring.running && px <= 0.5) _finishClose();
  }

  bool _onScroll(ScrollNotification n) {
    if (n is ScrollStartNotification && n.dragDetails != null) _spring.stop(); // the finger takes the sheet
    return false;
  }

  void _down(PointerDownEvent e) {
    if (_pointer != null) return;
    _pointer = e.pointer;
    _vt = VelocityTracker.withKind(e.kind)..addPosition(e.timeStamp, e.position);
    _lastY = e.position.dy;
    _g0 = _dsc.isAttached ? _dsc.size * _h + _over.value : _px;
    _y = _g0;
    _pastTop = _unrubber(_over.value, _h); // (a sheet caught on its way back from the rubber band)
    _owned = _pastTop > 0;
    _below = _g0 < _max - 2 || _owned; // M2: from the top, the body scrolls; from below, the finger has the sheet whatever it does
  }

  void _move(PointerMoveEvent e) {
    if (e.pointer != _pointer) return;
    _vt!.addPosition(e.timeStamp, e.position);
    final up = _lastY - e.position.dy;
    _lastY = e.position.dy;
    if (!_below) return;
    // the sheet's height under the finger, 1:1 through the rubber curve past the top; the framework's drag is cancelled out of it
    final y0 = _owned ? _y : (_dsc.isAttached ? _dsc.size * _h : _px);
    final past = _pastTop > 0 ? _pastTop + up : y0 + up - _max;
    if (past <= 0 && !_owned) return;
    _owned = true;
    _pastTop = past > 0 ? past : 0;
    _y = past > 0 ? _max + sheetRubber(past, _h) : (_max + past).clamp(widget.min, _max);
    _over.value = _y - (_dsc.isAttached ? _dsc.size * _h : _px);
  }

  void _up(PointerEvent e) {
    if (e.pointer != _pointer) return;
    _pointer = null;
    final v = e is PointerUpEvent ? -_vt!.getVelocity().pixelsPerSecond.dy : 0.0; // dp/s, upward
    final px = (_dsc.isAttached ? _dsc.size * _h : _px) + _over.value;
    _pastTop = 0;
    _owned = false;
    if ((px - _g0).abs() < 0.5) return; // (a tap, or the body scrolled)
    // after the framework's own release has run: it is what this replaces
    scheduleMicrotask(() {
      if (!mounted) return;
      _jump(px); // (stops the framework's snap)
      final to = sheetReleaseTarget(px: px, v: v, min: widget.min, max: _max, mid: _measured ? _midPx : null);
      if (to > widget.min + 0.5) Haptics.selection();
      _springTo(to, v0: v.clamp(-M2Motion.sheetReleaseVMax, M2Motion.sheetReleaseVMax));
    });
  }

  Widget _scroll(ScrollController sc) => CustomScrollView(controller: sc, physics: _HoldPhysics(() => _pastTop > 0, parent: widget.physics), key: _bodyKey, slivers: [if (widget.header != null) PinnedHeaderSliver(child: widget.header!), ...widget.slivers, SliverToBoxAdapter(child: SizedBox(height: _pad))]);

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      if (c.maxHeight != _h) {
        final first = _h == 0;
        _h = c.maxHeight;
        if (first) {
          _px = widget.startOpen ? 0 : widget.min;
        }
      }
      final minFrac = _h == 0 ? 0.0 : widget.min / _h, maxFrac = _h == 0 ? 1.0 : _max / _h;
      final midFrac = _h == 0 ? 0.0 : _midPx / _h;
      return Listener(
        onPointerDown: _down, onPointerMove: _move, onPointerUp: _up, onPointerCancel: _up,
        child: Stack(children: [
        if (widget.scrim)
          Positioned.fill(
            child: AnimatedBuilder(
              animation: _dsc,
              builder: (_, _) {
                final s = _dsc.isAttached ? _dsc.size : 0.0;
                // (closed - y) / (closed - mid): from the sheet's lowest height, not from nothing
                final f = midFrac <= minFrac ? 0.0 : ((s - minFrac) / (midFrac - minFrac)).clamp(0.0, 1.0);
                return IgnorePointer(
                  ignoring: f <= 0,
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque, onTap: widget.handle.close,
                    child: ColoredBox(color: M2Color.scrim.withValues(alpha: M2Motion.plateScrim * f)),
                  ),
                );
              },
            ),
          ),
        ValueListenableBuilder<double>(
          valueListenable: _over,
          builder: (_, over, sheet) => Stack(fit: StackFit.expand, children: [
            Positioned(left: 0, right: 0, bottom: 0, height: over < 0 ? 0 : over, child: ColoredBox(color: widget.color)), // (what the lifted sheet leaves bare)
            Transform.translate(offset: Offset(0, -over), child: sheet),
          ]),
          child: DraggableScrollableSheet(
          controller: _dsc, expand: true, minChildSize: minFrac, maxChildSize: maxFrac, initialChildSize: widget.startOpen ? 0 : minFrac,
          builder: (context, sc) {
            _sc = sc;
            return NotificationListener<ScrollNotification>(
              onNotification: _onScroll,
              child: DecoratedBox(
                decoration: BoxDecoration(color: widget.color, borderRadius: BorderRadius.vertical(top: Radius.circular(widget.radius)), boxShadow: widget.shadow),
                child: widget.radius == 0
                    ? _scroll(sc)
                    : ClipRRect(borderRadius: BorderRadius.vertical(top: Radius.circular(widget.radius)), child: _scroll(sc)),
              ),
            );
          },
          ),
        ),
      ]),
      );
    });
  }
}

/// `.grab`: the 22 dp strip with the 40 x 5 handle, the sheet's pinned top.
class SheetGrab extends StatelessWidget {
  final Color color;
  const SheetGrab({super.key, this.color = M2Color.chalk});
  @override
  Widget build(BuildContext context) => ColoredBox(
        color: color,
        child: SizedBox(
          height: M2Layout.grabH,
          child: Center(child: Container(width: M2Layout.grabW, height: M2Layout.grabBar, decoration: const BoxDecoration(color: M2Color.grab, borderRadius: BorderRadius.all(Radius.circular(M2Layout.grabBar)))),
          ),
        ),
      );
}
