// Port of the exporters in shared/src/storage.ts; shared/vectors/export.json is the byte-equality contract.
import 'dart:convert';

import '../data/packaged.dart';
import 'types.dart';

/// Number.prototype.toString: plain shortest digits for integral values below 1e21 and for 1e-6 <= |v| < 1e21,
/// exponent form ("1e+21", "1e-7") outside that. Dart's toString differs for big integral values (".0" suffix,
/// int saturation) and switches to exponent form below 1e-4.
String jsNum(num v) {
  if (v is int) return v.toString();
  if (v == 0) return '0'; // JS String(-0) is "0"; Dart prints "-0.0".
  if (v == v.truncateToDouble() && v.abs() < 1e21) return v.toString().replaceFirst(RegExp(r"\.0$"), "");
  final a = v.abs();
  if (a >= 1e21 || a < 1e-6) return v.toString();
  final s = v.toString();
  if (!s.contains('e')) return s;
  // 1e-6 <= |v| < 1e-4: expand "d.ddde-5" to plain decimal digits.
  final m = RegExp(r'^(-?)(\d)(?:\.(\d+))?e-(\d+)$').firstMatch(s)!;
  return '${m[1]}0.${'0' * (int.parse(m[4]!) - 1)}${m[2]}${m[3] ?? ''}';
}

String _enc(Object? v, String ind) {
  final inner = '$ind  ';
  return switch (v) {
    null => 'null',
    num() => v.isFinite ? jsNum(v) : 'null',
    List() => v.isEmpty ? '[]' : '[\n${v.map((e) => '$inner${_enc(e, inner)}').join(',\n')}\n$ind]',
    Map() => v.isEmpty ? '{}' : '{\n${v.entries.map((e) => '$inner${jsonEncode(e.key)}: ${_enc(e.value, inner)}').join(',\n')}\n$ind}',
    _ => jsonEncode(v),
  };
}

String _json(Object? v) => _enc(v, '');

String _num(num v) => jsNum(v);

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

String exportSavedFoodsAsJson(List<PackagedFood> foods) => _json([for (final f in foods) f.toJson()]);

String exportSavedFoodsAsCsv(List<PackagedFood> foods) => _csv(
      ['id', 'name', 'servingSize', 'calories', 'proteinG', 'totalCarbG', 'totalFatG', 'ingredients'],
      [
        for (final f in foods)
          [f.id, f.displayName, f.nutrition.servingSize, f.nutrition.calories, f.nutrition.proteinG, f.nutrition.totalCarbG, f.nutrition.totalFatG, f.ingredients ?? ''],
      ],
    );
