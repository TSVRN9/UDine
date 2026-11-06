// Search reads `here` (search-first-class Task 2): the hint names the open hall, its dishes rank first, and a + logs there.
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/m2/log.dart';
import 'package:udine/core/m2/plate.dart';
import 'package:udine/core/types.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import '../shell/tab_stacks_test.dart' show tab;
import 'search_screen_test.dart' show finish, plateOf, settle, type;
import 'support.dart';

void main() {
  setUpAll(loadFonts);

  Future<void> openHall(WidgetTester t, String name) async {
    await openApp(t, await bootRecorded(t));
    await until(t, () => find.text(name).evaluate().isNotEmpty);
    await t.tap(find.text(name));
    await until(t, () => find.byType(Spinner).evaluate().isEmpty && find.byType(DishRow).evaluate().isNotEmpty);
    await t.pumpAndSettle();
  }

  testWidgets('Franklin open: the first frame of Search already names it', (t) async {
    await openHall(t, 'Franklin');
    await t.tap(find.descendant(of: find.byType(M2TabBar), matching: find.text('Search')));
    await t.pump(const Duration(milliseconds: 16));
    expect(find.text('Search lunch at Franklin'), findsOneWidget);
    await settle(t);
    await finish(t);
  });

  for (final (name, tid) in [('Franklin', 2), ('Hampshire', 3)]) {
    testWidgets('$name open: a + on a dish served at F, H and B logs at $name', (t) async {
      await openHall(t, name);
      await tab(t, 'Search');
      await until(t, () => find.textContaining('Lunch now').evaluate().isNotEmpty);
      await type(t, 'grilled chicken breast');
      await t.tap(find.byType(AddButton).first);
      await settle(t);
      final plate = plateOf(t).state.plates.single;
      expect(plate.items.single.refs.keys, [name[0]]);
      // (what Log writes: logEntries' rows, at the plate's only place)
      final rows = logEntries(plate, place: plateHalls(plate)?.firstOrNull, loggedAt: 'T');
      expect((rows.single.source as UmassMenuSource).hallTid, tid);
      await finish(t);
    });
  }
}
