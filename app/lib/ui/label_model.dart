// What the kit prints: number formats and the Nutrition Facts rows. Building rows from a dish is the logic layer's job.

String f1(num x) => ((x * 10).round() / 10).toStringAsFixed(1).replaceFirst(RegExp(r'\.0$'), '');
/// en-US thousands grouping.
String fc(num x) => x.round().toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
/// M2 `fq`: a quantity as the stepper prints it.
String fq(double q) => q == 0.5 ? '½' : q % 1 != 0 ? '${q.floor()}½' : q.toInt().toString();

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

/// UMass Dining's Climate-Conscious Dining bands (M2 `CRB`), per kg of food: never summed or averaged across a plate.
const carbonBand = {
  'A': 'Very low: under 1.75', 'B': 'Low: 1.75 to 3', 'C': 'Medium: 3 to 4.25', 'D': 'High: 4.25 to 5.5', 'E': 'Very high: over 5.5',
};
