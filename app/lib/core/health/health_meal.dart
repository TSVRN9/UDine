import '../m2/history.dart';

/// Write-only grants, the single source the native side requests. Android: Health Connect's one write permission for NutritionRecord.
/// iOS: the HealthKit dietary types below, as share (write) types; nothing is ever requested to read.
const kHealthWritePermissions = <String, List<String>>{
  'android': ['android.permission.health.WRITE_NUTRITION'],
  'ios': [
    'HKQuantityTypeIdentifierDietaryEnergyConsumed',
    'HKQuantityTypeIdentifierDietaryFatTotal',
    'HKQuantityTypeIdentifierDietaryFatSaturated',
    'HKQuantityTypeIdentifierDietaryCholesterol',
    'HKQuantityTypeIdentifierDietarySodium',
    'HKQuantityTypeIdentifierDietaryCarbohydrates',
    'HKQuantityTypeIdentifierDietaryFiber',
    'HKQuantityTypeIdentifierDietarySugar',
    'HKQuantityTypeIdentifierDietaryProtein',
  ],
};

/// One logged meal as one Health record. [fields] are the label's nutrients in the units the keys name; the native side maps each key to
/// NutritionRecord (Android) or the dietary quantity type (iOS). The meal id is the meal's loggedAt, as everywhere else in the log.
class HealthMeal {
  const HealthMeal({required this.mealId, required this.name, required this.start, required this.end, required this.fields});
  final String mealId, name;
  final DateTime start, end;
  final Map<String, double> fields;

  /// What a write of this meal says: time, name and the nutrients for [platform]. Two meals with the same signature leave the same record.
  String signature(String platform) =>
      '${start.millisecondsSinceEpoch}|$name|${(fieldsFor(platform).entries.toList()..sort((a, b) => a.key.compareTo(b.key))).map((e) => '${e.key}=${e.value}').join(',')}';

  /// HealthKit has no trans-fat type, so iOS gets the rest.
  Map<String, double> fieldsFor(String platform) => {
        for (final e in fields.entries)
          if (!(platform == 'ios' && e.key == 'transFatG')) e.key: e.value,
      };
}

double _r(double v) => (v * 100).round() / 100;

/// [name] is the meal's title ("Lunch at Worcester"), which only the caller can resolve (cafeIds, board). Health Connect needs
/// start before end, so a meal spans the minute it was logged in.
HealthMeal healthMealOf(LoggedMeal m, String name) {
  double f(num Function(dynamic n) of) => _r(m.items.fold(0.0, (a, i) => a + of(i.entry.nutrition) * i.qty));
  final start = DateTime.parse(m.loggedAt);
  return HealthMeal(
    mealId: m.loggedAt,
    name: name,
    start: start,
    end: start.add(const Duration(minutes: 1)),
    fields: {
      'energyKcal': f((n) => n.calories),
      'fatG': f((n) => n.totalFatG),
      'satFatG': f((n) => n.satFatG),
      'transFatG': f((n) => n.transFatG),
      'cholesterolMg': f((n) => n.cholesterolMg),
      'sodiumMg': f((n) => n.sodiumMg),
      'carbG': f((n) => n.totalCarbG),
      'fiberG': f((n) => n.dietaryFiberG),
      'sugarG': f((n) => n.sugarsG),
      'proteinG': f((n) => n.proteinG),
    },
  );
}
