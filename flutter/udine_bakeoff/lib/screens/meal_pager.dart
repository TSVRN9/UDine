import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import '../ui/ui.dart';

double _clamp(double x) => x < 0 ? 0 : x > 1 ? 1 : x;

/// M2's `sharedAxisX` (Material shared axis, X): the old list slides `sharedXDist` toward the side it leaves and is gone by
/// `sharedXAt` of the time; the new one slides in from the other side and is opaque by `sharedXInAt`, overlapping the outgoing fade so
/// the list never empties to bare ground. The outgoing list is a copy the caller captured of the rows on screen. Under reduced motion
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

class SharedAxisLayerState extends State<SharedAxisLayer> with SingleTickerProviderStateMixin {
  late final AnimationController c = AnimationController(vsync: this, value: 1);
  Widget? _ghost;
  int _dir = 1;

  bool get running => c.isAnimating;

  /// Starts a change: `ghost` is a copy of the rows that were on screen, drawn where they were; `dir` is +1 when the new content is to
  /// the right of the old (the tab order decides).
  void run(int dir, Widget ghost) {
    _dir = dir;
    _ghost = reducedMotion(context) ? null : ghost;
    c.duration = resolveAnim(context, M2Motion.sharedX).duration;
    c.forward(from: 0).whenComplete(() {
      if (mounted) setState(() => _ghost = null);
    });
    setState(() {});
  }

  @override
  void dispose() {
    c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final rm = reducedMotion(context);
    return Stack(children: [
      Positioned.fill(
        child: AnimatedBuilder(
          animation: c, child: widget.child,
          builder: (_, child) {
            final t = c.value, slide = M2Motion.sharedX.curve.transform(t), fade = M2Motion.sharedXFade.curve.transform(t);
            final enter = rm ? M2Motion.rmFade.curve.transform(t) : _clamp(fade / M2Motion.sharedXInAt);
            return Opacity(
              key: const ValueKey('axis-in'), opacity: t < 1 ? enter : 1,
              child: Transform.translate(key: const ValueKey('axis-in-slide'), offset: Offset(rm || t >= 1 ? 0 : _dir * M2Motion.sharedXDist * (1 - slide), 0), child: child),
            );
          },
        ),
      ),
      if (_ghost != null)
        Positioned.fill(
          child: AnimatedBuilder(
            animation: c, child: _ghost,
            builder: (_, child) {
              final t = c.value, slide = M2Motion.sharedX.curve.transform(t), fade = M2Motion.sharedXFade.curve.transform(t);
              return IgnorePointer(
                child: ExcludeSemantics(
                  child: Opacity(
                    key: const ValueKey('axis-out'), opacity: 1 - _clamp(fade / M2Motion.sharedXAt),
                    child: Transform.translate(key: const ValueKey('axis-out-slide'), offset: Offset(-_dir * M2Motion.sharedXDist * slide, 0), child: child),
                  ),
                ),
              );
            },
          ),
        ),
    ]);
  }
}
