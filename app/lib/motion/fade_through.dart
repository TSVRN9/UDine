import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import '../ui/motion.dart';

/// Top-level tabs: a fade through. The outgoing tab stays drawn; the incoming one fades in over it while settling from `.97`
/// (`fadeThrough`); nothing slides. Under reduced motion, a plain crossfade.
class FadeThroughTabs extends StatefulWidget {
  final int index;
  final List<Widget> children;
  const FadeThroughTabs({super.key, required this.index, required this.children});
  @override
  State<FadeThroughTabs> createState() => _FadeThroughTabsState();
}

class _FadeThroughTabsState extends State<FadeThroughTabs> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, value: 1);
  late int _from = widget.index;

  @override
  void didUpdateWidget(FadeThroughTabs old) {
    super.didUpdateWidget(old);
    if (old.index != widget.index) {
      _from = old.index;
      _c.duration = resolveAnim(context, M2Motion.fadeThrough).duration;
      _c.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final rm = reducedMotion(context);
    return AnimatedBuilder(
      animation: _c,
      builder: (_, _) {
        final t = resolveAnim(context, M2Motion.fadeThrough).curve.transform(_c.value), running = _c.value < 1;
        return Stack(children: [
          for (var i = 0; i < widget.children.length; i++)
            Offstage(
              offstage: i != widget.index && !(running && i == _from),
              child: IgnorePointer(
                ignoring: i != widget.index,
                child: i == widget.index && running
                    ? Opacity(opacity: t, child: rm ? widget.children[i] : Transform.scale(scale: M2Motion.fadeThroughScale + (1 - M2Motion.fadeThroughScale) * t, child: widget.children[i]))
                    : widget.children[i],
              ),
            ),
        ]);
      },
    );
  }
}
