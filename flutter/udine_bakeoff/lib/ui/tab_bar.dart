import 'dart:math' as math;
import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'press.dart';

class _Icon extends CustomPainter {
  final String name;
  final Color color;
  const _Icon(this.name, this.color);
  @override
  void paint(Canvas canvas, Size s) {
    final p = Paint()..color = color..style = PaintingStyle.stroke..strokeWidth = M2Layout.tabIconStroke..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round;
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
        padding: EdgeInsets.only(bottom: math.max(bottomInset, M2Layout.safeBottomMin)),
        decoration: BoxDecoration(color: M2Color.white, border: Border(top: BorderSide(color: M2Color.hair))),
        child: Stack(clipBehavior: Clip.none, children: [
          Row(children: [
            for (var i = 0; i < tabs.length; i++)
              Expanded(
                child: Opacity(
                  opacity: disabled.contains(i) ? M2Layout.disabledTab : 1,
                  child: Semantics(
                    selected: i == selected, enabled: !disabled.contains(i),
                    child: Press(
                      label: tabs[i].$2, scale: true,
                      onTap: disabled.contains(i) ? null : () { if (i != selected) onSelect(i); },
                      child: SizedBox(
                        height: M2Size.tabBar,
                        child: ExcludeSemantics(
                          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                            CustomPaint(size: const Size(M2Layout.tabIcon, M2Layout.tabIcon), painter: _Icon(tabs[i].$1, i == selected ? M2Color.vm : M2Color.slate)),
                            const SizedBox(height: M2Layout.tabGap),
                            Text(tabs[i].$2, style: M2Text.tabBar.style(i == selected ? M2Color.vm : M2Color.slate)),
                          ]),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
          ]),
          // `.tbar .ind`: a third of the bar wide, over the hairline, sliding on `settle`
          Positioned(
            left: 0, right: 0, top: M2Layout.tabIndicatorTop, height: M2Layout.tabIndicatorH,
            child: IgnorePointer(
              child: AnimatedAlign(
                key: const ValueKey('tab-indicator'),
                alignment: Alignment(-1 + 2 * selected / (tabs.length - 1), 0),
                duration: const Duration(milliseconds: M2Motion.settleD), curve: standardM2,
                child: FractionallySizedBox(widthFactor: 1 / tabs.length, child: const ColoredBox(color: M2Color.vm, child: SizedBox.expand())),
              ),
            ),
          ),
        ]),
      );
}
