import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'hall_letter.dart';

/// `.tags`: where a dish is served now or next, on a Search row: each hall's letter on a deep-maroon tile (`.ht.on`), then a café's name
/// or how many cafés. A row says where, never where not. `label` is what a screen reader hears.
class HallTags extends StatelessWidget {
  final List<String> halls;
  /// the one café's name, or "N cafés"; null with no café
  final String? cafe;
  final String label;
  const HallTags({super.key, required this.halls, this.cafe, required this.label});

  @override
  Widget build(BuildContext context) => Semantics(
        image: true, label: label,
        child: ExcludeSemantics(
          child: Row(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.center, children: [
            for (var i = 0; i < halls.length; i++) ...[
              if (i > 0) const SizedBox(width: M2Layout.tagGap),
              Container(
                width: M2Layout.tagSize, height: M2Layout.tagSize, alignment: Alignment.center,
                decoration: const BoxDecoration(color: M2Color.dm, borderRadius: BorderRadius.all(Radius.circular(M2Radius.patch))),
                child: PatchLetter(halls[i], size: M2Layout.tagSize, font: M2Layout.tagLetter.size, color: M2Color.gold),
              ),
            ],
            if (cafe != null)
              Flexible(
                child: Padding(
                  padding: EdgeInsets.only(left: halls.isEmpty ? 0 : M2Layout.tagCafeLeft),
                  child: Text(cafe!, textAlign: TextAlign.right, style: M2Layout.tagCafe.style(M2Color.slate)),
                ),
              ),
          ]),
        ),
      );
}
