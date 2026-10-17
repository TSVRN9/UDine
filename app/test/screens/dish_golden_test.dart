import 'package:flutter_test/flutter_test.dart';
import 'package:udine/app.dart';
import 'package:udine/boot.dart';
import 'package:udine/core/m2/board.dart';
import 'package:udine/screens/dish/dish_sheet.dart';
import 'package:udine/screens/dish/full_label.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'dish_support.dart';
import 'support.dart';

// Every dish-sheet and label state of the brief at 360 and 390 dp, over M2's recordings and the fixed clock (Thursday Oct 8, 12:41).
// Photos are UMass's and never committed: the hall behind the sheet shows its maroon ground.
void main() {
  setUpAll(loadFonts);

  for (final w in [360.0, 390.0]) {
    final n = w.toInt();

    Future<void> shot(WidgetTester t, String name, String route, {Boot? boot, bool health = false, bool carbon = false, Future<void> Function(WidgetTester t, Boot b)? act, bool sheet = true}) async {
      final b = boot ?? await bootRecorded(t, health: health, carbon: carbon);
      await openHall(t, b, route, w: w);
      if (sheet) await sheetUp(t);
      await act?.call(t, b);
      await t.pumpAndSettle();
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/dish_${name}_$n.png'));
      await drain(t);
    }

    Future<void> up(WidgetTester t) async {
      await t.flingFrom(Offset(w / 2, 600), const Offset(0, -600), 1800);
      await t.pumpAndSettle();
    }

    Future<void> reveal(WidgetTester t, Finder f) async {
      await up(t);
      await t.ensureVisible(f);
      await t.pumpAndSettle();
    }

    const golden = 'Golden BBQ Chicken Thigh';
    testWidgets('a hall dish, $n dp', (t) => shot(t, 'hall', dishRoute(golden)));
    testWidgets('a hall dish with the scores on, $n dp', (t) => shot(t, 'scores', dishRoute(golden), health: true, carbon: true));
    testWidgets('the favourite star on, $n dp', (t) => shot(t, 'fav_on', dishRoute(golden), act: (t, b) async {
          await t.tap(find.byType(FavoriteStar));
          await t.pumpAndSettle();
        }));
    testWidgets('a dish with no marks and no scores, $n dp', (t) async {
      final b = await bootRecorded(t, health: true, carbon: true);
      await openHall(t, b, '/hall/worcester?meal=lunch', w: w);
      final d = (await lunchDishes(t, b, 1, '2026-10-08')).first;
      // (every dish in the recording is scored: this is the same dish with its marks and ratings taken off)
      final bare = MenuItem(dishName: d.dishName, category: d.category, mealPeriod: d.mealPeriod, hallTid: d.hallTid, date: d.date, nutrition: d.nutrition, allergens: const [], dietTags: const []);
      openDishSheet(t.element(find.byType(HallMenu)), dish: bare, place: 'W', meal: 'lunch', day: 0, fx: (t.state(find.byType(HallMenu)) as HallMenuState).fx, onServe: (_, _) {});
      await sheetUp(t);
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/dish_unscored_$n.png'));
      await drain(t);
    });
    testWidgets('an avoided allergen in Contains, $n dp', (t) async {
      final b = await bootRecorded(t);
      await openHall(t, b, '/hall/worcester?meal=lunch', w: w);
      final d = (await lunchDishes(t, b, 1, '2026-10-08')).firstWhere((d) => d.allergens.length >= 2);
      openDishSheet(t.element(find.byType(HallMenu)), dish: d, place: 'W', meal: 'lunch', day: 0, fx: (t.state(find.byType(HallMenu)) as HallMenuState).fx, avoid: [d.allergens.first], onServe: (_, _) {});
      await sheetUp(t);
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/dish_avoid_$n.png'));
      await drain(t);
    });
    // (the Terrace's breakfast sandwich, M2's first café dish with a price today: a café dish whose meal has add-ons opens the builder instead)
    testWidgets('a café dish with its price, $n dp', (t) => shot(t, 'cafe', '/cafe/27?meal=breakfast&dish=${Uri.encodeQueryComponent('Bacon, Egg & Cheese on English Muffin')}'));
    testWidgets('ingredients cut to three lines, $n dp', (t) => shot(t, 'ing_closed', dishRoute(golden), act: (t, b) => reveal(t, find.text('Show all'))));
    testWidgets('ingredients open, $n dp', (t) => shot(t, 'ing_open', dishRoute(golden), act: (t, b) async {
          await reveal(t, find.text('Show all'));
          await t.tap(find.text('Show all'));
          await t.pumpAndSettle();
          await t.ensureVisible(find.text('Show less'));
        }));
    testWidgets('scrolled to the label at the top detent (the name stays pinned), $n dp', (t) => shot(t, 'label', dishRoute(golden), health: true, carbon: true, act: (t, b) => reveal(t, find.byType(RatingsPanel))));
    testWidgets('where it is served: one place, $n dp', (t) => shot(t, 'where_one', dishRoute('Pork Adobada (Chicken)')));
    testWidgets('where it is served: two places, $n dp', (t) => shot(t, 'where_two', dishRoute('Black Bean Burger')));
    testWidgets('where it is served: tomorrow, $n dp', (t) => shot(t, 'where_tomorrow', dishRoute('Tofu Scramble', meal: 'breakfast', day: '2026-10-09')));
    testWidgets('where it is served: the same place, the list brought to the dish, $n dp', (t) => shot(t, 'where_here', dishRoute('Pork Adobada (Chicken)'), sheet: true, act: (t, b) => tapChip(t, 'Worcester')));
    testWidgets('where it is served: another place, pushed at the dish, $n dp', (t) => shot(t, 'where_pushed', dishRoute('Black Bean Burger'), act: (t, b) => tapChip(t, 'Berkshire')));

    testWidgets('the plate\'s Full label (benchmark plate), $n dp', (t) async {
      final b = await bootRecorded(t);
      await openHall(t, b, '/hall/worcester?meal=lunch', w: w);
      final menu = t.state<HallMenuState>(find.byType(HallMenu));
      final items = await lunchDishes(t, b, 1, '2026-10-08');
      MenuItem item(String name) => items.firstWhere((d) => d.dishName == name);
      for (final name in ['Beef Brisket Noodle Bowl', golden, golden]) {
        b.plate.add('lunch', name, {'W': item(name)});
      }
      openPlateLabel(t.element(find.byType(HallMenu)), plate: b.plate.state.plates.single, fx: menu.fx);
      await t.pumpAndSettle();
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/label_plate_$n.png'));
      await drain(t);
    });
  }
}
