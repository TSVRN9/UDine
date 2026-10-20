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
  var known = false;
  for (final it in p.items) {
    final m = macroOf(it, hall), q = it.qty;
    final food = it.food;
    if (it.custom != null && food == null) {
      fat += (m.f ?? 0) * q; carb += (m.c ?? 0) * q; pro += (m.p ?? 0) * q;
      known = true;
      continue;
    }
    final n = food?.nutrition ?? (it.refs[hall] ?? it.refs.values.first).nutrition;
    double g(String f, num x) {
      if (n.blank.contains(f)) return 0;
      known = true;
      return x * q;
    }
    fat += g('totalFatG', n.totalFatG); ff += g('caloriesFromFat', n.caloriesFromFat); sat += g('satFatG', n.satFatG); trans += g('transFatG', n.transFatG);
    chol += g('cholesterolMg', n.cholesterolMg); sod += g('sodiumMg', n.sodiumMg); carb += g('totalCarbG', n.totalCarbG); fib += g('dietaryFiberG', n.dietaryFiberG);
    sug += g('sugarsG', n.sugarsG); pro += g('proteinG', n.proteinG);
  }
  final cal = totals(p, hall).cal;
  // M2: nothing known on the plate is "–" down the whole label, not 0
  return labelRowsOf(NutritionFacts(
    servingSize: '', calories: cal ?? 0, caloriesFromFat: ff, totalFatG: fat, satFatG: sat, transFatG: trans, cholesterolMg: chol,
    sodiumMg: sod, totalCarbG: carb, dietaryFiberG: fib, sugarsG: sug, proteinG: pro,
    blank: {
      if (cal == null) 'calories',
      if (!known) ...const ['caloriesFromFat', 'totalFatG', 'satFatG', 'transFatG', 'cholesterolMg', 'sodiumMg', 'totalCarbG', 'dietaryFiberG', 'sugarsG', 'proteinG'],
    },
  ));
}
