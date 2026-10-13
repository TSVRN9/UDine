import 'package:flutter/widgets.dart';
import '../logic/fixture.dart';
import '../theme/tokens.dart';
import '../ui/ui.dart';

/// `#mtabs`: every meal of the day is visible, never scrolled or cut. The buttons share the row as `flex: 1 1 auto` does: each is
/// its label's width, the rest of the row split equally (a selected label is 600, so wider). A gold underline under the selected
/// one moves on `settle`. The row is opaque ground; its labels and the underline fade.
class MealTabs extends StatefulWidget {
  final List<String> meals;
  final String selected;
  final Animation<double> fade;
  final ValueChanged<String> onTap;
  const MealTabs({super.key, required this.meals, required this.selected, required this.fade, required this.onTap});
  @override
  State<MealTabs> createState() => _MealTabsState();
}

class _MealTabsState extends State<MealTabs> {
  bool _placed = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => mounted ? setState(() => _placed = true) : null);
  }

  TextStyle _style(bool sel) => M2Text.mealTab.style(sel ? M2Color.white : M2Color.onDm).copyWith(fontWeight: sel ? FontWeight.w600 : FontWeight.w500);

  @override
  Widget build(BuildContext context) {
    final w = widget;
    return ColoredBox(
      color: M2Color.dm,
      child: LayoutBuilder(builder: (context, c) {
        final labels = [for (final m in w.meals) mealLabel[m]!];
        final widths = [
          for (var i = 0; i < labels.length; i++)
            (TextPainter(text: TextSpan(text: labels[i], style: _style(w.meals[i] == w.selected)), textDirection: TextDirection.ltr)..layout()).width + 2 * M2Layout.tabPadX,
        ];
        final free = c.maxWidth - 2 * M2Layout.tabsPadX - widths.fold(0.0, (a, b) => a + b), extra = labels.isEmpty ? 0.0 : free / labels.length;
        var x = M2Layout.tabsPadX;
        final lefts = <double>[], ws = <double>[];
        for (final wd in widths) {
          lefts.add(x);
          ws.add(wd + extra);
          x += wd + extra;
        }
        final sel = w.meals.indexOf(w.selected);
        final ul = resolveAnim(context, M2Motion.settle);
        return Stack(children: [
          for (var i = 0; i < labels.length; i++)
            Positioned(
              left: lefts[i], width: ws[i], top: 0, height: M2Layout.stationRowH,
              child: Semantics(
                selected: i == sel, button: true, label: labels[i],
                child: Press(
                  semantics: false, scale: true, onTap: () => w.onTap(w.meals[i]), // `.mts button.down` scales; it has no tint
                  child: ExcludeSemantics(
                    child: Center(
                      child: AnimatedBuilder(
                        animation: w.fade,
                        builder: (_, child) => Opacity(opacity: w.fade.value, child: child),
                        child: Text(labels[i], style: _style(i == sel), maxLines: 1),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          if (sel >= 0)
            AnimatedPositioned(
              duration: _placed ? ul.duration : Duration.zero, curve: ul.curve,
              left: lefts[sel] + M2Layout.underInset, width: ws[sel] - 2 * M2Layout.underInset, bottom: 0, height: M2Layout.underH,
              child: IgnorePointer(child: AnimatedBuilder(animation: w.fade, builder: (_, child) => Opacity(opacity: w.fade.value, child: child), child: const ColoredBox(color: M2Color.gold))), // `.mts .ul` is inside `.mts`: it fades with the labels
            ),
        ]);
      }),
    );
  }
}

/// `#mswitch`: the station row, the last row of the header. The station you are in, a chevron (it turns over on `cont` while the
/// roster is up), and the day cell, gold Oswald and a chevron behind a hairline. Both are 47 dp tall under a 1 px rule.
class StationRow extends StatelessWidget {
  final Animation<double> fade;
  final String name, dayLabel;
  final bool open, topRule;
  final VoidCallback onStations, onDay;
  const StationRow({super.key, required this.fade, required this.name, required this.dayLabel, required this.open, required this.topRule, required this.onStations, required this.onDay});

  @override
  Widget build(BuildContext context) {
    final cont = resolveAnim(context, M2Motion.cont);
    Widget label(Widget child) => AnimatedBuilder(animation: fade, builder: (_, c) => Opacity(opacity: fade.value, child: c), child: child);
    final chevron = AnimatedRotation(turns: open ? 0.5 : 0, duration: cont.duration, curve: cont.curve, child: const _GoldChevron());
    return Container(
      decoration: BoxDecoration(color: M2Color.dm, border: topRule ? const Border(top: BorderSide(color: M2Color.swRule)) : null),
      child: Row(children: [
        Expanded(
          child: Opacity(
            opacity: name.isEmpty ? 0 : 1, // nothing posted, or not loaded: no station to name
            child: Press(
              overlay: M2Color.pressOnDm, label: name.isEmpty ? null : '$name, stations', onTap: name.isEmpty ? null : onStations,
              child: SizedBox(
                height: M2Layout.rowH,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: M2Space.gutter),
                  child: label(Row(children: [
                    Flexible(child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: M2Text.station.style(M2Color.gold))),
                    const SizedBox(width: M2Layout.swGap),
                    chevron,
                  ])),
                ),
              ),
            ),
          ),
        ),
        Press(
          overlay: M2Color.pressOnDm, label: '$dayLabel, change the day', onTap: onDay,
          child: Container(
            height: M2Layout.rowH,
            padding: const EdgeInsets.fromLTRB(M2Layout.dayPadL, 0, M2Layout.dayPadR, 0),
            decoration: const BoxDecoration(border: Border(left: BorderSide(color: M2Color.divider))),
            child: label(Row(mainAxisSize: MainAxisSize.min, children: [
              Text(dayLabel, maxLines: 1, style: M2Text.day.style(M2Color.gold)),
              const SizedBox(width: M2Layout.dayGap),
              const _GoldChevron(),
            ])),
          ),
        ),
      ]),
    );
  }
}

class _GoldChevron extends StatelessWidget {
  const _GoldChevron();
  @override
  Widget build(BuildContext context) => CustomPaint(size: const Size.square(M2Layout.chev18), painter: _P());
}

class _P extends CustomPainter {
  const _P();
  @override
  void paint(Canvas canvas, Size s) {
    canvas.scale(s.width / 18); // viewBox 18: M4 7l5 5 5-5
    canvas.drawPath(Path()..moveTo(4, 7)..relativeLineTo(5, 5)..relativeLineTo(5, -5), Paint()..color = M2Color.gold..style = PaintingStyle.stroke..strokeWidth = M2Layout.chevThick..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round);
  }

  @override
  bool shouldRepaint(_P o) => false;
}
