import 'fixture.dart';

/// M2 `dishMid`: the sheet's resting height ends on the label's rule under Calories, then a 6 dp sliver (never half a line),
/// and never past the top detent (`winH - top - 8`).
double restingSnap({required double calBottom, required double grab, required double winH, required double top}) {
  final want = grab + calBottom + 6, cap = winH - top - 8;
  return want < cap ? want : cap;
}

/// M2's `.mks` row: the dish's marks, then its score tiles per the You toggles. Null when there is nothing in it, so no row and
/// no empty slot. An unscored kind never draws (a healthfulness 0 is a real score).
({List<String> marks, int? health, String? carbon})? sheetMarks(Dish d, ({bool health, bool carbon}) on) {
  final marks = [if (d.diet & 2 != 0) 'plant' else if (d.diet & 1 != 0) 'veg', if (d.diet & 4 != 0) 'halal', if (d.diet & 8 != 0) 'local', if (d.diet & 16 != 0) 'sus'];
  final h = on.health ? d.health : null, c = on.carbon ? d.carbon : null;
  return marks.isNotEmpty || h != null || c != null ? (marks: marks, health: h, carbon: c) : null;
}

String f1(num x) => ((x * 10).round() / 10).toStringAsFixed(1).replaceFirst(RegExp(r'\.0$'), '');
/// en-US thousands grouping.
String fc(num x) => x.round().toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');

const _fda = {'fat': 78, 'sat': 20, 'chol': 300, 'sod': 2300, 'carb': 275, 'fiber': 28, 'protein': 50};

enum LabelKind { thin, row, sub }

/// `left` is `name value` as M2 prints it; `name` is the bold part of a top-level row.
class LabelRow {
  final LabelKind kind;
  final String left, name, value, right;
  final bool last;
  const LabelRow(this.kind, this.left, this.name, this.value, this.right, {this.last = false});
}

class Label {
  final String? serving;
  final String cal;
  final List<LabelRow> rows;
  const Label(this.serving, this.cal, this.rows);
}

/// M2 `labelHTML`: Nutrition Facts rows with %DV (the menu's own when published, else computed from FDA values).
Label labelRows(Map<String, dynamic> n, num cal, String serving) {
  num? v(String k) => n[k] as num?;
  String g(num? x, [String u = 'g']) => x == null ? '–' : '${f1(x)}$u';
  String pc(num? x, num? dv, int? base) {
    final p = dv ?? (x != null && base != null ? (x / base * 100).round() : null);
    return p == null ? '' : '$p%';
  }

  LabelRow row(LabelKind kind, String name, String key, String u, String? dvKey, String? fdaKey, {bool last = false}) =>
      LabelRow(kind, '$name ${g(v(key), u)}', name, g(v(key), u), pc(v(key), dvKey == null ? null : v(dvKey), fdaKey == null ? null : _fda[fdaKey]), last: last);
  return Label(serving.isEmpty ? null : serving, fc(cal), [
    if (v('fatCal') != null) LabelRow(LabelKind.thin, '', '', '', 'Fat cal. ${fc(v('fatCal')!)}'),
    const LabelRow(LabelKind.thin, '', '', '', '% Daily Value*'),
    row(LabelKind.row, 'Total Fat', 'fat', 'g', 'fatDv', 'fat'),
    row(LabelKind.sub, 'Saturated Fat', 'sat', 'g', 'satDv', 'sat'),
    row(LabelKind.sub, 'Trans Fat', 'trans', 'g', null, null),
    row(LabelKind.row, 'Cholesterol', 'chol', 'mg', null, 'chol'),
    row(LabelKind.row, 'Sodium', 'sod', 'mg', 'sodDv', 'sod'),
    row(LabelKind.row, 'Total Carbohydrate', 'carb', 'g', 'carbDv', 'carb'),
    row(LabelKind.sub, 'Dietary Fiber', 'fiber', 'g', 'fiberDv', 'fiber'),
    row(LabelKind.sub, 'Total Sugars', 'sugar', 'g', null, null),
    row(LabelKind.row, 'Protein', 'protein', 'g', 'proteinDv', 'protein', last: true),
  ]);
}

/// UMass Dining's Climate-Conscious Dining bands (M2 `CRB`), per kg of food: never summed or averaged across a plate.
const carbonBand = {
  'A': 'Very low: under 1.75', 'B': 'Low: 1.75 to 3', 'C': 'Medium: 3 to 4.25', 'D': 'High: 4.25 to 5.5', 'E': 'Very high: over 5.5',
};
