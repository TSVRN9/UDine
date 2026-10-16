import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'label_model.dart';
import 'motion.dart';
import 'press.dart';
import 'svg_path.dart';

final _plus = svgPath('M10 4v12M4 10h12');
final _minus = svgPath('M4 10h12');

class _IconPainter extends CustomPainter {
  final bool plus;
  final Color color;
  const _IconPainter(this.plus, this.color);
  @override
  void paint(Canvas canvas, Size s) {
    canvas.scale(s.width / 20);
    canvas.drawPath(plus ? _plus : _minus, Paint()..color = color..style = PaintingStyle.stroke..strokeWidth = M2Layout.glyphStroke..strokeCap = StrokeCap.round);
  }

  @override
  bool shouldRepaint(_IconPainter o) => o.plus != plus || o.color != color;
}

class PlusMinus extends StatelessWidget {
  final bool plus;
  final Color color;
  const PlusMinus({super.key, required this.plus, this.color = M2Color.vm});
  @override
  Widget build(BuildContext context) => ExcludeSemantics(child: CustomPaint(size: const Size.square(M2Layout.glyph), painter: _IconPainter(plus, color)));
}

/// `.add`: a 48 dp + (44 and ringed when `ghost`: the dish would start a second plate), maroon on chalk.
class AddButton extends StatelessWidget {
  final VoidCallback? onTap;
  final bool ghost;
  const AddButton({super.key, this.onTap, this.ghost = false});
  @override
  Widget build(BuildContext context) => Press(
        scale: true, label: 'Add', onTap: onTap,
        child: SizedBox(
          width: M2Layout.addSize, height: M2Layout.addSize,
          child: Center(
            child: Container(
              width: ghost ? M2Layout.ghostSize : M2Layout.addSize, height: ghost ? M2Layout.ghostSize : M2Layout.addSize,
              decoration: ghost ? BoxDecoration(borderRadius: const BorderRadius.all(Radius.circular(M2Radius.button)), border: Border.all(color: M2Color.ghost, width: M2Layout.rule)) : null,
              child: const Center(child: PlusMinus(plus: true)),
            ),
          ),
        ),
      );
}

/// `.step`: tint ground, minus, the quantity (½, 1, 2 ...), plus. 44 dp tall and every button 44 wide.
class Stepper extends StatelessWidget {
  final double qty;
  final VoidCallback? onDec, onInc;
  const Stepper({super.key, required this.qty, this.onDec, this.onInc});
  @override
  Widget build(BuildContext context) => Container(
        height: M2Size.tap, width: M2Layout.lane,
        decoration: const BoxDecoration(color: M2Color.tint, borderRadius: BorderRadius.all(Radius.circular(M2Radius.button))),
        child: Row(children: [
          Press(scale: true, label: 'Less', onTap: onDec, child: const SizedBox(width: M2Size.tap, height: M2Size.tap, child: Center(child: PlusMinus(plus: false)))),
          Expanded(child: Center(child: Text(fq(qty), style: M2Text.stepper.style(M2Color.dm)))),
          Press(scale: true, label: 'More', onTap: onInc, child: const SizedBox(width: M2Size.tap, height: M2Size.tap, child: Center(child: PlusMinus(plus: true)))),
        ]),
      );
}

/// The row's control lane, always as wide as the stepper so + to stepper never re-wraps the name. In place (M2 `setCtl`):
/// the + widens leftward into the stepper (scaleX from `laneFrom`, origin right, fading in, on `settle`); a quantity change only
/// changes the figure; removing the last half shrinks the stepper away on `exit` (scaleX to `laneOut`) while the + fades back.
class RowControl extends StatefulWidget {
  final double qty;
  final bool ghost;
  final VoidCallback onAdd, onInc, onDec;

  /// A menu row keeps its whole 114 lane (`.row .add{margin-left:66px}`), so its text never reflows; a bowl's add-in row (`.brow`) takes only
  /// what the control is: 48 for the + and 114 for the stepper.
  final bool lane;
  const RowControl({super.key, required this.qty, required this.ghost, required this.onAdd, required this.onInc, required this.onDec, this.lane = true});
  @override
  State<RowControl> createState() => _RowControlState();
}

class _RowControlState extends State<RowControl> with TickerProviderStateMixin {
  late final AnimationController _in = AnimationController(vsync: this), _out = AnimationController(vsync: this);
  late final Animation<double> _inFade = CurvedAnimation(parent: _in, curve: M2Motion.settle.curve);
  double _lastQty = 0;

  @override
  void initState() {
    super.initState();
    _lastQty = widget.qty;
    _in.value = 1;
    _out.value = 1;
  }

  @override
  void didUpdateWidget(RowControl old) {
    super.didUpdateWidget(old);
    final was = old.qty, now = widget.qty;
    if (was == 0 && now > 0) {
      _in.duration = resolveAnim(context, M2Motion.settle).duration;
      _in.forward(from: 0);
    } else if (was > 0 && now == 0) {
      _lastQty = was;
      _out.duration = resolveAnim(context, M2Motion.exit).duration;
      _out.forward(from: 0);
      _in.duration = resolveAnim(context, M2Motion.settle).duration;
      _in.forward(from: 0); // the + fades back in
    }
  }

  @override
  void dispose() {
    _in.dispose();
    _out.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final rm = reducedMotion(context), w = widget;
    final plus = w.qty == 0
        ? FadeTransition(opacity: _inFade, child: AddButton(onTap: w.onAdd, ghost: w.ghost))
        : null;
    final step = w.qty > 0
        ? AnimatedBuilder(
            animation: _inFade,
            builder: (_, c) => Opacity(
              opacity: _inFade.value,
              child: rm ? c : Transform(alignment: Alignment.centerRight, transform: Matrix4.diagonal3Values(M2Motion.laneFrom + (1 - M2Motion.laneFrom) * _inFade.value, 1, 1), child: c),
            ),
            child: Stepper(qty: w.qty, onDec: w.onDec, onInc: w.onInc),
          )
        : null;
    final ghostOut = AnimatedBuilder(
      animation: _out,
      builder: (_, _) {
        final p = M2Motion.exit.curve.transform(_out.value);
        if (_out.value >= 1) return const SizedBox.shrink();
        return IgnorePointer(
          child: Opacity(
            opacity: 1 - p,
            child: rm ? Stepper(qty: _lastQty) : Transform(alignment: Alignment.centerRight, transform: Matrix4.diagonal3Values(1 - (1 - M2Motion.laneOut) * p, 1, 1), child: Stepper(qty: _lastQty)),
          ),
        );
      },
    );
    return SizedBox(
      width: w.lane || w.qty > 0 ? M2Layout.lane : M2Layout.addSize, height: M2Layout.addSize,
      child: Stack(clipBehavior: w.lane ? Clip.hardEdge : Clip.none, alignment: Alignment.centerRight, children: [
        ?plus,
        ?step,
        Positioned(right: 0, child: ghostOut),
      ]),
    );
  }
}
