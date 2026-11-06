// + on every Search row, and the plate's meal (search-first-class Task 3). Departs from M2 on purpose: docs/briefs/search-first-class.md.
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/hours.dart' show easternInstant;
import 'package:udine/core/m2/board.dart' show clockMeal;
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/screens/search/search_screen.dart';
import 'package:udine/shell/shell_scope.dart';
import 'package:udine/ui/ui.dart' hide Stepper;
import 'package:udine/ui/ui.dart' as kit show Stepper;
import '../fonts.dart';
import '../shell/tab_stacks_test.dart' show openWorcester, tab;
import 'search_screen_test.dart' show finish, openSearch, plateOf, settle, type;
import 'support.dart';
import '../core/m2/support.dart' show dishes;
import 'package:udine/core/m2/search.dart' show LaterRow;
import 'package:udine/core/m2/where.dart' show WhereGroup;
import 'package:udine/screens/search/search_entries.dart' show LaterEntry, entryCtx;

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

  testWidgets('a cleared query ends the plate\'s visit: the hint and the next + are the clock\'s meal', (t) async {
    await openSearch(t);
    final meal = ShellScope.of(t.element(find.byType(SearchScreen))).searchMeal;
    meal.value = 'dinner';
    await type(t, 'chicken');
    await type(t, '');
    expect(meal.value, isNull);
    expect(find.text('Search lunch at every hall'), findsOneWidget);
    await t.tap(find.byType(AddButton).first);
    await settle(t);
    expect(plateOf(t).state.plates.single.meal, 'lunch');
    await finish(t);
  });

  test('a Later café row looks its plate item up at the café; a hall\'s at none', () {
    LaterEntry later(String place) => LaterEntry(LaterRow(WhereGroup('later', 'dinner', 0, '5:00 PM', '9:00 PM', [place], '2026-10-08'), dishes.first));
    expect(entryCtx(later('c5')), 'c5');
    expect(entryCtx(later('W')), isNull);
  });

  testWidgets('at 23:30 a Later + lands on the meal clockMeal names', (t) async {
    final at = easternInstant(DateTime.utc(2026, 10, 8, 23, 30));
    await openApp(t, await bootRecorded(t, at: at), route: '/search?q=waffle');
    await until(t, () => laterRows().evaluate().isNotEmpty);
    await settle(t);
    await t.tap(find.descendant(of: laterRows().first, matching: find.byType(AddButton)));
    await settle(t);
    expect(plateOf(t).state.plates.single.meal, clockMeal(at));
    await finish(t);
  });

  testWidgets('Hampshire open: a Later dish Hampshire serves logs at H', (t) async {
    await openApp(t, await bootRecorded(t));
    await until(t, () => find.text('Hampshire').evaluate().isNotEmpty);
    await t.tap(find.text('Hampshire'));
    await until(t, () => find.byType(Spinner).evaluate().isEmpty && find.byType(DishRow).evaluate().isNotEmpty);
    await t.pumpAndSettle();
    await tab(t, 'Search');
    await until(t, () => find.textContaining('Lunch now').evaluate().isNotEmpty);
    await type(t, 'marinated tomato');
    await t.tap(find.descendant(of: laterRows().first, matching: find.byType(AddButton)));
    await settle(t);
    expect(plateOf(t).state.plates.single.items.single.refs.keys, ['H']);
    await finish(t);
  });
}
