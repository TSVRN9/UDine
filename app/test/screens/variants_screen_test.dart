// Round 12 on screen (flutter-port m2-round-12-13 Task 1): a family is one row with its token, a picker in its sheet, the name follows the
// pick, the plate keeps the feed's item under the variant's name, the row follows the plate; a pho's broths and proteins are chips.
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/m2/board.dart';
import 'package:udine/screens/dish/bowl_foot.dart';
import 'package:udine/screens/dish/dish_sheet.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'dish_support.dart';
import 'support.dart';

Finder inSheet(Finder f) => find.descendant(of: find.byType(DishSheet), matching: f);
Finder rowOf(String name) => find.ancestor(of: find.textContaining(name), matching: find.byType(DishRow));

/// The list is lazy: walk it until the row is built, then bring it on screen.
Future<void> reveal(WidgetTester t, Finder f) async {
  final sc = t.state<ScrollableState>(find.descendant(of: find.byType(HallMenu), matching: find.byType(Scrollable)).first);
  for (var y = 0.0; f.evaluate().isEmpty && y < sc.position.maxScrollExtent; y += 300) {
    sc.position.jumpTo(y);
    await t.pump();
  }
  await t.ensureVisible(f);
  await t.pumpAndSettle();
}

Future<void> openRow(WidgetTester t, String name) async {
  await reveal(t, rowOf(name));
  await t.tap(rowOf(name));
  await sheetUp(t);
}

Future<void> chip(WidgetTester t, String label) async {
  final f = inSheet(find.text(label));
  await t.ensureVisible(f);
  await t.pumpAndSettle();
  await t.tap(f);
  await t.pumpAndSettle();
}

Future<void> addToPlate(WidgetTester t) async {
  // (most cafés' drinks open a builder, whose Add is the foot's; a plain dish's is under the name)
  final foot = find.descendant(of: find.byType(BowlFoot), matching: find.byType(Button));
  await t.tap(foot.evaluate().isNotEmpty ? foot : inSheet(find.text('Add to plate')));
  // (coarse steps: the sheet goes away through heights where Flutter's pinned header asserts on a frame it lands on)
  await t.pump();
  await t.pump(const Duration(seconds: 1));
  await t.pump(const Duration(seconds: 1));
}

void main() {
  setUpAll(loadFonts);

  testWidgets('a size family is one row: the family\'s name, its first size leading the meta; its sheet picks the size and the name follows', (t) async {
    final b = await bootRecorded(t);
    await openHall(t, b, '/cafe/12');
    await reveal(t, rowOf('Cappuccino'));
    expect(rowOf('Cappuccino'), findsOneWidget);
    expect(rowOf('16 oz Cappuccino'), findsNothing);
    expect(rowOf('20 oz Cappuccino'), findsNothing);
    expect(find.descendant(of: rowOf('Cappuccino'), matching: find.text('16 oz')), findsOneWidget);
    await openRow(t, 'Cappuccino');
    expect(inSheet(find.text('Cappuccino, 16 oz')), findsOneWidget);
    expect(inSheet(find.text('16 oz')), findsOneWidget);
    await chip(t, '20 oz');
    expect(inSheet(find.text('Cappuccino, 20 oz')), findsOneWidget);
    expect(inSheet(find.text('Cappuccino, 16 oz')), findsNothing);
    await addToPlate(t);
    final it = b.plate.state.plates.single.items.single;
    expect((it.key, it.name, it.refs.values.single.dishName), ('20 oz cappuccino', 'Cappuccino, 20 oz', '20 oz Cappuccino'));
    // the row now stands for the 20 oz and counts it
    expect(find.descendant(of: rowOf('Cappuccino'), matching: find.text('20 oz')), findsOneWidget);
    expect(find.descendant(of: rowOf('Cappuccino'), matching: find.text('16 oz')), findsNothing);
    await drain(t);
  });

  testWidgets('a milk family follows the plate: Oat, then Soy, then Soy removed falls back to Oat; the default again when the plate is empty', (t) async {
    final b = await bootRecorded(t);
    await openHall(t, b, '/cafe/19');
    await reveal(t, rowOf('Boba'));
    String stands() => ['Almond', 'Oat', 'Soy', 'Maple', 'Skim'].singleWhere((c) => find.descendant(of: rowOf('Boba'), matching: find.text(c)).evaluate().isNotEmpty);
    expect(stands(), 'Almond');
    for (final c in ['Oat', 'Soy']) {
      await openRow(t, 'Boba');
      await chip(t, c);
      await addToPlate(t);
      expect(stands(), c);
    }
    final soy = b.plate.state.plates.single.items.firstWhere((i) => i.name == 'Boba, Soy Milk');
    b.plate.step(b.plate.state.plates.single.id, soy.key, -1);
    b.plate.step(b.plate.state.plates.single.id, soy.key, -1);
    await t.pumpAndSettle();
    expect(stands(), 'Oat');
    b.plate.clear();
    await t.pumpAndSettle();
    expect(stands(), 'Almond');
    await drain(t);
  });

  testWidgets('a hall pho bar\'s broths are chips under the name; no chip chosen, Add waits; a chip names the bowl', (t) async {
    final b = await bootRecorded(t);
    await openHall(t, b, '/hall/hampshire?meal=lunch');
    await reveal(t, find.widgetWithText(ListRow, 'Noodle Bowl'));
    await t.tap(find.widgetWithText(ListRow, 'Noodle Bowl'));
    await sheetUp(t);
    expect(inSheet(find.text('Green Curry Pho Broth (Anchovies)')), findsOneWidget);
    expect(t.widget<BowlFoot>(find.byType(BowlFoot)).cal, 0);
    expect(inSheet(find.text('Chicken Pho Broth (Fish)')), findsOneWidget);
    // (the broths are chips now, not add-in rows)
    expect(find.byKey(const ValueKey('brow:0')), findsNothing);
    await chip(t, 'Green Curry Pho Broth (Anchovies)');
    expect(inSheet(find.text('Green Curry Pho Broth (Anchovies)')).evaluate().length, 2); // the name and the chip
    await drain(t);
  });

  testWidgets('a café\'s pho is picked by protein, then broth, 24 apart; Add waits for both and the bowl is the feed\'s pho', (t) async {
    final b = await bootRecorded(t);
    await openHall(t, b, '/cafe/7');
    await reveal(t, find.widgetWithText(ListRow, 'Noodle Bowl'));
    await t.tap(find.widgetWithText(ListRow, 'Noodle Bowl'));
    await sheetUp(t);
    expect(inSheet(find.text('Beef Pho')), findsOneWidget);
    expect(inSheet(find.text('Spicy Green Curry Broth')), findsOneWidget);
    final p = t.getRect(inSheet(find.text('Pulmuone Tofu Pho'))), br = t.getRect(inSheet(find.text('Chicken Broth')));
    expect(br.top - p.bottom, greaterThan(24), reason: 'the broth group starts a section gap below the proteins');
    await chip(t, 'Chicken Pho');
    expect(t.widget<BowlFoot>(find.byType(BowlFoot)).cal, 0, reason: 'one chosen: Add still waits');
    await chip(t, 'Vegetable Broth');
    expect(inSheet(find.text('Chicken Pho w/Vegetable Broth')), findsOneWidget);
    await drain(t);
  });
}
