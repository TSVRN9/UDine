import 'package:flutter_test/flutter_test.dart';
import 'package:udine/boot.dart';
import 'package:udine/core/m2/board.dart';
import 'package:udine/data/repository.dart';
import 'package:udine/screens/dish/dish_sheet.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/ui/ui.dart';
import 'support.dart';

/// `/hall/worcester?meal=lunch&dish=<name>`: the hall with that dish's sheet open over it.
String dishRoute(String name, {String place = 'worcester', String meal = 'lunch', String? day}) =>
    '/hall/$place?meal=$meal${day == null ? '' : '&day=$day'}&dish=${Uri.encodeQueryComponent(name)}';

/// Waits for the dish sheet and its "where" answer (the halls' menus come from the cache), then lets it settle.
Future<void> sheetUp(WidgetTester t) async {
  await until(t, () => find.byType(DishSheet).evaluate().isNotEmpty && find.byType(HallChip).evaluate().isNotEmpty);
  await t.pumpAndSettle();
}

/// A hall's lunch dishes for a day, as the repository has them.
Future<List<MenuItem>> lunchDishes(WidgetTester t, Boot boot, int tid, String iso) async {
  final s = await t.runAsync(() => boot.repo.menu(tid, iso).firstWhere((s) => s is Loaded<List<MenuItem>>));
  return [for (final d in (s! as Loaded<List<MenuItem>>).value) if (d.mealPeriod.name == 'lunch') d];
}

/// The menu on top: the last HallMenu in the tree is the page pushed last.
HallMenuState top(WidgetTester t) => t.state<HallMenuState>(find.byType(HallMenu).last);

/// The serving a where-served tap landed on, tinted.
DishRow? here(WidgetTester t) => t.widgetList<DishRow>(find.byType(DishRow)).where((r) => r.here).firstOrNull;

/// Taps the place's chip in the sheet; the sheet leaves, and the place arrives once its list is in.
Future<void> tapChip(WidgetTester t, String name) async {
  final chip = find.descendant(of: find.byType(DishSheet), matching: find.byWidgetPredicate((w) => w is HallChip && w.name == name));
  await t.ensureVisible(chip);
  await t.pumpAndSettle();
  await t.tap(chip);
  await until(t, () => here(t) != null);
  await t.pumpAndSettle();
}
