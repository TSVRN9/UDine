import 'dart:async';

import 'package:flutter/widgets.dart';

import '../../core/m2/board.dart';
import '../../core/types.dart';
import '../../core/m2/where.dart' show boardDay;
import '../../data/repository.dart' show HoursData, Loaded, LoadedOffline;
import '../../shell/app_scope.dart';
import '../../shell/shell_scope.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';
import '../hall/hall_controller.dart';
import 'dish_sheet.dart';

/// A favourite-alert tap: the sheet of the dish the notification names, opened as a tap on it in that hall's menu opens it. Today's menus
/// (saved at launch) say which hall serves it; a dish not served today has no menu entry, so its sheet opens on a bare record at Worcester
/// (every figure "–", its where line "Not on the menu again today or tomorrow").
Future<void> openAlertDish(BuildContext context, String name) async {
  final scope = AppScope.of(context), shell = ShellScope.of(context), repo = scope.repo, today = repo.today;
  final got = await repo.prefetchMenus([for (final h in diningHalls) (h.tid, today)]);
  if (!context.mounted) return;
  MenuItem? dish;
  var place = halls.first, meal = 'lunch';
  for (var i = 0; i < halls.length && dish == null; i++) {
    final items = got[(diningHalls[i].tid, today)] ?? const <MenuItem>[];
    for (final m in mealsOfItems(items, hall: true).entries) {
      for (final s in m.value) {
        for (final d in s.dishes) {
          if (dish == null && dishKey(d.dishName) == dishKey(name)) (dish, place, meal) = (d, halls[i], m.key);
        }
      }
    }
  }
  dish ??= MenuItem(
    dishName: name, category: '', mealPeriod: MealPeriod.lunch, hallTid: diningHalls.first.tid, date: today, allergens: const [], dietTags: const [],
    nutrition: const NutritionFacts(
      servingSize: '', calories: 0, caloriesFromFat: 0, totalFatG: 0, satFatG: 0, transFatG: 0, cholesterolMg: 0, sodiumMg: 0, totalCarbG: 0, dietaryFiberG: 0, sugarsG: 0, proteinG: 0,
      blank: {'calories', 'caloriesFromFat', 'totalFatG', 'satFatG', 'transFatG', 'cholesterolMg', 'sodiumMg', 'totalCarbG', 'dietaryFiberG', 'sugarsG', 'proteinG'},
    ),
  );
  // The place's own controller supplies the hours, grab windows and café ids "where" reads (as the plate's dish rows do); slow hours open the sheet without them.
  final c = HallController(repo, place), ready = Completer<void>();
  void check() {
    if ((c.hours is Loaded<HoursData> || c.hours is LoadedOffline<HoursData>) && !ready.isCompleted) ready.complete();
  }

  c.addListener(check);
  check();
  await ready.future.timeout(msOf(M2Motion.netSlow), onTimeout: () {});
  c.removeListener(check);
  if (!context.mounted) return c.dispose();
  openDishSheet(
    context, dish: dish, place: place, meal: meal, day: 0, fx: c.board, cafeIds: c.cafeIds, avoid: scope.prefs.diet.avoid, onClosed: c.dispose,
    onServe: (p, g) => shell.openPlace(p, meal: g.meal, day: boardDay(c.board, g), dish: dish!.key),
  );
}
