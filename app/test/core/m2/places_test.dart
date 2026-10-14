import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/hours.dart';
import 'package:udine/core/m2/places.dart';
import 'support.dart';

final roster = Roster.fromFeed(mapInfoV2([for (final l in jsonDecode(File('assets/recorded/locations-2026-10-11.json').readAsStringSync()) as List) l as Map<String, dynamic>]));

void main() {
  test('the table is M2\'s own: names, areas and buildings of every café, in book order', () {
    final fixture = (jsonDecode(File('test/core/m2/fixture.json').readAsStringSync())['places'] as List).where((p) => (p['key'] as String).startsWith('c')).toList();
    expect(cafeTable, hasLength(fixture.length));
    for (var i = 0; i < fixture.length; i++) {
      expect(fixture[i]['key'], 'c$i');
      expect([cafeTable[i].name, cafeTable[i].area, cafeTable[i].building], [fixture[i]['name'], fixture[i]['area'], fixture[i]['building']], reason: 'c$i');
    }
    for (final e in (vectors['places'] as Map).entries.where((e) => (e.key as String).startsWith('c'))) {
      expect(cafeTable[int.parse((e.key as String).substring(1))].name, e.value);
    }
  });

  test('the recorded feed gives every café in the table but Procrastination Station (not in that capture), hours under c<i>, and the four halls', () {
    expect(roster.cafes.map((p) => p.key), [for (var i = 0; i < cafeTable.length; i++) if (i != 19) 'c$i']);
    expect(roster.hours.keys.where((k) => !k.startsWith('c')), ['B', 'W', 'F', 'H']);
    expect(roster.cafes.firstWhere((p) => p.name == "Peet's Coffee & Tea").key, 'c18');
    expect(roster.hours['c10']!.general, isNotNull); // Harvest Market (Wasabi is "Closed" all day in the capture: no window)
  });

  group('the Charles River filter', () {
    test('areas: Charles River is last and only when on', () {
      expect(areasOn(charlesRiver: false), [0, 1, 2, 3]);
      expect(areasOn(charlesRiver: true), [0, 1, 2, 3, 4]);
    });
    test('places: its places are set aside when off, Terrace stays', () {
      final off = placesOn(roster.cafes, charlesRiver: false).map((p) => p.name);
      expect(off, isNot(contains('Charles River Campus')));
      expect(off, contains('Terrace'));
      expect(placesOn(roster.cafes, charlesRiver: true).map((p) => p.name), contains('Charles River Campus'));
    });
    test('a pin on a Charles River place resolves only while on', () {
      expect(roster.pinned('Charles River Campus', charlesRiver: false), isNull);
      expect(roster.pinned('Charles River Campus', charlesRiver: true)?.key, 'c28');
      expect(roster.pinned('Nowhere', charlesRiver: true), isNull);
    });
  });
}
