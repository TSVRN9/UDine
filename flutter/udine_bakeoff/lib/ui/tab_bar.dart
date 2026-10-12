import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'press.dart';

class _Icon extends CustomPainter {
  final String name;
  final Color color;
  const _Icon(this.name, this.color);
  @override
  void paint(Canvas canvas, Size s) {
    final p = Paint()..color = color..style = PaintingStyle.stroke..strokeWidth = 1.8..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round;
    final k = s.width / 24;
    canvas.scale(k);
    final path = Path();
    switch (name) {
      case 'halls':
        path..moveTo(3, 10)..relativeLineTo(9, -6)..relativeLineTo(9, 6)
          ..moveTo(5, 10)..relativeLineTo(0, 9)..moveTo(19, 10)..relativeLineTo(0, 9)
          ..moveTo(9.5, 19)..relativeLineTo(0, -6)..relativeLineTo(5, 0)..relativeLineTo(0, 6)
          ..moveTo(3, 19.5)..relativeLineTo(18, 0);
      case 'search':
        path..addOval(Rect.fromCircle(center: const Offset(10.5, 10.5), radius: 6.5))..moveTo(20, 20)..relativeLineTo(-4.8, -4.8);
      default:
        path..addOval(Rect.fromCircle(center: const Offset(12, 8), radius: 4))
          ..moveTo(4, 20)..relativeCubicTo(1.5, -4, 4.5, -6, 8, -6)..relativeCubicTo(3.5, 0, 6.5, 2, 8, 6);
    }
    canvas.drawPath(path, p);
  }

  @override
  bool shouldRepaint(_Icon o) => o.name != name || o.color != color;
}

const tabs = [('halls', 'Halls'), ('search', 'Search'), ('you', 'You')];

/// M2 `.tbar`: white bar, hairline top, Halls / Search / You. A disabled tab is dimmed and inert.
class M2TabBar extends StatelessWidget {
  final int selected;
  final Set<int> disabled;
  final ValueChanged<int> onSelect;
  final double bottomInset;
  const M2TabBar({super.key, required this.selected, required this.onSelect, this.disabled = const {1}, this.bottomInset = 0});

  @override
  Widget build(BuildContext context) => Container(
        padding: EdgeInsets.only(bottom: bottomInset),
        decoration: BoxDecoration(color: M2Color.white, border: Border(top: BorderSide(color: M2Color.hair))),
        child: Row(children: [
          for (var i = 0; i < tabs.length; i++)
            Expanded(
              child: Opacity(
                opacity: disabled.contains(i) ? 0.4 : 1,
                child: Semantics(
                  selected: i == selected, enabled: !disabled.contains(i),
                  child: Press(
                    label: tabs[i].$2, scale: true,
                    onTap: disabled.contains(i) ? null : () { if (i != selected) onSelect(i); },
                    child: SizedBox(
                      height: M2Size.tabBar,
                      child: ExcludeSemantics(
                        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                          CustomPaint(size: const Size(24, 24), painter: _Icon(tabs[i].$1, i == selected ? M2Color.vm : M2Color.slate)),
                          const SizedBox(height: 3),
                          Text(tabs[i].$2, style: M2Text.tabBar.style(i == selected ? M2Color.vm : M2Color.slate)),
                        ]),
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ]),
      );
}
