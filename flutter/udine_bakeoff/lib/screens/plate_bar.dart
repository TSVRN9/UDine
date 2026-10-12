import 'package:flutter/widgets.dart';
import '../logic/dish_sheet.dart';
import '../logic/fixture.dart';
import '../logic/plate.dart';
import '../state/store.dart';
import '../theme/tokens.dart';
import '../ui/ui.dart';

/// What the bar shows: the plate in progress, the choice of where to log a plate several places serve, or the receipt.
enum BarMode { plate, choose, logged }

/// The plate bar's face (M2 `#bar .in`): the plate's label and item count over the calories and protein, and Log; or the receipt,
/// a snackbar with Undo; or Log at, one gold button per place.
class PlateBarFace extends StatelessWidget {
  final Store store;
  final BarMode mode;
  final VoidCallback onLog, onUnchoose, onUndo;
  final ValueChanged<String> onLogAt;
  const PlateBarFace({super.key, required this.store, required this.mode, required this.onLog, required this.onUnchoose, required this.onUndo, required this.onLogAt});

  Text _unit(String t) => Text(t, style: M2Text.meta.style(M2Color.onDm), maxLines: 1);
  Text _num(String t) => Text(t, style: M2Text.barNum.style(M2Color.white));

  @override
  Widget build(BuildContext context) {
    final fx = store.fx;
    Widget wrap(List<Widget> kids) => ConstrainedBox(
          constraints: const BoxConstraints(minHeight: M2Layout.barMin),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.barPadTop, M2Layout.barPadRight, M2Layout.barPadTop),
            child: Row(children: kids),
          ),
        );
    if (mode == BarMode.logged && store.last != null) {
      final e = store.last!.entry;
      return wrap([
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Logged ${e.place != null ? '${placeName(fx, e.place!)} ' : ''}${mealLabel[e.meal]!.toLowerCase()}', style: M2Text.meta.style(M2Color.onDm), maxLines: 1, overflow: TextOverflow.ellipsis),
            Padding(
              padding: const EdgeInsets.only(top: M2Layout.barL2Top),
              child: Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
                _unit('Today '), _num(fc(store.loggedCal)), const SizedBox(width: M2Layout.barNumGap), _unit('cal'),
              ]),
            ),
          ]),
        ),
        const SizedBox(width: M2Layout.barGap),
        Button(kind: ButtonKind.outline, label: 'Undo', onTap: onUndo),
      ]);
    }
    final pl = store.plates.plates[store.plates.front], hs = plateHalls(pl);
    if (mode == BarMode.choose && hs != null && hs.length > 1) {
      return wrap([
        Expanded(child: Press(label: 'Back', onTap: onUnchoose, child: SizedBox(height: M2Layout.btnM, child: Align(alignment: Alignment.centerLeft, child: _unit('Log at'))))),
        for (final h in hs) ...[
          const SizedBox(width: M2Layout.barPadTop),
          Press(
            scale: true, label: 'Log at ${placeName(fx, h)}', onTap: () => onLogAt(h),
            child: Container(
              height: M2Layout.btnM, padding: const EdgeInsets.symmetric(horizontal: M2Layout.logAtPad), alignment: Alignment.center,
              decoration: const BoxDecoration(color: M2Color.gold, borderRadius: BorderRadius.all(Radius.circular(M2Radius.button))),
              child: Text(placeName(fx, h), style: M2Text.button.style(M2Color.dm)),
            ),
          ),
        ],
      ]);
    }
    final t = totals(pl), items = t.n == 1 ? '1 item' : '${fq(t.n)} items';
    return wrap([
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${plateLabel(fx, pl)}, $items', style: M2Text.meta.style(M2Color.onDm), maxLines: 1, overflow: TextOverflow.ellipsis),
          Padding(
            padding: const EdgeInsets.only(top: M2Layout.barL2Top),
            child: Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
              _num(fc(t.cal)), const SizedBox(width: M2Layout.barNumGap), _unit('cal'), const SizedBox(width: M2Layout.barUnitGap),
              _num('${f1(t.p)}g'), const SizedBox(width: M2Layout.barNumGap), _unit('protein'),
            ]),
          ),
        ]),
      ),
      const SizedBox(width: M2Layout.barGap),
      Button(kind: ButtonKind.gold, label: 'Log', onTap: onLog),
    ]);
  }
}

/// `#bar .dots`: with several plates, a row of dots, the front one gold.
class PlateBarDots extends StatelessWidget {
  final int n, front;
  const PlateBarDots({super.key, required this.n, required this.front});
  @override
  Widget build(BuildContext context) => IgnorePointer(
        child: Padding(
          padding: const EdgeInsets.only(top: M2Layout.dotsTop),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.start, children: [
            for (var i = 0; i < n; i++) ...[
              if (i > 0) const SizedBox(width: M2Layout.dotGap),
              Container(width: M2Layout.dotSize, height: M2Layout.dotSize, decoration: BoxDecoration(color: i == front ? M2Color.gold : M2Color.dotOff, borderRadius: const BorderRadius.all(Radius.circular(M2Layout.dotSize)))),
            ],
          ]),
        ),
      );
}

/// `#bar .peek`: the felt edge of the plate behind, over the bar's top edge. Drawn by the layer above the sheet, which clips its own.
class PlateBarPeek extends StatelessWidget {
  const PlateBarPeek({super.key});
  @override
  Widget build(BuildContext context) => const IgnorePointer(
        child: SizedBox(height: M2Layout.peekH, child: DecoratedBox(decoration: BoxDecoration(color: M2Color.felt, borderRadius: BorderRadius.vertical(top: Radius.circular(M2Layout.peekRadius))))),
      );
}
