import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';

double _c01(double x) => x < 0 ? 0 : x > 1 ? 1 : x;

/// One frame of the tracking layer (M2 R13 §3): the content's opacity, how much of its height is open (1 whole, 0 closed) and how far
/// the plate bar has risen (1 home, 0 below the screen).
typedef LiftFrame = ({double alpha, double size, double bar});

const LiftFrame liftWhole = (alpha: 1, size: 1, bar: 1);
const LiftFrame liftGone = (alpha: 0, size: 0, bar: 0);

/// Where the timeline ends, in ms. Off: fade (`exit`), then close (`fold`). On: open (`fold`), then fade in (`settle`) and, on You, the bar
/// rises over the `fold` after the open.
double liftEnd({required bool on, bool onYou = true}) =>
    (on ? M2Motion.fold.ms + (onYou ? M2Motion.fold.ms : M2Motion.settle.ms) : M2Motion.exit.ms + M2Motion.fold.ms).toDouble();

/// M2 `liftOff` / `liftOn` at `ms`: a fold only ever opens or closes empty space. Reduced motion has opacity crossfades only: the height is
/// whole while anything shows and the bar fades in place ([LiftFrame.bar] still reads 0 to 1; the caller drops the movement).
LiftFrame liftAt({required bool on, required double ms, bool onYou = true, bool reduced = false}) {
  if (!on) {
    final a = 1 - M2Motion.exit.curve.transform(_c01(ms / M2Motion.exit.ms));
    final s = reduced ? (a > 0 ? 1.0 : 0.0) : 1 - M2Motion.fold.curve.transform(_c01((ms - M2Motion.exit.ms) / M2Motion.fold.ms));
    return (alpha: a, size: s, bar: a);
  }
  final fd = M2Motion.fold.ms;
  final open = reduced ? 1.0 : M2Motion.fold.curve.transform(_c01(ms / fd));
  final from = reduced ? 0 : fd;
  final a = M2Motion.settle.curve.transform(_c01((ms - from) / M2Motion.settle.ms));
  final barAt = reduced ? 0 : onYou ? fd : 0;
  return (alpha: a, size: open, bar: M2Motion.fold.curve.transform(_c01((ms - barAt) / fd)));
}

/// The tracking layer's clock. Turning tracking off or on runs it once; everything the layer is made of reads [frame]. Until a ticker is
/// [attach]ed (nothing is on screen) a flip lands at once. A flip while it runs is ignored, as M2's `TRK.busy` does.
class TrackLift extends ChangeNotifier {
  TrackLift(this._on) : _end = liftEnd(on: _on);
  bool _on;
  bool _onYou = true, _reduced = false;
  double _end, _ms = double.infinity;
  AnimationController? _c;
  TickerProvider? _vsync;

  bool get on => _on;
  bool get running => _c?.isAnimating ?? false;

  void attach(TickerProvider v) => _vsync = v;
  void detach() {
    final was = running;
    _c?.dispose();
    _c = null;
    _vsync = null;
    if (was) {
      _ms = _end; // (a lift cut short rests where it was going; the clock outlives the tree that drove it)
      notifyListeners();
    }
  }

  /// [reduced]: the OS asks for no movement
  void to(bool on, {bool onYou = true, bool reduced = false}) {
    if (on == _on || running) return;
    _on = on;
    _onYou = onYou;
    _reduced = reduced;
    final ms = _end = liftEnd(on: on, onYou: onYou);
    final v = _vsync;
    if (v == null) {
      _ms = _end;
      return notifyListeners();
    }
    _ms = 0;
    (_c ??= AnimationController(vsync: v, animationBehavior: AnimationBehavior.preserve)..addListener(() {
          _ms = _c!.value * _end;
          notifyListeners();
        }))
      ..duration = Duration(milliseconds: (ms).round())
      ..forward(from: 0);
    notifyListeners();
  }

  LiftFrame get frame => _ms >= _end ? (_on ? liftWhole : liftGone) : liftAt(on: _on, ms: _ms, onYou: _onYou, reduced: _reduced);
}
