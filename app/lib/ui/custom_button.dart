import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'press.dart';
import 'stepper.dart' show PlusMinus;

/// `.custom`: the custom-food button: a maroon ring over chalk (`solid` when it is the only thing offered: filled maroon with a +).
class CustomFoodButton extends StatelessWidget {
  final String label;
  final bool solid;
  final VoidCallback? onTap;
  const CustomFoodButton({super.key, required this.label, this.solid = false, this.onTap});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: M2Space.gutter, vertical: M2Layout.customMargin),
        child: Press(
          scale: true, label: label, onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(minHeight: M2Layout.customMin),
            padding: const EdgeInsets.symmetric(horizontal: M2Layout.customPadX),
            decoration: BoxDecoration(
              color: solid ? M2Color.vm : null, borderRadius: const BorderRadius.all(Radius.circular(M2Radius.button)),
              border: solid ? null : Border.all(color: M2Layout.customRing, width: M2Layout.rule),
            ),
            child: ExcludeSemantics(
              child: Row(children: [
                if (solid) ...[const SizedBox(width: M2Layout.customPlus, height: M2Layout.customPlus, child: PlusMinus(plus: true, color: M2Color.white)), const SizedBox(width: M2Layout.customGap)],
                Expanded(child: Text(label, style: M2Text.button.style(solid ? M2Color.white : M2Color.vm))),
              ]),
            ),
          ),
        ),
      );
}

/// `.custom`: the ringed "add something" row, a plus then its label, left-aligned (Add something else; Search's no-match uses it too).
class CustomButton extends StatelessWidget {
  final String label;
  final VoidCallback? onTap;
  const CustomButton({super.key, required this.label, this.onTap});
  @override
  Widget build(BuildContext context) => Press(
        scale: true, label: label, onTap: onTap,
        child: Container(
          width: double.infinity, constraints: const BoxConstraints(minHeight: M2Layout.customMin), padding: const EdgeInsets.symmetric(horizontal: M2Layout.customPadX),
          foregroundDecoration: const BoxDecoration(borderRadius: BorderRadius.all(Radius.circular(M2Radius.button)), border: Border.fromBorderSide(BorderSide(color: M2Layout.customRing, width: M2Layout.rule))),
          child: Row(children: [
            const PlusMinus(plus: true),
            const SizedBox(width: M2Layout.customGap),
            Expanded(child: Text(label, style: M2Text.button.style(M2Color.vm))),
          ]),
        ),
      );
}
