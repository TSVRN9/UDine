import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'press.dart';
import 'svg_path.dart';

// M2 `IC.star`, a 24 viewBox. Outlined in maroon; a favourite is filled and stroked in gold.
final _star = svgPath('M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z');

class _StarPainter extends CustomPainter {
  final Color stroke;
  final Color? fill;
  final double width;
  const _StarPainter(this.stroke, this.fill, this.width);
  @override
  void paint(Canvas canvas, Size s) {
    canvas.scale(s.width / 24);
    if (fill != null) canvas.drawPath(_star, Paint()..color = fill!);
    if (width > 0) canvas.drawPath(_star, Paint()..color = stroke..style = PaintingStyle.stroke..strokeWidth = width..strokeJoin = StrokeJoin.round..strokeCap = StrokeCap.round);
  }

  @override
  bool shouldRepaint(_StarPainter o) => o.stroke != stroke || o.fill != fill || o.width != width;
}

/// The favourite button on the dish sheet (`.favb`): a 48 dp target around a 24 dp star, gold when on. The sheet places it so its glyph
/// is centred on the name's first line, where M2's margins pull it (6 up of the name's row), over the sheet rather than in its header:
/// the whole 48 dp box takes the tap, which a header 36 dp tall would cut.
class FavoriteStar extends StatelessWidget {
  final bool on;
  final VoidCallback onTap;
  const FavoriteStar({super.key, required this.on, required this.onTap});
  @override
  Widget build(BuildContext context) => Semantics(
        toggled: on,
        child: Press(
          scale: true, label: 'Favorite', onTap: onTap,
          child: SizedBox(
            width: M2Layout.favBox, height: M2Layout.favBox,
            child: Center(child: CustomPaint(size: const Size.square(M2Layout.favGlyph), painter: _StarPainter(on ? M2Color.gold : M2Color.vm, on ? M2Color.gold : null, M2Layout.favStroke))),
          ),
        ),
      );
}

/// A favourite's mark after its name in a list (`.star`): a small filled maroon star.
class StarMark extends StatelessWidget {
  const StarMark({super.key});
  @override
  Widget build(BuildContext context) => Semantics(
        image: true, label: 'Favorite',
        child: Padding(
          padding: const EdgeInsets.only(left: M2Layout.starLeft),
          child: CustomPaint(size: const Size.square(M2Layout.starRow), painter: const _StarPainter(M2Color.vm, M2Color.vm, 0)),
        ),
      );
}
