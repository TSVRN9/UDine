import 'package:flutter/widgets.dart';

import '../../core/m2/board.dart' show Macro;
import '../../core/m2/dish_sheet.dart';
import '../../core/saved_food.dart';
import '../../core/types.dart' show NutritionFacts;
import '../../shell/app_scope.dart';
import '../../shell/shell_scope.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';
import '../plate/custom_food.dart' show FoodFormSliver;
import 'dish_sheet.dart';

/// Opens a food's sheet (M2 `openFood`) above everything: a saved food from You, Your foods in Search, or a plate row; or a packaged or UMass
/// Dining hit not yet kept. `meal` is the plate its Add joins (Search's meal, else the one the clock is in).
SheetHandle openFoodSheet(BuildContext context, {required SavedFood food, required String meal, VoidCallback? onClosed, bool startEdit = false}) =>
    ShellScope.of(context).pushSheet((handle, done) => FoodSheet(
          handle: handle, food: food, meal: meal, startEdit: startEdit,
          onClosed: () {
            onClosed?.call();
            done();
          },
        ));

/// A food's sheet (M2 `renderFood`): the dish sheet's identity group (name, serving, marks, Contains), Add to plate, the label and the
/// ingredients. It is served nowhere, so it has no "where", grades or star. A saved food has Edit where a dish has its star; Edit turns the
/// sheet into the form in place, with Save (back to the sheet) and Delete (the sheet goes down, and a receipt with Undo takes its place in the plate bar).
class FoodSheet extends StatefulWidget {
  const FoodSheet({super.key, required this.handle, required this.food, required this.meal, required this.onClosed, this.startEdit = false});
  /// opens already in Edit (a screenshot route)
  final bool startEdit;
  final SheetHandle handle;
  final SavedFood food;
  final String meal;
  final VoidCallback onClosed;
  @override
  State<FoodSheet> createState() => _FoodSheetState();
}

class _FoodSheetState extends State<FoodSheet> {
  final _cal = GlobalKey();
  final _px = ValueNotifier<double>(0);
  late bool _edit = widget.startEdit;
  bool _stuck = false, _ingOpen = false;
  late SavedFood _food = widget.food;

  @override
  void dispose() {
    _px.dispose();
    super.dispose();
  }

  /// Edit's box: its word and the 12 of padding each side (`.tbtn`), which is what the name leaves room for
  static final double _editW = (TextPainter(text: TextSpan(text: 'Edit', style: M2Text.link.style(M2Color.vm)), textDirection: TextDirection.ltr)..layout()).width + 2 * M2Layout.tbtnPad;

  double _mid(SheetMetrics m, double st) {
    if (_edit) return m.height;
    final scroll = m.body?.findRenderObject() as RenderBox?, cal = _cal.currentContext?.findRenderObject() as RenderBox?;
    if (scroll == null || cal == null || !cal.hasSize) return m.height * M2Layout.dishMidGuess;
    final bottom = cal.localToGlobal(Offset(0, cal.size.height), ancestor: scroll).dy;
    return restingSnap(calBottom: bottom - M2Layout.grabH, grab: M2Layout.grabH, winH: m.height, top: st);
  }

  void _add(AppScope scope) => widget.handle.away(() {
        Haptics.add();
        (scope.foods?.keep(_food) ?? Future.value(_food)).then((f) => scope.plate.addFood(widget.meal, f));
      });

  void _setEdit(bool on) {
    setState(() => _edit = on);
    if (on) widget.handle.to(double.maxFinite);
  }

  void _save(AppScope scope, String name, Macro m) {
    final next = _food.edited(name: name, cal: m.cal ?? 0, p: m.p ?? 0, c: m.c ?? 0, f: m.f ?? 0);
    scope.foods!.edit(_food, next).then((_) {
      if (!mounted) return;
      setState(() {
        _food = next;
        _edit = false;
      });
      Haptics.selection();
    }).catchError((Object e) {
      debugPrint('udine: the edit was not saved: $e');
    });
  }

  void _delete(AppScope scope) {
    final f = _food;
    widget.handle.away(() {
      Haptics.remove();
      scope.foods!.delete(f).then((undo) => scope.plate.showDeleted('Deleted ${f.name}', undo)).catchError((Object e) {
        debugPrint('udine: the food was not deleted: $e');
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context), st = safeTop(context), f = _food;
    return ListenableBuilder(
      listenable: Listenable.merge([scope.prefs, ?scope.foods]),
      builder: (context, _) {
        final saved = scope.foods?.byKey(f.key) != null, n = f.nutrition;
        final shown = NutritionFacts(
          servingSize: f.serving, calories: n.calories, caloriesFromFat: n.caloriesFromFat, totalFatG: n.totalFatG, satFatG: n.satFatG, transFatG: n.transFatG,
          cholesterolMg: n.cholesterolMg, sodiumMg: n.sodiumMg, totalCarbG: n.totalCarbG, dietaryFiberG: n.dietaryFiberG, sugarsG: n.sugarsG, proteinG: n.proteinG,
          totalFatDv: n.totalFatDv, satFatDv: n.satFatDv, cholesterolDv: n.cholesterolDv, sodiumDv: n.sodiumDv, totalCarbDv: n.totalCarbDv, dietaryFiberDv: n.dietaryFiberDv,
          sugarsDv: n.sugarsDv, proteinDv: n.proteinDv, blank: n.blank,
        );
        final label = labelRowsOf(shown), marks = dietMarks(f.diet), avoid = scope.prefs.diet.avoid;
        return NotificationListener<ScrollNotification>(
          onNotification: (s) {
            if (s.metrics.axis == Axis.vertical && !_edit) {
              final stuck = s.metrics.pixels > M2Layout.stuckAt;
              if (stuck != _stuck) setState(() => _stuck = stuck);
            }
            return false;
          },
          child: LayoutBuilder(builder: (context, frame) => Stack(children: [
            Positioned.fill(child: M2Sheet(
              handle: widget.handle, top: st + M2Layout.sheetTop, onClosed: widget.onClosed, mid: (m) => _mid(m, st), header: const SheetGrab(), onSize: (v) => _px.value = v,
              slivers: _edit
                  ? [
                      FoodFormSliver(
                        key: const ValueKey('form'), title: 'Edit food', primary: 'Save', name: f.name, cal: _fill(f.macro.cal, fc), p: _fill(f.macro.p), c: _fill(f.macro.c), f: _fill(f.macro.f),
                        fadeFrom: M2Layout.editFadeFrom, onSubmit: (name, m) => _save(scope, name, m), onDelete: () => _delete(scope),
                      ),
                    ]
                  : [
                      PinnedHeaderSliver(child: DishHead(name: f.name, stuck: _stuck, reserve: saved, slot: _editW)),
                      SliverToBoxAdapter(
                        child: Arrive(
                          key: ValueKey(f), from: M2Layout.editFadeFrom,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: M2Space.gutter),
                            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                              if (f.serving.isNotEmpty) Padding(padding: const EdgeInsets.only(top: M2Layout.dsvTop), child: Text(f.serving, style: M2Text.date.style(M2Color.slate))),
                              if (marks.isNotEmpty)
                                Padding(
                                  padding: const EdgeInsets.only(top: M2Layout.marksTop),
                                  child: Wrap(spacing: M2Layout.marksGap, runSpacing: M2Layout.marksGap, children: [for (final m in marks) MarkPatch(markGlyphs[m]!, markNames[m]!)]),
                                ),
                              if (f.allergens.isNotEmpty)
                                Padding(
                                  padding: const EdgeInsets.only(top: M2Layout.dalTop),
                                  child: Text.rich(TextSpan(style: M2Text.lbl.style(M2Color.ink), children: [
                                    TextSpan(text: 'Contains ', style: const TextStyle(color: M2Color.dm, fontWeight: bold700)),
                                    for (var i = 0; i < f.allergens.length; i++) ...[
                                      if (i > 0) const TextSpan(text: ', '),
                                      TextSpan(text: f.allergens[i], style: avoid.contains(f.allergens[i]) ? const TextStyle(color: M2Color.vm, fontWeight: bold700) : null),
                                    ],
                                  ])),
                                ),
                              if (scope.prefs.track)
                                Padding(padding: const EdgeInsets.only(top: M2Layout.dadd), child: Button(kind: ButtonKind.primary, label: 'Add to plate', expand: true, onTap: () => _add(scope))),
                              Padding(padding: const EdgeInsets.only(top: M2Layout.labelTop), child: NutritionLabel(label: label, calKey: _cal)),
                              if (f.ingredients?.isNotEmpty ?? false) DishIngredients(text: f.ingredients!, open: _ingOpen, onToggle: () => setState(() => _ingOpen = !_ingOpen)),
                            ]),
                          ),
                        ),
                      ),
                    ],
            )),
            if (saved && !_edit)
              ValueListenableBuilder<double>(
                valueListenable: _px,
                builder: (_, px, _) => Positioned(
                  top: frame.maxHeight - px + M2Layout.grabH + M2Layout.favUp, right: M2Space.gutter - M2Layout.favOut, height: M2Layout.favBox,
                  child: Center(child: TextAction('Edit', onTap: () => _setEdit(true))),
                ),
              ),
          ])),
        );
      },
    );
  }
}

/// An unknown figure opens the Edit form empty, not as "–".
String _fill(num? x, [String Function(num?) fmt = f1]) => x == null ? '' : fmt(x);
