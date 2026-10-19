import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'motion.dart';

/// M2 `A(el, [{opacity:.4},{opacity:1}], 'settle')`: what is under it comes back from 0.4 each time [value] changes (a bowl's figures, a family's row,
/// the sheet under a variant picker).
class SettleFade extends StatefulWidget {
  const SettleFade({super.key, required this.value, required this.child});
  final Object? value;
  final Widget child;
  @override
  State<SettleFade> createState() => _SettleFadeState();
}

class _SettleFadeState extends State<SettleFade> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, value: 1);

  @override
  void didUpdateWidget(SettleFade oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.value == widget.value) return;
    final a = resolveAnim(context, M2Motion.settle);
    _c.duration = a.duration;
    _c.forward(from: 0);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        builder: (_, child) => Opacity(opacity: M2Opacity.settleFrom + (1 - M2Opacity.settleFrom) * M2Motion.settle.curve.transform(_c.value), child: child),
        child: widget.child,
      );
}
