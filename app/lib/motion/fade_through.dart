import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import '../ui/motion.dart';

double _clamp(double x) => x < 0 ? 0 : x > 1 ? 1 : x;

/// Top-level tabs: M2's round-14 fade through, "fade content, keep ground". The old tab's content goes out linearly over the first
/// `sharedXAt` of `fadeThrough` (`fadeThroughOut`), then the new one fades in on `fadeThrough`'s curve while settling from `.97`;
/// never both at once, so no text is doubled. The page background and the header bands never fade: a `GroundMark` in a pane (the
/// header of Halls and You) and `pinned[i]` (a header fixed at the top of pane `i`, Search's field) are painted under the panes, in
/// the colour they have, for as long as a change runs. Nothing slides. Under reduced motion the same, over `rmFade`, without the scale.
class FadeThroughTabs extends StatefulWidget {
  final int index;
  final List<Widget> children;
  final List<double> pinned;
  const FadeThroughTabs({super.key, required this.index, required this.children, this.pinned = const []});
  @override
  State<FadeThroughTabs> createState() => _FadeThroughTabsState();
}

/// The header bands of one pane, as `GroundMark`s register them.
class _Marks extends InheritedWidget {
  final Set<BuildContext> marks;
  const _Marks({required this.marks, required super.child});
  @override
  bool updateShouldNotify(_Marks old) => false;
}

/// Marks a header band as ground: it is painted under the tab panes while a tab change runs, so the pane's own copy of it can fade
/// with the rest of the pane and the band never changes. Outside `FadeThroughTabs`, it is its child.
class GroundMark extends StatefulWidget {
  final Widget child;
  const GroundMark({super.key, required this.child});
  @override
  State<GroundMark> createState() => _GroundMarkState();
}

class _GroundMarkState extends State<GroundMark> {
  late final Set<BuildContext>? _marks = context.getInheritedWidgetOfExactType<_Marks>()?.marks;
  @override
  void initState() {
    super.initState();
    _marks?.add(context);
  }

  @override
  void dispose() {
    _marks?.remove(context);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

class _FadeThroughTabsState extends State<FadeThroughTabs> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, value: 1);
  late int _from = widget.index;
  final _groundKey = GlobalKey();
  late final List<Set<BuildContext>> _marks = [for (final _ in widget.children) <BuildContext>{}];

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

  /// The ground under the panes: the header bands of the pane whose content is on screen, while a change runs.
  void _paintGround(Canvas canvas, Size size) {
    if (_c.value >= 1) return;
    final me = _groundKey.currentContext?.findRenderObject();
    if (me is! RenderBox || !me.attached) return;
    final shown = _c.value < M2Motion.sharedXAt ? _from : widget.index, origin = me.localToGlobal(Offset.zero), paint = Paint()..color = M2Color.dm;
    canvas.clipRect(Offset.zero & size);
    // Unscaled geometry: the pane settles from .97 about its centre, which pulls a band's own edges in, so the ground is the band's
    // bottom with the scale undone, full width, from the very top (the status bar included).
    final cy = size.height / 2, scale = _scales[shown].value;
    var bottom = shown < widget.pinned.length ? widget.pinned[shown] : 0.0;
    for (final m in _marks[shown]) {
      final b = m.findRenderObject();
      if (b is RenderBox && b.attached && b.hasSize) {
        final y = (b.localToGlobal(Offset(0, b.size.height)) - origin).dy;
        bottom = bottom > y ? bottom : cy + (y - cy) / scale;
      }
    }
    canvas.drawRect(Rect.fromLTWH(0, 0, size.width, bottom), paint);
  }

  /// Pane `i`'s content opacity at clock `v`: the old one out linearly by `sharedXAt`, the new one in after it.
  double _fade(int i, double v) {
    final at = M2Motion.sharedXAt;
    if (v >= 1) return 1;
    if (i == widget.index) return v < at ? 0 : resolveAnim(context, M2Motion.fadeThrough).curve.transform(_clamp((v - at) / (1 - at)));
    return i == _from ? 1 - M2Motion.fadeThroughOut.curve.transform(_clamp(v / at)) : 1;
  }

  late final _fades = [for (var i = 0; i < widget.children.length; i++) _Fn(_c, (v) => _fade(i, v))];
  late final _scales = [
    for (var i = 0; i < widget.children.length; i++)
      _Fn(_c, (v) => i == widget.index && v < 1 && !reducedMotion(context) ? M2Motion.fadeThroughScale + (1 - M2Motion.fadeThroughScale) * _fade(i, v) : 1),
  ];

  @override
  Widget build(BuildContext context) {
    return Stack(children: [
      Positioned.fill(child: CustomPaint(key: _groundKey, painter: _Ground(_paintGround, _c))),
      AnimatedBuilder(
        animation: _c,
        builder: (_, _) {
          final running = _c.value < 1, cut = _c.value < M2Motion.sharedXAt;
          return Stack(children: [
            for (var i = 0; i < widget.children.length; i++)
              Offstage(
                offstage: i != widget.index && !(running && i == _from && cut),
                child: IgnorePointer(
                  ignoring: i != widget.index,
                  child: _Marks(
                    marks: _marks[i],
                    // always the same wrappers, running or not, so a change moves no pane's subtree (the outgoing one keeps its scroll)
                    child: FadeTransition(opacity: _fades[i], child: ScaleTransition(scale: _scales[i], child: widget.children[i])),
                  ),
                ),
              ),
          ]);
        },
      ),
    ]);
  }
}

/// An animation that is `f` of its parent's value.
class _Fn extends Animation<double> with AnimationWithParentMixin<double> {
  _Fn(this.parent, this.f);
  @override
  final Animation<double> parent;
  final double Function(double) f;
  @override
  double get value => f(parent.value);
}

class _Ground extends CustomPainter {
  final void Function(Canvas, Size) draw;
  _Ground(this.draw, Listenable repaint) : super(repaint: repaint);
  @override
  void paint(Canvas canvas, Size size) => draw(canvas, size);
  @override
  bool shouldRepaint(_Ground old) => true;
}
