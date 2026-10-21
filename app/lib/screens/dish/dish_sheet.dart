import 'dart:async' show Timer;

import 'package:flutter/widgets.dart';
import '../../core/m2/board.dart';
import '../../core/m2/bowl.dart' show Bowl, Syn;
import '../../core/m2/bowl_builder.dart';
import '../../core/m2/dish_sheet.dart';
import '../../core/m2/plate.dart';
import '../../core/m2/variants.dart';
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

  /// a plain family variant opened from its plate row: the action reads Update and moves that item to the variant picked
  ({int plateId, String key})? update,
  VoidCallback? onClosed,
}) {
  // today's dish that builds opens its builder (the row's + still adds it plain); a plate row of a plain dish opens as itself
  // (tracking off: a build station's dishes are just dishes, M2 CONCEPT R10 §2)
  build = !AppScope.of(context).prefs.track ? null : build ?? (day == 0 && !plain ? buildFor(fx, place, meal, dish) : null);
  final book = WhereBook(AppScope.of(context).repo, fx, cafeIds, false);
  return ShellScope.of(context).pushSheet((handle, done) => DishSheet(
        handle: handle, dish: dish, place: place, meal: meal, day: day, fx: fx, book: book, avoid: avoid, refs: refs, onServe: onServe, build: build, sel: sel, edit: edit, update: update,
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
  final ({int plateId, String key})? edit, update;
  const DishSheet({
    super.key, required this.handle, required this.dish, required this.place, required this.meal, required this.day, required this.fx,
    required this.book, this.avoid = const [], this.refs, required this.onServe, required this.onClosed, this.build, this.sel, this.edit, this.update,
  });
  @override
  State<DishSheet> createState() => _DishSheetState();
}

class _DishSheetState extends State<DishSheet> {
  final _cal = GlobalKey(), _whereLine = GlobalKey();
  bool _stuck = false, _ingOpen = false;
  /// the sheet's height now (the star rides its pinned header)
  final _px = ValueNotifier<double>(0);
  late Sel _sel = {...?widget.sel};
  /// What the sheet is of now: a family's picker moves the variant (and its builder, and the places' servings), a pho's moves what is chosen.
  late MenuItem _d = widget.dish;
  late BowlSpec? _spec = widget.build;
  late Map<String, MenuItem>? _refs = widget.refs;
  late final FamilyIndex _ix = familiesOf(widget.fx);
  /// a two-picker pho: the protein and the broth chosen so far (read from the pho already chosen, when a plate item reopens)
  late ({String? p, String? b}) _pk = _phoPicks();
  final _rowKeys = List.generate(4, (_) => GlobalKey());
  Timer? _whereTimer;

  @override
  void initState() {
    super.initState();
    // the sheet slides in first; "where it is served" (every hall's and café's menus) loads only while the sheet rests: after the slide,
    // and again after the halls' answer has moved it
    _whereTimer = Timer(M2Motion.cont.duration, () => widget.book.start(settled: () => widget.handle.settled));
  }

  @override
  void dispose() {
    _whereTimer?.cancel();
    _px.dispose();
    super.dispose();
  }

  MenuItem get d => _d;
  Family? get _fam => _ix.familyOf(_d);

  ({String? p, String? b}) _phoPicks() {
    final spec = widget.build, y = spec?.syn;
    if (y == null || y.axes == null) return (p: null, b: null);
    for (final e in (widget.sel ?? const {}).entries) {
      final m = RegExp(r'^(.+?) Pho w/(.+) Broth$').firstMatch(spec!.parts[e.key].dishName);
      if (m != null && e.key < y.choices.length) return (p: m[1], b: m[2]);
    }
    return (p: null, b: null);
  }

  /// The place's serving of the variant `x` for each place the sheet counts (M2 `sameVar`).
  Map<String, MenuItem>? _remap(Variant x) {
    final r = _refs;
    if (r == null) return null;
    return {
      for (final e in r.entries) e.key: (() {
        final f = _ix.familyOf(e.value);
        return f?.vars.where((y) => y.v == x.v).firstOrNull?.dish ?? e.value;
      })(),
    };
  }

  /// A family chip: the sheet becomes that variant's, the builder keeps its add-ins (M2 `pickVar`).
  void _pick(int i) {
    final x = _fam!.vars[i];
    if (identical(x.dish, _d)) return;
    setState(() {
      final old = _spec;
      _refs = _remap(x) ?? {widget.place: x.dish};
      if (old != null) {
        final nb = buildFor(widget.fx, widget.place, widget.meal, x.dish);
        if (nb != null) {
          _sel = {for (final e in _sel.entries) if (nb.parts.indexWhere((p) => identical(p, old.parts[e.key])) case final j when j >= 0) j: e.value};
        }
        _spec = nb;
      }
      _d = x.dish;
    });
    Haptics.selection();
  }

  /// A hall bar's or a plain café's broth chip: that one is chosen, the last one put back.
  void _pickChoice(int i) {
    setState(() => _sel = stepPart(_spec!, _sel, i, 1));
    Haptics.selection();
  }

  /// A café's protein (axis 'p') or broth chip; a pho is chosen once both are (its feed dish names the bowl).
  void _pickAxis(String axis, String v) {
    final y = _spec!.syn!, pk = axis == 'p' ? (p: v, b: _pk.b) : (p: _pk.p, b: v);
    if (pk == _pk) return;
    setState(() {
      _pk = pk;
      _sel = {..._sel}..removeWhere((k, _) => k < y.choices.length);
      final dish = pk.p == null || pk.b == null ? null : y.axes!.dish(pk.p!, pk.b!);
      if (dish != null) _sel[_spec!.parts.indexWhere((x) => identical(x, dish))] = 1;
    });
    Haptics.selection();
  }

  double _mid(SheetMetrics m, double st) {
    final spec = _spec;
    if (spec != null) {
      final sc = m.body?.findRenderObject() as RenderBox?;
      final rows = [for (final k in _rowKeys.take(_drawn(spec).length)) k.currentContext?.findRenderObject() as RenderBox?];
      if (sc == null || rows.isEmpty || rows.any((r) => r == null || !r.hasSize)) return m.height * M2Layout.dishMidGuess;
      return buildMid(
        grab: M2Layout.grabH, rowsBottom: [for (final r in rows) r!.localToGlobal(Offset(0, r.size.height), ancestor: sc).dy - M2Layout.grabH],
        foot: BowlFoot.heightFor(context), winH: m.height, top: st,
      );
    }
    final scroll = m.body?.findRenderObject() as RenderBox?, cal = _cal.currentContext?.findRenderObject() as RenderBox?;
    if (!AppScope.of(context).prefs.track) {
      // tracking off: no label; it rests at the end of "where" (the line reserved at open, so its answer never re-snaps the sheet)
      final w = _whereLine.currentContext?.findRenderObject() as RenderBox?;
      if (scroll == null || w == null || !w.hasSize) return m.height * M2Layout.dishMidGuess;
      return restingSnap(calBottom: w.localToGlobal(Offset.zero, ancestor: scroll).dy + M2Layout.whereLine - M2Layout.grabH, grab: M2Layout.grabH, winH: m.height, top: st);
    }
    if (scroll == null || cal == null || !cal.hasSize) return m.height * M2Layout.dishMidGuess;
    final bottom = cal.localToGlobal(Offset(0, cal.size.height), ancestor: scroll).dy; // under the pinned grab, to the rule under Calories
    // the where line is reserved at open and never moves the sheet: an answer taller than its line (a second group, chips on two
    // rows) pushes the label down, and the rest stays where one line put it (owner, 2026-10-18)
    final where = _whereLine.currentContext?.findRenderObject() as RenderBox?;
    final over = where == null || !where.hasSize ? 0.0 : (where.size.height - M2Layout.whereLine).clamp(0.0, double.infinity);
    return restingSnap(calBottom: bottom - M2Layout.grabH - over, grab: M2Layout.grabH, winH: m.height, top: st);
  }

  void _add(AppScope scope, String pm) {
    final refs = _refs ?? {widget.place: d}, name = shownOf(_ix, d), key = d.key;
    widget.handle.away(() {
      scope.plate.add(pm, name, refs, null, key);
      Haptics.add();
    });
  }

  /// M2 `vupd`: the plate item becomes the variant now picked, keeping its servings.
  void _vupd(AppScope scope) {
    final u = widget.update!, refs = _refs ?? {widget.place: d}, name = shownOf(_ix, d), dish = d;
    widget.handle.away(() {
      scope.plate.updateDish(u.plateId, u.key, name, dish, refs);
      Haptics.add();
    });
  }

  /// The parts a builder draws as add-in rows: all but a pho's choices, which are the picker's chips.
  List<int> _drawn(BowlSpec spec) => [for (var i = 0; i < spec.parts.length; i++) if (!(spec.syn != null && spec.syn!.pho && i < spec.syn!.choices.length)) i];

  void _step(int i, int dir) {
    setState(() => _sel = stepPart(_spec!, _sel, i, dir));
    dir > 0 ? Haptics.add() : Haptics.remove();
  }

  /// M2 `badd`: the sheet goes down; the bowl lands on the plate (or replaces the one being edited) where the bar can show it.
  void _badd(AppScope scope, String pm, Bowl bowl) {
    final spec = _spec!, edit = widget.edit, name = spec.base == null ? null : shownOf(_ix, spec.base!);
    widget.handle.away(() {
      if (edit != null) {
        scope.plate.updateBowl(edit.plateId, edit.key, spec, bowl, name: name);
      } else {
        scope.plate.addBowl(pm, spec, bowl, name: name);
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
    if (answer.isEmpty) return Text(notServed, style: M2Text.sheetHead.style(M2Color.dm));
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

  /// The answer not yet in: the reserved line holds blank chips (no text, no motion), and the real ones replace them in place.
  Widget _holders() => Padding(
        padding: EdgeInsets.only(top: M2Text.sheetHead.line! + M2Layout.wtBottom),
        child: Wrap(key: const ValueKey('where-holders'), spacing: M2Layout.wcGap, children: [
          for (var i = 0; i < 2; i++)
            const SizedBox(
              width: M2Layout.hchipHolderW, height: M2Layout.hchipH,
              child: DecoratedBox(decoration: BoxDecoration(color: M2Color.tint, borderRadius: BorderRadius.all(Radius.circular(M2Radius.button)))),
            ),
        ]),
      );

  /// `.brow`: a compact add-in row under the builder's heading: its name, calories (and a café's price), the row's stepper.
  Widget _brow(int i, int at, Bowl bowl) {
    final x = _spec!.parts[i], cafe = isCafe(widget.place), n = M2Text.metaNum.style(M2Color.ink), u = M2Text.meta.style(M2Color.slate);
    return KeyedSubtree(
      key: at < _rowKeys.length ? _rowKeys[at] : null,
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
                    Text(fc(x.nutrition.knownCal), style: n), const SizedBox(width: M2Layout.numSpace), Text('cal', style: u),
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
    final scope = AppScope.of(context), st = safeTop(context), spec = _spec;
    return ListenableBuilder(
      listenable: Listenable.merge([scope.prefs, scope.plate, widget.book]),
      builder: (context, _) {
        final fx = widget.fx, pm = plateMeal(fx, widget.place, widget.meal, fx.clock);
        final bowl = spec == null ? null : bowlNow(spec, _sel), head = spec == null ? d : spec.base, item = bowl?.item ?? d;
        final on = widget.day == 0 && findItem(scope.plate.state, pm, d.key) != null;
        final marks = head == null ? null : sheetMarks(head, scope.prefs.scores), label = labelRows(item);
        final price = spec == null ? shownPrice(widget.place, d) : (isCafe(widget.place) ? item.price : null);
        final serving = spec == null ? label.serving : (head == null ? null : labelRows(head).serving);
        final board = widget.book.board, fam = _fam;
        // a built family member reads as its variant (M2 `nameOf`)
        final name = bowl == null ? shownOf(_ix, d) : spec!.base != null ? shownOf(_ix, spec.base!) : bowl.name;
        final y = spec?.syn != null && spec!.syn!.pho ? spec.syn : null, pickers = _pickers(fam, y, spec);
        final sig = Object.hash(_d, _pk, y == null ? null : [for (var i = 0; i < y.choices.length; i++) i].where(_sel.containsKey).firstOrNull);
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
            handle: widget.handle, top: st + M2Layout.sheetTop, onClosed: widget.onClosed, mid: (m) => _mid(m, st), onSize: (v) => _px.value = v,
            bottomPad: spec == null ? null : M2Layout.footBodyPad + safeBottom(context),
            slivers: [
              // (the grab rides in the one pinned header: a second pinned sliver after it asserts on the frames where the sheet is shorter than both)
              PinnedHeaderSliver(child: Column(mainAxisSize: MainAxisSize.min, children: [const SheetGrab(), DishHead(name: name, stuck: _stuck, reserve: !(head?.always ?? false))])),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: M2Space.gutter),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    if (pickers.isNotEmpty) Padding(padding: const EdgeInsets.only(top: M2Layout.vpickGap), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: pickers)),
                    // (everything under the chips is the pick's own and comes back from 0.4 in place)
                    _Under(fade: pickers.isNotEmpty, value: sig, child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    if (price != null || serving != null)
                      Padding(
                        padding: EdgeInsets.only(top: pickers.isNotEmpty ? M2Layout.vpickGap : M2Layout.dsvTop),
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
                          for (final (at, i) in _drawn(spec).indexed) ...[
                            // (a café pho's add-ons heading leads the rows once its choices are chips)
                            if (spec.syn?.topHead != null && at == 0)
                              Padding(padding: const EdgeInsets.only(top: M2Layout.bhTop, bottom: M2Layout.bhBottom), child: Text(spec.syn!.topHead!, style: M2Text.sheetHead.style(M2Color.dm))),
                            _brow(i, at, bowl!),
                          ],
                        ]),
                      ),
                    ] else if (widget.day == 0 && scope.prefs.track)
                      widget.update != null && fam != null
                          ? Padding(padding: const EdgeInsets.only(top: M2Layout.dadd), child: Button(kind: ButtonKind.primary, label: 'Update', expand: true, onTap: () => _vupd(scope)))
                          : Padding(padding: const EdgeInsets.only(top: M2Layout.dadd), child: Button(kind: ButtonKind.primary, label: on ? 'Add another' : 'Add to plate', expand: true, onTap: () => _add(scope, pm))),
                    // tracking off: "where it's served" takes the action's place, 16 after the identity group. One line of it is
                    // reserved from the first frame and held empty until the answer fills it in place
                    if (head != null)
                      Padding(
                        padding: EdgeInsets.only(top: scope.prefs.track ? M2Layout.whereTop : M2Layout.whereTopOff),
                        child: ConstrainedBox(
                          key: _whereLine,
                          constraints: BoxConstraints(minHeight: M2Layout.whereLine),
                          child: KeyedSubtree(key: const ValueKey('where-line'), child: board == null ? _holders() : _where(board, head)),
                        ),
                      ),
                    if (scope.prefs.track) Padding(padding: const EdgeInsets.only(top: M2Layout.labelTop), child: NutritionLabel(label: label, calKey: _cal)),
                    if (head != null && (head.health != null || head.carbon != null)) Padding(padding: const EdgeInsets.only(top: M2Layout.gradesTop), child: RatingsPanel(health: head.health, carbon: head.carbon)),
                    if (head?.ingredients?.isNotEmpty ?? false) DishIngredients(text: head!.ingredients!, open: _ingOpen, onToggle: () => setState(() => _ingOpen = !_ingOpen)),
                    ])),
                  ]),
                ),
              ),
            ],
          )),
            if (head != null && !head.always)
              ValueListenableBuilder<double>(
                valueListenable: _px,
                builder: (_, px, _) => Positioned(
                  top: frame.maxHeight - px + M2Layout.grabH + M2Layout.favUp, right: M2Space.gutter - M2Layout.favOut,
                  child: FavoriteStar(on: scope.prefs.isFavorite(fam == null ? head.dishName : favoriteOf(fam)), onTap: () => _favorite(scope, fam == null ? head.dishName : favoriteOf(fam))),
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
                      cal: item.nutrition.knownCal, protein: item.nutrition.knownProtein, update: widget.edit != null, off: addOff(spec, bowl!), onTap: () => _badd(scope, pm, bowl),
                    ),
                  );
                },
              ),
          ])),
        );
      },
    );
  }

  /// The chip groups under the name (`vpickHTML`): a family's variants; a pho's broths, or its protein then its broth (round 12b, 24 apart).
  List<Widget> _pickers(Family? fam, Syn? y, BowlSpec? spec) {
    if (y != null) {
      final ax = y.axes;
      if (ax != null) {
        return [
          VariantPicker(name: 'Protein', labels: [for (final (_, l) in ax.p) l], chosen: _some(ax.p.indexWhere((e) => e.$1 == _pk.p)), onPick: (i) => _pickAxis('p', ax.p[i].$1)),
          const SizedBox(height: M2Layout.vpickGroupGap),
          VariantPicker(name: 'Broth', labels: [for (final (_, l) in ax.b) l], chosen: _some(ax.b.indexWhere((e) => e.$1 == _pk.b)), onPick: (i) => _pickAxis('b', ax.b[i].$1)),
        ];
      }
      return [
        VariantPicker(
          name: y.label, labels: [for (final c in y.choices) c.dishName],
          chosen: [for (var i = 0; i < y.choices.length; i++) i].where(_sel.containsKey).firstOrNull, onPick: _pickChoice,
        ),
      ];
    }
    if (fam == null) return const [];
    return [VariantPicker(name: fam.name, labels: [for (final x in fam.vars) x.chip], chosen: _some(fam.vars.indexWhere((x) => identical(x.dish, _d))), onPick: _pick)];
  }

  static int? _some(int i) => i < 0 ? null : i;

  void _favorite(AppScope scope, String stored) {
    Haptics.light();
    scope.prefs.toggleFavorite(stored).catchError((Object e) => debugPrint('favorite not saved: $e'));
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
          padding: EdgeInsets.fromLTRB(M2Space.gutter, 0, reserve ? M2Space.gutter - M2Layout.favOut : M2Space.gutter, 0),
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

/// What is under a picker's chips (only a sheet with a picker fades; the others are drawn as they always were).
class _Under extends StatelessWidget {
  const _Under({required this.fade, required this.value, required this.child});
  final bool fade;
  final Object? value;
  final Widget child;
  @override
  Widget build(BuildContext context) => fade ? SettleFade(value: value, child: child) : child;
}
