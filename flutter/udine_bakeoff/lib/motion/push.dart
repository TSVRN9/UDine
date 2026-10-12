import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import '../ui/motion.dart';
import 'container_transform.dart';

double _clamp01(double x) => x < 0 ? 0 : x > 1 ? 1 : x;

/// M2's push (iOS navigation, `navPush`/`navPop`): the page slides in from the right edge over the screen, which shifts left by
/// `pushShift` of the width and dims by `pushDim`, both with the page's own progress. The page casts a soft shadow on what it covers
/// only while it moves. Back, and an edge swipe that follows the finger 1:1, play it in reverse; a release past half the width or a
/// flick commits. One slot: pushing again replaces the page.
class PushController extends ChangeNotifier {
  PushController({required TickerProvider vsync}) : p = AnimationController(vsync: vsync);
  final AnimationController p;
  Widget Function(BuildContext context, VoidCallback pop)? builder;
  int _run = 0;
  bool _disposed = false;

  bool get open => builder != null;

  void push(Widget Function(BuildContext, VoidCallback) b) {
    builder = b;
    p.value = 0;
    notifyListeners();
    _go(1, M2Motion.pushIn);
  }

  void pop() {
    if (!open) return;
    _go(0, M2Motion.pushOut, then: () {
      builder = null;
      notifyListeners();
    });
  }

  // the duration is the full time scaled by the distance left, as the container's
  void _go(double to, Anim a, {VoidCallback? then}) {
    final run = ++_run;
    p.animateTo(to, duration: Duration(milliseconds: (a.ms * (to - p.value).abs()).round()), curve: a.curve).then((_) {
      if (!_disposed && run == _run) then?.call();
    });
  }

  void grab() => p.stop();
  void move(double dist, double width) => p.value = _clamp01(1 - dist / width);

  /// `v` px/ms toward closing. M2: commit on a flick, or when it is past the commit line and not flung back.
  void release(double v) {
    if (v > M2Motion.dragBackFlick || (p.value < 1 - M2Motion.pushCommit && v > -M2Motion.dragBackFlick)) {
      pop();
    } else {
      _go(1, M2Motion.pushIn);
    }
  }

  @override
  void dispose() {
    _disposed = true;
    p.dispose();
    super.dispose();
  }
}

/// Draws `child` and, over it, the controller's page. The tab bar and the plate bar sit outside it and never move.
class PushHost extends StatelessWidget {
  final PushController controller;
  final Widget child;
  const PushHost({super.key, required this.controller, required this.child});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final rm = reducedMotion(context);
        return LayoutBuilder(builder: (context, c) {
          final w = c.maxWidth;
          return Stack(children: [
            AnimatedBuilder(
              animation: controller.p,
              builder: (_, ch) => Transform.translate(offset: Offset(rm ? 0 : -w * M2Motion.pushShift * controller.p.value, 0), child: ch),
              child: child,
            ),
            if (controller.open) ...[
              Positioned.fill(
                child: IgnorePointer(
                  child: AnimatedBuilder(animation: controller.p, builder: (_, _) => ColoredBox(color: M2Color.scrim.withValues(alpha: rm ? 0 : M2Motion.pushDim * controller.p.value))),
                ),
              ),
              Positioned.fill(
                child: RawGestureDetector(
                  behavior: HitTestBehavior.translucent,
                  gestures: {
                    BackSwipeRecognizer: GestureRecognizerFactoryWithHandlers<BackSwipeRecognizer>(
                      () => BackSwipeRecognizer(onGrab: controller.grab, onMove: (d) => controller.move(d, w), onRelease: (d, v) => controller.release(v), canDragDown: () => false),
                      (_) {},
                    ),
                  },
                  child: AnimatedBuilder(
                    animation: controller.p,
                    builder: (_, ch) {
                      final v = controller.p.value, moving = v > 0 && v < 1 && !rm;
                      return Opacity(
                        opacity: rm ? v : 1,
                        child: Transform.translate(
                          offset: Offset(rm ? 0 : w * (1 - v), 0),
                          child: DecoratedBox(decoration: BoxDecoration(boxShadow: moving ? M2Shadow.push : const []), child: ch),
                        ),
                      );
                    },
                    child: Builder(builder: (ctx) => controller.builder!(ctx, controller.pop)),
                  ),
                ),
              ),
            ],
          ]);
        });
      },
    );
  }
}

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
