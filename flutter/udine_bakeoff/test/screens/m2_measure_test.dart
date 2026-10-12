// Positions measured in M2's own DOM (Playwright on the built prototype, `--st` 24, `--sb` 10; ~/.cache/udine-scratch/flutter/q3.js),
// against the same elements here. The goldens are looked at; these numbers are asserted.
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine_bakeoff/screens/hall_menu.dart';
import 'package:udine_bakeoff/screens/you.dart';
import 'package:udine_bakeoff/ui/ui.dart';
import '../fonts.dart';
import 'flows_test.dart' show boot, openHall;

double top(WidgetTester t, Finder f) => t.getTopLeft(f.first).dy;

void main() {
  setUpAll(loadFonts);
  for (final w in [390.0, 360.0]) {
    testWidgets('Halls header and rack at $w: UDine 34, date 46, Lunch 66, first band 137.6, Cafés & markets 780.6', (t) async {
      await boot(t, w: w);
      expect(top(t, find.text('UDine')), closeTo(34, 1.2));
      expect(top(t, find.text('Thursday, October 8')), closeTo(46, 1.2));
      expect(top(t, find.text('Lunch')), closeTo(66, 1.2));
      expect(t.getTopLeft(find.byType(Band).first).dy + 1, closeTo(137.59, 1.2)); // (the band's own top margin is the 1 dp seam)
      expect(top(t, find.text('Cafés & markets')), closeTo(780.59, 1.5));
    });
  }

  testWidgets('station sheet: top 269 (so 24 + the 10 dp floor under it), title 293, options from 329.8, current in 700', (t) async {
    await boot(t);
    await openHall(t, 'Worcester');
    final menu = t.widget<CustomScrollView>(find.descendant(of: find.byType(HallMenu), matching: find.byType(CustomScrollView))).controller!;
    menu.jumpTo(520);
    await t.pumpAndSettle();
    await t.tap(find.textContaining('Soups').last);
    await t.pumpAndSettle();
    expect(top(t, find.byType(SheetGrab)), closeTo(269, 1.2));
    expect(top(t, find.textContaining('Worcester lunch')), closeTo(293, 1.5));
    expect(t.getTopLeft(find.byType(SheetOption).first).dy, closeTo(329.8, 1.2));
    expect(t.getBottomLeft(find.byType(SheetOption).last).dy, closeTo(809.8, 1.2));
    final cur = t.widget<Text>(find.descendant(of: find.byType(SheetOption), matching: find.text('Soups')).first);
    expect(cur.style!.fontWeight, FontWeight.w700);
  });

  testWidgets('Dietary preferences: bar 76, Only show 106, first row 136.4, Avoid 332.4', (t) async {
    await boot(t);
    await t.tap(find.text('You').last);
    await t.pumpAndSettle();
    await t.tap(find.text('Dietary preferences'));
    await t.pumpAndSettle();
    expect(top(t, find.text('Only show')), closeTo(106, 1.2));
    expect(t.getTopLeft(find.descendant(of: find.byType(DietPage), matching: find.byType(CheckRow)).first).dy, closeTo(136.39, 1.2));
    expect(top(t, find.text('Avoid')), closeTo(332.39, 1.5));
  });
}
