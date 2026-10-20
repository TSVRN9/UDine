import 'package:flutter/widgets.dart';
import '../../core/m2/plate.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';

/// `.prow`: one item on the plate sheet. Name over "218 cal each", the row's control lane on the right (+ is never shown here:
/// an item on a plate always has a stepper), a hairline under it. Taking the last half off closes the row up on `exit` before the
/// item leaves the plate (M2: nothing to travel to, the plate is where it was); `onDec` runs once it has closed.
class PlateRow extends StatefulWidget {
  final PlateItem item;
  final num? cal;
  final VoidCallback? onOpen;
  final VoidCallback onInc, onDec;

  /// a bowl's "with Hard Boiled Egg, 2 × Steamed Bok Choy" (`.pw`), under its name
  final String? withText;
  const PlateRow({
    super.key,
    required this.item,
    required this.cal,
    this.withText,
    this.onOpen,
    required this.onInc,
    required this.onDec,
  });
  @override
  State<PlateRow> createState() => _PlateRowState();
}

class _PlateRowState extends State<PlateRow>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    value: 1,
  );
  bool _closing = false;

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  void _dec() {
    if (widget.item.qty != 0.5 || _closing) return widget.onDec();
    _closing = true;
    final a = resolveAnim(context, M2Motion.exit);
    _c.duration = a.duration;
    _c.animateBack(0, curve: a.curve).whenComplete(widget.onDec);
  }

  @override
  Widget build(BuildContext context) {
    final it = widget.item;
    return AnimatedBuilder(
      animation: _c,
      builder: (_, child) => ClipRect(
        child: Align(
          alignment: Alignment.topCenter,
          heightFactor: _c.value,
          child: Opacity(opacity: _c.value, child: child),
        ),
      ),
      child: Press(
        overlay: M2Color.pressRow,
        onTap: widget.onOpen,
        label: it.name,
        child: Container(
          constraints: const BoxConstraints(minHeight: M2Layout.prowMin),
          decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: M2Color.hair)),
          ),
          child: Row(
            children: [
              Expanded(
                child: ExcludeSemantics(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // (`.prow .n` has no line-height of its own: the font's normal line, 19, where a menu row's is 20)
                  Text(it.name, style: M2Text.rowName.normal().style(M2Color.ink)),
                      if (widget.withText != null && widget.withText!.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: M2Layout.pwTop),
                          child: Text(widget.withText!, style: M2Text.meta.withLine(M2Layout.pwLine).style(M2Color.slate)),
                        ),
                      Padding(
                        padding: const EdgeInsets.only(
                          top: M2Layout.prowMetaTop,
                        ),
                        child: Text.rich(
                          TextSpan(
                            style: M2Text.meta.style(M2Color.slate),
                            children: [
                              TextSpan(
                                text: fc(widget.cal),
                                style: M2Text.metaNum.style(M2Color.ink),
                              ),
                              TextSpan(text: it.food?.per100g ?? false ? ' cal per 100 g' : ' cal each'),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: M2Layout.prowGap),
              RowControl(
                qty: it.qty,
                ghost: false,
                onAdd: () {},
                onInc: widget.onInc,
                onDec: _dec,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
