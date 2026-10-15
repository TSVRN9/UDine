import 'package:flutter/widgets.dart';
import '../../theme/tokens.dart';

/// The calorie toss on Log: a "+404" tag leaves the bar's calories and lands on the You tab, where the plate went. One progress value
/// drives it: x straight across, y along a quadratic that bows up by `tossArc`, the tag fading out over the last stretch. It runs on
/// the container transform's timing (`cont`), the only long motion the tokens have; M2's own build has no toss (round 2 cut it), so
/// its timing and arc are unmeasured.
class CalorieToss extends StatefulWidget {
  final Offset from, to;
  final String text;
  final VoidCallback onDone;
  const CalorieToss({
    super.key,
    required this.from,
    required this.to,
    required this.text,
    required this.onDone,
  });
  @override
  State<CalorieToss> createState() => _CalorieTossState();
}

class _CalorieTossState extends State<CalorieToss>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: M2Motion.cont.duration,
  )..forward().whenComplete(widget.onDone);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => IgnorePointer(
    child: AnimatedBuilder(
      animation: _c,
      builder: (_, child) {
        final t = M2Motion.cont.curve.transform(_c.value),
            a = widget.from,
            b = widget.to;
        final x = a.dx + (b.dx - a.dx) * t,
            y = a.dy + (b.dy - a.dy) * t - M2Layout.tossArc * 4 * t * (1 - t);
        return Stack(
          children: [
            Positioned(
              left: x,
              top: y,
              child: FractionalTranslation(
                translation: const Offset(-0.5, -0.5),
                child: Opacity(opacity: (1 - t).clamp(0.0, 1.0), child: child),
              ),
            ),
          ],
        );
      },
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: M2Layout.tossPadX,
          vertical: M2Layout.tossPadY,
        ),
        decoration: const BoxDecoration(
          color: M2Color.dm,
          borderRadius: BorderRadius.all(Radius.circular(M2Radius.button)),
        ),
        child: Text(widget.text, style: M2Text.barNum.style(M2Color.gold)),
      ),
    ),
  );
}
