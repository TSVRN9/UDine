import 'package:flutter/widgets.dart';

import '../../theme/tokens.dart';
import '../../ui/ui.dart';
import '../hall/dish_row.dart' show andList;

/// What offline Search searches (M2 `.netnote`, in `#snet`): the halls always, plus each café whose menu for today is saved.
String offlineLine(List<String> cafes) =>
    "You're offline. Searching the menus saved on this phone: the halls, today and tomorrow${cafes.isEmpty ? '' : ', and ${andList(cafes)}, today'}.";

/// `.netnote`: one slate line over the results and Events, ruled off by a hairline.
class NetNote extends StatelessWidget {
  const NetNote({super.key, required this.text});
  final String text;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: M2Space.gutter, vertical: M2Layout.netNoteV),
        decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: M2Color.hair))),
        child: Semantics(liveRegion: true, child: Text(text, style: M2Layout.netNote.style(M2Color.slate))),
      );
}

/// `.netfail`: Halls' own pair, "Couldn't connect" and the outlined Try again, on chalk.
class NetFail extends StatelessWidget {
  const NetFail({super.key, required this.onRetry});
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: M2Space.gutter, vertical: M2Layout.netFailV),
        decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: M2Color.hair))),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Flexible(child: Semantics(liveRegion: true, child: Text("Couldn't connect", style: M2Layout.netFail.style(M2Color.ink)))),
          const SizedBox(width: M2Layout.netFailGap),
          Button(kind: ButtonKind.line, size: ButtonSize.tap, label: 'Try again', onTap: onRetry),
        ]),
      );
}
