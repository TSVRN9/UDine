import '../../ui/label_model.dart';
import '../types.dart';
import 'board.dart';

/// M2 `dishMid`: the sheet's resting height ends on the label's rule under Calories, then a 6 dp sliver (never half a line),
/// and never past the top detent (`winH - top - 8`).
double restingSnap({required double calBottom, required double grab, required double winH, required double top}) {
  final want = grab + calBottom + 6, cap = winH - top - 8;
  return want < cap ? want : cap;
}

/// M2's `.mks` row: the dish's marks, then its score tiles per the You toggles. Null when there is nothing in it, so no row and
/// no empty slot. An unscored kind never draws (a healthfulness 0 is a real score).
({List<String> marks, int? health, String? carbon})? sheetMarks(MenuItem d, ({bool health, bool carbon}) on) {
  final marks = [if (d.diet & 2 != 0) 'plant' else if (d.diet & 1 != 0) 'veg', if (d.diet & 4 != 0) 'halal', if (d.diet & 8 != 0) 'local', if (d.diet & 16 != 0) 'sus'];
  final h = on.health ? d.health : null, c = on.carbon ? d.carbon : null;
  return marks.isNotEmpty || h != null || c != null ? (marks: marks, health: h, carbon: c) : null;
}

const _fda = {'fat': 78, 'sat': 20, 'chol': 300, 'sod': 2300, 'carb': 275, 'fiber': 28, 'protein': 50};

/// M2 `labelHTML`: Nutrition Facts rows with %DV (the menu's own when published, else computed from FDA values).
/// A figure the feed left empty reads "–" with no %DV (M2 `g`/`pc`), and an empty fat-calories figure drops the Fat cal. row.
Label labelRows(MenuItem d) {
  final n = d.nutrition;
  String g(String f, num x, [String u = 'g']) => n.blank.contains(f) ? '–' : '${f1(x)}$u';
  String pc(String f, num x, Dv? dv, int? base) {
    final p = dv?.value?.round() ?? (base != null && !n.blank.contains(f) ? (x / base * 100).round() : null);
    return p == null ? '' : '$p%';
  }

  LabelRow row(LabelKind kind, String name, String f, num x, String u, Dv? dv, String? fdaKey, {bool last = false}) =>
      LabelRow(kind, '$name ${g(f, x, u)}', name, g(f, x, u), pc(f, x, dv, fdaKey == null ? null : _fda[fdaKey]), last: last);
  final serving = n.servingSize.trim().toLowerCase();
  return Label(serving.isEmpty ? null : serving, fc(n.calories.round()), [
    if (!n.blank.contains('caloriesFromFat')) LabelRow(LabelKind.thin, '', '', '', 'Fat cal. ${fc(n.caloriesFromFat)}'),
    const LabelRow(LabelKind.thin, '', '', '', '% Daily Value*'),
    row(LabelKind.row, 'Total Fat', 'totalFatG', n.totalFatG, 'g', n.totalFatDv, 'fat'),
    row(LabelKind.sub, 'Saturated Fat', 'satFatG', n.satFatG, 'g', n.satFatDv, 'sat'),
    row(LabelKind.sub, 'Trans Fat', 'transFatG', n.transFatG, 'g', null, null),
    row(LabelKind.row, 'Cholesterol', 'cholesterolMg', n.cholesterolMg, 'mg', n.cholesterolDv, 'chol'),
    row(LabelKind.row, 'Sodium', 'sodiumMg', n.sodiumMg, 'mg', n.sodiumDv, 'sod'),
    row(LabelKind.row, 'Total Carbohydrate', 'totalCarbG', n.totalCarbG, 'g', n.totalCarbDv, 'carb'),
    row(LabelKind.sub, 'Dietary Fiber', 'dietaryFiberG', n.dietaryFiberG, 'g', n.dietaryFiberDv, 'fiber'),
    row(LabelKind.sub, 'Total Sugars', 'sugarsG', n.sugarsG, 'g', null, null),
    row(LabelKind.row, 'Protein', 'proteinG', n.proteinG, 'g', n.proteinDv, 'protein', last: true),
  ]);
}
