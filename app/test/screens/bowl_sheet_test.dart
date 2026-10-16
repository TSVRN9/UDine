// The builder in the dish sheet (flutter-port-bowls Task 2): what + does, what Add and Update do to the plate, a synthetic base's Add off at 0,
// a plain dish on the plate opening as itself.
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/m2/board.dart';
import 'package:udine/core/m2/bowl.dart' show withLine;
import 'package:udine/screens/dish/bowl_foot.dart';
import 'package:udine/screens/dish/dish_sheet.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/screens/plate/plate_row.dart';
import 'package:udine/theme/tokens.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'dish_support.dart';
import 'plate_support.dart';
import 'support.dart';

Future<void> plus(WidgetTester t, int i, [int times = 1]) async {
  for (var k = 0; k < times; k++) {
    final r = t.getRect(find.descendant(of: find.byKey(ValueKey('brow:$i')), matching: find.byType(RowControl)));
    await t.tapAt(Offset(r.right - 24, r.center.dy));
    await t.pumpAndSettle();
  }
}

int partIndex(WidgetTester t, String name) => t.widget<DishSheet>(find.byType(DishSheet)).build!.parts.indexWhere((x) => x.dishName == name);

Finder get foot => find.byType(BowlFoot);
Finder get footAdd => find.descendant(of: foot, matching: find.byType(Button));

void main() {
  setUpAll(loadFonts);

  testWidgets('Add puts the bowl on the plate as one item named for its base with a "with" line; the row\'s + is still the plain dish', (t) async {
    final b = await bootRecorded(t);
    await openHall(t, b, dishRoute('Beef Brisket Noodle Bowl'));
    await sheetUp(t);
    expect(t.widget<BowlFoot>(foot).update, isFalse);
    await plus(t, partIndex(t, 'Hard Boiled Egg'));
    await plus(t, partIndex(t, 'Scallions'));
    expect(t.widget<BowlFoot>(foot).cal, 334);
    await t.tap(footAdd);
    await t.pumpAndSettle();
    final it = b.plate.state.plates.single.items.single;
    expect(it.name, 'Beef Brisket Noodle Bowl');
    expect(it.key, startsWith('bowl:'));
    expect(withLine(it.bowl!.bowl.parts), 'with Hard Boiled Egg, Scallions');
    expect(find.byType(DishSheet), findsNothing);
    await drain(t);
  });

  testWidgets('Add with nothing chosen is the plain dish (its row\'s stepper goes to 1); Add reads Add, never Update', (t) async {
    final b = await bootRecorded(t);
    await openHall(t, b, dishRoute('Beef Brisket Noodle Bowl'));
    await sheetUp(t);
    await t.tap(footAdd);
    await t.pumpAndSettle();
    final it = b.plate.state.plates.single.items.single;
    expect(it.key, dishKey('Beef Brisket Noodle Bowl'));
    expect(it.bowl, isNull);
    await drain(t);
  });

  testWidgets('a synthetic base keeps Add off at 0: a tap on it adds nothing; one part turns it on and the plate item is named for the bar', (t) async {
    final b = await bootRecorded(t);
    await openHall(t, b, '/hall/franklin?meal=lunch');
    final row = find.widgetWithText(ListRow, 'Deli Bar'), sc = t.state<ScrollableState>(find.descendant(of: find.byType(HallMenu), matching: find.byType(Scrollable)).first);
    for (var y = 0.0; row.evaluate().isEmpty && y < sc.position.maxScrollExtent; y += 300) {
      sc.position.jumpTo(y);
      await t.pump();
    }
    await Scrollable.ensureVisible(t.element(row), alignment: 0.5);
    await t.pumpAndSettle();
    await t.tap(row);
    await sheetUp(t);
    expect(t.widget<BowlFoot>(foot).off, isTrue);
    expect(t.widget<Opacity>(find.ancestor(of: footAdd, matching: find.byType(Opacity)).first).opacity, M2Opacity.footDisabled);
    await t.tap(footAdd);
    await t.pumpAndSettle();
    expect(b.plate.state.plates, isEmpty);
    await plus(t, 0);
    expect(t.widget<BowlFoot>(foot).off, isFalse);
    expect(t.widget<Opacity>(find.ancestor(of: footAdd, matching: find.byType(Opacity)).first).opacity, 1);
    await t.tap(footAdd);
    await t.pumpAndSettle();
    expect(b.plate.state.plates.single.items.single.name, 'Deli Bar');
    await drain(t);
  });

  testWidgets('a bowl on the plate reopens with Update; Update replaces it where it is', (t) async {
    final b = await openPlate(t, route: '/plate?seed=bowls');
    await t.tap(inBar(find.textContaining(RegExp(r'items?$'))));
    await t.pumpAndSettle();
    final before = [for (final i in b.plate.state.plates.single.items) i.key];
    await t.tap(find.byType(PlateRow).first);
    await sheetUp(t);
    expect(find.widgetWithText(Button, 'Update'), findsOneWidget);
    await plus(t, partIndex(t, 'Hard Boiled Egg'));
    await t.tap(footAdd);
    await t.pumpAndSettle();
    final items = b.plate.state.plates.single.items;
    expect(items.length, 3);
    expect(items[0].key, isNot(before[0]));
    expect(items[1].key, before[1]);
    expect(withLine(items[0].bowl!.bowl.parts), 'with Bean Sprouts, 2 × Chopped Cilantro, Hard Boiled Egg');
    await drain(t);
  });

  testWidgets('a plain dish on the plate opens as itself (Add another), not as the builder', (t) async {
    await openPlate(t);
    await t.tap(inBar(find.textContaining(RegExp(r'items?$'))));
    await t.pumpAndSettle();
    await t.tap(find.byType(PlateRow).first);
    await sheetUp(t);
    expect(find.text('Add another'), findsOneWidget);
    expect(foot, findsNothing);
    await drain(t);
  });
}
