// Every hall letter, in every patch it is drawn on, has its glyph ink centred in the patch within 0.25 dp (flutter-motion-fixes Task 2;
// owner 2026-10-17). Rendered at 8x and measured from the pixels, never from the line box.
import 'dart:typed_data';
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/theme/tokens.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';

const _ratio = 8.0;
final _key = GlobalKey();

/// The ink's bounds in dp, in the capture's own dp, inside [patch] deflated by [skip] (the stitch).
/// A pixel is ink when it is nearer [ink] than [bg]; with no [bg], when it is not transparent.
Future<Rect> _ink(WidgetTester t, Widget w, Finder Function() patch, {required Color ink, Color? bg, double skip = 0}) async {
  await t.pumpWidget(Directionality(textDirection: TextDirection.ltr, child: Align(alignment: Alignment.topLeft, child: RepaintBoundary(key: _key, child: w))));
  final origin = t.getTopLeft(find.byKey(_key)), box = t.getRect(patch()).shift(-origin), region = box.deflate(skip);
  late ByteData d;
  late int width;
  await t.runAsync(() async {
    final img = await (_key.currentContext!.findRenderObject()! as RenderRepaintBoundary).toImage(pixelRatio: _ratio);
    width = img.width;
    d = (await img.toByteData())!;
  });
  double dist(int o, Color c) {
    double q(int a, double b) => (a - b) * (a - b);
    return q(d.getUint8(o), c.r * 255) + q(d.getUint8(o + 1), c.g * 255) + q(d.getUint8(o + 2), c.b * 255);
  }
  var l = 1e9, tp = 1e9, r = -1e9, b = -1e9;
  for (var y = (region.top * _ratio).ceil(); y < (region.bottom * _ratio).floor(); y++) {
    for (var x = (region.left * _ratio).ceil(); x < (region.right * _ratio).floor(); x++) {
      final o = (y * width + x) * 4;
      final on = bg == null ? d.getUint8(o + 3) > 127 : dist(o, ink) < dist(o, bg);
      if (!on) continue;
      l = l < x ? l : x.toDouble(); tp = tp < y ? tp : y.toDouble(); r = r > x + 1 ? r : x + 1.0; b = b > y + 1 ? b : y + 1.0;
    }
  }
  expect(r, greaterThan(l), reason: 'no ink found');
  return Rect.fromLTRB(l / _ratio, tp / _ratio, r / _ratio, b / _ratio);
}

void main() {
  setUpAll(loadFonts);
  const letters = ['W', 'F', 'H', 'B'];
  for (final c in letters) {
    Future<void> centred(WidgetTester t, Widget w, Finder Function() patch, {required Color ink, Color? bg, double skip = 0, bool horizontal = true}) async {
      await t.pumpWidget(const SizedBox());
      final r = await _ink(t, w, patch, ink: ink, bg: bg, skip: skip);
      final box = t.getRect(patch()).shift(-t.getTopLeft(find.byKey(_key))), o = r.center - box.center;
      if (horizontal) expect(o.dx.abs(), lessThan(0.25), reason: '$c ink centre ${o.dx} dp off horizontally');
      expect(o.dy.abs(), lessThan(0.25), reason: '$c ink centre ${o.dy} dp off vertically');
    }

    testWidgets('$c on the Search tile', (t) => centred(t, HallTags(halls: [c], label: ''), () => find.descendant(of: find.byType(HallTags), matching: find.byType(Container)).first, ink: M2Color.gold, bg: M2Color.dm, skip: 2));
    testWidgets('$c on the dish-sheet where-chip', (t) => centred(t, HallChip(letter: c, name: 'Worcester'), () => find.byType(Felt), ink: M2Color.dm, bg: M2Color.gold, skip: 5));
    // the hall card's band and the hall header draw one widget (at two tops); it is placed by its x, so only its height is a centring claim
    testWidgets('$c as the band and header letter', (t) => centred(t, SizedBox(width: 300, height: 300, child: Stack(children: [HallLetter(letter: c, x: 0, top: 50)])), () => find.byType(CustomPaint).last, ink: M2Color.gold, horizontal: false));
  }
}
