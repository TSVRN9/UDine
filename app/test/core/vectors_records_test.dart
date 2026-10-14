// Runs shared/vectors/{match-query,favorite-match,export}.json (the same files the TS suite reads) against core/.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/export.dart';
import 'package:udine/core/favorite_match.dart';
import 'package:udine/core/search.dart';
import 'package:udine/core/types.dart';

List<Map<String, dynamic>> cases(String file) {
  final doc = jsonDecode(File('../shared/vectors/$file.json').readAsStringSync()) as Map<String, dynamic>;
  return [for (final c in doc['cases'] as List) c as Map<String, dynamic>];
}

List<Map<String, dynamic>> rows(Object? l) => List<Map<String, dynamic>>.from(l as List);

void main() {
  group('match-query.json', () {
    for (final c in cases('match-query')) {
      test('${c['name']}', () {
        final i = c['input'] as Map<String, dynamic>;
        expect(matchesQuery(i['name'], i['query']), c['expected']);
      });
    }
  });

  group('favorite-match.json', () {
    for (final c in cases('favorite-match')) {
      test('${c['name']}', () {
        final i = c['input'] as Map<String, dynamic>;
        final got = matchFavoritedDishes(
          [for (final f in rows(i['favorites'])) Favorite.fromJson(f)],
          [for (final m in rows(i['menuItems'])) MenuItem.fromJson(m)],
        );
        expect(jsonDecode(jsonEncode([for (final m in got) m.toJson()])), c['expected']);
      });
    }
  });

  group('export.json', () {
    final run = <String, String Function(List<Map<String, dynamic>>)>{
      'entries_json': (r) => exportEntriesAsJson([for (final e in r) LogEntry.fromJson(e)]),
      'entries_csv': (r) => exportEntriesAsCsv([for (final e in r) LogEntry.fromJson(e)]),
      'ranked_dishes_json': (r) => exportRankedDishesAsJson([for (final e in r) RankedDish.fromJson(e)]),
      'ranked_dishes_csv': (r) => exportRankedDishesAsCsv([for (final e in r) RankedDish.fromJson(e)]),
      'ranked_foods_json': (r) => exportRankedFoodsAsJson([for (final e in r) RankedFood.fromJson(e)]),
      'ranked_foods_csv': (r) => exportRankedFoodsAsCsv([for (final e in r) RankedFood.fromJson(e)]),
      'favorites_json': (r) => exportFavoritesAsJson([for (final e in r) Favorite.fromJson(e)]),
      'favorites_csv': (r) => exportFavoritesAsCsv([for (final e in r) Favorite.fromJson(e)]),
      'custom_foods_json': (r) => exportCustomFoodsAsJson([for (final e in r) CustomFood.fromJson(e)]),
      'custom_foods_csv': (r) => exportCustomFoodsAsCsv([for (final e in r) CustomFood.fromJson(e)]),
    };
    for (final c in cases('export')) {
      test('${c['kind']}: ${c['name']}', () {
        expect(run[c['kind']]!(rows(c['input'])), c['expected']);
      });
    }
  });
}
