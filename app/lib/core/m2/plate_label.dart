import '../types.dart';
import 'dish_sheet.dart';
import 'plate.dart';
import '../../ui/label_model.dart';

/// M2 `openPlateLabel`: the Nutrition Facts panel summed over a plate, quantities included. Each nutrient adds the dish's figure x qty
/// (the serving at the plate's first place, as `macroOf`); a custom food has only calories and the three macros, so it adds those
/// and nothing else. No serving row, no published %DV (every one is computed from the FDA base), and no carbon grade: grades are per
/// kg of food and do not sum.
Label plateLabelRows(Plate p, [String? hall]) {
  hall ??= plateHalls(p)?.firstOrNull;
  double fat = 0, ff = 0, sat = 0, trans = 0, chol = 0, sod = 0, carb = 0, fib = 0, sug = 0, pro = 0;
  for (final it in p.items) {
    final m = macroOf(it, hall), q = it.qty;
    final food = it.food;
    if (it.custom != null && food == null) {
      fat += m.f * q; carb += m.c * q; pro += m.p * q;
      continue;
    }
    final n = food?.nutrition ?? (it.refs[hall] ?? it.refs.values.first).nutrition;
    fat += n.totalFatG * q; ff += n.caloriesFromFat * q; sat += n.satFatG * q; trans += n.transFatG * q; chol += n.cholesterolMg * q;
    sod += n.sodiumMg * q; carb += n.totalCarbG * q; fib += n.dietaryFiberG * q; sug += n.sugarsG * q; pro += n.proteinG * q;
  }
  return labelRowsOf(NutritionFacts(
    servingSize: '', calories: totals(p, hall).cal, caloriesFromFat: ff, totalFatG: fat, satFatG: sat, transFatG: trans, cholesterolMg: chol,
    sodiumMg: sod, totalCarbG: carb, dietaryFiberG: fib, sugarsG: sug, proteinG: pro,
  ));
}
