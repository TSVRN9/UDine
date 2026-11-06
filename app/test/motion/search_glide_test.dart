// Search's rows hold still when nothing about them changed: the Events block is in place in the first frame that draws a row (it is
// built again with each return to idle, not waited for), and a row that survives a keystroke starts its glide where it was
// (M2 `renderSearch`: FLIP, then `setIdle`).
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/screens/search/events.dart';
import '../fonts.dart';
import '../screens/search_screen_test.dart' show finish, openSearch, settle;
import '../screens/support.dart';

void main() {
  setUpAll(loadFonts);

  testWidgets('first show: no frame draws a Lunch-now row without the Events block, and the rows never move afterwards', (t) async {
    await openApp(t, await bootRecorded(t), route: '/search');
    double? top;
    for (var i = 0; i < 120 && (top == null || i < 60); i++) {
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 25)));
      await t.pump(const Duration(milliseconds: 16));
      if (find.byType(DishRow).evaluate().isEmpty) continue;
      expect(find.byType(EventCard), findsWidgets, reason: 'frame $i drew a row before Events');
      final y = t.getTopLeft(find.byType(DishRow).first).dy;
      expect(y, top ?? y, reason: 'frame $i moved the first row');
      top = y;
    }
    expect(top, isNotNull);
    await finish(t);
  });

  testWidgets('back to idle after a query: Events is there in the first frame, rows start where they were', (t) async {
    await openSearch(t);
    await t.enterText(find.byType(EditableText), 'chicken');
    await settle(t);
    expect(find.byType(EventCard), findsNothing);
    final before = t.getTopLeft(find.byType(DishRow).first).dy;
    await t.enterText(find.byType(EditableText), '');
    await t.pump();
    expect(find.byType(EventCard), findsWidgets, reason: 'Events not built again the frame idle returns');
    expect(t.getTopLeft(find.byType(DishRow).first).dy, greaterThan(before), reason: 'rows sit under Events from the first frame');
    await settle(t);
    await finish(t);
  });
}
