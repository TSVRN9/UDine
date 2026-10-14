// Port of the exporters in shared/src/storage.ts; shared/vectors/export.json is the byte-equality contract.
import 'dart:convert';

import 'types.dart';

String _json(Object? v) => const JsonEncoder.withIndent('  ').convert(v);

String _num(num v) => jsonNum(v).toString();

/// Quote and escape one field; a leading = + - @ gets a tab prefix against spreadsheet formula injection.
String _field(Object value) {
  final s = value is num ? _num(value) : value.toString();
  final safe = RegExp(r'^[=+\-@]').hasMatch(s) ? '\t$s' : s;
  return '"${safe.replaceAll('"', '""')}"';
}

String _csv(List<String> columns, Iterable<List<Object>> rows) => [columns.join(','), for (final r in rows) r.map(_field).join(',')].join('\n');

String exportEntriesAsJson(List<LogEntry> entries) => _json([for (final e in entries) e.toJson()]);

String exportEntriesAsCsv(List<LogEntry> entries) => _csv(
      ['id', 'loggedAt', 'dishName', 'servings', 'calories', 'proteinG', 'totalCarbG', 'totalFatG'],
      [
        for (final e in entries)
          [
            e.id,
            e.loggedAt,
            switch (e.source) {
              UmassMenuSource(:final dishName) => dishName,
              OffSource(:final productName) => productName,
              UsdaSource(:final productName) => productName,
              CustomSource(:final productName) => productName,
            },
            e.servings,
            e.nutrition.calories,
            e.nutrition.proteinG,
            e.nutrition.totalCarbG,
            e.nutrition.totalFatG,
          ],
      ],
    );

String exportRankedDishesAsJson(List<RankedDish> dishes) => _json([for (final d in dishes) d.toJson()]);

String exportRankedDishesAsCsv(List<RankedDish> dishes) =>
    _csv(['dishName', 'hallTid', 'rating', 'comparisonCount'], [for (final d in dishes) [d.dishName, d.hallTid, d.rating, d.comparisonCount]]);

String exportRankedFoodsAsJson(List<RankedFood> foods) => _json([for (final f in foods) f.toJson()]);

String exportRankedFoodsAsCsv(List<RankedFood> foods) =>
    _csv(['dishName', 'rating', 'comparisonCount'], [for (final f in foods) [f.dishName, f.rating, f.comparisonCount]]);

String exportFavoritesAsJson(List<Favorite> favorites) => _json([for (final f in favorites) f.toJson()]);

String exportFavoritesAsCsv(List<Favorite> favorites) => _csv(
      ['type', 'dishName', 'hallTid'],
      [
        for (final f in favorites)
          switch (f) {
            DishFavorite(:final dishName) => ['dish', dishName, ''],
            LocationFavorite(:final hallTid) => ['location', '', hallTid],
          },
      ],
    );

String exportCustomFoodsAsJson(List<CustomFood> foods) => _json([for (final f in foods) f.toJson()]);

String exportCustomFoodsAsCsv(List<CustomFood> foods) => _csv(
      ['id', 'name', 'servingSize', 'calories', 'proteinG', 'totalCarbG', 'totalFatG', 'ingredients'],
      [
        for (final f in foods)
          [f.id, f.name, f.servingSize, f.nutrition.calories, f.nutrition.proteinG, f.nutrition.totalCarbG, f.nutrition.totalFatG, f.ingredients ?? ''],
      ],
    );
