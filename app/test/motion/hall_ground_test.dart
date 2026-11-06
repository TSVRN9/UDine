// M2 round 15 §1 (owner, 2026-11-05): under a growing band card the ground is the stack's deep maroon until the list's chalk fades in
// with the list (p .2 to .8); no white bar shows below the station row on the way out or back.
import 'dart:ui' as ui;
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/motion/container_math.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/screens/hall/meal_tabs.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import '../screens/support.dart';

void main() {
  setUpAll(loadFonts);

  testWidgets('a band opening: below the station row the ground is not chalk until the list fades in, and is part way by p .5', (t) async {
    const w = 360.0, h = 780.0;
    await openApp(t, await bootRecorded(t), w: w, h: h);
    await t.pump();
    final band = find.ancestor(of: find.text('Franklin'), matching: find.byType(Band));
    await until(t, () => band.evaluate().isNotEmpty && find.descendant(of: band.first, matching: find.byType(Meter)).evaluate().isNotEmpty);
    final row = t.getRect(band.first);
    await t.tap(find.text('Franklin'));
    for (var i = 0; i < 5 && find.byType(HallMenu).evaluate().isEmpty; i++) {
      await t.pump();
    }
    var checked = 0;
    for (var i = 0; i < 120; i++) {
      final p = t.widget<HallMenu>(find.byType(HallMenu)).progress.value;
      if (p > 0.02 && p < 0.85) {
        final bottom = h - (1 - p) * (h - row.top - row.height), below = t.getRect(find.byType(StationRow)).bottom;
        // (the window's real foot is the page's, a bottom bar above this `bottom`: sample just under the row, well inside it)
        if (bottom - below > 48) {
          final img = (await t.runAsync(() => t.renderObject<RenderRepaintBoundary>(find.byType(RepaintBoundary).first).toImage()))!;
          final data = (await t.runAsync(() => img.toByteData(format: ui.ImageByteFormat.rawRgba)))!;
          final y = (below + 6).round(), o = (y * img.width + 4) * 4;
          final lum = 0.2126 * data.getUint8(o) + 0.7152 * data.getUint8(o + 1) + 0.0722 * data.getUint8(o + 2);
          // chalk is 248; at `incomingOpacity` k the ground is k of the way from dm (~18) to it
          final k = incomingOpacity(p), want = 18 + 230 * k;
          expect((lum - want).abs(), lessThan(14), reason: 'p $p: the ground under the station row is $lum, wanted $want (chalk at $k)');
          checked++;
        }
      }
      await t.pump(const Duration(milliseconds: 8));
    }
    expect(checked, greaterThan(2));
    await t.pump(const Duration(seconds: 1));
    await drain(t);
  });
}
