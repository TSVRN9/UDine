import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';

/// M2's press: finger down within `pressD`, release settles back (`settleD`) with no overshoot. `scale` for compact controls,
/// `overlay` (a fill that fades in over the child) for bands and rows.
class Press extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  final bool scale;
  final Color? overlay;
  final String? label;
  const Press({super.key, required this.child, this.onTap, this.scale = false, this.overlay, this.label});
  @override
  State<Press> createState() => _PressState();
}

class _PressState extends State<Press> {
  bool _down = false;
  void _set(bool v) => setState(() => _down = v);

  @override
  Widget build(BuildContext context) {
    final d = Duration(milliseconds: _down ? M2Motion.pressD : M2Motion.settleD);
    Widget c = widget.child;
    if (widget.overlay != null) {
      c = Stack(children: [
        c,
        Positioned.fill(child: IgnorePointer(child: AnimatedOpacity(opacity: _down ? 1 : 0, duration: d, curve: standardM2, child: ColoredBox(color: widget.overlay!)))),
      ]);
    }
    if (widget.scale) c = AnimatedScale(scale: _down ? M2Motion.pressScale : 1, duration: d, curve: standardM2, child: c);
    return Semantics(
      button: true, label: widget.label, onTap: widget.onTap,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTapDown: widget.onTap == null ? null : (_) => _set(true),
        onTapUp: widget.onTap == null ? null : (_) => _set(false),
        onTapCancel: widget.onTap == null ? null : () => _set(false),
        onTap: widget.onTap,
        child: c,
      ),
    );
  }
}
