import 'dart:async' show Timer;

import 'package:flutter/widgets.dart';
import '../../core/m2/board.dart';
import '../../core/m2/bowl.dart' show Bowl;
import '../../core/m2/bowl_builder.dart';
import '../../core/m2/dish_sheet.dart';
import '../../core/m2/plate.dart';
import '../../core/m2/where.dart';
import '../../shell/app_scope.dart';
import '../../shell/shell_scope.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';
import 'bowl_foot.dart';
import 'where_book.dart';

const markGlyphs = {'plant': Glyph.plant, 'veg': Glyph.veg, 'halal': Glyph.halal, 'local': Glyph.local, 'sus': Glyph.sus};
const markNames = {'plant': 'Plant based', 'veg': 'Vegetarian', 'halal': 'Halal', 'local': 'Local', 'sus': 'Sustainable'};

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
  BowlSpec? build,
  Sel? sel,
  ({int plateId, String key})? edit,
  bool plain = false,
  VoidCallback? onClosed,
}) {
  // today's dish that builds opens its builder (the row's + still adds it plain); a plate row of a plain dish opens as itself
  // (tracking off: a build station's dishes are just dishes, M2 CONCEPT R10 §2)
  build = !AppScope.of(context).prefs.track ? null : build ?? (day == 0 && !plain ? buildFor(fx, place, meal, dish) : null);
  final book = WhereBook(AppScope.of(context).repo, fx, cafeIds, false);
  return ShellScope.of(context).pushSheet((handle, done) => DishSheet(
        handle: handle, dish: dish, place: place, meal: meal, day: day, fx: fx, book: book, avoid: avoid, refs: refs, onServe: onServe, build: build, sel: sel, edit: edit,
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

  /// The builder this sheet is (M2 `openDish` with a build): the add-ins chosen so far, and the plate item being edited (Update).
  final BowlSpec? build;
  final Sel? sel;
  final ({int plateId, String key})? edit;
  const DishSheet({
    super.key, required this.handle, required this.dish, required this.place, required this.meal, required this.day, required this.fx,
    required this.book, this.avoid = const [], this.refs, required this.onServe, required this.onClosed, this.build, this.sel, this.edit,
  });
  @override
  State<DishSheet> createState() => _DishSheetState();
}

class _DishSheetState extends State<DishSheet> {
  final _cal = GlobalKey();
  bool _stuck = false, _ingOpen = false;
  /// the sheet's height now (the star rides its pinned header)
  final _px = ValueNotifier<double>(0);
  late Sel _sel = {...?widget.sel};
  final _rowKeys = List.generate(4, (_) => GlobalKey());
  Timer? _whereTimer;

  @override
  void initState() {
    super.initState();
    // the sheet slides in first; "where it is served" (every hall's and café's menus) starts once it has settled
    _whereTimer = Timer(M2Motion.cont.duration, widget.book.start);
  }

  @override
  void dispose() {
    _whereTimer?.cancel();
    _px.dispose();
    super.dispose();
  }

  MenuItem get d => widget.dish;

  double _mid(SheetMetrics m, double st) {
    final spec = widget.build;
    if (spec != null) {
      final sc = m.body?.findRenderObject() as RenderBox?;
      final rows = [for (final k in _rowKeys.take(spec.parts.length)) k.currentContext?.findRenderObject() as RenderBox?];
      if (sc == null || rows.isEmpty || rows.any((r) => r == null || !r.hasSize)) return m.height * M2Layout.dishMidGuess;
      return buildMid(
        grab: M2Layout.grabH, rowsBottom: [for (final r in rows) r!.localToGlobal(Offset(0, r.size.height), ancestor: sc).dy - M2Layout.grabH],
        foot: BowlFoot.heightFor(context), winH: m.height, top: st,
      );
    }
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

  void _step(int i, int dir) {
    setState(() => _sel = stepPart(widget.build!, _sel, i, dir));
    dir > 0 ? Haptics.add() : Haptics.remove();
  }

  /// M2 `badd`: the sheet goes down; the bowl lands on the plate (or replaces the one being edited) where the bar can show it.
  void _badd(AppScope scope, String pm, Bowl bowl) {
    final spec = widget.build!, edit = widget.edit;
    widget.handle.away(() {
      if (edit != null) {
        scope.plate.updateBowl(edit.plateId, edit.key, spec, bowl);
      } else {
        scope.plate.addBowl(pm, spec, bowl);
      }
      Haptics.add();
    });
  }

  void _serve(String place, WhereGroup g) => widget.handle.away(() {
        Haptics.light();
        widget.onServe(place, g);
      });

  static const _glyphs = markGlyphs, _names = markNames;

  Widget _where(Board fx, MenuItem head) {
    final answer = whereAnswer(fx, head.dishName, widget.fx.clock, newton: AppScope.of(context).prefs.charlesRiver);
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

  /// `.brow`: a compact add-in row under the builder's heading: its name, calories (and a café's price), the row's stepper.
  Widget _brow(int i, Bowl bowl) {
    final x = widget.build!.parts[i], cafe = isCafe(widget.place), n = M2Text.metaNum.style(M2Color.ink), u = M2Text.meta.style(M2Color.slate);
    return KeyedSubtree(
      key: i < _rowKeys.length ? _rowKeys[i] : null,
      child: Container(
        key: ValueKey('brow:$i'),
        constraints: const BoxConstraints(minHeight: M2Layout.browMin),
        decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: M2Color.hair))),
        child: Row(children: [
          Expanded(
            child: ExcludeSemantics(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text.rich(Badge.name(x.dishName, M2Text.rowName.style(M2Color.ink), badge: Badge.forDiet(x.diet))),
                Padding(
                  padding: const EdgeInsets.only(top: M2Layout.browMetaTop),
                  child: Row(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
                    Text(fc(x.nutrition.calories), style: n), const SizedBox(width: M2Layout.numSpace), Text('cal', style: u),
                    if (cafe && x.price != null) ...[const SizedBox(width: M2Layout.numSpace + M2Layout.browPriceGap), Text(x.price!, style: n)],
                  ]),
                ),
              ]),
            ),
          ),
          const SizedBox(width: M2Layout.browGap),
          RowControl(lane: false, qty: (_sel[i] ?? 0).toDouble(), ghost: false, onAdd: () => _step(i, 1), onInc: () => _step(i, 1), onDec: () => _step(i, -1)),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context), st = safeTop(context), spec = widget.build;
    return ListenableBuilder(
      listenable: Listenable.merge([scope.prefs, scope.plate, widget.book]),
      builder: (context, _) {
        final fx = widget.fx, pm = plateMeal(fx, widget.place, widget.meal, fx.clock);
        final bowl = spec == null ? null : bowlNow(spec, _sel), head = spec == null ? d : spec.base, item = bowl?.item ?? d;
        final on = widget.day == 0 && findItem(scope.plate.state, pm, d.key) != null;
        final marks = head == null ? null : sheetMarks(head, scope.prefs.scores), label = labelRows(item);
        final price = spec == null ? shownPrice(widget.place, d) : (isCafe(widget.place) ? item.price : null);
        final serving = spec == null ? label.serving : (head == null ? null : labelRows(head).serving);
        final board = widget.book.board, name = bowl?.name ?? d.dishName;
        return NotificationListener<ScrollNotification>(
          onNotification: (n) {
            if (n.metrics.axis == Axis.vertical) {
              final stuck = n.metrics.pixels > M2Layout.stuckAt;
              if (stuck != _stuck) setState(() => _stuck = stuck);
            }
            return false;
          },
          child: LayoutBuilder(builder: (context, frame) => Stack(children: [
            Positioned.fill(child: M2Sheet(
            handle: widget.handle, top: st + M2Layout.sheetTop, onClosed: widget.onClosed, mid: (m) => _mid(m, st), header: const SheetGrab(), onSize: (v) => _px.value = v,
            bottomPad: spec == null ? null : M2Layout.footBodyPad + safeBottom(context),
            slivers: [
              PinnedHeaderSliver(child: DishHead(name: name, stuck: _stuck)),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: M2Space.gutter),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    if (price != null || serving != null)
                      Padding(
                        padding: const EdgeInsets.only(top: M2Layout.dsvTop),
                        child: Text.rich(TextSpan(style: M2Text.date.style(M2Color.slate), children: [
                          if (price != null) ...[
                            TextSpan(text: price, style: M2Text.price.style(M2Color.ink)),
                            const WidgetSpan(child: SizedBox(width: M2Space.part)),
                          ],
                          TextSpan(text: serving),
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
                    if (item.allergens.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: M2Layout.dalTop),
                        child: Text.rich(TextSpan(style: M2Text.lbl.style(M2Color.ink), children: [
                          TextSpan(text: 'Contains ', style: const TextStyle(color: M2Color.dm, fontWeight: bold700)),
                          for (var i = 0; i < item.allergens.length; i++) ...[
                            if (i > 0) const TextSpan(text: ', '),
                            TextSpan(text: item.allergens[i], style: widget.avoid.contains(item.allergens[i]) ? const TextStyle(color: M2Color.vm, fontWeight: bold700) : null),
                          ],
                        ])),
                      ),
                    if (spec != null) ...[
                      if (spec.syn == null)
                        Padding(padding: const EdgeInsets.only(top: M2Layout.bhTop, bottom: M2Layout.bhBottom), child: Text(spec.head, style: M2Text.sheetHead.style(M2Color.dm))),
                      Padding(
                        padding: EdgeInsets.only(top: spec.syn != null ? M2Layout.bpartsSynTop : 0),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                          for (var i = 0; i < spec.parts.length; i++) ...[
                            if (spec.syn?.topHead != null && i == spec.syn!.choices.length)
                              Padding(padding: const EdgeInsets.only(top: M2Layout.bhTop, bottom: M2Layout.bhBottom), child: Text(spec.syn!.topHead!, style: M2Text.sheetHead.style(M2Color.dm))),
                            _brow(i, bowl!),
                          ],
                        ]),
                      ),
                    ] else if (widget.day == 0 && scope.prefs.track)
                      Padding(padding: const EdgeInsets.only(top: M2Layout.dadd), child: Button(kind: ButtonKind.primary, label: on ? 'Add another' : 'Add to plate', expand: true, onTap: () => _add(scope, pm))),
                    // tracking off: "where it's served" takes the action's place, 16 after the identity group
                    if (board != null && head != null) Padding(padding: EdgeInsets.only(top: scope.prefs.track ? M2Layout.whereTop : M2Layout.whereTopOff), child: _where(board, head)),
                    Padding(padding: const EdgeInsets.only(top: M2Layout.labelTop), child: NutritionLabel(label: label, calKey: _cal)),
                    if (head != null && (head.health != null || head.carbon != null)) Padding(padding: const EdgeInsets.only(top: M2Layout.gradesTop), child: RatingsPanel(health: head.health, carbon: head.carbon)),
                    if (head?.ingredients?.isNotEmpty ?? false) DishIngredients(text: head!.ingredients!, open: _ingOpen, onToggle: () => setState(() => _ingOpen = !_ingOpen)),
                  ]),
                ),
              ),
            ],
          )),
            if (head != null)
              ValueListenableBuilder<double>(
                valueListenable: _px,
                builder: (_, px, _) => Positioned(
                  top: frame.maxHeight - px + M2Layout.grabH + M2Layout.favUp, right: M2Space.gutter - M2Layout.favOut,
                  child: FavoriteStar(on: scope.prefs.isFavorite(head.dishName), onTap: () => _favorite(scope, head)),
                ),
              ),
            if (spec != null)
              ValueListenableBuilder<double>(
                valueListenable: _px,
                builder: (_, px, _) {
                  final h = BowlFoot.heightFor(context);
                  return Positioned(
                    left: 0, right: 0, height: h, top: frame.maxHeight - (px < h ? px : h),
                    child: BowlFoot(
                      cal: item.nutrition.calories, protein: item.nutrition.proteinG, update: widget.edit != null, off: addOff(spec, bowl!), onTap: () => _badd(scope, pm, bowl),
                    ),
                  );
                },
              ),
          ])),
        );
      },
    );
  }

  void _favorite(AppScope scope, MenuItem head) {
    Haptics.light();
    scope.prefs.toggleFavorite(head.dishName).catchError((Object e) => debugPrint('favorite not saved: $e'));
  }
}

/// `.dhd`: the name over the label as it scrolls, with room at its right for the favourite star. Padding-bottom 4 under the name and margin-bottom -4, so the
/// next row starts at the name's own bottom while the ground (and, once something passes under it, its edge) reaches 4 under it.
class DishHead extends StatelessWidget {
  final String name;
  final bool stuck;
  /// the name keeps clear of the star's (or Edit's) slot at its right; a name with nothing there takes the whole line
  final bool reserve;
  /// the width of what sits there: the star's box, or Edit's
  final double slot;
  const DishHead({super.key, required this.name, required this.stuck, this.reserve = true, this.slot = M2Layout.favBox});
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
            if (reserve) ...[
              const SizedBox(width: M2Layout.favGap),
              SizedBox(width: slot), // (the star itself is drawn over the sheet)
            ],
          ]),
        ),
      ]);
}

/// `.ingh`, `.ing`, `.ingmore`: Ingredients cut to three lines with a fade, and Show all only when it is cut; the height opens in
/// place on `settle`.
class DishIngredients extends StatelessWidget {
  final String text;
  final bool open;
  final VoidCallback onToggle;
  const DishIngredients({super.key, required this.text, required this.open, required this.onToggle});
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
