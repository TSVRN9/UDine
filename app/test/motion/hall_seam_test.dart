// M2 `paint()`: the hall opens as one container. Nothing inside its window is a different surface from the rest of it: the band's grade
// (`#mlg`, `inset:0`) covers the whole header, so no step in the header's ground sits at the old row's height; and a close lifts the
// station chevron with the sheet, not after it.
import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/hall/hall_header.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/screens/hall/meal_tabs.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import '../screens/support.dart';

void main() {
  setUpAll(loadFonts);

  testWidgets('a band opening: the header ground has no step at the old row\'s height at any frame', (t) async {
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
    for (var i = 0; i < 60; i++) {
      final p = t.widget<HallMenu>(find.byType(HallMenu)).progress.value;
      if (p > 0.02 && p < 0.7) {
        final img = (await t.runAsync(() => t.renderObject<RenderRepaintBoundary>(find.byType(RepaintBoundary).first).toImage()))!;
        final data = (await t.runAsync(() => img.toByteData(format: ui.ImageByteFormat.rawRgba)))!;
        // the window is [T, H - q (H - T - BH)] and the header is the top of it; the column is the gutter, where no text or letter is drawn
        final q = 1 - p, bottom = math.min(h - q * (h - row.top - row.height), t.getRect(find.byType(HallHeader)).bottom);
        double lum(int y) {
          final o = (y * img.width + 4) * 4;
          return 0.2126 * data.getUint8(o) + 0.7152 * data.getUint8(o + 1) + 0.0722 * data.getUint8(o + 2);
        }
        for (var y = row.top.ceil() + 6; y < bottom.floor() - 6 && y < 4 + h; y++) {
          expect((lum(y + 1) - lum(y)).abs(), lessThan(4), reason: 'p $p: a step in the header ground at y $y (the old row spans ${row.top}..${row.bottom}, the window ends at $bottom)');
        }
        checked++;
      }
      await t.pump(const Duration(milliseconds: 16));
    }
    expect(checked, greaterThan(3));
    await t.pump(const Duration(seconds: 1));
    await drain(t);
  });

  testWidgets('the station chevron turns back when the sheet starts to close, not when it has gone', (t) async {
    await openHall(t, await bootRecorded(t), '/hall/worcester?meal=lunch');
    bool open() => t.widget<StationRow>(find.byType(StationRow)).open;
    final row = find.descendant(of: find.byType(StationRow), matching: find.text('Miscellaneous'));
    await t.tap(row);
    await t.pump();
    expect(open(), isTrue, reason: 'it turns as the sheet opens');
    await t.pumpAndSettle();
    await t.tap(find.descendant(of: find.byType(SheetOption), matching: find.text('Miscellaneous')));
    await t.pump(const Duration(milliseconds: 16));
    expect(find.byType(SheetOption), findsWidgets, reason: 'the sheet is still on its way out');
    expect(open(), isFalse, reason: 'the chevron has already been told to turn back');
    await t.pumpAndSettle();
    await drain(t);
  });
}
