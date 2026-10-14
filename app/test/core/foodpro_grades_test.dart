// Healthfulness grade, carbon letter and price: TS shared/ does not parse the first two, so there is no vector.
// Source: the 3,106 distinct dishes captured in docs/design/explorations/2026-10-ui-overhaul/flows/menus-2026-10-08-to-22.json
// (their raw data-* attributes, one map per dish), serialized back into the <a data-*> fragment the feed sends and parsed.
// Expected values follow mobile/scripts/bakeoff-fixture.mjs on bakeoff/rn, lines ~35-55: grade = first H0..H7 token
// of recipe-webcode, carbon = A-E, price = the meal-price span.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/foodpro.dart';
import 'package:udine/core/types.dart';

const _capture = '../docs/design/explorations/2026-10-ui-overhaul/flows/menus-2026-10-08-to-22.json';

String _esc(String s) => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/// The dish as the feed sends it: one <a> with data-* attributes, then the price span (retail) after the </a>.
String fragment(Map<String, dynamic> dish) {
  final attrs = [for (final MapEntry(:key, :value) in dish.entries) if (key != 'price') 'data-$key="${_esc(value as String)}"'];
  final name = _esc(dish['dish-name'] as String);
  final price = dish['price'] as String?;
  return '<a ${attrs.join(' ')} href="#inline">$name</a>${price == null ? '' : '<img src="x.png"><span class="meal-price">$price</span>'}';
}

MenuItem parse(Map<String, dynamic> dish) {
  final items = parseCategoryItems(fragment(dish), 'Cat', MealPeriod.lunch, 1, '2026-10-08');
  expect(items, hasLength(1));
  return items.single;
}

void main() {
  final dishes = [for (final d in (jsonDecode(File(_capture).readAsStringSync()) as Map)['dishes'] as List) d as Map<String, dynamic>];

  // Spot checks pinned by hand from the capture (index, name, webcode, healthfulness, carbon, price).
  final spots = <(int, String, int?, String?, String?)>[
    (24, 'Strawberry Plant Based Soft Serve', 0, 'A', null), // H0 is a real 0, not "missing"
    (265, 'Red Pepper Pesto Pasta Salad', 7, 'A', null),
    (116, 'Hard Boiled Egg', null, 'B', null), // data-healthfulness="30" but no H code: not trusted
    (186, 'Homemade Spicy Hummus', null, 'B', null), // webcode is "H VGN H\r6 CR2": the stray CR splits H6, so no grade
    (113, 'Local Whole Wheat Bread', 3, null, null), // carbon-list "None"
    (1659, 'Bacon', 0, 'E', r'$3.00'),
  ];
  for (final (i, name, health, carbon, price) in spots) {
    test('capture dish $i $name -> grade $health, carbon $carbon, price $price', () {
      expect(dishes[i]['dish-name'], name);
      final m = parse(dishes[i]);
      expect((m.health, m.carbon, m.price), (health, carbon, price));
    });
  }

  test('every captured dish: grade, carbon and price agree with the bake-off rule; totals pinned', () {
    var h0 = 0, noGrade = 0, noCarbon = 0, priced = 0;
    for (final d in dishes) {
      final m = parse(d);
      final code = RegExp(r'(?:^|\s)H([0-7])(?=\s|$)').firstMatch(d['recipe-webcode'] as String);
      expect(m.health, code == null ? null : int.parse(code[1]!), reason: d['dish-name'] as String);
      expect(m.carbon, 'ABCDE'.contains(d['carbon-list'] as String) ? d['carbon-list'] : null, reason: d['dish-name'] as String);
      expect(m.price, d['price'], reason: d['dish-name'] as String);
      if (m.health == 0) h0++;
      if (m.health == null) noGrade++;
      if (m.carbon == null) noCarbon++;
      if (m.price != null) priced++;
    }
    // Counted independently with a script over the capture.
    expect((dishes.length, h0, noGrade, noCarbon, priced), (3106, 373, 190, 393, 508));
  });
}
