import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
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
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.sheetTitleTop, M2Space.gutter, M2Layout.sheetTitleBottom),
                  child: Semantics(header: true, child: Text(title, style: M2Text.schedHead.style(M2Color.dm))),
                ),
                for (var i = 0; i < stations.length; i++)
                  SheetOption(label: stations[i].$1, trailing: '${stations[i].$2}', current: i == current, onTap: () => onPick(i)),
            ]),
          ),
        ],
      );
}
