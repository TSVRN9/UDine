// M2 R12c on screen: a nutrient the feed leaves blank is drawn "–" on the row, the sheet's label, the plate bar, the plate's row and totals,
// and an add-on with no calories is offered with "–" (recorded data, the 20 oz Chai at Worcester Café, picked in the Chai family's sheet).
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/dish/bowl_foot.dart';
import 'package:udine/screens/dish/dish_sheet.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/screens/plate/plate_bar.dart';
import 'package:udine/screens/plate/plate_row.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'dish_support.dart';
import 'support.dart';

const cafe = '/cafe/12?meal=all';

/// Scrolls the café's list to the row whose name reads `name` (a dish, or a family) and returns it.
Future<Finder> rowOf(WidgetTester t, String name) async {
  final row = find.byWidgetPredicate((w) => w is DishRow && (w.family ?? w.dish.dishName) == name);
  await t.dragUntilVisible(row, find.byType(Scrollable).first, const Offset(0, -300));
  await Scrollable.ensureVisible(t.element(row), alignment: 0.3); // (clear of the tab bar)
  await t.pumpAndSettle();
  return row;
}

Finder inSheet(Finder f) => find.descendant(of: find.byType(DishSheet), matching: f);

/// Opens the Chai family (round 12: one row, its smallest size first) and picks its 20 oz.
Future<Finder> chai20(WidgetTester t) async {
  final row = await rowOf(t, 'Chai');
  await t.tap(row, warnIfMissed: false);
  await t.pump();
  await sheetUp(t);
  final c = inSheet(find.text('20 oz'));
  await t.ensureVisible(c);
  await t.pumpAndSettle();
  await t.tap(c);
  await t.pumpAndSettle();
  expect(inSheet(find.text('Chai, 20 oz')), findsOneWidget);
  return row;
}

/// Adds the sheet's dish: a café drink's Add is its builder's foot, a plain dish's is under the name.
Future<void> addFromSheet(WidgetTester t) async {
  final foot = find.descendant(of: find.byType(BowlFoot), matching: find.byType(Button));
  await t.tap(foot.evaluate().isNotEmpty ? foot : inSheet(find.text('Add to plate')));
  // (coarse steps: the sheet goes away through heights where Flutter's pinned header asserts on a frame it lands on)
  await t.pump();
  await t.pump(const Duration(seconds: 1));
  await t.pump(const Duration(seconds: 1));
  await t.pumpAndSettle();
}

void main() {
  setUpAll(loadFonts);

  testWidgets('Chai 20 oz: "–" on the sheet\'s label, and "– cal – protein" on its row once the plate holds it', (t) async {
    final boot = await bootRecorded(t);
    await openHall(t, boot, cafe);
    final row = await chai20(t);
    expect(inSheet(find.text('–')), findsWidgets);
    expect(inSheet(find.text('0')), findsNothing, reason: 'the label\'s Calories');

    await addFromSheet(t);
    expect(find.descendant(of: row, matching: find.text('20 oz')), findsOneWidget, reason: 'the row stands for the 20 oz the plate holds');
    expect(find.descendant(of: row, matching: find.text('–')), findsNWidgets(2));
    expect(find.descendant(of: row, matching: find.text('0')), findsNothing);
    await drain(t);
  });

  testWidgets('Chai 20 oz on the plate: "–" in the bar, "– cal each" on its row, "–" in all four of the totals', (t) async {
    final boot = await bootRecorded(t);
    await openHall(t, boot, cafe);
    await chai20(t);
    await addFromSheet(t);
    expect(boot.plate.state.plates, hasLength(1));
    expect(find.descendant(of: find.byType(PlateBar), matching: find.text('–', findRichText: true)), findsNWidgets(2));
    expect(find.descendant(of: find.byType(PlateBar), matching: find.text('0g', findRichText: true)), findsNothing);

    await t.tap(find.byType(PlateBar));
    await t.pumpAndSettle();
    expect(find.descendant(of: find.byType(PlateRow), matching: find.text('– cal each', findRichText: true)), findsOneWidget);
    expect(find.descendant(of: find.byType(Facts), matching: find.text('–')), findsNWidgets(4));
    await drain(t);
  });

  testWidgets('a recorded 0 stays 0: the 16 oz Cappuccino reads 0 cal', (t) async {
    final boot = await bootRecorded(t);
    await openHall(t, boot, cafe);
    final row = await rowOf(t, 'Cappuccino'); // (the family's row stands for its 16 oz)
    expect(find.descendant(of: row, matching: find.text('0')), findsOneWidget);
    expect(find.descendant(of: row, matching: find.text('–')), findsNothing);
    await drain(t);
  });

  testWidgets('Whitmore\'s Add-ons offer "Add Crispy Chicken" with – for its calories', (t) async {
    final boot = await bootRecorded(t);
    await openHall(t, boot, '/cafe/20?meal=all&dish=${Uri.encodeQueryComponent('Buffalo Chicken Salad Wrap')}');
    await sheetUp(t);
    final brow = find.ancestor(of: find.text('Add Crispy Chicken', findRichText: true), matching: find.byWidgetPredicate((w) => w.key.toString().startsWith("[<'brow:")));
    expect(brow, findsOneWidget);
    expect(find.descendant(of: brow, matching: find.text('–')), findsOneWidget);
    await drain(t);
  });
}
