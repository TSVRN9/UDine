import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import '../ui/motion.dart';
import 'container_math.dart';
import 'container_transform.dart';

double _clamp01(double x) => x < 0 ? 0 : x > 1 ? 1 : x;

/// The progress M2's `paint(p)` reads, run on the route's own controller: `from` to `to` over the token's time scaled by the
/// distance left, shaped by its curve, so a release after a drag settles from where the finger left it with no jump. A fresh open
/// does not start its clock until the page's first frame is drawn (the first tick after the one that built it), so a heavy page
/// cannot start the curve at 91%.
class _Shaped extends Simulation {
  _Shaped({required this.from, required this.to, required Anim anim, this.lateStart = false})
      : curve = anim.curve,
        seconds = anim.ms / 1000 * (to - from).abs();
  final double from, to, seconds;
  final Curve curve;
  final bool lateStart;
  double? _origin;

  double _t(double t) {
    if (!lateStart || t.isInfinite) return t;
    if (t > 0) _origin ??= t;
    return t - (_origin ?? t);
  }

  @override
  double x(double time) {
    final t = _t(time);
    return seconds <= 0 || t >= seconds ? to : from + (to - from) * curve.transform(_clamp01(t / seconds));
  }

  @override
  double dx(double time) => (x(time + 0.001) - x(time)) / 0.001;

  @override
  bool isDone(double time) => _t(time) >= seconds;
}

/// Which band a card is open from; the band draws nothing while its card is up or closing, and reappears the moment the last
/// card from it is gone. Keyed by the card's source (a place key); the token is the route, so a card that is reopened from the same
/// band while the first still closes does not show the band when the first finally goes.
class BandHider extends ChangeNotifier {
  final _by = <Object, Object>{};
  bool hides(Object key) => _by.containsKey(key);
  void hide(Object key, Object token) {
    _by[key] = token;
    notifyListeners();
  }

  void show(Object key, Object token) {
    if (_by[key] == token) {
      _by.remove(key);
      notifyListeners();
    }
  }
}

/// A route of the app's stack: one layer over the one beneath, on one controller whose value is the progress itself. Subclasses say
/// how that progress is drawn. Back is interactive (`BackSwipeRecognizer`) and tracks the finger 1:1 over `extent` px.
abstract class StackRoute<T> extends PageRoute<T> {
  StackRoute({super.settings, required this.reduced});

  /// Reduced motion, read when the route was pushed: every transform becomes M2's crossfade.
  final bool reduced;
  Anim get anim;
  Anim get animBack;

  /// The route directly above, when it is a push (it shifts and dims this one; a card leaves it still).
  PushRoute<dynamic>? _coveredBy;

  Anim _use(Anim a) => reduced ? M2Motion.rmFade : a;

  @override
  Duration get transitionDuration => _use(anim).duration;
  @override
  Duration get reverseTransitionDuration => _use(animBack).duration;
  @override
  bool get opaque => true;
  @override
  bool get barrierDismissible => false;
  @override
  Color? get barrierColor => null;
  @override
  String? get barrierLabel => null;
  @override
  bool get maintainState => true;

  @override
  Simulation? createSimulation({required bool forward}) {
    final v = controller!.value;
    return forward
        ? _Shaped(from: v, to: 1, anim: _use(anim), lateStart: v == 0)
        : _Shaped(from: v, to: 0, anim: _use(animBack));
  }

  @override
  void didChangeNext(Route<dynamic>? nextRoute) {
    _coveredBy = nextRoute is PushRoute ? nextRoute : null;
    super.didChangeNext(nextRoute);
  }

  @override
  void didPopNext(Route<dynamic> nextRoute) {
    _coveredBy = nextRoute is PushRoute ? nextRoute : null;
    super.didPopNext(nextRoute);
  }

  // ---- interactive back ----

  /// How many px of finger take the screen all the way back.
  double extent(double width);
  bool get dragDown => false;
  bool Function()? canDragDown;

  void _grab() {
    if (!isCurrent || controller == null) return;
    navigator!.didStartUserGesture();
    controller!.stop();
  }

  void _move(double dist, double width) {
    if (controller != null && navigator!.userGestureInProgress) controller!.value = _clamp01(1 - dist / extent(width));
  }

  bool settlesClosed(double v, double p);

  void _release(double v) {
    final c = controller;
    if (c != null) _settle(close: settlesClosed(v, c.value));
  }

  /// Ends a drag-back from where it is: out (the pop's own simulation starts at the current progress) or back up.
  void _settle({required bool close}) {
    final c = controller;
    if (c == null || !navigator!.userGestureInProgress) return;
    if (close) {
      navigator!.pop();
    } else {
      c.animateWith(_Shaped(from: c.value, to: 1, anim: _use(anim)));
    }
    navigator!.didStopUserGesture();
  }

  // Android's predictive back (the system gesture, sent to the Shell) draws the same drag-back. Android decides commit or cancel, so
  // there is no settle rule here; TransitionRoute's own handlers would reverse from the top after the pop's simulation started.
  void backStart() => _grab();
  void backMove(double dist, double width) => _move(dist, width);
  void backEnd({required bool commit}) => _settle(close: commit && isCurrent); // (a page pushed over it meanwhile is not the one to pop)

  Widget _withBack(Widget child, double width) => RawGestureDetector(
        behavior: HitTestBehavior.translucent,
        gestures: {
          BackSwipeRecognizer: GestureRecognizerFactoryWithHandlers<BackSwipeRecognizer>(
            () => BackSwipeRecognizer(onGrab: _grab, onMove: (d) => _move(d, width), onRelease: (d, v) => _release(v), canDragDown: dragDown ? () => canDragDown?.call() ?? true : () => false),
            (_) {},
          ),
        },
        child: child,
      );

  /// What a push over this route does to it: shift left by `pushShift` of the width and dim by `pushDim`, both with the cover's
  /// own progress. Under reduced motion, nothing moves.
  Widget _covered(Widget child, Animation<double> secondary, double width) {
    return AnimatedBuilder(
      animation: secondary,
      builder: (_, c) {
        final s = _coveredBy == null || _coveredBy!.reduced ? 0.0 : secondary.value;
        if (s == 0) return c!;
        return Transform.translate(
          offset: Offset(-width * M2Motion.pushShift * s, 0),
          child: Stack(children: [c!, Positioned.fill(child: IgnorePointer(child: ColoredBox(color: M2Color.scrim.withValues(alpha: M2Motion.pushDim * s))))]),
        );
      },
      child: child,
    );
  }

  @override
  Widget buildTransitions(BuildContext context, Animation<double> animation, Animation<double> secondaryAnimation, Widget child) =>
      // A route on its way out takes no touches, window and gesture layer included, so a tap on the band it shrinks toward reaches the
      // band (Flutter's own scope only ignores the page inside the transition).
      IgnorePointer(
        ignoring: animation.status == AnimationStatus.reverse,
        child: LayoutBuilder(builder: (context, c) => _covered(transition(context, animation, child, c.biggest), secondaryAnimation, c.maxWidth)),
      );

  /// This route's own entrance, drawn from its progress.
  Widget transition(BuildContext context, Animation<double> p, Widget page, Size size);
}

/// The tab root: always there, never animates in; it is only ever covered.
class BaseRoute<T> extends StackRoute<T> {
  BaseRoute({super.settings, required this.builder}) : super(reduced: false);
  final WidgetBuilder builder;
  @override
  Anim get anim => M2Motion.rmFade; // (never runs: the base is there from the first frame)
  @override
  Anim get animBack => M2Motion.rmFade;
  @override
  Duration get transitionDuration => Duration.zero;
  @override
  Duration get reverseTransitionDuration => Duration.zero;
  @override
  Simulation? createSimulation({required bool forward}) => null;
  @override
  double extent(double width) => width;
  @override
  bool settlesClosed(double v, double p) => false;
  @override
  Widget buildPage(BuildContext context, Animation<double> animation, Animation<double> secondaryAnimation) => builder(context);
  @override
  Widget transition(BuildContext context, Animation<double> p, Widget page, Size size) => page;
}

/// M2's push (iOS navigation, `navPush`/`navPop`): the page slides in from the right edge over the screen, which shifts left and
/// dims; the page casts a soft shadow on what it covers only while it moves. Back, and an edge swipe that follows the finger 1:1,
/// play it in reverse; a release past half the width or a flick commits. A pushed page can push again.
class PushRoute<T> extends StackRoute<T> {
  PushRoute({super.settings, required super.reduced, required this.builder});
  final WidgetBuilder builder;
  @override
  Anim get anim => M2Motion.pushIn;
  @override
  Anim get animBack => M2Motion.pushOut;
  @override
  double extent(double width) => width;
  @override
  bool settlesClosed(double v, double p) => v > M2Motion.dragBackFlick || (p < 1 - M2Motion.pushCommit && v > -M2Motion.dragBackFlick);
  @override
  Widget buildPage(BuildContext context, Animation<double> animation, Animation<double> secondaryAnimation) => builder(context);

  @override
  Widget transition(BuildContext context, Animation<double> p, Widget page, Size size) {
    final w = size.width;
    return _withBack(
      AnimatedBuilder(
        animation: p,
        builder: (_, ch) {
          final v = p.value, moving = v > 0 && v < 1 && !reduced;
          return Opacity(
            opacity: reduced ? v : 1,
            child: Transform.translate(offset: Offset(reduced ? 0 : w * (1 - v), 0), child: DecoratedBox(decoration: BoxDecoration(boxShadow: moving ? M2Shadow.push : const []), child: ch)),
          );
        },
        child: page,
      ),
      w,
    );
  }
}

/// What a card's page is told: the progress it is drawn at (0 = the band, 1 = the page), where the band was, and how to close.
class CardPage {
  CardPage({required this.progress, required this.rect, required this.close, this.dragWrap = _same});
  final Animation<double> progress;
  final BandRect rect;
  final VoidCallback close;

  /// Wraps a page's scrolling list in the back-drag recogniser, as a descendant of the scroll view: at the list's top a drag down is then
  /// claimed before the list's own drag is (the recogniser the route holds above the page sees the move second).
  final Widget Function(Widget child) dragWrap;

  /// A drag down takes the screen only while this is true (M2: `sc.scrollTop <= 0`); the page sets it from its list.
  bool Function() canDragDown = () => true;
}

Widget _same(Widget child) => child;

/// M2's expanding card (container transform): the band's rect grows to the screen and the page hangs from its photo; the screen
/// behind stays put under a 32% scrim. Back is the same frames reversed, and interactive: drag down (only while the page's list is
/// at its top, `canDragDown`) or swipe in from the left edge. The tapped band is hidden while its card is up.
class CardRoute<T> extends StackRoute<T> {
  CardRoute({super.settings, required super.reduced, required this.rect, required this.source, required this.hider, required this.builder});
  final BandRect rect;
  final Object source;
  final BandHider hider;
  final Widget Function(BuildContext context, CardPage page) builder;
  @override
  Anim get anim => M2Motion.cont;
  @override
  Anim get animBack => M2Motion.contBack;
  @override
  bool get dragDown => true;
  @override
  double extent(double width) => M2Motion.dragBackDist;
  @override
  bool settlesClosed(double v, double p) => settleTarget(v, p) == Settle.closed;

  @override
  void install() {
    super.install();
    hider.hide(source, this);
  }

  @override
  void dispose() {
    hider.show(source, this);
    super.dispose();
  }

  @override
  Widget buildPage(BuildContext context, Animation<double> animation, Animation<double> secondaryAnimation) {
    final width = MediaQuery.sizeOf(context).width;
    final page = CardPage(progress: animation, rect: rect, close: () => navigator?.maybePop(), dragWrap: (child) => _withBack(child, width));
    canDragDown = () => page.canDragDown();
    return builder(context, page);
  }

  @override
  Widget transition(BuildContext context, Animation<double> p, Widget page, Size size) {
    final scrim = IgnorePointer(child: AnimatedBuilder(animation: p, builder: (_, _) => ColoredBox(color: M2Color.scrim.withValues(alpha: M2Motion.scrim * p.value))));
    if (reduced) {
      return Stack(children: [Positioned.fill(child: scrim), FadeTransition(opacity: p, child: _withBack(page, size.width))]);
    }
    return Stack(children: [
      Positioned.fill(child: scrim),
      Positioned.fill(child: _withBack(ContainerWindow(progress: p, rect: rect, height: size.height, child: page), size.width)),
    ]);
  }
}

/// Pushes and pops on the nearest Navigator: the app's stack. Every route can be covered by another, to any depth.
abstract final class Nav {
  static Future<T?> push<T>(BuildContext context, WidgetBuilder builder) =>
      Navigator.of(context).push(PushRoute<T>(reduced: reducedMotion(context), builder: builder));

  /// Opens a card from `band` (global coordinates). `off` is where the band's window into the page's header starts (px).
  static Future<T?> openCard<T>(BuildContext context, {required Object source, required BandHider hider, required Rect band, required double off, required Widget Function(BuildContext, CardPage) builder}) {
    final nav = Navigator.of(context);
    final origin = (nav.context.findRenderObject()! as RenderBox).localToGlobal(Offset.zero);
    return nav.push(CardRoute<T>(reduced: reducedMotion(context), source: source, hider: hider, rect: BandRect(band.top - origin.dy, band.height, off), builder: builder));
  }
}
