import 'package:flutter/widgets.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';

double _clamp(double x) => x < 0 ? 0 : x > 1 ? 1 : x;

/// M2's `sharedAxisX` (Material shared axis, X): the old list slides `sharedXDist` toward the side it leaves and is gone by
/// `sharedXAt` of the time; the new one slides in from the other side and starts fading in only then, so no text is ever doubled (M2
/// round 14, "fade content, keep ground": the header and the page behind the lists never fade). The outgoing list is a copy the caller captured of the rows on screen. Under reduced motion
/// nothing slides: the new list crossfades in on `rmFade`.
///
/// The live list is always inside the same opacity and offset wrappers, whether or not a change is running, so starting one moves no
/// subtree.
class SharedAxisLayer extends StatefulWidget {
  final Widget child;
  const SharedAxisLayer({super.key, required this.child});
  @override
  State<SharedAxisLayer> createState() => SharedAxisLayerState();
}

class SharedAxisLayerState extends State<SharedAxisLayer> with TickerProviderStateMixin {
  late final AnimationController c = AnimationController(vsync: this, value: 1, animationBehavior: AnimationBehavior.preserve);
  /// The outgoing copies still leaving, each on its own clock: a tap mid-run restarts the incoming leg but lets every copy finish, as
  /// M2's `sharedAxisX` does (its ghosts remove themselves when their own animation ends).
  final _ghosts = <_Ghost>[];
  int _dir = 1;

  bool get running => c.isAnimating;

  /// Starts a change: `ghost` is a copy of the rows that were on screen, drawn where they were; `dir` is +1 when the new content is to
  /// the right of the old (the tab order decides).
  void run(int dir, Widget? ghost) {
    // M2 `sharedAxisX`: always the incoming leg, from the start, whatever was running; an outgoing copy only when there were rows to copy
    _dir = dir;
    final d = resolveAnim(context, M2Motion.sharedX).duration;
    c.duration = d;
    c.forward(from: 0);
    if (ghost != null && !reducedMotion(context)) {
      final g = _Ghost(ghost, dir, AnimationController(vsync: this, duration: d, animationBehavior: AnimationBehavior.preserve));
      _ghosts.add(g);
      g.c.forward().whenComplete(() {
        if (!mounted) return;
        setState(() => _ghosts.remove(g));
        g.c.dispose();
      });
    }
    setState(() {});
  }

  @override
  void dispose() {
    c.dispose();
    for (final g in _ghosts) {
      g.c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final rm = reducedMotion(context);
    return Stack(children: [
      Positioned.fill(
        child: AnimatedBuilder(
          animation: c, child: RepaintBoundary(child: widget.child),
          builder: (_, child) {
            final t = c.value, slide = M2Motion.sharedX.curve.transform(t), fade = M2Motion.sharedXFade.curve.transform(t);
            final enter = rm ? M2Motion.rmFade.curve.transform(t) : _clamp((fade - M2Motion.sharedXAt) / (1 - M2Motion.sharedXAt));
            return Opacity(
              key: const ValueKey('axis-in'), opacity: t < 1 ? enter : 1,
              child: Transform.translate(key: const ValueKey('axis-in-slide'), offset: Offset(rm || t >= 1 ? 0 : _dir * M2Motion.sharedXDist * (1 - slide), 0), child: child),
            );
          },
        ),
      ),
      for (final g in _ghosts)
        Positioned.fill(
          child: AnimatedBuilder(
            animation: g.c, child: RepaintBoundary(child: g.child),
            builder: (_, child) {
              final t = g.c.value, slide = M2Motion.sharedX.curve.transform(t), fade = M2Motion.sharedXFade.curve.transform(t);
              return IgnorePointer(
                child: ExcludeSemantics(
                  child: Opacity(
                    key: const ValueKey('axis-out'), opacity: 1 - _clamp(fade / M2Motion.sharedXAt),
                    child: Transform.translate(key: const ValueKey('axis-out-slide'), offset: Offset(-g.dir * M2Motion.sharedXDist * slide, 0), child: child),
                  ),
                ),
              );
            },
          ),
        ),
    ]);
  }
}

class _Ghost {
  final Widget child;
  final int dir;
  final AnimationController c;
  _Ghost(this.child, this.dir, this.c);
}
