import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'press.dart';
import 'stepper.dart';

/// `.custom`: the ringed "add something" row, a plus then its label, left-aligned (Add something else; Search's no-match uses it too).
class CustomButton extends StatelessWidget {
  final String label;
  final VoidCallback? onTap;
  const CustomButton({super.key, required this.label, this.onTap});
  @override
  Widget build(BuildContext context) => Press(
        scale: true, label: label, onTap: onTap,
        child: Container(
          width: double.infinity, constraints: const BoxConstraints(minHeight: M2Layout.customH), padding: const EdgeInsets.symmetric(horizontal: M2Layout.customPadX),
          foregroundDecoration: const BoxDecoration(borderRadius: BorderRadius.all(Radius.circular(M2Radius.button)), border: Border.fromBorderSide(BorderSide(color: M2Layout.customRing, width: M2Layout.rule))),
          child: Row(children: [
            const PlusMinus(plus: true),
            const SizedBox(width: M2Layout.customGap),
            Expanded(child: Text(label, style: M2Text.button.style(M2Color.vm))),
          ]),
        ),
      );
}
