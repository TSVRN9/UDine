import 'dart:math' as math;
import 'package:flutter/gestures.dart';
import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';

/// The tapped band in the overlay's coordinates; `off` is where its window into the header photo starts (px).
class BandRect {
  final double top, height, off;
  const BandRect(this.top, this.height, this.off);
}

/// M2's `edge`-aware interactive back (App Store zoom): drag down, or swipe in from the left edge. One recogniser decides the axis
/// like M2: an edge touch moving right is horizontal, any other touch moving down is vertical (and only while `canDragDown`, a
/// list under it being at its top), anything else is rejected so the child's own gestures keep it.
class BackSwipeRecognizer extends OneSequenceGestureRecognizer {
  BackSwipeRecognizer({required this.onGrab, required this.onMove, required this.onRelease, this.canDragDown, super.debugOwner});
  final VoidCallback onGrab;
  final ValueChanged<double> onMove;
  final void Function(double dist, double v) onRelease;
  final bool Function()? canDragDown;

  int? _pointer;
  Offset _from = Offset.zero;
  bool _edge = false, _started = false, _won = false;
  int _mode = 0; // 0 undecided, 1 horizontal, 2 vertical
  double _last = 0;
  VelocityTracker? _vt;

  @override
  void addAllowedPointer(PointerDownEvent event) {
    if (_pointer != null) return;
    startTrackingPointer(event.pointer, event.transform);
    _pointer = event.pointer;
    _from = event.position;
    _edge = event.localPosition.dx < M2Edge.swipe;
    _mode = 0;
    _started = false;
    _won = false;
    _last = 0;
    _vt = VelocityTracker.withKind(event.kind)..addPosition(event.timeStamp, event.position);
  }

  @override
  void handleEvent(PointerEvent event) {
    if (event.pointer != _pointer) return;
    if (event is PointerMoveEvent) {
      _vt!.addPosition(event.timeStamp, event.position);
      final d = event.position - _from;
      // M2 decides on its first touchmove, which a browser only sends after its own touch slop; here the slop is explicit, so a
      // tap with a wobbling finger stays a tap.
      if (_mode == 0 && d.distance > kTouchSlop) {
        if (_edge && d.dx > 0 && d.dx >= d.dy.abs()) {
          _mode = 1;
          _decided();
        } else if (!_edge && d.dy > 0 && d.dy >= d.dx.abs() && (canDragDown?.call() ?? true)) {
          _mode = 2;
          _decided();
        } else {
          _pointer = null;
          resolve(GestureDisposition.rejected);
          stopTrackingPointer(event.pointer);
          return;
        }
      }
      if (_started) {
        _last = _mode == 1 ? d.dx : d.dy;
        onMove(_last);
      }
    } else if (event is PointerUpEvent || event is PointerCancelEvent) {
      if (_started) {
        final v = event is PointerUpEvent ? _vt!.getVelocity().pixelsPerSecond : Offset.zero;
        _started = false;
        onRelease(_last, (_mode == 1 ? v.dx : v.dy) / 1000);
      } else {
        resolve(GestureDisposition.rejected);
      }
      _pointer = null;
      stopTrackingPointer(event.pointer);
    }
  }

  // A lone recogniser in the arena wins at pointer down, before it has decided anything: it only starts once it has an axis.
  void _decided() => _won ? _begin() : resolve(GestureDisposition.accepted);

  void _begin() {
    if (_started) return;
    _started = true;
    _last = 0;
    onGrab();
  }

  @override
  void acceptGesture(int pointer) {
    if (pointer != _pointer) return;
    _won = true;
    if (_mode != 0) _begin();
  }

  @override
  void rejectGesture(int pointer) {
    if (pointer == _pointer && !_started) {
      _pointer = null;
      stopTrackingPointer(pointer);
    }
  }

  @override
  void didStopTrackingLastPointer(int pointer) {}

  @override
  String get debugDescription => 'back swipe';
}

/// The window and the layer: the container surface (chalk) clipped to [WT, WB], and `child` (the screen, `height` tall) hung
/// from its photo. Paint only; the screen is laid out once.
class ContainerWindow extends StatelessWidget {
  final Animation<double> progress;
  final BandRect rect;
  final double height;
  final Widget child;
  const ContainerWindow({super.key, required this.progress, required this.rect, required this.height, required this.child});

  @override
  Widget build(BuildContext context) {
    final r = rect;
    return ClipRect(
      clipper: _WindowClipper(progress, r, height),
      child: ColoredBox(
        color: M2Color.chalk,
        child: AnimatedBuilder(
          animation: progress,
          child: SizedBox(height: height, child: child),
          builder: (_, c) => Transform.translate(offset: Offset(0, (r.top - r.off) * (1 - progress.value)), child: OverflowBox(alignment: Alignment.topCenter, minHeight: height, maxHeight: height, child: c)),
        ),
      ),
    );
  }
}

class _WindowClipper extends CustomClipper<Rect> {
  _WindowClipper(this.p, this.r, this.h) : super(reclip: p);
  final Animation<double> p;
  final BandRect r;
  final double h;
  @override
  Rect getClip(Size size) {
    final q = 1 - p.value, wt = r.top * q, wb = h - q * (h - r.top - r.height);
    return Rect.fromLTRB(0, wt, size.width, math.max(wt, wb));
  }

  @override
  bool shouldReclip(_WindowClipper old) => old.r != r || old.h != h;
}
