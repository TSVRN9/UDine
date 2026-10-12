// The phone trace of the RN build (first frame of the open 187 ms, a day change stalling 400 ms) as tests on what Flutter does about it.
import 'package:flutter_test/flutter_test.dart';
import 'package:udine_bakeoff/screens/dish_row.dart';
import 'package:udine_bakeoff/screens/hall_header.dart';
import 'package:udine_bakeoff/screens/halls.dart';
import 'package:udine_bakeoff/screens/hall_menu.dart';
import 'package:udine_bakeoff/ui/ui.dart';
import '../fonts.dart';
import 'flows_test.dart' show boot, openHall;
import 'harness.dart' show bringIn;

void main() {
  setUpAll(loadFonts);

  testWidgets('the open\'s clock starts after the hall page\'s first frame is drawn: that frame and the next show the band (progress 0)', (t) async {
    await boot(t);
    final tab = t.state<HallsTabState>(find.byType(HallsTab));
    await t.tap(find.text('Hampshire'));
    await t.pump(); // the frame that builds the page
    expect(tab.t.progress.value, 0);
    // the first frame took 187 ms on the phone (RN's trace): the frame after it is that much later, and the curve must not have run
    await t.pump(const Duration(milliseconds: 187));
    expect(tab.t.progress.value, lessThan(0.02));
    await t.pump(const Duration(milliseconds: 16));
    expect(tab.t.progress.value, lessThan(0.05));
    await t.pumpAndSettle();
    expect(tab.t.progress.value, 1);
  });

  testWidgets('the list is lazy: the container finishing its open builds no rows, and only those near the screen were ever built', (t) async {
    Photos.enabled = false;
    await boot(t);
    await t.tap(find.text('Worcester').first);
    await t.pump();
    await t.pump();
    await t.pump(const Duration(milliseconds: 450));
    final before = DishRow.builds;
    await t.pump(const Duration(milliseconds: 80)); // the open completes inside this
    await t.pumpAndSettle();
    expect(DishRow.builds - before, lessThanOrEqualTo(14), reason: 'the end of the open rebuilds the rows on screen, never the menu'); // (7 are on screen)
    expect(DishRow.builds, lessThan(30), reason: 'rows built since boot, of 70');
    expect(find.byType(DishRow).evaluate().length, lessThan(20));
  });

  testWidgets('a day change builds only the rows near the screen, not the menu', (t) async {
    await boot(t);
    await openHall(t, 'Worcester');
    DishRow.builds = 0;
    await t.tap(find.text('Today'));
    await t.pumpAndSettle();
    await t.tap(find.text('Tomorrow'));
    await t.pumpAndSettle();
    expect(find.text('Fri 9'), findsOneWidget);
    expect(DishRow.builds, inInclusiveRange(1, 25), reason: 'of 70 rows');
  });

  testWidgets('a hall pushed from where-served keeps only the rows around its landing row', (t) async {
    await boot(t);
    await openHall(t, 'Worcester');
    await bringIn(t, find.byWidgetPredicate((w) => w is DishRow && w.dish.name == 'Roasted Zucchini'));
    await t.tapAt(t.getTopLeft(find.byWidgetPredicate((w) => w is DishRow && w.dish.name == 'Roasted Zucchini')) + const Offset(40, 22));
    await t.pumpAndSettle();
    await t.tap(find.text('Worcester').last);
    await t.pumpAndSettle();
    expect(find.byType(HallMenu), findsNWidgets(2));
    final pushed = find.descendant(of: find.byType(HallMenu).last, matching: find.byType(DishRow));
    expect(pushed.evaluate().length, inInclusiveRange(3, 20));
    final y = t.getTopLeft(find.descendant(of: pushed, matching: find.text('Zucchini'), skipOffstage: false).first).dy;
    expect(y, inInclusiveRange(172, 260)); // just under the collapsed header and its pinned rows (M2 toDish: 8 dp below them)
  });

  testWidgets('a day change builds none of the header or the board; nor does a scroll', (t) async {
    await boot(t);
    await openHall(t, 'Worcester');
    HallHeaderState.builds = 0;
    HallBoard.builds = 0;
    await t.drag(find.text('Soups').last, const Offset(0, -300));
    await t.pumpAndSettle();
    expect((HallHeaderState.builds, HallBoard.builds), (0, 0), reason: 'scrolling');
    await t.drag(find.text('Soups').last, const Offset(0, 600));
    await t.pumpAndSettle();
    await t.tap(find.text('Today'));
    await t.pumpAndSettle();
    await t.tap(find.text('Tomorrow'));
    await t.pumpAndSettle();
    expect(find.text('Fri 9'), findsOneWidget); // the day did change
    expect((HallHeaderState.builds, HallBoard.builds), (0, 0), reason: 'a day change');
  });
}
