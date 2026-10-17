import 'package:flutter/widgets.dart';
import 'package:flutter/physics.dart';
import 'package:flutter/scheduler.dart';
import '../theme/tokens.dart';

/// Reduced motion, once: M2's `A()` keeps opacity-only crossfades (`rmFade`) and drops movement.
bool reducedMotion(BuildContext c) => MediaQuery.maybeDisableAnimationsOf(c) ?? false;

/// The token a movement runs on: its own, or `rmFade` under reduced motion. Movement itself (slides, scales) is the caller's to
/// drop when `reducedMotion` is true.
Anim resolveAnim(BuildContext c, Anim a) => reducedMotion(c) ? M2Motion.rmFade : a;

/// Fades its child in from nothing from the frame it is mounted: the animation starts at mount, never from an effect.
class Arrive extends StatelessWidget {
  final Widget child;
  final Anim anim;
  /// where the fade starts (M2's `A(el, [{opacity: .4}, {opacity: 1}], 'settle')` turns a sheet's content into another in place)
  final double from;
  const Arrive({super.key, required this.child, this.anim = M2Motion.settle, this.from = 0});
  @override
  Widget build(BuildContext context) {
    final a = resolveAnim(context, anim);
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: from, end: 1), duration: a.duration, curve: a.curve,
      builder: (_, v, c) => Opacity(opacity: v, child: c), child: child,
    );
  }
}

/// A velocity-carrying spring (M2 `spring()`: k 300, ζ .84) on a Ticker, in whatever unit `from` and `to` are in. Reduced motion
/// snaps. One at a time: running again retargets from where it is.
class Spring {
  Spring(this.vsync);
  final TickerProvider vsync;
  Ticker? _ticker;
  double x = 0, v = 0;
  bool get running => _ticker?.isActive ?? false;

  static final description = SpringDescription.withDampingRatio(mass: 1, stiffness: M2Motion.springSheetK, ratio: M2Motion.springSheetZ);
  static const _tolerance = Tolerance(distance: 0.3, velocity: 10); // M2: stop within .3 px at under 10 px/s

  void run({required double from, required double to, double v0 = 0, required ValueChanged<double> onTick, VoidCallback? onDone, bool snap = false}) {
    stop();
    x = from;
    v = v0;
    if (snap) {
      x = to;
      onTick(to);
      onDone?.call();
      return;
    }
    final sim = SpringSimulation(description, from, to, v0, tolerance: _tolerance);
    _ticker = vsync.createTicker((elapsed) {
      final t = elapsed.inMicroseconds / 1e6;
      x = sim.x(t);
      v = sim.dx(t);
      if (sim.isDone(t)) {
        stop();
        x = to;
        v = 0;
        onTick(to);
        onDone?.call();
      } else {
        onTick(x);
      }
    })..start();
  }

  void stop() {
    _ticker?.dispose();
    _ticker = null;
  }

  void dispose() => stop();
}

/// A token's milliseconds as a Duration (receipt time, the slow-network wait), for the screens and the shell, which hold no raw durations.
Duration msOf(num ms) => Duration(milliseconds: (ms).round());
