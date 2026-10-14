import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'press.dart';

/// How an option's right-hand text is set: a `count` (Oswald 16, slate: a station's dishes, `#stidx .c`) or a `note` (15, slate, maroon
/// on the current row: a day's span, `#days .day .r`).
enum SheetTrailing { count, note }

/// `#stidx button`, `#days .day`: a 48 dp option row in a sheet, a 4 dp maroon edge when it is the current one, whose name is then
/// bold 700 maroon. Row press is the `pressRow` tint.
class SheetOption extends StatelessWidget {
  final String label;
  final String? trailing;
  final SheetTrailing trailingStyle;
  final bool current;
  final VoidCallback onTap;
  const SheetOption({super.key, required this.label, this.trailing, this.trailingStyle = SheetTrailing.count, required this.current, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final t = trailing ?? '';
    final right = trailingStyle == SheetTrailing.count
        ? M2Text.metaNum.withSize(M2Layout.optionCount).style(M2Color.slate)
        : M2Text.sched.style(current ? M2Color.vm : M2Color.slate).copyWith(fontWeight: current ? FontWeight.w500 : FontWeight.w400);
    return Semantics(
      selected: current, button: true, label: t.isEmpty ? label : '$label, $t',
      child: Press(
        semantics: false, overlay: M2Color.pressRow, onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: M2Layout.optionH),
          padding: const EdgeInsets.only(left: M2Space.action, right: M2Space.gutter),
          decoration: BoxDecoration(border: Border(left: BorderSide(width: M2Layout.optionEdge, color: current ? M2Color.vm : M2Color.chalk.withValues(alpha: 0)))),
          child: ExcludeSemantics(
            child: Row(children: [
              Expanded(child: Text(label, style: M2Text.dayRow.style(current ? M2Color.vm : M2Color.ink).copyWith(fontWeight: current ? bold700 : FontWeight.w500))),
              if (t.isNotEmpty) ...[const SizedBox(width: M2Space.panel), Text(t, style: right)],
            ]),
          ),
        ),
      ),
    );
  }
}
