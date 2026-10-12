import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'haptics.dart';
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
  /// Springs to a height in dp (a detent).
  void to(double px, {double v0 = 0}) => _s?._springTo(px, v0: v0);
}

/// M2's `Sheet()` on Flutter's `DraggableScrollableSheet`: a bottom sheet with detents closed / mid / top, a scrim that follows it,
/// and the body's scroll handed to the drag at the top. Opening and closing run M2's spring (k 300, ζ .84) through the
/// controller; a drag and its snap are the framework's (it snaps by the fling's direction at 1600 dp/s, where M2 projects the
/// finger's velocity and springs: a recorded departure, as is the missing rubber band past the top, which the framework clamps).
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
  final ScrollPhysics? physics;
  /// the ground of the sheet
  final Color color;
  const M2Sheet({
    super.key, required this.handle, required this.top, required this.slivers, this.mid, this.min = 0, this.startOpen = true, this.onClosed, this.onSize,
    this.radius = M2Radius.sheet, this.scrim = true, this.header, this.physics, this.color = M2Color.chalk,
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
  double _lastDetent = -1;

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
    super.dispose();
  }

  double get _max => (_h - widget.top);
  double _clampPx(double v) => v.clamp(widget.min, _max);

  double _defaultMid(SheetMetrics m) => (m.content + M2Layout.sheetBottom + MediaQuery.paddingOf(context).bottom).clamp(0, m.height * M2Layout.sheetMaxFrac);

  void _measure() {
    if (!mounted || _h == 0 || !_dsc.isAttached) return;
    final box = _bodyKey.currentContext;
    final sc = _scrollMetrics();
    final content = sc == null ? 0.0 : sc.maxScrollExtent + sc.viewportDimension;
    final m = SheetMetrics(_h, content, box);
    final mid = _clampPx((widget.mid ?? _defaultMid)(m));
    final changed = (mid - _midPx).abs() > 0.5;
    _midPx = mid;
    if (!_measured) {
      _measured = true;
      if (widget.startOpen) _springTo(mid);
      setState(() {});
    } else if (changed) {
      // the content changed under a resting sheet: ease to the new resting height; a sheet being dragged or closing is left alone
      if (_spring.running && _target > 0 && !_closed) {
        _springTo(mid, v0: _spring.v);
      } else if ((_px - _target).abs() < 1 && _target > 0 && _dsc.size > 0) {
        _springTo(mid);
      }
      setState(() {});
    }
  }

  ScrollMetrics? _scrollMetrics() => _sc?.hasClients == true ? _sc!.position : null;
  ScrollController? _sc;

  void _jump(double px) {
    _px = px;
    if (_dsc.isAttached && _h > 0) _dsc.jumpTo((px / _h).clamp(0.0, 1.0));
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
    if (n is ScrollEndNotification) {
      final px = _dsc.isAttached ? _dsc.size * _h : _px;
      final detent = (px - _midPx).abs() < 2 ? _midPx : (px - _max).abs() < 2 ? _max : -1.0;
      if (detent >= 0 && detent != _lastDetent) Haptics.selection();
      _lastDetent = detent;
    }
    return false;
  }

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
      final snaps = [if (_measured && midFrac > minFrac + 0.001 && midFrac < maxFrac - 0.001) midFrac];
      return Stack(children: [
        if (widget.scrim)
          Positioned.fill(
            child: AnimatedBuilder(
              animation: _dsc,
              builder: (_, _) {
                final s = _dsc.isAttached ? _dsc.size : 0.0;
                final f = midFrac <= 0 ? 0.0 : (s / midFrac).clamp(0.0, 1.0);
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
        DraggableScrollableSheet(
          controller: _dsc, expand: true, snap: true, snapSizes: snaps, minChildSize: minFrac, maxChildSize: maxFrac, initialChildSize: widget.startOpen ? 0 : minFrac,
          builder: (context, sc) {
            _sc = sc;
            return NotificationListener<ScrollNotification>(
              onNotification: _onScroll,
              child: DecoratedBox(
                decoration: BoxDecoration(color: widget.color, borderRadius: BorderRadius.vertical(top: Radius.circular(widget.radius))),
                child: ClipRRect(
                  borderRadius: BorderRadius.vertical(top: Radius.circular(widget.radius)),
                  child: CustomScrollView(controller: sc, physics: widget.physics, key: _bodyKey, slivers: [if (widget.header != null) PinnedHeaderSliver(child: widget.header!), ...widget.slivers]),
                ),
              ),
            );
          },
        ),
      ]);
    });
  }
}
