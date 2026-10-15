import 'package:flutter/widgets.dart';
import '../../core/m2/board.dart';
import '../../core/m2/dish_sheet.dart';
import '../../core/m2/plate.dart';
import '../../core/m2/where.dart';
import '../../shell/app_scope.dart';
import '../../shell/shell_scope.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';
import 'where_book.dart';

/// Opens the dish sheet (M2 `openDish`) above everything, the tab bar included, over whatever it was opened from, which stays where it
/// was. `refs` are the places an Add counts for (the serving at this place by default; every place serving it from Search).
/// `onServe` runs once a where-served tap has the sheet half-way out: the opener decides between scrolling its own list and pushing
/// the place. `cafeIds` (café key -> location id) lets "where" name cafés too.
SheetHandle openDishSheet(
  BuildContext context, {
  required MenuItem dish,
  required String place,
  required String meal,
  required int day,
  required Board fx,
  required void Function(String place, WhereGroup group) onServe,
  List<String> avoid = const [],
  Map<String, MenuItem>? refs,
  Map<String, int> cafeIds = const {},
  VoidCallback? onClosed,
}) {
  final book = WhereBook(AppScope.of(context).repo, fx, cafeIds);
  return ShellScope.of(context).pushSheet((handle, done) => DishSheet(
        handle: handle, dish: dish, place: place, meal: meal, day: day, fx: fx, book: book, avoid: avoid, refs: refs, onServe: onServe,
        onClosed: () {
          book.dispose();
          onClosed?.call();
          done();
        },
      ));
}

/// Dish detail (M2 round 7): a sheet from the bottom edge. It rests at a height that shows the name, Add, where it is served and the
/// top of the label (through Calories); scrolling or dragging it up takes it to full height; dragging down, or a tap on the dimmed
/// backdrop, puts it away. Add, and a where-served tap, run when the sheet is half-way out, never on dismissal.
class DishSheet extends StatefulWidget {
  final SheetHandle handle;
  final MenuItem dish;
  final String place, meal;
  final int day;
  final Board fx;
  final WhereBook book;
  final List<String> avoid;
  final Map<String, MenuItem>? refs;
  final void Function(String place, WhereGroup group) onServe;
  final VoidCallback onClosed;
  const DishSheet({
    super.key, required this.handle, required this.dish, required this.place, required this.meal, required this.day, required this.fx,
    required this.book, this.avoid = const [], this.refs, required this.onServe, required this.onClosed,
  });
  @override
  State<DishSheet> createState() => _DishSheetState();
}

class _DishSheetState extends State<DishSheet> {
  final _cal = GlobalKey();
  bool _stuck = false, _ingOpen = false;

  MenuItem get d => widget.dish;

  double _mid(SheetMetrics m, double st) {
    final scroll = m.body?.findRenderObject() as RenderBox?, cal = _cal.currentContext?.findRenderObject() as RenderBox?;
    if (scroll == null || cal == null || !cal.hasSize) return m.height * M2Layout.dishMidGuess;
    final bottom = cal.localToGlobal(Offset(0, cal.size.height), ancestor: scroll).dy; // under the pinned grab, to the rule under Calories
    return restingSnap(calBottom: bottom - M2Layout.grabH, grab: M2Layout.grabH, winH: m.height, top: st);
  }

  void _add(AppScope scope, String pm) {
    final refs = widget.refs ?? {widget.place: d};
    widget.handle.away(() {
      scope.plate.add(pm, d.dishName, refs);
      Haptics.add();
    });
  }

  void _serve(String place, WhereGroup g) => widget.handle.away(() {
        Haptics.light();
        widget.onServe(place, g);
      });

  static const _glyphs = {'plant': Glyph.plant, 'veg': Glyph.veg, 'halal': Glyph.halal, 'local': Glyph.local, 'sus': Glyph.sus};
  static const _names = {'plant': 'Plant based', 'veg': 'Vegetarian', 'halal': 'Halal', 'local': 'Local', 'sus': 'Sustainable'};

  Widget _where(Board fx) {
    final answer = whereAnswer(fx, d.dishName, widget.fx.clock, newton: AppScope.of(context).prefs.charlesRiver);
    if (answer.isEmpty) return Text('Not on the menu again today or tomorrow', style: M2Text.sheetHead.style(M2Color.dm));
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      for (var i = 0; i < answer.length; i++) ...[
        if (i > 0) const SizedBox(height: M2Layout.wlGap),
        Padding(
          padding: const EdgeInsets.only(bottom: M2Layout.wtBottom),
          child: Text(whenText(answer[i], i > 0 ? answer[i - 1] : null), style: (i > 0 ? M2Text.sheetHeadSm.style(M2Color.vm) : M2Text.sheetHead.style(M2Color.dm))),
        ),
        Wrap(spacing: M2Layout.wcGap, runSpacing: M2Layout.wcGap, children: [
          for (final h in answer[i].halls)
            Press(scale: true, label: placeName(fx, h), onTap: () => _serve(h, answer[i]), child: HallChip(letter: isCafe(h) ? null : h, name: placeName(fx, h))),
        ]),
      ],
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context), st = safeTop(context);
    return ListenableBuilder(
      listenable: Listenable.merge([scope.prefs, scope.plate, widget.book]),
      builder: (context, _) {
        final fx = widget.fx, pm = plateMeal(fx, widget.place, widget.meal, fx.clock);
        final on = widget.day == 0 && findItem(scope.plate.state, pm, d.key) != null;
        final marks = sheetMarks(d, scope.prefs.scores), price = shownPrice(widget.place, d), label = labelRows(d);
        final board = widget.book.board;
        return NotificationListener<ScrollNotification>(
          onNotification: (n) {
            if (n.metrics.axis == Axis.vertical) {
              final stuck = n.metrics.pixels > M2Layout.stuckAt;
              if (stuck != _stuck) setState(() => _stuck = stuck);
            }
            return false;
          },
          child: M2Sheet(
            handle: widget.handle, top: st + M2Layout.sheetTop, onClosed: widget.onClosed, mid: (m) => _mid(m, st), header: const SheetGrab(),
            slivers: [
              PinnedHeaderSliver(child: _Head(name: d.dishName, stuck: _stuck, favorite: scope.prefs.isFavorite(d.dishName), onFavorite: () {
                Haptics.light();
                scope.prefs.toggleFavorite(d.dishName);
              })),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: M2Space.gutter),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    if (price != null || label.serving != null)
                      Padding(
                        padding: const EdgeInsets.only(top: M2Layout.dsvTop),
                        child: Text.rich(TextSpan(style: M2Text.date.style(M2Color.slate), children: [
                          if (price != null) ...[
                            TextSpan(text: price, style: M2Text.price.style(M2Color.ink)),
                            const WidgetSpan(child: SizedBox(width: M2Space.part)),
                          ],
                          TextSpan(text: label.serving),
                        ])),
                      ),
                    if (marks != null)
                      Padding(
                        padding: const EdgeInsets.only(top: M2Layout.marksTop),
                        child: Wrap(spacing: M2Layout.marksGap, runSpacing: M2Layout.marksGap, crossAxisAlignment: WrapCrossAlignment.center, children: [
                          for (final m in marks.marks) MarkPatch(_glyphs[m]!, _names[m]!),
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
                            TextSpan(text: d.allergens[i], style: widget.avoid.contains(d.allergens[i]) ? const TextStyle(color: M2Color.vm, fontWeight: bold700) : null),
                          ],
                        ])),
                      ),
                    if (widget.day == 0)
                      Padding(padding: const EdgeInsets.only(top: M2Layout.dadd), child: Button(kind: ButtonKind.primary, label: on ? 'Add another' : 'Add to plate', expand: true, onTap: () => _add(scope, pm))),
                    if (board != null) Padding(padding: const EdgeInsets.only(top: M2Layout.whereTop), child: _where(board)),
                    Padding(padding: const EdgeInsets.only(top: M2Layout.labelTop), child: NutritionLabel(label: label, calKey: _cal)),
                    if (d.health != null || d.carbon != null) Padding(padding: const EdgeInsets.only(top: M2Layout.gradesTop), child: RatingsPanel(health: d.health, carbon: d.carbon)),
                    if (d.ingredients?.isNotEmpty ?? false) _Ingredients(text: d.ingredients!, open: _ingOpen, onToggle: () => setState(() => _ingOpen = !_ingOpen)),
                  ]),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// `.dhd`: the name over the label as it scrolls, with the favourite star. Padding-bottom 4 under the name and margin-bottom -4, so the
/// next row starts at the name's own bottom while the ground (and, once something passes under it, its edge) reaches 4 under it.
class _Head extends StatelessWidget {
  final String name;
  final bool stuck, favorite;
  final VoidCallback onFavorite;
  const _Head({required this.name, required this.stuck, required this.favorite, required this.onFavorite});
  @override
  Widget build(BuildContext context) => Stack(clipBehavior: Clip.none, children: [
        Positioned(
          left: 0, right: 0, top: 0, bottom: -M2Layout.dishHeadBottom,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: M2Color.chalk,
              boxShadow: stuck
                  ? [
                      const BoxShadow(offset: Offset(0, -M2Layout.dishHeadTop), color: M2Color.chalk),
                      const BoxShadow(offset: Offset(0, 1), color: M2Color.hair),
                      BoxShadow(offset: const Offset(0, M2Layout.shadowDy), blurRadius: M2Layout.shadowBlur, spreadRadius: M2Layout.shadowSpread, color: M2Color.scrim.withValues(alpha: M2Opacity.edgeShadow)),
                    ]
                  : const [BoxShadow(offset: Offset(0, -M2Layout.dishHeadTop), color: M2Color.chalk)],
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(M2Space.gutter, 0, M2Space.gutter - M2Layout.favOut, 0),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: Padding(padding: const EdgeInsets.only(top: M2Layout.dishHeadTop), child: Semantics(header: true, child: Text(name, style: M2Text.dishName.style(M2Color.dm))))),
            const SizedBox(width: M2Layout.favGap),
            FavoriteStar(on: favorite, onTap: onFavorite),
          ]),
        ),
      ]);
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
    // (the engine rounds each 22.5 dp line up to 23, so a long list reads up to half a dp per line taller than M2's)
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
              Positioned(left: 0, right: 0, bottom: 0, height: lineH, child: DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [M2Color.chalk.withValues(alpha: 0), M2Color.chalk])))),
          ]),
        ),
        if (cut) Align(alignment: Alignment.centerLeft, child: Padding(padding: const EdgeInsets.only(top: M2Layout.ingMoreTop), child: TextAction(open ? 'Show less' : 'Show all', onTap: () { Haptics.selection(); onToggle(); }))),
      ]);
    });
  }
}
