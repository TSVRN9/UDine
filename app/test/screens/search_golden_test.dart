import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/app.dart';
import 'package:udine/screens/dish/dish_sheet.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/ui/ui.dart' show AddButton;
import 'package:udine/screens/search/events.dart' show EventCard;
import '../fonts.dart';
import 'search_screen_test.dart' show finish, settle;
import 'support.dart';

// Every Search state of the brief at 360 and 390 dp, over M2's recordings and the fixed clock (Thursday Oct 8, 12:41). The field is unfocused for the capture: a focused
// field's cursor blinks, and a golden must not depend on the frame it lands on. Photos are never drawn.
void main() {
  setUpAll(loadFonts);

  for (final w in [360.0, 390.0]) {
    final n = w.toInt();

    Future<void> shot(WidgetTester t, String name, String route, {Future<void> Function(WidgetTester t)? act, bool noEvents = false}) async {
      await openApp(t, await bootRecorded(t, read: noEvents ? (f) async => f == 'events-raw.json' ? '{"events":[]}' : readRecorded(f) : null), route: route, w: w);
      await until(t, () => find.byType(DishRow).evaluate().isNotEmpty || find.textContaining(RegExp('Nothing called|No dishes|Star a dish|Places')).evaluate().isNotEmpty);
      await finish(t);
      await act?.call(t);
      FocusManager.instance.primaryFocus?.unfocus();
      await settle(t);
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/search_${name}_$n.png'));
    }

    testWidgets('idle with no events this week, $n dp', (t) => shot(t, 'idle', '/search', noEvents: true));
    testWidgets('idle with events, $n dp', (t) => shot(t, 'idle_events', '/search', act: (t) => until(t, () => find.byType(EventCard).evaluate().isNotEmpty)));
    testWidgets('typing with results in every group, $n dp', (t) => shot(t, 'every_group', '/search?q=green'));
    testWidgets('a query with only later results, $n dp', (t) => shot(t, 'later_only', '/search?q=pancakes'));
    testWidgets('a query with only café results, $n dp', (t) => shot(t, 'cafe_only', '/search?q=apple'));
    testWidgets('a query that is only a place, $n dp', (t) => shot(t, 'places_only', '/search?q=organic'));
    testWidgets('a hall card among places, $n dp', (t) => shot(t, 'hall_card', '/search?q=worcester'));
    testWidgets('no match: the custom-food call to action, $n dp', (t) => shot(t, 'no_match', '/search?q=zzzq'));
    for (final l in ['protein', 'light', 'veg', 'plant', 'halal', 'lowc', 'fav']) {
      testWidgets('the $l lens on, $n dp', (t) => shot(t, 'lens_$l', '/search?lens=$l'));
    }
    testWidgets('a plate item added from a row, $n dp', (t) => shot(t, 'added', '/search?q=brisket', act: (t) async {
          await t.tap(find.byType(AddButton).first);
          await settle(t);
        }));
    testWidgets('the dish sheet over Search, $n dp', (t) => shot(t, 'dish_sheet', '/search?q=brisket', act: (t) async {
          await t.tap(find.byType(DishRow).first);
          await until(t, () => find.byType(DishSheet).evaluate().isNotEmpty && t.widget<DishSheet>(find.byType(DishSheet)).book.complete);
          await settle(t);
        }));
  }
}
