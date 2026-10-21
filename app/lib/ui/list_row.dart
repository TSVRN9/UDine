import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'press.dart';
import 'settle_fade.dart';

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

  /// what the name and meta stand for: when it changes they come back from 0.4 in place (a family's row coming to stand for another variant)
  final Object? stands;

  /// The row's least height: 64, or the name-only 48 with tracking off (between them while the layer lifts)
  final double minHeight;

  /// How much of the meta line is open, 1 whole to 0 closed: a line that held only the figures closes when they are gone
  final double metaOpen;
  const ListRow({super.key, required this.name, this.meta, this.control, this.metaEnd, this.onTap, this.here = false, required this.label, this.stands, this.minHeight = M2Size.row, this.metaOpen = 1});
  @override
  Widget build(BuildContext context) => Press(
        overlay: M2Color.pressRow, onTap: onTap, label: label,
        child: Stack(children: [
          Container(
            constraints: BoxConstraints(minHeight: minHeight),
            color: here ? M2Color.here : null,
            padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.rowPadTop, M2Layout.rowPadRight, M2Layout.rowPadTop),
            child: Row(children: [
              Expanded(
                child: _Fade(stands: stands, child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  ExcludeSemantics(child: Text.rich(name, style: M2Text.rowName.style(M2Color.ink))),
                  if (meta != null && metaOpen > 0) _closing(
                    Padding(
                      padding: const EdgeInsets.only(top: M2Layout.rowMetaTop),
                      child: metaEnd == null ? ExcludeSemantics(child: meta) : Row(children: [Expanded(child: ExcludeSemantics(child: meta)), metaEnd!]),
                    ),
                  ),
                ])),
              ),
              if (control != null) ...[const SizedBox(width: M2Layout.rowGap), control!],
            ]),
          ),
          const Positioned(left: M2Space.gutter, right: 0, bottom: 0, height: M2Layout.hairline, child: ColoredBox(color: M2Color.hair)),
        ]),
      );
}

extension on ListRow {
  /// (the tiles hang outside the line: only a line that is closing is clipped)
  Widget _closing(Widget line) => metaOpen >= 1 ? line : ClipRect(child: Align(alignment: Alignment.topLeft, heightFactor: metaOpen, child: line));
}

/// (only a row that can come to stand for another variant carries the fade: every other row is drawn as it always was)
class _Fade extends StatelessWidget {
  const _Fade({required this.stands, required this.child});
  final Object? stands;
  final Widget child;
  @override
  Widget build(BuildContext context) => stands == null ? child : SettleFade(value: stands, child: child);
}
