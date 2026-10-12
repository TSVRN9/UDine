import 'dart:math' as math;
import 'package:flutter/gestures.dart';
import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'container_math.dart';

/// The tapped band in the overlay's coordinates; `off` is where its window into the header photo starts (px).
class BandRect {
  final double top, height, off;
  const BandRect(this.top, this.height, this.off);
}

double _clamp01(double x) => x < 0 ? 0 : x > 1 ? 1 : x;

/// One AnimationController, `progress` (0 = band, 1 = menu), drives every animated property, as M2's `paint(p)`: the container
/// window grows from the band's rect to the screen, the screen layer hangs from its photo so the photo stays where the band
/// showed it, outgoing content (the band's copy) fades by `contFade`, incoming content fades in after it. The phase lives in
/// `container_math.dart`'s reducer; only the run that is still current may finish it.
class ContainerTransform extends ChangeNotifier {
  ContainerTransform({required TickerProvider vsync}) : progress = AnimationController(vsync: vsync);

  final AnimationController progress;
  Machine machine = const Machine(Phase.closed, 0);
  BandRect? rect;
  bool _disposed = false;

  Phase get phase => machine.phase;

  Machine _send(Event e) {
    final next = transition(machine, e);
    if (next != machine) {
      machine = next;
      notifyListeners();
    }
    return next;
  }

  // Runs progress to `to` over `ms` x the distance left; only the run that is still current may finish the machine. A cancelled
  // animation's future never completes, and a stale `done` is ignored by the reducer besides.
  void _runTo(double to, int ms, int run) {
    progress
        .animateTo(to, duration: Duration(milliseconds: (ms * (to - progress.value).abs()).round()), curve: emphasized)
        .then((_) {
      if (!_disposed) _send(Event.done(run));
    });
  }

  /// A tap on a band. During a running close it reopens from where the close had got to; while opening it is ignored.
  void open(BandRect from) {
    if (phase == Phase.closed) {
      rect = from;
      progress.value = 0;
    }
    final next = _send(Event.open);
    if (next.phase == Phase.opening) _runTo(1, M2Motion.contD, next.run);
  }

  void close() {
    final next = _send(Event.close);
    if (next.phase == Phase.closing) _runTo(0, M2Motion.contBackD, next.run);
  }

  void grab() {
    if (phase == Phase.closed) return;
    progress.stop();
    _send(Event.grab);
  }

  /// `dist` px along the drag; the whole way back is `dragBackDist`.
  void move(double dist) {
    if (phase == Phase.dragging) progress.value = _clamp01(1 - dist / M2Motion.dragBackDist);
  }

  /// `v` px/ms toward closing.
  void release(double dist, double v) {
    final to = settleTarget(v, _clamp01(1 - dist / M2Motion.dragBackDist));
    final next = _send(Event.release(to));
    if (next.phase == Phase.closing) _runTo(0, M2Motion.contBackD, next.run);
    if (next.phase == Phase.opening) _runTo(1, M2Motion.contD, next.run);
  }

  @override
  void dispose() {
    _disposed = true;
    progress.dispose();
    super.dispose();
  }
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
    _edge = event.localPosition.dx < M2Motion.edge;
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
      if (_mode == 0) {
        if (_edge && d.dx > 0 && d.dx >= d.dy.abs()) {
          _mode = 1;
          _decided();
        } else if (!_edge && d.dy > 0 && d.dy >= d.dx.abs() && (canDragDown?.call() ?? true)) {
          _mode = 2;
          _decided();
        } else if (d.distance > 10) {
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
    if (pointer == _pointer && !_started) _pointer = null;
  }

  @override
  void didStopTrackingLastPointer(int pointer) {}

  @override
  String get debugDescription => 'back swipe';
}

/// The window and the layer: the container surface (chalk) clipped to [WT, WB], and `child` (the screen, `height` tall) hung
/// from its photo. Paint only; the screen is laid out once.
class ContainerWindow extends StatelessWidget {
  final ContainerTransform t;
  final double height;
  final Widget child;
  const ContainerWindow({super.key, required this.t, required this.height, required this.child});

  @override
  Widget build(BuildContext context) {
    final r = t.rect!;
    return ClipRect(
      clipper: _WindowClipper(t.progress, r, height),
      child: ColoredBox(
        color: M2Color.chalk,
        child: AnimatedBuilder(
          animation: t.progress,
          child: SizedBox(height: height, child: child),
          builder: (_, c) => Transform.translate(offset: Offset(0, (r.top - r.off) * (1 - t.progress.value)), child: OverflowBox(alignment: Alignment.topCenter, minHeight: height, maxHeight: height, child: c)),
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
