import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'press.dart';

/// M2's buttons, one widget: the filled maroon `.btn`, its ring form `.btn.line`, the gold `.gbtn` on the plate bar, the white
/// ring `.obtn` on maroon (and `.obtn.dk` on chalk), and the maroon-ringed `.dirb` (Directions).
enum ButtonKind { primary, line, gold, outline, outlineDark, directions }

enum ButtonSize { large, medium, tap } // 52 `.btn`, 48 `.gbtn`, 44 `.obtn` / `.dirb`

class Button extends StatelessWidget {
  final ButtonKind kind;
  final ButtonSize? size;
  final String label;
  final VoidCallback? onTap;
  /// full width (`.btn`) rather than the label's width
  final bool expand;
  const Button({super.key, required this.kind, required this.label, this.onTap, this.size, this.expand = false});

  ButtonSize get _size => size ?? switch (kind) {
        ButtonKind.primary || ButtonKind.line => ButtonSize.large,
        ButtonKind.gold => ButtonSize.medium,
        _ => ButtonSize.tap,
      };

  @override
  Widget build(BuildContext context) {
    final h = switch (_size) { ButtonSize.large => M2Layout.btnL, ButtonSize.medium => M2Layout.btnM, ButtonSize.tap => M2Size.tap };
    final inset = kind == ButtonKind.directions;
    final big = _size == ButtonSize.large && (kind == ButtonKind.gold || kind == ButtonKind.outline); // `.evbtn`: 52 tall, 17 dp
    final (bg, fg, ring, style, pad) = switch (kind) {
      ButtonKind.primary => (M2Color.vm, M2Color.white, null, M2Text.action.bold(), 0.0),
      ButtonKind.line => (null, M2Color.vm, M2Color.vm, M2Text.action.bold(), 0.0),
      ButtonKind.gold => (M2Color.gold, M2Color.dm, null, big ? M2Text.action.bold() : M2Text.button.bold(), M2Layout.gbtnPad),
      ButtonKind.outline => (null, M2Color.white, M2Color.outline, big ? M2Text.action : M2Text.link, M2Layout.obtnPad),
      ButtonKind.outlineDark => (null, M2Color.vm, M2Color.vm, M2Text.link, M2Layout.obtnPad),
      ButtonKind.directions => (null, M2Color.vm, M2Color.vm, M2Text.link, M2Layout.dirbPad),
    };
    final body = Container(
      height: h,
      width: expand ? double.infinity : null,
      constraints: kind == ButtonKind.gold ? const BoxConstraints(minWidth: M2Layout.gbtnMinW) : null,
      padding: EdgeInsets.symmetric(horizontal: pad),
      alignment: Alignment.center,
      decoration: BoxDecoration(color: bg, borderRadius: const BorderRadius.all(Radius.circular(M2Radius.button)), border: ring == null || inset ? null : Border.all(color: ring, width: M2Layout.rule)),
      // `.dirb`'s ring is an inset box-shadow: drawn over the box, taking no room from the padding (the other rings are borders)
      foregroundDecoration: ring == null || !inset ? null : BoxDecoration(borderRadius: const BorderRadius.all(Radius.circular(M2Radius.button)), border: Border.all(color: ring, width: M2Layout.rule)),
      child: Text(label, style: style.style(fg), maxLines: 1),
    );
    return Press(scale: true, label: label, onTap: onTap, child: expand ? body : IntrinsicWidth(child: body));
  }
}

/// `.tbtn`: a 44 dp text button in maroon (Show all, Undo, Done).
class TextAction extends StatelessWidget {
  final String label;
  final VoidCallback? onTap;
  const TextAction(this.label, {super.key, this.onTap});
  @override
  Widget build(BuildContext context) => Press(
        scale: true, label: label, onTap: onTap,
        child: Container(height: M2Size.tap, padding: const EdgeInsets.symmetric(horizontal: M2Layout.tbtnPad), alignment: Alignment.center, child: Text(label, style: M2Text.link.style(M2Color.vm))),
      );
}
