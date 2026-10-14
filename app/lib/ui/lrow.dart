import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'chevron.dart';
import 'press.dart';

/// `.lrow`: a list row, 56 dp at least, hairline under it except the last, title (600) over a 13 dp slate line, and a chevron or a
/// trailing widget. Row press is the `pressRow` tint laid over the row.
class LRow extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final bool chevron, last;
  final VoidCallback? onTap;
  const LRow({super.key, required this.title, this.subtitle, this.trailing, this.chevron = true, this.last = false, this.onTap});
  @override
  Widget build(BuildContext context) => Press(
        overlay: M2Color.pressRow, onTap: onTap, label: [title, ?subtitle].join(', '),
        child: Container(
          constraints: const BoxConstraints(minHeight: M2Layout.areaRowMin),
          padding: const EdgeInsets.symmetric(vertical: M2Space.part),
          decoration: BoxDecoration(border: last ? null : const Border(bottom: BorderSide(color: M2Color.hair))),
          child: ExcludeSemantics(
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(title, style: M2Text.rowName.style(M2Color.ink)),
                  if (subtitle != null) Padding(padding: const EdgeInsets.only(top: M2Layout.areaMetaGap), child: Text(subtitle!, style: M2Text.meta.style(M2Color.slate))),
                ]),
              ),
              const SizedBox(width: M2Space.panel),
              ?trailing,
              if (chevron && trailing == null) const Chevron(),
            ]),
          ),
        ),
      );
}
