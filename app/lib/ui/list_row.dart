import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'press.dart';

/// `.row`: a menu row. 64 dp at least; 20 dp in on the left, 8 on the right, 6 above and below; the name over a meta line, a
/// control lane on the right; a hairline from 20 dp in to the edge, drawn inside the row so it adds no height. `here` is the
/// serving a where-served tap landed on. Row press is the `pressRow` tint over the row; a control inside claims its own press.
class ListRow extends StatelessWidget {
  final InlineSpan name;
  final Widget? meta;
  final Widget? control;
  /// Set on the meta line's right edge, outside the line's own width and its excluded semantics (Search's hall tiles, which hang under the control)
  final Widget? metaEnd;
  final VoidCallback? onTap;
  final bool here;
  final String label;
  const ListRow({super.key, required this.name, this.meta, this.control, this.metaEnd, this.onTap, this.here = false, required this.label});
  @override
  Widget build(BuildContext context) => Press(
        overlay: M2Color.pressRow, onTap: onTap, label: label,
        child: Stack(children: [
          Container(
            constraints: const BoxConstraints(minHeight: M2Size.row),
            color: here ? M2Color.here : null,
            padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.rowPadTop, M2Layout.rowPadRight, M2Layout.rowPadTop),
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  ExcludeSemantics(child: Text.rich(name, style: M2Text.rowName.style(M2Color.ink))),
                  if (meta != null)
                    Padding(
                      padding: const EdgeInsets.only(top: M2Layout.rowMetaTop),
                      child: metaEnd == null ? ExcludeSemantics(child: meta) : Row(children: [Expanded(child: ExcludeSemantics(child: meta)), metaEnd!]),
                    ),
                ]),
              ),
              if (control != null) ...[const SizedBox(width: M2Layout.rowGap), control!],
            ]),
          ),
          const Positioned(left: M2Space.gutter, right: 0, bottom: 0, height: M2Layout.hairline, child: ColoredBox(color: M2Color.hair)),
        ]),
      );
}
