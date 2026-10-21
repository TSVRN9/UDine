import 'package:flutter/gestures.dart';
import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'motion.dart';

// The pointer the nearest Press already claimed: M2 puts `.down` on the closest button or row only, so a stepper inside a row
// tints the stepper, not the row. A deeper Press sees the event first.
int _claimed = -1;

/// M2's press feedback: finger down within `press`, release settles back on `settle`, no overshoot. `scale` for compact controls;
/// `overlay` is a tint laid over the child (photo and all), per surface: `pressBand` over photos, `pressOnDm` on the maroon bars,
/// `pressRow` on chalk. The visual follows the pointer itself (a Listener), not the tap recogniser, which inside a scroll view
/// waits out `kPressTimeout`; it clears when the finger moves past touch slop (the list is scrolling) or lifts.
class Press extends StatefulWidget {
  final Widget child;
  final VoidCallback? onTap;
  final bool scale;
  final Color? overlay;
  final String? label;
  final bool semantics;
  const Press({super.key, required this.child, this.onTap, this.scale = false, this.overlay, this.label, this.semantics = true});
  @override
  State<Press> createState() => _PressState();
}

class _PressState extends State<Press> {
  bool _down = false;
  Offset _from = Offset.zero;
  void _set(bool v) {
    if (_down != v && mounted) setState(() => _down = v);
  }

  @override
  Widget build(BuildContext context) {
    final a = _down ? M2Motion.press : M2Motion.settle, rm = reducedMotion(context);
    final d = (rm ? M2Motion.rmFade : a).duration, curve = (rm ? M2Motion.rmFade : a).curve;
    Widget c = widget.child;
    if (widget.overlay != null) {
      c = Stack(children: [
        c,
        Positioned.fill(child: IgnorePointer(child: AnimatedOpacity(opacity: _down ? 1 : 0, duration: d, curve: curve, child: ColoredBox(color: widget.overlay!)))),
      ]);
    }
    if (widget.scale && !rm) c = AnimatedScale(scale: _down ? M2Motion.pressScale : 1, duration: d, curve: curve, child: c);
    final live = widget.onTap != null;
    Widget out = Listener(
      behavior: HitTestBehavior.opaque,
      onPointerDown: !live ? null : (e) {
        if (_claimed == e.pointer) return;
        _claimed = e.pointer;
        _from = e.position;
        _set(true);
      },
      onPointerMove: !live ? null : (e) {
        if (_down && (e.position - _from).distance > kTouchSlop) _set(false);
      },
      onPointerUp: !live ? null : (_) => _set(false),
      onPointerCancel: !live ? null : (_) => _set(false),
      child: GestureDetector(behavior: HitTestBehavior.opaque, excludeFromSemantics: true, onTap: widget.onTap, child: c),
    );
    // one node per pressable: the detector's own is excluded; `semantics: false` means the caller's wrapper says button and label, the tap action stays here
    return Semantics(button: widget.semantics, label: widget.label, onTap: widget.onTap, child: out);
  }
}
