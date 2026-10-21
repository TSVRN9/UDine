import 'package:flutter/widgets.dart';

import '../../theme/tokens.dart';
import '../../ui/ui.dart';
import '../you/you_parts.dart';

/// First run (M2 CONCEPT R10 §1, `#obsheet`): You's own rows in a non-modal sheet, no scrim, resting with its top at `restTop` so the four
/// hall bands stay visible and live. It holds Track what I eat, Only show, Avoid and Show on dishes, the same widgets You uses: one
/// control per setting. Done, dragging it away, Android back and opening a hall all end it (`onClosed`); the choices are written as they are
/// made, so a skip writes nothing.
class FirstRunSheet extends StatelessWidget {
  const FirstRunSheet({super.key, required this.handle, required this.top, required this.restTop, required this.onClosed});
  final SheetHandle handle;
  final double top;

  /// where the sheet's top edge rests, from the frame's top, given the frame's height
  final double Function(double frame) restTop;
  final VoidCallback onClosed;

  Widget _h2(String text) => Padding(padding: const EdgeInsets.only(top: M2Layout.dietTop, bottom: M2Layout.h3Bottom), child: Semantics(header: true, child: Text(text, style: M2Text.section.style(M2Color.dm))));

  @override
  Widget build(BuildContext context) => M2Sheet(
        handle: handle, top: top, scrim: false, onClosed: onClosed, header: const SheetGrab(), shadow: const [M2Layout.obShadow],
        mid: (m) => m.height - restTop(m.height),
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: M2Space.gutter),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  Semantics(header: true, child: Text('You', style: M2Layout.obTitle.style(M2Color.dm))),
                  Transform.translate(offset: const Offset(M2Layout.obBleed, 0), child: TextAction('Done', onTap: handle.close)),
                ]),
                const TrackRow(last: true, onYou: false),
                _h2('Only show'),
                const OnlyShowRows(),
                _h2('Avoid'),
                const AvoidRows(),
                _h2('Show on dishes'),
                const ShowRows(),
              ]),
            ),
          ),
        ],
      );
}
