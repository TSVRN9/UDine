import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'press.dart';
import 'svg_path.dart';

final _lens = svgPath('M20 20l-4.8-4.8'), _cross = svgPath('M7 7l10 10M17 7L7 17');

class _FieldIcon extends CustomPainter {
  final bool clear;
  const _FieldIcon(this.clear);
  @override
  void paint(Canvas canvas, Size s) {
    final k = s.width / 24;
    canvas.scale(k);
    final p = Paint()..color = clear ? M2Color.slate : M2Color.vm..style = PaintingStyle.stroke..strokeWidth = clear ? M2Layout.clearStroke : M2Layout.fieldIconStroke..strokeCap = StrokeCap.round;
    if (clear) {
      canvas.drawPath(_cross, p);
    } else {
      canvas.drawCircle(const Offset(10.5, 10.5), 6.5, p);
      canvas.drawPath(_lens, p);
    }
  }

  @override
  bool shouldRepaint(_FieldIcon o) => o.clear != clear;
}

/// `.field`: Search's white 52 dp field on the maroon header: a magnifier, the text, and a × once something is typed. The page owns
/// the controller and the focus node: nothing in the results takes focus, so the keyboard stays up between picks.
class SearchField extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode focus;
  final String hint;
  final ValueChanged<String> onChanged;
  final VoidCallback onClear;
  /// the keyboard's search key; the field keeps its focus
  final VoidCallback? onSubmit;
  const SearchField({super.key, required this.controller, required this.focus, required this.hint, required this.onChanged, required this.onClear, this.onSubmit});

  @override
  Widget build(BuildContext context) => Container(
        height: M2Layout.fieldH,
        padding: const EdgeInsets.only(left: M2Layout.fieldPadL, right: M2Layout.fieldPadR),
        decoration: const BoxDecoration(color: M2Color.white, borderRadius: BorderRadius.all(Radius.circular(M2Radius.button))),
        child: Row(children: [
          ExcludeSemantics(child: CustomPaint(size: const Size.square(M2Layout.fieldIcon), painter: const _FieldIcon(false))),
          const SizedBox(width: M2Layout.fieldGap),
          Expanded(
            child: ListenableBuilder(
              listenable: controller,
              builder: (_, _) => Stack(alignment: Alignment.centerLeft, children: [
                if (controller.text.isEmpty) IgnorePointer(child: Text(hint, maxLines: 1, overflow: TextOverflow.ellipsis, style: M2Layout.fieldHint.style(M2Color.slate))),
                Semantics(
                  textField: true, label: 'Search dishes',
                  child: EditableText(
                    controller: controller, focusNode: focus, onChanged: onChanged, onEditingComplete: onSubmit ?? () {}, maxLines: 1, autocorrect: false, enableSuggestions: false,
                    style: M2Layout.fieldText.style(M2Color.ink), cursorColor: M2Color.vm, backgroundCursorColor: M2Color.hair, selectionColor: M2Color.tint,
                    keyboardType: TextInputType.text, textInputAction: TextInputAction.search,
                  ),
                ),
              ]),
            ),
          ),
          ListenableBuilder(
            listenable: controller,
            builder: (_, _) => controller.text.isEmpty
                ? const SizedBox(width: M2Layout.clearBox)
                // the clear button never takes focus from the field: the pointer is claimed by the press, not by a focus traversal
                : Press(
                    label: 'Clear', onTap: onClear,
                    child: SizedBox(width: M2Layout.clearBox, height: M2Layout.clearBox, child: Center(child: CustomPaint(size: const Size.square(M2Layout.clearGlyph), painter: const _FieldIcon(true)))),
                  ),
          ),
        ]),
      );
}
