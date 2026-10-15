import 'package:flutter/widgets.dart';

import '../../core/m2/board.dart';
import '../../core/m2/history.dart';
import '../../core/m2/plate.dart';
import '../../core/store/log_book.dart';
import '../../core/store/store.dart' show Undo;
import '../../shell/app_scope.dart';
import '../../shell/shell_scope.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';
import '../plate/plate_row.dart';
import '../plate/plate_sheet.dart' show plateBoard;
import 'you_parts.dart';

/// Opens a logged meal (M2 `openMeal`) above everything, the tab bar included: plate rows with the plate's steppers, the totals, Full
/// label and Delete meal. `at` is the meal's `loggedAt`.
SheetHandle openMealSheet(BuildContext context, {required String at, VoidCallback? onClosed}) {
  final scope = AppScope.of(context);
  return ShellScope.of(context).pushSheet((handle, done) => MealSheet(
        handle: handle, book: scope.log!, at: at, fx: plateBoard(scope.repo.now()),
        onDeleted: (text, undo) => handle.away(() => scope.plate.showDeleted(text, undo)),
        onClosed: () {
          onClosed?.call();
          done();
        },
      ));
}

/// The stepper edits as you go (it is its own undo); the last half of an item leaves an inline Undo where it was; Delete meal puts the
/// sheet away and shows the receipt with Undo in the bar's slot. Taking the last half off the last item deletes the meal.
class MealSheet extends StatefulWidget {
  const MealSheet({super.key, required this.handle, required this.book, required this.at, required this.fx, required this.onDeleted, required this.onClosed});
  final SheetHandle handle;
  final LogBook book;
  final String at;
  final Board fx;
  final void Function(String text, Undo undo) onDeleted;
  final VoidCallback onClosed;
  @override
  State<MealSheet> createState() => _MealSheetState();
}

class _MealSheetState extends State<MealSheet> {
  LoggedMeal? _last;
  ({LoggedItem item, Undo undo})? _gone;
  bool _label = false;

  LoggedMeal? get _meal => widget.book.meals.where((m) => m.loggedAt == widget.at).firstOrNull;

  void _step(LoggedMeal m, LoggedItem it, int dir) {
    final q = it.qty;
    if (dir > 0) {
      Haptics.add();
      _quiet(widget.book.setServings(it, q == 0.5 ? 1 : q + 1));
    } else if (q > 1) {
      Haptics.remove();
      _quiet(widget.book.setServings(it, q - 1));
    } else if (q == 1) {
      Haptics.remove();
      _quiet(widget.book.setServings(it, 0.5));
    } else if (m.items.length == 1) {
      _delete(m);
    } else {
      Haptics.remove();
      _quiet(widget.book.remove(it).then((undo) {
        if (mounted) setState(() => _gone = (item: it, undo: undo));
      }));
    }
  }

  /// A write that fails has already been read back by the book, so the rows show what the store holds; nothing more to do here.
  void _quiet(Future<void> f) => f.catchError((Object _) {});

  Future<void> _delete(LoggedMeal m) async {
    Haptics.remove();
    final Undo undo;
    try {
      undo = await widget.book.deleteMeal(m);
    } catch (_) {
      return;
    }
    widget.onDeleted(deletedLine(m, widget.fx), undo);
  }

  Future<void> _ungone() async {
    final g = _gone!;
    Haptics.light();
    setState(() => _gone = null);
    await g.undo().catchError((Object _) {});
  }

  void _fullLabel() {
    setState(() => _label = true);
    widget.handle.to(MediaQuery.sizeOf(context).height - safeTop(context) - M2Layout.sheetTop);
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: widget.book,
        builder: (context, _) {
          final m = _last = _meal ?? _last;
          return M2Sheet(
            handle: widget.handle, top: safeTop(context) + M2Layout.sheetTop, onClosed: widget.onClosed, header: const SheetGrab(),
            slivers: [
              if (m != null)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: M2Space.gutter),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      Padding(
                        padding: const EdgeInsets.only(top: M2Layout.sheetTitleTop, bottom: M2Layout.sheetTitleBottom),
                        child: Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
                          Expanded(child: Semantics(header: true, child: Text(mealTitle(m, widget.fx), style: M2Layout.plateLabelHead.style(M2Color.dm)))),
                          const SizedBox(width: M2Layout.plateLabelGap),
                          Text(m.time, textAlign: TextAlign.right, style: M2Text.date.style(M2Color.slate)),
                        ]),
                      ),
                      if (_label)
                        Padding(padding: const EdgeInsets.only(top: M2Layout.labelTop), child: NutritionLabel(label: mealLabelRows(m)))
                      else ...[
                        for (final it in m.items) PlateRow(key: ValueKey(it.id), item: PlateItem(it.id, it.name, it.qty, const {}, null), cal: it.calEach, onInc: () => _step(m, it, 1), onDec: () => _step(m, it, -1)),
                        if (_gone != null) GoneRow(name: _gone!.item.name, onUndo: _ungone),
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: M2Layout.factsMargin),
                          child: Facts(cal: m.total.cal, p: m.total.p, c: m.total.c, f: m.total.f),
                        ),
                        Padding(
                          padding: const EdgeInsets.only(top: M2Layout.twobTop),
                          child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                            TextAction('Full label', onTap: _fullLabel),
                            TextAction('Delete meal', onTap: () => _delete(m)),
                          ]),
                        ),
                      ],
                    ]),
                  ),
                ),
            ],
          );
        },
      );
}
