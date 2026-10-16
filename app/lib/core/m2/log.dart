import 'dart:math';

import '../types.dart';
import 'board.dart';
import 'plate.dart';

/// RN `toLogEntries`: one row per plate item (not per unit), every row stamped with the plate's one `loggedAt`, `servings` = the
/// quantity, and an id of `<loggedAt>-<index>-<random base 36>`. The source and nutrition are the serving at `place` (the place the
/// plate was logged at; a plate that serves several is asked), so "Log at Berkshire" writes Berkshire's hallTid and calories. A custom
/// item has only its macros. A bowl's row is one entry with its parts (a snapshot of each, per serving) and the summed nutrition.
List<LogEntry> logEntries(
  Plate p, {
  required String? place,
  required String loggedAt,
  String Function()? salt,
}) {
  final rnd = Random();
  String id(int i) =>
      '$loggedAt-$i-${salt != null ? salt() : rnd.nextInt(1 << 32).toRadixString(36)}';
  return [
    for (var i = 0; i < p.items.length; i++)
      () {
        final it = p.items[i], c = it.custom;
        if (c != null) {
          final cal = c.cal, f = c.f, carb = c.c, pr = c.p;
          return LogEntry(
            id: id(i),
            loggedAt: loggedAt,
            servings: it.qty,
            source: CustomSource(
              customFoodId: it.key.replaceFirst('custom:', ''),
              productName: it.name,
            ),
            nutrition: NutritionFacts(
              servingSize: '',
              calories: cal,
              caloriesFromFat: 0,
              totalFatG: f,
              satFatG: 0,
              transFatG: 0,
              cholesterolMg: 0,
              sodiumMg: 0,
              totalCarbG: carb,
              dietaryFiberG: 0,
              sugarsG: 0,
              proteinG: pr,
            ),
          );
        }
        final m =
            (place != null ? it.refs[place] : null) ?? it.refs.values.first;
        return LogEntry(
          id: id(i),
          loggedAt: loggedAt,
          servings: it.qty,
          source: UmassMenuSource(
            dishName: m.dishName,
            hallTid: m.hallTid,
            parts: it.bowl == null ? null : [for (final (x, q) in it.bowl!.bowl.parts) LogPart(name: x.dishName, servings: q, nutrition: x.nutrition)],
          ),
          nutrition: m.nutrition,
        );
      }(),
  ];
}

/// M2 `showLogged`: "Logged Worcester lunch" ("Logged lunch" for a plate of only custom foods).
String receiptLine(Board fx, String? place, String meal) =>
    'Logged ${place != null ? '${placeName(fx, place)} ' : ''}${mealLabel[meal]!.toLowerCase()}';
