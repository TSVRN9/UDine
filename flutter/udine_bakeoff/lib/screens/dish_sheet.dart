import 'package:flutter/widgets.dart';
import '../logic/dish_sheet.dart';
import '../logic/fixture.dart';
import '../logic/plate.dart';
import '../logic/where.dart';
import '../shell_api.dart';
import '../state/store.dart';
import '../theme/tokens.dart';
import '../ui/sheet.dart';
import '../ui/ui.dart';

/// Dish detail (M2 round 7): a sheet from the bottom edge over the list it was opened from, which stays where it was. It rests at a
/// height that shows the name, Add, where it's served and the top of the label (through Calories); scrolling or dragging it up takes
/// it to full height; dragging down, or a tap on the dimmed backdrop, puts it away. Add, and a where-served tap, run when the sheet
/// is half-way out, never on dismissal.
class DishSheet extends StatefulWidget {
  final SheetHandle handle;
  final DishCtx ctx;
  final double top;
  final VoidCallback onClosed;
  const DishSheet({super.key, required this.handle, required this.ctx, required this.top, required this.onClosed});
  @override
  State<DishSheet> createState() => _DishSheetState();
}

class _DishSheetState extends State<DishSheet> {
  final _cal = GlobalKey();
  bool _stuck = false, _ingOpen = false;

  Dish get d => widget.ctx.dish;

  double _mid(SheetMetrics m) {
    final scroll = m.body?.findRenderObject() as RenderBox?, cal = _cal.currentContext?.findRenderObject() as RenderBox?;
    if (scroll == null || cal == null || !cal.hasSize) return m.height * 0.55;
    final bottom = cal.localToGlobal(Offset(0, cal.size.height), ancestor: scroll).dy; // under the pinned grab, to the rule under Calories
    return restingSnap(calBottom: bottom - M2Layout.grabH, grab: M2Layout.grabH, winH: m.height, top: widget.top - M2Layout.sheetTop);
  }

  void _add(Store store) {
    final c = widget.ctx, now = DateTime.parse(store.fx.clock);
    widget.handle.away(() {
      store.add(plateMeal(store.fx, c.place, c.meal, now), d.name, c.refs ?? {c.place: d});
      Haptics.add();
    });
  }

  void _serve(String place, WhereGroup g) {
    final shell = ShellScope.of(context);
    widget.handle.away(() {
      Haptics.light();
      shell.pushHall(HallTarget(place: place, meal: g.meal, day: g.day, dishKey: d.key));
    });
  }

  @override
  Widget build(BuildContext context) {
    final store = StoreScope.of(context), fx = store.fx, c = widget.ctx;
    final now = DateTime.parse(fx.clock), pm = plateMeal(fx, c.place, c.meal, now);
    final on = c.day == 0 && findItem(store.plates, pm, d.key) != null;
    final marks = sheetMarks(d, (health: store.show.health, carbon: store.show.carbon));
    final price = shownPrice(c.place, d);
    final answer = whereAnswer(fx, d.name, now, newton: store.newton);
    final label = labelRows(d.nutrition, d.cal, d.serving);
    final pad = EdgeInsets.symmetric(horizontal: M2Space.gutter);
    Widget gap(double h) => SizedBox(height: h);

    final glyphs = {'plant': Glyph.plant, 'veg': Glyph.veg, 'halal': Glyph.halal, 'local': Glyph.local, 'sus': Glyph.sus};
    const names = {'plant': 'Plant based', 'veg': 'Vegetarian', 'halal': 'Halal', 'local': 'Local', 'sus': 'Sustainable'};
    final body = Padding(
      padding: pad,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (price != null || d.serving.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: M2Layout.dsvTop),
            child: Text.rich(TextSpan(style: M2Text.date.style(M2Color.slate), children: [
              if (price != null) TextSpan(text: price, style: M2Text.price.style(M2Color.ink)),
              if (price != null) const WidgetSpan(child: SizedBox(width: M2Space.part)),
              TextSpan(text: d.serving),
            ])),
          ),
        if (marks != null)
          Padding(
            padding: const EdgeInsets.only(top: M2Layout.marksTop),
            child: Wrap(spacing: M2Layout.marksGap, runSpacing: M2Layout.marksGap, crossAxisAlignment: WrapCrossAlignment.center, children: [
              for (final m in marks.marks) MarkPatch(glyphs[m]!, names[m]!),
              if (marks.health != null || marks.carbon != null)
                SizedBox(
                  height: M2Layout.markH,
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    ScoreBadge(kind: ScoreKind.health, value: marks.health, size: ScoreSize.sheet),
                    if (marks.health != null && marks.carbon != null) const SizedBox(width: M2Layout.marksGap),
                    ScoreBadge(kind: ScoreKind.carbon, value: marks.carbon, size: ScoreSize.sheet),
                  ]),
                ),
            ]),
          ),
        if (d.allergens.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: M2Layout.dalTop),
            child: Text.rich(TextSpan(style: M2Text.lbl.style(M2Color.ink), children: [
              TextSpan(text: 'Contains ', style: const TextStyle(color: M2Color.dm, fontWeight: bold700)),
              for (var i = 0; i < d.allergens.length; i++) ...[
                if (i > 0) const TextSpan(text: ', '),
                TextSpan(text: d.allergens[i], style: store.prefs.avoid.contains(d.allergens[i]) ? const TextStyle(color: M2Color.vm, fontWeight: bold700) : null),
              ],
            ])),
          ),
        if (c.day == 0)
          Padding(padding: const EdgeInsets.only(top: M2Layout.dadd), child: Button(kind: ButtonKind.primary, label: on ? 'Add another' : 'Add to plate', expand: true, onTap: () => _add(store))),
        Padding(
          padding: const EdgeInsets.only(top: M2Layout.whereTop),
          child: answer.isEmpty
              ? Text('Not on the menu again today or tomorrow', style: M2Text.sheetHead.style(M2Color.dm))
              : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  for (var i = 0; i < answer.length; i++) ...[
                    if (i > 0) gap(M2Layout.wlGap),
                    Padding(
                      padding: const EdgeInsets.only(bottom: M2Layout.wtBottom),
                      child: Text(whenText(answer[i], i > 0 ? answer[i - 1] : null), style: (i > 0 ? M2Text.sheetHeadSm.style(M2Color.vm) : M2Text.sheetHead.style(M2Color.dm))),
                    ),
                    Wrap(spacing: M2Layout.wcGap, runSpacing: M2Layout.wcGap, children: [
                      for (final h in answer[i].halls)
                        Press(semantics: true, label: placeName(fx, h), onTap: () => _serve(h, answer[i]), child: HallChip(letter: isCafe(h) ? null : h, name: placeName(fx, h))),
                    ]),
                  ],
                ]),
        ),
        Padding(padding: const EdgeInsets.only(top: M2Layout.labelTop), child: NutritionLabel(label: label, calKey: _cal)),
        if (d.health != null || d.carbon != null) Padding(padding: const EdgeInsets.only(top: M2Layout.gradesTop), child: RatingsPanel(health: d.health, carbon: d.carbon)),
        if (d.ingredients.isNotEmpty) _Ingredients(text: d.ingredients, open: _ingOpen, onToggle: () => setState(() => _ingOpen = !_ingOpen)),
      ]),
    );

    return NotificationListener<ScrollNotification>(
      onNotification: (n) {
        if (n.metrics.axis == Axis.vertical) {
          final stuck = n.metrics.pixels > M2Layout.stuckAt;
          if (stuck != _stuck) setState(() => _stuck = stuck);
        }
        return false;
      },
      child: M2Sheet(
        handle: widget.handle, top: widget.top, onClosed: widget.onClosed, mid: _mid, header: const SheetGrab(),
        slivers: [
          PinnedHeaderSliver(
            child: Container(
              padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.dishHeadTop, M2Space.gutter, M2Layout.dishHeadBottom),
              decoration: BoxDecoration(
                color: M2Color.chalk,
                boxShadow: _stuck
                    ? [
                        const BoxShadow(offset: Offset(0, -M2Layout.dishHeadTop), color: M2Color.chalk),
                        const BoxShadow(offset: Offset(0, 1), color: M2Color.hair),
                        BoxShadow(offset: const Offset(0, M2Layout.shadowDy), blurRadius: M2Layout.shadowBlur, spreadRadius: M2Layout.shadowSpread, color: M2Color.scrim.withValues(alpha: M2Opacity.edgeShadow)),
                      ]
                    : const [BoxShadow(offset: Offset(0, -M2Layout.dishHeadTop), color: M2Color.chalk)],
              ),
              child: Semantics(header: true, child: Text(d.name, style: M2Text.dishName.style(M2Color.dm))),
            ),
          ),
          SliverToBoxAdapter(child: body),
        ],
      ),
    );
  }
}

/// `.ingh`, `.ing`, `.ingmore`: Ingredients cut to three lines with a fade, and Show all only when it is cut; the height opens in
/// place on `settle`.
class _Ingredients extends StatelessWidget {
  final String text;
  final bool open;
  final VoidCallback onToggle;
  const _Ingredients({required this.text, required this.open, required this.onToggle});
  @override
  Widget build(BuildContext context) {
    final style = M2Text.ing.style(M2Color.ink);
    final a = resolveAnim(context, M2Motion.settle);
    return LayoutBuilder(builder: (context, c) {
      final tp = TextPainter(text: TextSpan(text: text, style: style), textDirection: TextDirection.ltr, maxLines: M2Layout.ingLines.toInt())..layout(maxWidth: c.maxWidth);
      final cut = tp.didExceedMaxLines, lineH = M2Text.ing.line!;
      final full = (TextPainter(text: TextSpan(text: text, style: style), textDirection: TextDirection.ltr)..layout(maxWidth: c.maxWidth)).height;
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(padding: const EdgeInsets.only(top: M2Layout.ingTop, bottom: M2Layout.ingBottom), child: Text('Ingredients', style: M2Text.sheetHead.style(M2Color.dm))),
        AnimatedContainer(
          duration: a.duration, curve: a.curve, height: open || !cut ? full : lineH * M2Layout.ingLines, clipBehavior: Clip.hardEdge, decoration: const BoxDecoration(),
          child: Stack(children: [
            OverflowBox(alignment: Alignment.topLeft, maxHeight: double.infinity, child: Text(text, style: style)),
            if (cut && !open)
              Positioned(left: 0, right: 0, bottom: 0, height: lineH, child: const DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color.fromRGBO(248, 249, 251, 0), M2Color.chalk])))),
          ]),
        ),
        if (cut) Align(alignment: Alignment.centerLeft, child: Padding(padding: const EdgeInsets.only(top: M2Layout.ingMoreTop), child: SizedBox(height: M2Layout.ingMore, child: TextAction(open ? 'Show less' : 'Show all', onTap: () { Haptics.selection(); onToggle(); })))),
      ]);
    });
  }
}
