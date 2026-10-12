// The phone trace of the RN build (first frame of the open 187 ms, a day change stalling 400 ms) as tests on what Flutter does about it.
import 'package:flutter_test/flutter_test.dart';
import 'package:udine_bakeoff/screens/dish_row.dart';
import 'package:udine_bakeoff/screens/hall_header.dart';
import 'package:udine_bakeoff/screens/halls.dart';
import 'package:udine_bakeoff/ui/ui.dart';
import '../fonts.dart';
import 'flows_test.dart' show boot, openHall;

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

  testWidgets('the list is a screenful while the container opens and the whole menu once it is open', (t) async {
    Photos.enabled = false;
    await boot(t);
    await t.tap(find.text('Worcester').first);
    await t.pump();
    await t.pump();
    await t.pump(const Duration(milliseconds: 100));
    final during = find.byType(DishRow).evaluate().length;
    expect(during, lessThan(14));
    await t.pumpAndSettle();
    expect(find.byType(DishRow, skipOffstage: false).evaluate().length, greaterThan(50));
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
