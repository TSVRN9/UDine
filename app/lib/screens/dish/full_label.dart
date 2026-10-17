import 'package:flutter/widgets.dart';
import '../../core/m2/board.dart';
import '../../core/m2/plate.dart';
import '../../core/m2/plate_label.dart';
import '../../shell/shell_scope.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';

/// Opens the plate's Full label (M2 `openPlateLabel`) above everything: a plain bottom sheet, straight to its top detent.
SheetHandle openPlateLabel(BuildContext context, {required Plate plate, required Board fx, VoidCallback? onClosed}) =>
    ShellScope.of(context).pushSheet((handle, done) => PlateLabelSheet(
          handle: handle, plate: plate, fx: fx,
          onClosed: () {
            onClosed?.call();
            done();
          },
        ));

/// The plate's label: the same panel as a dish's, summed over the plate, quantities included. It has no carbon grade (grades are per
/// kg of food and do not sum), so no ratings panel follows it.
class PlateLabelSheet extends StatelessWidget {
  final SheetHandle handle;
  final Plate plate;
  final Board fx;
  final VoidCallback onClosed;
  const PlateLabelSheet({super.key, required this.handle, required this.plate, required this.fx, required this.onClosed});

  @override
  Widget build(BuildContext context) {
    final items = plate.items.map((it) => '${it.qty != 1 ? '${fq(it.qty)} × ' : ''}${it.name}').join(', ');
    return M2Sheet(
      handle: handle, top: safeTop(context) + M2Layout.sheetTop, onClosed: onClosed, mid: (m) => m.height, header: const SheetGrab(),
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: M2Space.gutter),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Padding(
                padding: const EdgeInsets.only(top: M2Layout.sheetTitleTop, bottom: M2Layout.sheetTitleBottom),
                child: Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
                  Semantics(header: true, child: Text('Your plate', style: M2Layout.plateLabelHead.style(M2Color.dm))),
                  const SizedBox(width: M2Layout.plateLabelGap),
                  Expanded(child: Text(plateLabel(fx, plate), textAlign: TextAlign.right, style: M2Text.date.style(M2Color.slate))),
                ]),
              ),
              Text(items, style: M2Layout.plateKv.style(M2Color.slate)),
              Padding(padding: const EdgeInsets.only(top: M2Layout.labelTop), child: NutritionLabel(label: plateLabelRows(plate))),
            ]),
          ),
        ),
      ],
    );
  }
}
