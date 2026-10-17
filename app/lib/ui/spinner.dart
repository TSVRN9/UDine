import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'motion.dart';

class _SpinPainter extends CustomPainter {
  final double turn;
  const _SpinPainter(this.turn);
  @override
  void paint(Canvas canvas, Size s) {
    // `border: 3px solid track; border-top-color: vm` on a circle: the top quarter is maroon
    final r = Rect.fromLTWH(M2Size.spinStroke / 2, M2Size.spinStroke / 2, s.width - M2Size.spinStroke, s.height - M2Size.spinStroke);
    final p = Paint()..style = PaintingStyle.stroke..strokeWidth = M2Size.spinStroke;
    canvas.save();
    canvas.translate(s.width / 2, s.height / 2);
    canvas.rotate(turn * 2 * math.pi);
    canvas.translate(-s.width / 2, -s.height / 2);
    canvas.drawArc(r, 0, 2 * math.pi, false, p..color = M2Color.spinTrack);
    canvas.drawArc(r, -math.pi * 3 / 4, math.pi / 2, false, p..color = M2Color.vm);
    canvas.restore();
  }

  @override
  bool shouldRepaint(_SpinPainter o) => o.turn != turn;
}

/// `.spin`: the platform's activity indicator, drawn only after 400 ms (`spinIn`, 1 ms after a 400 ms delay), turning once in 900 ms,
/// linear, for as long as it is there. Under reduced motion it does not turn and is there at once (M2 turns animations off).
class Spinner extends StatefulWidget {
  /// what it is waiting for, as a screen reader says it ("Searching UMass Dining")
  final String label;
  const Spinner({super.key, this.label = 'Loading the menu'});
  @override
  State<Spinner> createState() => _SpinnerState();
}

class _SpinnerState extends State<Spinner> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: M2Motion.spin.duration);
  Timer? _t;
  bool _shown = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (reducedMotion(context)) {
      _t?.cancel();
      _c.stop();
      _shown = true;
    } else {
      if (!_c.isAnimating) _c.repeat();
      _t ??= Timer(Duration(milliseconds: M2Motion.netSpinnerDelay.round()), () => mounted ? setState(() => _shown = true) : null);
    }
  }

  @override
  void dispose() {
    _t?.cancel();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Semantics(
        label: widget.label, value: 'progressbar',
        child: Opacity(
          opacity: _shown ? 1 : 0,
          child: AnimatedBuilder(animation: _c, builder: (_, _) => CustomPaint(size: const Size.square(M2Size.spin), painter: _SpinPainter(_c.value))),
        ),
      );
}
