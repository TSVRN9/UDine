import 'package:flutter/widgets.dart';

/// A bare [EditableText]'s tap target, grown to the whole field box around it. Its EditableText takes `rendererIgnoresPointer: true`.
/// Every tap places the caret and asks for the keyboard (as TextField does): after the back key hides the keyboard the field keeps
/// its focus, and a tap that leaves the caret where it was (an empty field) would not bring it back.
class FieldTap extends StatelessWidget {
  final FocusNode focus;
  final Widget child;
  const FieldTap({super.key, required this.focus, required this.child});

  @override
  Widget build(BuildContext context) => GestureDetector(
        behavior: HitTestBehavior.opaque,
        excludeFromSemantics: true, // the EditableText's own semantics already focus it; a semantic tap carries no position
        onTapUp: (d) {
          final s = focus.context?.findAncestorStateOfType<EditableTextState>();
          s?.renderEditable.selectPositionAt(from: d.globalPosition, cause: SelectionChangedCause.tap);
          s?.requestKeyboard();
        },
        child: child,
      );
}
