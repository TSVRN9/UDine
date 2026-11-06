import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';

import '../../theme/tokens.dart';
import '../../ui/ui.dart';

/// M2's FLIP on a keystroke or a lens (`renderSearch`): the rows that survive glide from where they were to where they are, a row that
/// was not there fades up, on `settle`; a chip never moves. The tracker takes every built row's position just before the list is
/// redrawn for a new query, lens or data.
class GlideTracker {
  final _live = <String, _GlideState>{};
  final _before = <String, double>{};
  final _was = <String>{};
  bool _armed = false;

  /// Call before the list is rebuilt for a new result, with the ids of the list on screen: what is built now is where the rows glide
  /// from, and an id in the old list is not new even when it was below the fold and never built.
  void snapshot(Iterable<String> ids) {
    _was..clear()..addAll(ids);
    _before.clear();
    for (final e in _live.entries) {
      final t = e.value._top;
      if (t != null) _before[e.key] = t + e.value._shift;
    }
    _armed = true;
  }
}

class Glide extends StatefulWidget {
  const Glide({super.key, required this.id, required this.tracker, required this.generation, required this.child});
  final String id;
  final GlideTracker tracker;
  /// bumps with each new result: a row seeing a new number has been redrawn for it
  final int generation;
  final Widget child;
  @override
  State<Glide> createState() => _GlideState();
}

class _GlideState extends State<Glide> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, value: 1);
  late int _gen;
  double _dy = 0;
  bool _fade = false;
  late bool _arrives;
  // The old place of a row redrawn for a new result, until the first paint of it: that paint measures the move and draws the row back at
  // the old place, so no frame shows it at the new one (a post-frame measure drew one frame there first).
  double? _from;
  bool _going = false;
  // (read in didChangeDependencies: paint may not look up the tree)
  late Anim _a;
  late bool _reduced;

  /// where the row is laid out, and how far it is drawn from there now
  double? get _top {
    final o = context.findRenderObject();
    return o is RenderBox && o.attached && o.hasSize ? o.localToGlobal(Offset.zero).dy : null;
  }

  double get _shift => _dy == 0 ? 0 : _dy * (1 - _a.curve.transform(_going ? _c.value : 0));

  void _run({required double dy, required bool fade}) {
    _dy = _reduced ? 0 : dy;
    _fade = fade;
    _c
      ..duration = _a.duration
      ..forward(from: 0);
  }

  @override
  void initState() {
    super.initState();
    _gen = widget.generation;
    widget.tracker._live[widget.id] = this;
    // a row that was not in the old result fades up (the first list on screen simply is there)
    _arrives = widget.tracker._armed && !widget.tracker._was.contains(widget.id);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _a = resolveAnim(context, M2Motion.settle);
    _reduced = reducedMotion(context);
    if (_arrives) {
      _arrives = false;
      _run(dy: 0, fade: true); // from the first frame, so the row never shows at full opacity first
    }
  }

  @override
  void didUpdateWidget(Glide old) {
    super.didUpdateWidget(old);
    if (widget.generation == _gen) return;
    _gen = widget.generation;
    _from = widget.tracker._before[widget.id];
    WidgetsBinding.instance.addPostFrameCallback((_) => _from = null);
  }

  /// Called by the row's first paint after a redraw, with where it is laid out now.
  void _moved(double to) {
    final from = _from;
    _from = null;
    if (from == null || (from - to).abs() <= 1) return;
    _dy = _reduced ? 0 : from - to;
    _going = false;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _going = true;
      _run(dy: _dy, fade: false);
    });
  }

  @override
  void dispose() {
    if (widget.tracker._live[widget.id] == this) widget.tracker._live.remove(widget.id);
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => _Shift(
        state: this,
        child: AnimatedBuilder(
          animation: _c,
          child: widget.child,
          builder: (_, child) {
            if (_c.value >= 1 || !_fade) return child!;
            return Opacity(opacity: _a.curve.transform(_c.value), child: child);
          },
        ),
      );
}

/// Draws its child [_GlideState._shift] away from where it is laid out, and tells the state where that is on a redrawn row's first paint.
class _Shift extends SingleChildRenderObjectWidget {
  const _Shift({required this.state, super.child});
  final _GlideState state;
  @override
  RenderObject createRenderObject(BuildContext context) => _RenderShift(state);
  @override
  void updateRenderObject(BuildContext context, _RenderShift r) => r
    ..state = state
    ..markNeedsPaint(); // (a row's own layer is not repainted when only its place changed, and this paint is what measures the place)
}

class _RenderShift extends RenderProxyBox {
  _RenderShift(this.state) {
    state._c.addListener(markNeedsPaint);
  }
  _GlideState state;

  @override
  void paint(PaintingContext context, Offset offset) {
    if (state._from != null) state._moved(localToGlobal(Offset.zero).dy);
    super.paint(context, offset + Offset(0, state._shift));
  }

  @override
  bool hitTestChildren(BoxHitTestResult result, {required Offset position}) =>
      result.addWithPaintOffset(offset: Offset(0, state._shift), position: position, hitTest: (r, p) => child?.hitTest(r, position: p) ?? false);

  @override
  void applyPaintTransform(RenderBox child, Matrix4 transform) => transform.translateByDouble(0, state._shift, 0, 1);
}
