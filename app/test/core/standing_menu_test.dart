// A café's standing menu splits into items when the feed keeps its tags (the Oct 11 capture does; the Oct 8 one is flattened to text
// and stays the recorded-mode baseline, so these read Oct 11 directly).
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/content.dart';
import 'package:udine/core/hours.dart';
import 'package:udine/core/m2/places.dart';
import 'package:udine/core/m2/search.dart';
import 'package:udine/data/repository.dart';

import 'm2/support.dart';

void main() {
  late Map<String, List<RetailMenuItem>> menus;
  setUpAll(() {
    final feed = mapInfoV2([for (final l in jsonDecode(File('assets/recorded/locations-2026-10-11.json').readAsStringSync()) as List) l as Map<String, dynamic>]);
    menus = {
      for (final r in feed.retail)
        if (resolveCafeMenu(const [], r) case StandingCafeMenu(menu: RetailMenuItems(:final items))) straight(r.name): items,
    };
  });

  test('Peet\'s, Carney and Argo split into their lines, not one paragraph', () {
    expect(menus['Peet\'s Coffee & Tea']!.length, greaterThan(40));
    expect(menus['Carney Café']!.length, greaterThan(5));
    expect(menus['Argo Tea']!.map((i) => i.name), containsAll(['Black tea Hot or Iced', 'Bubble Tea', 'Macarons']));
  });

  test('priced lines keep the price apart from the name, a size run whole', () {
    expect(menus['Snack Overflow']!, contains(const RetailMenuItem('Espresso', r'$1.75')));
    expect(menus['Peet\'s Coffee & Tea']!, contains(const RetailMenuItem('Chai or Matcha Green Tea', r'$4 / $4.50 / $5')));
  });

  test('Search finds Argo by one of its standing items', () {
    final standing = {
      for (var i = 0; i < cafeTable.length; i++)
        if (menus[straight(cafeTable[i].title)] case final items?) 'c$i': [for (final x in items) x.name],
    };
    final r = runSearch(SearchIndex(board, DateTime.parse('2026-10-08T12:41:00-04:00'), standing: standing), query: 'macarons');
    expect(r.places.whereType<CafeHit>().map((h) => h.item), contains('Macarons'));
  });
}
