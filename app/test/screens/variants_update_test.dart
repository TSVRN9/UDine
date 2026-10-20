// Round 12's remaining paths on screen: Update from the plate (the plate row's sheet, the picker, the merge into a twin), a pick keeping
// the builder's add-ins, a starred family named in You > Favorites, and a family's names in history from the menus saved on the device.
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/boot.dart' show Boot;
import 'package:udine/core/m2/variants.dart';
import 'package:udine/core/types.dart';
import 'package:udine/data/repository.dart';
import 'package:udine/motion/routes.dart';
import 'package:udine/screens/you/day_page.dart';
import 'package:udine/screens/dish/bowl_foot.dart';
import 'package:udine/screens/dish/dish_sheet.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/screens/plate/plate_row.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'dish_support.dart';
import 'plate_support.dart';
import 'support.dart';

Finder inSheet(Finder f) => find.descendant(of: find.byType(DishSheet), matching: f);

Future<void> reveal(WidgetTester t, Finder f) async {
  final sc = t.state<ScrollableState>(find.descendant(of: find.byType(HallMenu), matching: find.byType(Scrollable)).first);
  for (var y = 0.0; f.evaluate().isEmpty && y < sc.position.maxScrollExtent; y += 300) {
    sc.position.jumpTo(y);
    await t.pump();
  }
  await t.ensureVisible(f);
  await t.pumpAndSettle();
}

Future<void> away(WidgetTester t) async {
  // (coarse steps: the sheet goes away through heights where Flutter's pinned header asserts on a frame it lands on)
  await t.pump();
  await t.pump(const Duration(seconds: 1));
  await t.pump(const Duration(seconds: 1));
}

Future<void> chip(WidgetTester t, String label) async {
  await t.tap(inSheet(find.text(label)));
  await t.pumpAndSettle();
}

final capRow = find.byWidgetPredicate((w) => w is DishRow && w.family == 'Cappuccino');

/// Worcester Café's Cappuccino (the plain 16 oz, added from its sheet), the row stepped to [qty16], and optionally a 20 oz added from its sheet.
Future<dynamic> setUp(WidgetTester t, {required double qty16, bool twin = false}) async {
  final b = await bootRecorded(t);
  await openHall(t, b, '/cafe/12');
  await reveal(t, capRow);
  await t.tap(capRow);
  await sheetUp(t);
  await t.tap(find.descendant(of: find.byType(BowlFoot), matching: find.byType(Button)));
  await away(t);
  for (var i = 1; i < qty16; i++) {
    b.plate.step(b.plate.state.plates.single.id, '16 oz cappuccino', 1);
  }
  await t.pumpAndSettle();
  if (twin) {
    await t.tap(capRow);
    await sheetUp(t);
    await chip(t, '20 oz');
    await t.tap(find.descendant(of: find.byType(BowlFoot), matching: find.byType(Button)));
    await away(t);
  }
  return b;
}

Future<void> openFromPlate(WidgetTester t, String name) async {
  await t.tap(inBar(find.textContaining(RegExp(r'items?$'))));
  await t.pumpAndSettle();
  await t.tap(find.widgetWithText(PlateRow, name));
  await sheetUp(t);
}

/// Starts priming (in real time: it reads the device's saved menus) and frames it until it is done.
Future<void> prime(WidgetTester t, Boot b, {Future<void> Function()? beforeFirstFrame}) async {
  var done = false;
  b.primeShownNames().then((_) => done = true);
  await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 100)));
  await beforeFirstFrame?.call();
  for (var i = 0; i < 300 && !done; i++) {
    await t.pump(); // (the first frame starts the work; the rest let its fake-zone steps and the store's real reads meet)
    await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 10)));
  }
  expect(done, isTrue);
}

void main() {
  setUpAll(loadFonts);

  testWidgets('a family item on the plate reopens with Update; another size and Update make it that item, keeping its servings', (t) async {
    final b = await setUp(t, qty16: 2);
    await openFromPlate(t, 'Cappuccino, 16 oz');
    expect(find.widgetWithText(Button, 'Update'), findsOneWidget);
    expect(inSheet(find.text('Add another')), findsNothing);
    await chip(t, '20 oz');
    await t.tap(find.widgetWithText(Button, 'Update'));
    await away(t);
    final it = b.plate.state.plates.single.items.single;
    expect((it.key, it.name, it.qty, it.refs.values.single.dishName), ('20 oz cappuccino', 'Cappuccino, 20 oz', 2.0, '20 oz Cappuccino'));
    await drain(t);
  });

  testWidgets('Update onto a size already on the plate merges the two: one item, the servings together', (t) async {
    final b = await setUp(t, qty16: 2, twin: true);
    expect(b.plate.state.plates.single.items.length, 2);
    await openFromPlate(t, 'Cappuccino, 16 oz');
    await chip(t, '20 oz');
    await t.tap(find.widgetWithText(Button, 'Update'));
    await away(t);
    final it = b.plate.state.plates.single.items.single;
    expect((it.key, it.qty), ('20 oz cappuccino', 3.0));
    await drain(t);
  });

  testWidgets('picking another size keeps the add-ins chosen: the foot still sums them and the row still counts one', (t) async {
    final b = await bootRecorded(t);
    await openHall(t, b, '/cafe/12?dish=${Uri.encodeQueryComponent('16 oz Cappuccino')}');
    await sheetUp(t);
    final ctl = find.descendant(of: find.byKey(const ValueKey('brow:0')), matching: find.byType(RowControl));
    final r = t.getRect(ctl);
    await t.tapAt(Offset(r.right - 24, r.center.dy));
    await t.pumpAndSettle();
    final cal = t.widget<BowlFoot>(find.byType(BowlFoot)).cal;
    expect(cal, greaterThan(0));
    await chip(t, '20 oz');
    expect(t.widget<RowControl>(ctl).qty, 1);
    expect(t.widget<BowlFoot>(find.byType(BowlFoot)).cal, cal);
    await drain(t);
  });

  testWidgets('a starred family reads by its name in You > Favorites, never with the f: it is stored under', (t) async {
    final b = await bootRecorded(t);
    await t.runAsync(() => b.prefs.toggleFavorite('f:Boba'));
    await openApp(t, b, route: '/you/favs');
    await t.pumpAndSettle();
    expect(find.text('Boba'), findsOneWidget);
    expect(find.textContaining('f:'), findsNothing);
    await drain(t);
  });

  testWidgets('a restart reads the menus saved on the device: a past "20 oz Cappuccino" is named for its family before any board opens', (t) async {
    final b = await bootRecorded(t);
    await openPlace(t, b, 'c12'); // (the café's menu is saved on the device as it loads)
    forgetShownNames(); // the restart: nothing this session has shown yet
    expect(shownName('20 oz Cappuccino'), '20 oz Cappuccino');
    await prime(t, b);
    expect(shownName('20 oz Cappuccino'), 'Cappuccino, 20 oz');
    await drain(t);
  });

  testWidgets('priming waits for the first frame: no saved menu is parsed before it', (t) async {
    final b = await bootRecorded(t);
    await openPlace(t, b, 'c12');
    Repository.savedMenuParses = 0;
    await prime(t, b, beforeFirstFrame: () async => expect(Repository.savedMenuParses, 0, reason: 'no frame yet'));
    expect(Repository.savedMenuParses, greaterThan(0));
    await drain(t);
  });

  testWidgets('a meal opened before priming lands re-reads its names with no other action', (t) async {
    final b = await bootRecorded(t);
    await openPlace(t, b, 'c12');
    forgetShownNames();
    await t.runAsync(() async {
      await b.store!.addEntries([
        LogEntry(
          id: 'c0', loggedAt: '2026-10-08T12:20:00.000', servings: 1,
          source: const UmassMenuSource(dishName: '20 oz Cappuccino', hallTid: 1),
          nutrition: const NutritionFacts(servingSize: '', calories: 0, caloriesFromFat: 0, totalFatG: 0, satFatG: 0, transFatG: 0, cholesterolMg: 0, sodiumMg: 0, totalCarbG: 0, dietaryFiberG: 0, sugarsG: 0, proteinG: 0),
        ),
      ]);
      await b.log!.reload();
    });
    Nav.push<void>(t.element(find.byType(HallMenu).last), (_) => const DayPage(top: 24, day: '2026-10-08'));
    await t.pumpAndSettle();
    await t.tap(find.text('Lunch at Worcester'));
    await t.pumpAndSettle();
    expect(find.text('20 oz Cappuccino'), findsOneWidget);
    await prime(t, b);
    await t.pumpAndSettle();
    expect(find.text('Cappuccino, 20 oz'), findsOneWidget);
    expect(find.text('20 oz Cappuccino'), findsNothing);
    await drain(t);
  });
}
