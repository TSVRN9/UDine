// + on every Search row, and the plate's meal (search-first-class Task 3). Departs from M2 on purpose: docs/briefs/search-first-class.md.
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/screens/search/search_screen.dart';
import 'package:udine/shell/shell_scope.dart';
import 'package:udine/ui/ui.dart' hide Stepper;
import 'package:udine/ui/ui.dart' as kit show Stepper;
import '../fonts.dart';
import '../shell/tab_stacks_test.dart' show openWorcester, tab;
import 'search_screen_test.dart' show finish, openSearch, plateOf, settle, type;
import 'support.dart';

void main() {
  setUpAll(loadFonts);

  Finder laterRows() => find.byWidgetPredicate((w) => w is DishRow && w.tail != null);

  testWidgets('every Later row has a +; it logs to the current meal, and a second + steps the same item', (t) async {
    await openSearch(t, route: '/search?q=oatmeal');
    final rows = laterRows();
    expect(rows, findsWidgets);
    for (final r in rows.evaluate()) {
      expect((r.widget as DishRow).code, isNotNull);
    }
    final add = find.descendant(of: rows.first, matching: find.byType(AddButton));
    await t.tap(add);
    await settle(t);
    final plate = plateOf(t).state.plates.single;
    expect(plate.meal, 'lunch');
    expect(plate.items.single.qty, 1);
    expect(t.widget<kit.Stepper>(find.descendant(of: rows.first, matching: find.byType(kit.Stepper))).qty, 1);
    await t.tap(find.descendant(of: find.descendant(of: rows.first, matching: find.byType(kit.Stepper)), matching: find.byType(Press)).at(1));
    await settle(t);
    expect(plateOf(t).state.plates.single.items.single.qty, 2);
    expect(plateOf(t).state.plates.single.items, hasLength(1));
    await finish(t);
  });

  testWidgets('tracking off: no + on a Later row', (t) async {
    await openApp(t, await bootRecorded(t, track: false), route: '/search?q=oatmeal');
    await until(t, () => laterRows().evaluate().isNotEmpty);
    await settle(t);
    expect(find.byType(AddButton), findsNothing);
    await finish(t);
  });

  testWidgets('the search key presses the first loggable row\'s +, a Later row when it is the only one', (t) async {
    await openSearch(t, route: '/search?q=pancakes');
    expect(find.textContaining('now'), findsNothing);
    expect(laterRows(), findsWidgets);
    await t.testTextInput.receiveAction(TextInputAction.search);
    await settle(t);
    expect(plateOf(t).state.plates.single.items, hasLength(1));
    await finish(t);
  });

  testWidgets('Worcester open: a Later dish Worcester serves logs at W', (t) async {
    await openWorcester(t);
    await tab(t, 'Search');
    await until(t, () => find.textContaining('Lunch now').evaluate().isNotEmpty);
    await type(t, 'oatmeal');
    final r = laterRows().evaluate().map((e) => e.widget as DishRow).toList();
    expect(r, isNotEmpty);
    await t.tap(find.descendant(of: laterRows().first, matching: find.byType(AddButton)));
    await settle(t);
    final item = plateOf(t).state.plates.single.items.single;
    expect(item.refs.keys, contains('W'));
    expect(item.refs.keys, hasLength(1));
    await finish(t);
  });

  testWidgets('Add something else: Search adds to that plate\'s meal until the tab is left', (t) async {
    await openSearch(t);
    ShellScope.of(t.element(find.byType(SearchScreen))).searchMeal.value = 'dinner';
    await settle(t);
    expect(find.text('Search dinner at every hall'), findsOneWidget);
    await type(t, 'chicken');
    await t.tap(find.byType(AddButton).first);
    await settle(t);
    expect(plateOf(t).state.plates.single.meal, 'dinner');
    await tab(t, 'Halls');
    expect(ShellScope.of(t.element(find.byType(M2TabBar))).searchMeal.value, isNull);
    await finish(t);
  });
}
