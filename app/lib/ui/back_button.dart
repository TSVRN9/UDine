import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'chevron.dart';
import 'press.dart';

/// `.icon` with the back chevron: a 48 dp target (above the 44 dp floor), the Chevron kit component in white, its own drop shadow so
/// it reads on any photo (`#mctl`) or none (`.pbar`).
class BackButton extends StatelessWidget {
  final VoidCallback? onTap;
  final bool shadow;
  const BackButton({super.key, this.onTap, this.shadow = true});
  @override
  Widget build(BuildContext context) => Press(
        label: 'Back', scale: true, onTap: onTap,
        child: SizedBox(width: M2Layout.backBtn, height: M2Layout.backBtn, child: Center(child: Chevron(back: true, color: M2Color.white, size: M2Layout.backSize, shadow: shadow))),
      );
}
