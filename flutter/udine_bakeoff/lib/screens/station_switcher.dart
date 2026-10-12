import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import '../ui/sheet.dart';
import '../ui/ui.dart';

/// M2's station roster (`#stidx`): the meal's stations with their dish counts, the current one marked with a maroon edge. A pick
/// closes the sheet and the list scrolls there.
class StationSheet extends StatelessWidget {
  final SheetHandle handle;
  final double top;
  final String title;
  final List<(String, int)> stations;
  final int current;
  final ValueChanged<int> onPick;
  final VoidCallback onClosed;
  const StationSheet({super.key, required this.handle, required this.top, required this.title, required this.stations, required this.current, required this.onPick, required this.onClosed});

  @override
  Widget build(BuildContext context) => M2Sheet(
        handle: handle, top: top, onClosed: onClosed, header: const SheetGrab(),
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.only(bottom: M2Layout.sheetBottom),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.sheetTitleTop, M2Space.gutter, M2Layout.sheetTitleBottom),
                  child: Semantics(header: true, child: Text(title, style: M2Text.schedHead.style(M2Color.dm))),
                ),
                for (var i = 0; i < stations.length; i++)
                  SheetOption(label: stations[i].$1, trailing: '${stations[i].$2}', current: i == current, onTap: () => onPick(i)),
              ]),
            ),
          ),
        ],
      );
}

/// `#stidx button`, `#days .day`: a 48 dp option row in a sheet, a 4 dp maroon edge when it is the current one.
class SheetOption extends StatelessWidget {
  final String label;
  final String? trailing;
  final bool current;
  final VoidCallback onTap;
  const SheetOption({super.key, required this.label, this.trailing, required this.current, required this.onTap});
  @override
  Widget build(BuildContext context) => Semantics(
        selected: current, button: true, label: label,
        child: Press(
          semantics: false, overlay: M2Color.pressRow, onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(minHeight: M2Layout.optionH),
            padding: const EdgeInsets.only(left: M2Space.action, right: M2Space.gutter),
            decoration: BoxDecoration(border: Border(left: BorderSide(width: M2Layout.optionEdge, color: current ? M2Color.vm : M2Color.chalk.withValues(alpha: 0)))),
            child: ExcludeSemantics(
              child: Row(children: [
                Expanded(child: Text(label, style: M2Text.dayRow.style(current ? M2Color.vm : M2Color.ink).copyWith(fontWeight: current ? FontWeight.w600 : FontWeight.w500))),
                if (trailing != null) Text(trailing!, style: M2Text.metaNum.withSize(M2Layout.optionCount).style(M2Color.slate)),
              ]),
            ),
          ),
        ),
      );
}
