import 'package:flutter/widgets.dart';

import '../../theme/tokens.dart';
import '../../ui/ui.dart';

/// M2's FLIP on a keystroke or a lens (`renderSearch`): the rows that survive glide from where they were to where they are, a row that
/// was not there fades up, on `settle`; a chip never moves. The tracker takes every built row's position just before the list is
/// redrawn for a new query, lens or data.
class GlideTracker {
  final _live = <String, _GlideState>{};
  final _before = <String, double>{};
  bool _armed = false;

  /// Call before the list is rebuilt for a new result: what is on screen now is where the rows glide from.
  void snapshot() {
    _before.clear();
    for (final e in _live.entries) {
      final t = e.value._top;
      if (t != null) _before[e.key] = t;
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

  double? get _top {
    final o = context.findRenderObject();
    return o is RenderBox && o.attached && o.hasSize ? o.localToGlobal(Offset.zero).dy : null;
  }

  void _run({required double dy, required bool fade}) {
    final a = resolveAnim(context, M2Motion.settle);
    _dy = reducedMotion(context) ? 0 : dy;
    _fade = fade;
    _c
      ..duration = a.duration
      ..forward(from: 0);
  }

  @override
  void initState() {
    super.initState();
    _gen = widget.generation;
    widget.tracker._live[widget.id] = this;
    // a row built because the result changed fades up (the first list on screen simply is there)
    if (widget.tracker._armed) WidgetsBinding.instance.addPostFrameCallback((_) => mounted ? _run(dy: 0, fade: true) : null);
  }

  @override
  void didUpdateWidget(Glide old) {
    super.didUpdateWidget(old);
    if (widget.generation == _gen) return;
    _gen = widget.generation;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final from = widget.tracker._before[widget.id], to = _top;
      if (from == null || to == null) {
        _run(dy: 0, fade: true);
      } else if ((from - to).abs() > 1) {
        _run(dy: from - to, fade: false);
      }
    });
  }

  @override
  void dispose() {
    if (widget.tracker._live[widget.id] == this) widget.tracker._live.remove(widget.id);
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        child: widget.child,
        builder: (_, child) {
          if (_c.value >= 1) return child!;
          final t = resolveAnim(context, M2Motion.settle).curve.transform(_c.value);
          return Transform.translate(offset: Offset(0, _dy * (1 - t)), child: _fade ? Opacity(opacity: t, child: child) : child);
        },
      );
}
