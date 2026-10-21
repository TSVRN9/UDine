import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'motion.dart';
import 'press.dart';

/// `.vpick` (round 12): a single-select group of chips under a name, wrapping, one chosen, no heading. The chosen chip is the tonal fill and the
/// maroon edge alone: no check and no bolder text, so a chip never changes width and a choice never moves one to the other line. The fill
/// settles in. [chosen] is null before a choice (a pho before its broth).
class VariantPicker extends StatelessWidget {
  const VariantPicker({super.key, required this.labels, required this.chosen, required this.onPick, required this.name});
  final List<String> labels;
  final int? chosen;
  final ValueChanged<int> onPick;

  /// what the group is called to a screen reader (never drawn)
  final String name;

  static const _text = M2Type(15, null, 'LibreFranklin', FontWeight.w500);

  @override
  Widget build(BuildContext context) {
    final a = resolveAnim(context, M2Motion.settle);
    return Semantics(
      container: true, label: name,
      child: Wrap(spacing: M2Layout.vpickGap, runSpacing: M2Layout.vpickGap, children: [
        for (var i = 0; i < labels.length; i++)
          Semantics(
            inMutuallyExclusiveGroup: true, checked: i == chosen, label: labels[i],
            child: Press(
              scale: true, onTap: () => onPick(i), semantics: false,
              child: ExcludeSemantics(
                child: ConstrainedBox(
                  // (`max-width: 100%`: a name longer than the line wraps inside its chip)
                  constraints: BoxConstraints(minHeight: M2Size.tap, maxWidth: MediaQuery.sizeOf(context).width - 2 * M2Space.gutter),
                  child: AnimatedContainer(
                    duration: a.duration, curve: a.curve,
                    padding: const EdgeInsets.symmetric(horizontal: M2Layout.chipPadX, vertical: M2Layout.vpickPadY),
                    decoration: BoxDecoration(color: i == chosen ? M2Color.tint : null, borderRadius: const BorderRadius.all(Radius.circular(M2Radius.button))),
                    foregroundDecoration: BoxDecoration(
                      borderRadius: const BorderRadius.all(Radius.circular(M2Radius.button)),
                      border: Border.all(color: i == chosen ? M2Color.vm : M2Layout.chipRing, width: M2Layout.rule),
                    ),
                    child: Text(labels[i], style: _text.style(i == chosen ? M2Color.dm : M2Color.ink).copyWith(height: M2Layout.vpickLine), textAlign: TextAlign.left),
                  ),
                ),
              ),
            ),
          ),
      ]),
    );
  }
}
