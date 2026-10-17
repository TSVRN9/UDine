// "Where it's served" (M2 `act==='srv'`): the sheet goes down and, once it is half-way out, the place arrives at the dish. The place and
// day already showing scroll in place; any other is pushed at its day and meal, scrolled to the dish with its row tinted.
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/dish/dish_sheet.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import '../fonts.dart';
import 'dish_support.dart';
import 'support.dart';

void main() {
  setUpAll(loadFonts);

  testWidgets('the place and day already showing: the list scrolls to the dish, in place, and no page is pushed', (t) async {
    await openHall(t, await bootRecorded(t), dishRoute('Pork Adobada (Chicken)'));
    await sheetUp(t);
    expect(find.byType(HallMenu), findsOneWidget);
    expect(top(t).atTop, isTrue);
    await tapChip(t, 'Worcester');
    expect(find.byType(DishSheet), findsNothing);
    expect(find.byType(HallMenu, skipOffstage: false), findsOneWidget);
    expect(top(t).atTop, isFalse, reason: 'a dish far down the list is brought up');
    expect(here(t)?.dish.dishName, 'Pork Adobada (Chicken)');
    await drain(t);
  });

  testWidgets('another place: it is pushed on a lunch at Berkshire, already at the dish, the row tinted', (t) async {
    await openHall(t, await bootRecorded(t), dishRoute('Black Bean Burger'));
    await sheetUp(t);
    await tapChip(t, 'Berkshire');
    expect(find.byType(DishSheet), findsNothing);
    expect(find.byType(HallMenu, skipOffstage: false), findsNWidgets(2));
    expect(top(t).place, 'B');
    expect(top(t).debugDay, 0);
    expect(here(t)?.dish.dishName, 'Black Bean Burger');
    await drain(t);
  });

  testWidgets('a later day: tomorrow\'s breakfast at Franklin opens on that day, at the dish', (t) async {
    await openHall(t, await bootRecorded(t), dishRoute('Tofu Scramble', meal: 'breakfast', day: '2026-10-09'));
    await sheetUp(t);
    expect(find.text('Add to plate'), findsNothing);
    await tapChip(t, 'Franklin');
    expect(top(t).place, 'F');
    expect(top(t).debugDay, 1);
    expect(here(t)?.dish.dishName, 'Tofu Scramble');
    await drain(t);
  });
}
