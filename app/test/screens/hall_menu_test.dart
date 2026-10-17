import 'package:flutter/rendering.dart' show RenderParagraph;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/m2/board.dart' show mealLabel;
import 'package:udine/core/m2/menu_view.dart' show mealOrder;
import 'package:udine/data/recorded/recorded.dart';
import 'package:udine/screens/hall/meal_tabs.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/screens/hall/hall_route.dart';
import 'package:udine/shell/app_scope.dart';
import 'package:udine/theme/tokens.dart';
import 'package:udine/ui/ui.dart' hide Stepper;
import 'package:udine/ui/ui.dart' as kit show Stepper;
import '../fonts.dart';
import 'support.dart';

/// A dish's row (a name wraps over spans, so it is found by the row's dish).
Finder dish(String name) => find.byWidgetPredicate((w) => w is DishRow && w.dish.dishName == name);

String selectedTab(WidgetTester t) {
  final tabs = t.widget<MealTabs>(find.byType(MealTabs));
  return tabs.selected;
}

void main() {
  setUpAll(loadFonts);

  testWidgets('Worcester lunch opens on live data: every meal is a tab, Grab \'N Go included, Lunch selected, the first station named', (t) async {
    await openHall(t, await bootRecorded(t), '/hall/worcester?meal=lunch');
    final tabs = t.widget<MealTabs>(find.byType(MealTabs));
    expect(tabs.meals, ['breakfast', 'lunch', 'dinner', 'late', 'grab']);
    expect([for (final m in tabs.meals) mealLabel[m]], ['Breakfast', 'Lunch', 'Dinner', 'Late night', "Grab 'N Go"]);
    expect(tabs.selected, 'lunch');
    expect(find.text('Miscellaneous'), findsNWidgets(2)); // the station row and the head
    expect(dish('Local Roasted Sweet Potatoes'), findsOneWidget);
    expect(find.text('Today'), findsOneWidget);
    await drain(t);
  });

  testWidgets('/cafe/3 launches a café\'s menu body: Green Fields, with prices', (t) async {
    await openHall(t, await bootRecorded(t), '/cafe/3');
    expect(t.widget<HallMenu>(find.byType(HallMenu)).place, 'c3');
    expect(find.byType(DishRow), findsWidgets);
    await drain(t);
  });

  testWidgets('a meal tab changes the list; Grab \'N Go leads with its own status and window', (t) async {
    await openHall(t, await bootRecorded(t), '/hall/worcester?meal=lunch');
    await t.tap(find.text("Grab 'N Go"));
    await t.pumpAndSettle();
    expect(selectedTab(t), 'grab');
    expect(dish('Local Roasted Sweet Potatoes'), findsNothing);
    expect(find.textContaining('Open until 8 PM', findRichText: true), findsOneWidget);
    expect(find.textContaining(', 7 AM to 8 PM', findRichText: true), findsOneWidget);
    await t.tap(find.text('Dinner'));
    await t.pumpAndSettle();
    expect(selectedTab(t), 'dinner');
    await drain(t);
  });

  testWidgets('a name never breaks after a slash, as in the browser: "w/Bacon" wraps whole', (t) async {
    await openHall(t, await bootRecorded(t), '/cafe/12', w: 360);
    final name = find.byWidgetPredicate((w) => w is RichText && w.text.toPlainText().contains('Croissant w'));
    final r = t.renderObject<RenderParagraph>(name.first);
    final text = r.text.toPlainText();
    double top(String s) {
      final i = text.indexOf(s);
      return r.getBoxesForSelection(TextSelection(baseOffset: i, extentOffset: i + 1)).first.top;
    }
    expect(top('w/'), top('Bacon'), reason: text);
    expect(top('w/'), greaterThan(top('Croissant')), reason: text);
    await drain(t);
  });

  testWidgets('Grab \'N Go stations drop the feed\'s "Grab n\'Go " prefix, as M2\'s build does', (t) async {
    await openHall(t, await bootRecorded(t), '/hall/worcester?meal=grab');
    expect(find.textContaining("Grab n'Go"), findsNothing);
    expect(find.text('Breakfast'), findsWidgets);
    await drain(t);
  });

  testWidgets('+ becomes 1, then ½, then goes: the plate is in memory and only the row\'s own control shows it', (t) async {
    final boot = await bootRecorded(t);
    await openHall(t, boot, '/hall/worcester?meal=lunch');
    final plate = AppScope.of(t.element(find.byType(HallMenu))).plate;
    expect(plate.state.plates, isEmpty);
    await t.tap(find.byType(AddButton).first);
    await t.pumpAndSettle();
    expect(plate.state.plates.single.items.single.qty, 1);
    expect(t.widget<kit.Stepper>(find.byType(kit.Stepper)).qty, 1);
    Finder press(int i) => find.descendant(of: find.byType(kit.Stepper), matching: find.byType(Press)).at(i);
    await t.tap(press(0)); // Less
    await t.pumpAndSettle();
    expect(plate.state.plates.single.items.single.qty, 0.5);
    expect(t.widget<kit.Stepper>(find.byType(kit.Stepper)).qty, 0.5);
    await t.tap(press(1)); // More
    await t.pumpAndSettle();
    expect(plate.state.plates.single.items.single.qty, 1);
    await t.tap(press(0));
    await t.pumpAndSettle();
    await t.tap(press(0));
    await t.pumpAndSettle();
    expect(plate.state.plates, isEmpty);
    expect(find.byType(kit.Stepper), findsNothing);
    await drain(t);
  });

  testWidgets('another day\'s dishes carry no control; a row tap names the dish to the dish sheet\'s hook', (t) async {
    await openHall(t, await bootRecorded(t), '/hall/worcester?meal=lunch&day=2026-10-09');
    expect(find.byType(DishRow), findsWidgets);
    expect(find.byType(AddButton), findsNothing);
    expect(find.text('Fri 9'), findsOneWidget);
    await drain(t);
  });

  testWidgets('a row opens the dish sheet (the hook gets the serving, its place, meal and day)', (t) async {
    final boot = await bootRecorded(t);
    MenuTap? got;
    Photos.enabled = false;
    phone(t);
    await t.pumpWidget(WidgetsApp(
      color: M2Color.dm,
      pageRouteBuilder: <T>(settings, builder) => PageRouteBuilder<T>(settings: settings, pageBuilder: (c, _, _) => builder(c)),
      home: boot.wrap(HallMenuHarness(onTap: (x) => got = x)),
    ));
    await until(t, () => dish('Local Roasted Sweet Potatoes').evaluate().isNotEmpty);
    await t.tap(dish('Local Roasted Sweet Potatoes'));
    await t.pump();
    expect((got!.name, got!.place, got!.meal, got!.day), ('Local Roasted Sweet Potatoes', 'W', 'lunch', 0));
    await drain(t);
  });

  testWidgets('an empty day says "No menu posted" with no tabs to pick (Oct 10)', (t) async {
    await openHall(t, await bootRecorded(t), '/hall/worcester?meal=lunch&day=2026-10-10');
    expect(find.text('No menu posted for Saturday, October 10.'), findsOneWidget);
    expect(find.text('Sat 10'), findsOneWidget);
    expect(t.widget<MealTabs>(find.byType(MealTabs)).meals, isEmpty);
    expect(find.byType(DishRow), findsNothing);
    await drain(t);
  });

  testWidgets('an event is a note on its own day and no date tag (Mon Oct 12, Indigenous Peoples Day)', (t) async {
    await openHall(t, await bootRecorded(t), '/hall/worcester?meal=lunch&day=2026-10-12');
    expect(find.text('Indigenous Peoples Day'), findsOneWidget);
    expect(find.textContaining('Oct 12'), findsNothing);
    await drain(t);
  });

  testWidgets('and on no other day (Tue Oct 13)', (t) async {
    await openHall(t, await bootRecorded(t), '/hall/worcester?meal=lunch&day=2026-10-13');
    expect(find.text('Indigenous Peoples Day'), findsNothing);
    await drain(t);
  });

  group('network states', () {
    testWidgets('loading: the indicator draws after 400 ms; the labels and list fade in when the menu lands', (t) async {
      await openApp(t, await bootRecorded(t, net: NetMode.slow), route: '/hall/worcester?meal=lunch');
      await until(t, () => find.byType(Spinner).evaluate().isNotEmpty);
      double shown() => t.widget<Opacity>(find.descendant(of: find.byType(Spinner), matching: find.byType(Opacity))).opacity;
      expect(shown(), 0);
      expect(find.byType(DishRow), findsNothing);
      await t.pump(const Duration(milliseconds: 450));
      expect(shown(), 1);
      await t.pump(const Duration(milliseconds: 1700));
      await until(t, () => find.byType(DishRow).evaluate().isNotEmpty, frame: const Duration(milliseconds: 40));
      expect(find.byType(Spinner), findsNothing);
      expect(t.widget<ChalkFade>(find.byKey(const ValueKey('fade-list'))).opacity, lessThan(1)); // arriving
      await t.pumpAndSettle();
      expect(t.widget<ChalkFade>(find.byKey(const ValueKey('fade-list'))).opacity, 1);
      for (var i = 0; i < 6; i++) {
        await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 30)));
        await t.pump(const Duration(seconds: 2)); // the slow busy calls still to come
      }
      await drain(t);
    });

    testWidgets('offline with the day saved: the menu shows', (t) async {
      await openHall(t, await bootRecorded(t, net: NetMode.offline), '/hall/worcester?meal=lunch');
      expect(dish('Local Roasted Sweet Potatoes'), findsOneWidget);
      await drain(t);
    });

    testWidgets('offline, a day that is not saved says so and has no tabs', (t) async {
      await openHall(t, await bootRecorded(t, net: NetMode.offline), '/hall/worcester?meal=lunch&day=2026-10-12');
      expect(find.text("You're offline, and the menu for Monday, October 12 isn't saved on this phone."), findsOneWidget);
      expect(find.byType(DishRow), findsNothing);
      await drain(t);
    });

    testWidgets('failed: "Worcester\'s menu didn\'t load." with Try again, which asks again', (t) async {
      await openHall(t, await bootRecorded(t, net: NetMode.fail), '/hall/worcester?meal=lunch');
      expect(find.text("Worcester's menu didn't load."), findsOneWidget);
      await t.tap(find.text('Try again'));
      await t.pump();
      expect(find.text("Worcester's menu didn't load."), findsNothing); // asking again
      await until(t, () => find.text("Worcester's menu didn't load.").evaluate().isNotEmpty);
      await drain(t);
    });
  });

  group('cafés with dishes use the same body', () {
    testWidgets('Green Fields: lunch and dinner tabs, no letter, a station row; Worcester Café posts one menu, so no tab row', (t) async {
      await openPlace(t, await bootRecorded(t), 'c3');
      expect(t.widget<MealTabs>(find.byType(MealTabs)).meals, ['lunch', 'dinner']);
      expect(find.byType(HallLetter), findsNothing);
      await drain(t);
    });

    testWidgets('a single-meal café has no tab row', (t) async {
      await openPlace(t, await bootRecorded(t), 'c12');
      expect(find.byType(MealTabs), findsNothing);
      expect(find.byType(StationRow), findsOneWidget);
      await drain(t);
    });
  });

  testWidgets('the station row opens the roster, which lists each station with its count; a pick scrolls the list there', (t) async {
    await openHall(t, await bootRecorded(t), '/hall/worcester?meal=lunch');
    await t.tap(find.descendant(of: find.byType(StationRow), matching: find.text('Miscellaneous')));
    await t.pumpAndSettle();
    expect(find.text('Worcester lunch'), findsOneWidget);
    expect(find.byType(SheetOption), findsWidgets);
    bool current(String name) => t.widget<SheetOption>(find.byWidgetPredicate((w) => w is SheetOption && w.label == name)).current;
    expect(current('Miscellaneous'), isTrue); // the station the list is at
    expect(current('Desserts'), isFalse);
    expect(find.descendant(of: find.byType(SheetOption), matching: find.text('Desserts')), findsOneWidget);
    await t.tap(find.descendant(of: find.byType(SheetOption), matching: find.text('Desserts')));
    await t.pumpAndSettle();
    expect(find.byType(SheetOption), findsNothing);
    expect(dish('Chocolate Soft Serve Ice Cream'), findsOneWidget);
    expect(t.widget<StationRow>(find.byType(StationRow)).name, 'Desserts');
    await drain(t);
  });

  test('a café index outside the table is no launch route (the halls tab opens), not a RangeError', () {
    expect(hallLaunchRoute('/cafe/999', 0), isNull);
    expect(hallLaunchRoute('/cafe/-1', 0), isNull);
    expect(hallLaunchRoute('/cafe/3', 0), isNotNull);
  });

  test('every meal M2 keeps is a tab key', () => expect(mealOrder, ['breakfast', 'lunch', 'dinner', 'late', 'all', 'grab']));
}

/// What a row tap hands the dish sheet.
class MenuTap {
  MenuTap(this.name, this.place, this.meal, this.day);
  final String name, place, meal;
  final int day;
}

/// The hall body on its own, with a recording hook for the dish tap.
class HallMenuHarness extends StatelessWidget {
  const HallMenuHarness({super.key, required this.onTap});
  final void Function(MenuTap) onTap;
  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (_, c) => HallMenu(place: 'W', top: 24, height: c.maxHeight, onBack: () {}, onOpenDish: (d, {required place, required meal, required day}) => onTap(MenuTap(d.dishName, place, meal, day))),
      );
}
