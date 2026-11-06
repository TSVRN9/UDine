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

  testWidgets('Franklin open: the hint names it, and a + on a dish served at several halls logs at Franklin', (t) async {
    await openApp(t, await bootRecorded(t));
    await until(t, () => find.text('Franklin').evaluate().isNotEmpty);
    await t.tap(find.text('Franklin'));
    await until(t, () => find.byType(Spinner).evaluate().isEmpty && find.byType(DishRow).evaluate().isNotEmpty);
    await t.pumpAndSettle();
    await tab(t, 'Search');
    await until(t, () => find.textContaining('Search lunch').evaluate().isNotEmpty);
    expect(find.text('Search lunch at Franklin'), findsOneWidget);
    await type(t, 'grilled chicken breast');
    await t.tap(find.byType(AddButton).first);
    await settle(t);
    final item = plateOf(t).state.plates.single.items.single;
    expect(item.refs.keys, ['F']);
    // (the plate's place is not what is asserted: the rows Log writes are)
    final rows = logEntries(plateOf(t).state.plates.single, place: plateHalls(plateOf(t).state.plates.single)?.firstOrNull, loggedAt: 'T');
    expect((rows.single.source as UmassMenuSource).hallTid, 2);
    await finish(t);
  });
}
