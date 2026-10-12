import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import '../ui/ui.dart';

double _clamp(double x) => x < 0 ? 0 : x > 1 ? 1 : x;

/// M2's `sharedAxisX` (Material shared axis, X): the old list slides `sharedXDist` toward the side it leaves and is gone by
/// `sharedXAt` of the time; the new one slides in from the other side and is opaque by `sharedXInAt`, overlapping the outgoing fade so
/// the list never empties to bare ground. The outgoing list is a copy of the child as it was. Under reduced motion nothing slides:
/// the new list crossfades in on `rmFade`.
class SharedAxis extends StatefulWidget {
  /// what the child shows; the animation runs when it changes
  final Object id;
  /// +1 when the new content is to the right of the old (the tab order decides), -1 to the left
  final int dir;
  final Widget child;
  /// the content changed for another reason (a day change, which fades through): swap without sliding
  final bool still;
  /// wraps the outgoing copy (to take its keys away)
  final Widget Function(Widget copy)? copyOf;
  const SharedAxis({super.key, required this.id, required this.dir, required this.child, this.still = false, this.copyOf});
  @override
  State<SharedAxis> createState() => SharedAxisState();
}

class SharedAxisState extends State<SharedAxis> with SingleTickerProviderStateMixin {
  late final AnimationController c = AnimationController(vsync: this, value: 1);
  Widget? _ghost;
  int _dir = 1;

  bool get running => c.isAnimating;

  @override
  void didUpdateWidget(SharedAxis oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.id != widget.id && !widget.still) {
      final copy = reducedMotion(context) ? null : oldWidget.child;
      _ghost = copy == null ? null : (widget.copyOf?.call(copy) ?? copy);
      _dir = widget.dir;
      final a = resolveAnim(context, M2Motion.sharedX);
      c.duration = a.duration;
      c.forward(from: 0).whenComplete(() {
        if (mounted) setState(() => _ghost = null);
      });
    }
  }

  @override
  void dispose() {
    c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final rm = reducedMotion(context);
    return AnimatedBuilder(
      animation: c,
      builder: (_, _) {
        final t = c.value, slide = M2Motion.sharedX.curve.transform(t), fade = M2Motion.sharedXFade.curve.transform(t);
        final enter = rm ? M2Motion.rmFade.curve.transform(t) : _clamp(fade / M2Motion.sharedXInAt);
        final arriving = c.isAnimating || t < 1;
        Widget incoming = widget.child;
        if (arriving) {
          incoming = Opacity(
            opacity: enter,
            child: rm ? incoming : Transform.translate(offset: Offset(_dir * M2Motion.sharedXDist * (1 - slide), 0), child: incoming),
          );
        }
        return Stack(children: [
          incoming,
          if (_ghost != null && arriving)
            Positioned(
              left: 0, right: 0, top: 0,
              child: IgnorePointer(
                child: ExcludeSemantics(
                  child: Opacity(
                    opacity: 1 - _clamp(fade / M2Motion.sharedXAt),
                    child: Transform.translate(offset: Offset(-_dir * M2Motion.sharedXDist * slide, 0), child: _ghost),
                  ),
                ),
              ),
            ),
        ]);
      },
    );
  }
}
