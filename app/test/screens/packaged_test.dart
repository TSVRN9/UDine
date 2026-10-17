// Packaged foods and Your foods in the UI (flutter-port-packaged-foods Task 3), on M2's recordings: Search's groups past the menus, the lookup's
// states, add-and-keep, a food's sheet with Edit, Delete and Undo, You -> Your foods, tracking off and offline.
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/data/recorded/flags.dart' show LookupMode, NetMode;
import 'package:udine/core/saved_food.dart';
import 'package:udine/screens/dish/food_sheet.dart';
import 'package:udine/screens/plate/plate_bar.dart';
import 'package:udine/screens/plate/plate_row.dart';
import 'package:udine/screens/plate/custom_food.dart' show CustomFoodSheet, FoodFormSliver;
import 'package:udine/screens/search/food_row.dart';
import 'package:udine/screens/search/search_screen.dart';
import 'package:udine/shell/app_scope.dart';
import 'package:udine/ui/ui.dart';
import 'package:udine/screens/hall/dish_row.dart';
import '../fonts.dart';
import 'search_screen_test.dart' show finish, settle;
import 'support.dart';
import 'you_support.dart';

Future<AppScope> openQ(WidgetTester t, String q, {bool foods = true, bool track = true, NetMode net = NetMode.ok, LookupMode lookup = LookupMode.found, bool packFail = false, double w = 390, HangingClient? hang, CountingClient? count}) async {
  final b = await bootRecorded(t, foods: foods, track: track, net: net, lookup: lookup, packFail: packFail, hangLookup: hang, count: count);
  await openApp(t, b, route: '/search?q=$q', w: w);
  await until(t, () => find.byType(DishRow).evaluate().isNotEmpty || find.textContaining('Nothing called').evaluate().isNotEmpty || find.textContaining('No dishes').evaluate().isNotEmpty);
  await settle(t);
  // (the packaged answer: the query rests, then real I/O, then its frame)
  for (var i = 0; i < 6; i++) {
    await drain(t);
    await t.pump(const Duration(milliseconds: 200));
  }
  await settle(t);
  return AppScope.of(t.element(find.byType(SearchScreen)));
}

double y(WidgetTester t, String text) => t.getTopLeft(find.text(text)).dy;

void main() {
  setUpAll(loadFonts);

  group('Search past the menus', () {
    testWidgets('"clif": Your foods, then Packaged, then Search UMass Dining, then the custom button, in that order', (t) async {
      await openQ(t, 'clif');
      expect(find.text('Your foods'), findsOneWidget);
      expect(find.text('Packaged'), findsOneWidget);
      await t.dragUntilVisible(find.text('Add “clif” as a custom food'), find.byType(CustomScrollView), const Offset(0, -300));
      final order = [y(t, 'Search UMass Dining for “clif”'), y(t, 'Add “clif” as a custom food')];
      expect(order[0], lessThan(order[1]));
      await finish(t);
    });

    testWidgets('"clif" rows: a per-100 g hit reads "368 cal per 100 g", a saved food its calories and protein, and a food already saved is not repeated in Packaged', (t) async {
      await openQ(t, 'clif');
      expect(find.text('Clif Bar Chocolate Chip'), findsOneWidget); // (saved: Your foods only; the recorded hits also hold one)
      expect(find.text('cal per 100 g'), findsWidgets);
      expect(find.text('Clif bar'), findsOneWidget);
      expect(find.text('250'), findsOneWidget);
      await finish(t);
    });

    testWidgets('"chobani": one saved food, no packaged answer, the lookup button waiting', (t) async {
      await openQ(t, 'chobani');
      expect(find.byType(FoodRow), findsOneWidget);
      expect(find.text('Packaged'), findsNothing);
      expect(find.text('Search UMass Dining for “chobani”'), findsOneWidget);
      await finish(t);
    });

    testWidgets('+ on a packaged hit keeps it in Your foods and puts one 100 g serving on the plate, which reads "368 cal per 100 g"', (t) async {
      final s = await openQ(t, 'clif');
      await t.tap(find.descendant(of: find.widgetWithText(ListRow, 'Clif bar'), matching: find.byType(AddButton)));
      await until(t, () => s.plate.state.plates.isNotEmpty);
      final it = s.plate.state.plates.single.items.single;
      expect((it.key, it.qty, it.food!.per100g), ('food:off:36346363', 1, true));
      await settle(t);
      expect((await t.runAsync(() => s.store!.savedFoods()))!.map((f) => f.id), contains('off:36346363'));
      expect(s.foods!.foods.first.name, 'Clif bar');
      await finish(t);
    });

    testWidgets('no match anywhere: only Search UMass Dining and the custom button, which is no longer the solid one', (t) async {
      await openQ(t, 'zzzq');
      expect(find.text('Nothing called “zzzq” is on any menu today or tomorrow.'), findsOneWidget);
      expect(find.text('Search UMass Dining for “zzzq”'), findsOneWidget);
      expect(t.widget<CustomFoodButton>(find.byType(CustomFoodButton)).solid, isFalse);
      await finish(t);
    });

    testWidgets('packaged failed: the heading, "Packaged foods didn\'t load." and Try again', (t) async {
      await openQ(t, 'clif', packFail: true);
      expect(find.text('Packaged'), findsOneWidget);
      expect(find.text("Packaged foods didn't load."), findsOneWidget);
      expect(find.widgetWithText(Button, 'Try again'), findsOneWidget);
      await finish(t);
    });
  });

  group('Search UMass Dining', () {
    Future<void> ask(WidgetTester t) async {
      await t.tap(find.text('Search UMass Dining for “laksa”'));
      await t.pump();
    }

    testWidgets('found: a UMass Dining group of dishes on no menu today or tomorrow, and the button is gone', (t) async {
      await openQ(t, 'laksa');
      await ask(t);
      await until(t, () => find.text('UMass Dining').evaluate().isNotEmpty);
      expect(find.textContaining('Laksa Noodle Bowl'), findsOneWidget);
      expect(find.text('Search UMass Dining for “laksa”'), findsNothing);
      await finish(t);
    });

    testWidgets('none: "UMass Dining has nothing else called “laksa”."', (t) async {
      await openQ(t, 'laksa', lookup: LookupMode.none);
      await ask(t);
      await until(t, () => find.text('UMass Dining has nothing else called “laksa”.').evaluate().isNotEmpty);
      await finish(t);
    });

    testWidgets('failed: "Couldn\'t reach UMass Dining." with Try again, which asks again', (t) async {
      await openQ(t, 'laksa', lookup: LookupMode.fail);
      await ask(t);
      await until(t, () => find.text("Couldn't reach UMass Dining.").evaluate().isNotEmpty);
      await t.tap(find.widgetWithText(Button, 'Try again'));
      await until(t, () => find.text("Couldn't reach UMass Dining.").evaluate().isNotEmpty);
      await finish(t);
    });

    testWidgets('rate-limited: "Searching UMass Dining is paused until 1 PM." (the next UTC hour after 12:41 Eastern)', (t) async {
      await openQ(t, 'laksa', lookup: LookupMode.limited);
      await ask(t);
      await until(t, () => find.text('Searching UMass Dining is paused until 1 PM.').evaluate().isNotEmpty);
      await finish(t);
    });

    testWidgets('typing on puts the button back for the new query', (t) async {
      await openQ(t, 'laksa', lookup: LookupMode.none);
      await ask(t);
      await until(t, () => find.textContaining('has nothing else called').evaluate().isNotEmpty);
      await t.enterText(find.byType(EditableText), 'laksas');
      await settle(t);
      expect(find.text('Search UMass Dining for “laksas”'), findsOneWidget);
      await finish(t);
    });
  });

  group('nothing is sent unless Search may ask', () {
    // (a query typed and the debounce long past: the count is what reached the network, OFF and USDA alike)
    Future<int> sent(WidgetTester t, {bool track = true, NetMode net = NetMode.ok}) async {
      final c = CountingClient();
      await openQ(t, 'clif', track: track, net: net, count: c);
      for (var i = 0; i < 4; i++) {
        await t.pump(const Duration(seconds: 1));
        await drain(t);
      }
      await finish(t);
      return c.urls.length;
    }

    testWidgets('control: tracking on and online asks OFF and USDA (lookup-dish only by hand)', (t) async {
      expect(await sent(t), 3);
    });
    testWidgets('tracking off: no request at all, though a query is typed and the debounce has passed', (t) async => expect(await sent(t, track: false), 0));
    testWidgets('offline: no request at all', (t) async => expect(await sent(t, net: NetMode.offline), 0));
  });

  group('a plate row opens its food', () {
    Future<(AppScope, SavedFood)> onPlate(WidgetTester t) async {
      final s = await openQ(t, 'chobani');
      final f = s.foods!.foods.firstWhere((x) => x.name == 'Chobani');
      s.plate.addFood('lunch', f);
      await t.pumpAndSettle();
      await t.tap(find.byType(PlateBar));
      await t.pumpAndSettle();
      return (s, f);
    }

    testWidgets('a saved food\'s row opens its sheet', (t) async {
      await onPlate(t);
      await t.tap(find.descendant(of: find.byType(PlateRow), matching: find.text('Chobani')));
      await t.pumpAndSettle();
      expect(find.byType(FoodSheet), findsOneWidget);
      await finish(t);
    });

    testWidgets('a food deleted since opens nothing', (t) async {
      final (s, f) = await onPlate(t);
      await t.runAsync(() => s.foods!.delete(f));
      await t.pumpAndSettle();
      await t.tap(find.descendant(of: find.byType(PlateRow), matching: find.text('Chobani')));
      await t.pumpAndSettle();
      expect(find.byType(FoodSheet), findsNothing);
      await t.pump(const Duration(seconds: 6));
      await finish(t);
    });
  });

  group('tracking off and offline', () {
    testWidgets('tracking off: no Your foods, Packaged, Search UMass Dining or custom button, and nothing asked', (t) async {
      await openQ(t, 'clif', track: false);
      for (final x in ['Your foods', 'Packaged', 'Search UMass Dining for “clif”']) {
        expect(find.text(x), findsNothing);
      }
      expect(find.byType(CustomFoodButton), findsNothing);
      expect(find.byType(FoodRow), findsNothing);
      await finish(t);
    });

    testWidgets('offline: Your foods still answers; Packaged and Search UMass Dining are absent; the custom button stays', (t) async {
      await openQ(t, 'clif', net: NetMode.offline);
      expect(find.text('Your foods'), findsOneWidget);
      expect(find.text('Packaged'), findsNothing);
      expect(find.text('Search UMass Dining for “clif”'), findsNothing);
      expect(find.text('Add “clif” as a custom food'), findsOneWidget);
      await finish(t);
    });
  });

  group('a food\'s sheet', () {
    Future<AppScope> sheet(WidgetTester t, String q, String row) async {
      final s = await openQ(t, q);
      await t.tap(find.descendant(of: find.widgetWithText(ListRow, row), matching: find.text(row)).first);
      await t.pumpAndSettle();
      await until(t, () => find.byType(FoodSheet).evaluate().isNotEmpty);
      await settle(t);
      return s;
    }

    testWidgets('a packaged hit not yet kept: name, serving, Add to plate, the label; no Edit, where, grades or star', (t) async {
      await sheet(t, 'clif', 'Clif bar');
      expect(find.text('100 g'), findsWidgets);
      expect(find.text('Add to plate'), findsOneWidget);
      expect(find.text('Edit'), findsNothing);
      expect(find.byType(FavoriteStar), findsNothing);
      expect(find.textContaining('Not on the menu'), findsNothing);
      await finish(t);
    });

    testWidgets('a kept food: Contains, the ingredients, and Edit where a dish has its star', (t) async {
      await sheet(t, 'clif', 'Clif Bar Chocolate Chip');
      expect(find.text('Edit'), findsOneWidget);
      expect(find.textContaining('Soy'), findsWidgets);
      expect(find.text('Ingredients'), findsOneWidget);
      await finish(t);
    });

    testWidgets('Add to plate keeps the hit, lays it on the plate, and the sheet goes down', (t) async {
      final s = await sheet(t, 'clif', 'Clif bar');
      await t.tap(find.text('Add to plate'));
      await until(t, () => s.plate.state.plates.isNotEmpty);
      await t.pumpAndSettle();
      expect(find.byType(FoodSheet), findsNothing);
      expect(s.foods!.foods.map((f) => f.name), contains('Clif bar'));
      await finish(t);
    });

    testWidgets('Edit turns the sheet into the form, filled in; Save returns to the sheet with the new name and figures', (t) async {
      final s = await sheet(t, 'chobani', 'Chobani');
      await t.tap(find.text('Edit'));
      await t.pumpAndSettle();
      expect(find.text('Edit food'), findsOneWidget);
      expect(find.text('Save'), findsOneWidget);
      expect(find.text('Delete'), findsOneWidget);
      await t.enterText(find.descendant(of: find.byType(FoodFormSliver), matching: find.byType(EditableText)).first, 'Chobani Zero');
      await t.tap(find.text('Save'));
      await until(t, () => find.text('Edit').evaluate().isNotEmpty);
      await t.pumpAndSettle();
      expect(find.text('Chobani Zero'), findsWidgets);
      expect(s.foods!.foods.map((f) => f.name), contains('Chobani Zero'));
      expect(find.byType(CustomFoodSheet), findsNothing);
      await finish(t);
    });

    testWidgets('Delete puts the sheet away and shows "Deleted Chobani" with Undo in the plate bar\'s slot; Undo brings it back where it was', (t) async {
      final s = await sheet(t, 'chobani', 'Chobani');
      final before = [for (final f in s.foods!.foods) f.id];
      await t.tap(find.text('Edit'));
      await t.pumpAndSettle();
      await t.tap(find.text('Delete'));
      await until(t, () => s.plate.deleted != null);
      await t.pumpAndSettle();
      expect(find.byType(FoodSheet), findsNothing);
      expect(find.text('Deleted Chobani'), findsOneWidget);
      expect(s.foods!.foods.map((f) => f.id), isNot(contains(before.first)));
      await t.tap(find.widgetWithText(Button, 'Undo'));
      await until(t, () => s.plate.deleted == null);
      await settle(t);
      expect([for (final f in s.foods!.foods) f.id], before);
      await finish(t);
    });
  });

  group('You -> Your foods', () {
    testWidgets('the row reads "2 foods"; the page lists newest first with calories and serving', (t) async {
      final b = await bootRecorded(t, foods: true);
      await openYou(t, b);
      expect(find.text('Your foods'), findsOneWidget);
      expect(find.text('2 foods'), findsOneWidget);
      await t.tap(find.text('Your foods'));
      await t.pumpAndSettle();
      expect(y(t, 'Chobani'), lessThan(y(t, 'Clif Bar Chocolate Chip')));
      expect(find.text('140 cal, 1 serving'), findsOneWidget);
      expect(find.text('250 cal, 1 bar (68 g)'), findsOneWidget);
      await finish(t);
    });

    testWidgets('no foods: "None yet", and the page says where they are kept', (t) async {
      await openYou(t, await bootRecorded(t));
      expect(find.text('None yet'), findsWidgets);
      await t.tap(find.text('Your foods'));
      await t.pumpAndSettle();
      expect(find.text("Foods you add that aren't on a menu are kept here."), findsOneWidget);
      await finish(t);
    });

    testWidgets('tracking off: the row is gone, and nothing is deleted', (t) async {
      final b = await bootRecorded(t, foods: true, track: false);
      await openYou(t, b);
      expect(find.text('Your foods'), findsNothing);
      expect(b.foods!.foods, hasLength(2));
      await finish(t);
    });
  });
}
