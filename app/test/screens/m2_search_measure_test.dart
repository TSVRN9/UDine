// M2's own Search geometry (test/m2_dom_search.json, measured with ~/.cache/udine-scratch/flutter/m2dom-search.js on the M2-r11 build at dpr 1)
// against ours, within 1 dp. Each rect is [left, top, width, height]. Every miss is collected and reported together.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/theme/tokens.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'search_screen_test.dart' show finish, settle;
import 'support.dart';

void main() {
  setUpAll(loadFonts);
  for (final w in [360, 390]) {
    Map<String, dynamic> dom(String state) => ((jsonDecode(File('test/m2_dom_search.json').readAsStringSync()) as Map<String, dynamic>)['$w'] as Map<String, dynamic>)[state] as Map<String, dynamic>;

    final misses = <String>[];
    tearDown(() => expect(misses, isEmpty, reason: 'at $w dp'));

    void near(WidgetTester t, String what, Finder f, Object? want, {bool block = false, bool seam = false}) {
      final x = t.getRect(f), v = (want as List).cast<num>(), got = [x.left, x.top + (seam ? 1 : 0), x.width, x.height - (seam ? 1 : 0)];
      for (var i = 0; i < 4; i++) {
        if (block && i == 2) continue;
        if ((got[i] - v[i]).abs() > 1.0) misses.add('$what[${const ['left', 'top', 'width', 'height'][i]}] ours ${got.map((e) => e.toStringAsFixed(1))}, M2 $v');
      }
    }

    // M2 measures the block (`.sgrp`, `.empty`): ours is the padding around the text
    Finder block(Finder f) => find.ancestor(of: f, matching: find.byType(Padding)).first;

    Future<void> open(WidgetTester t, String route) async {
      await openApp(t, await bootRecorded(t), route: route, w: w.toDouble());
      await until(t, () => find.byType(DishRow).evaluate().isNotEmpty || find.textContaining(RegExp('Places|Nothing called')).evaluate().isNotEmpty);
      await finish(t);
      FocusManager.instance.primaryFocus?.unfocus();
      await settle(t);
    }

    testWidgets('the field, the lens chips and the group title at $w dp match M2 within 1 dp', (t) async {
      await open(t, '/search?q=green');
      final m = dom('every_group');
      near(t, 'shead', find.byType(SearchField).first, m['field']);
      for (var i = 0; i < 7; i++) {
        near(t, 'chip $i', find.byType(FilterChipButton).at(i), (m['chips'] as List)[i]);
      }
      near(t, 'sgrp', block(find.text('Places')), (m['sgrp'] as List).first);
      near(t, 'prow', find.byType(PlaceRow).first, (m['prow'] as List).first);
      near(t, 'row', find.byType(DishRow).first, (m['rows'] as List).first);
      // The tiles are not M2's `ht` rect: M2 hangs them from the lane's bottom (2.5 dp low of the meta line, growing leftward from the right
      // edge). flutter-motion-fixes Task 2 (owner 2026-10-17) centres them on the meta line, as one group under the +.
      final tags = find.byType(HallTags).first, row = find.ancestor(of: tags, matching: find.byType(DishRow)).first;
      final ht = t.getRect(tags), meta = t.getRect(find.descendant(of: row, matching: find.byType(CalProtein))), add = t.getRect(find.descendant(of: row, matching: find.byType(RowControl)));
      expect(ht.size, Size((m['ht'] as List).first[2].toDouble(), (m['ht'] as List).first[3].toDouble()));
      expect(ht.center.dy, closeTo(meta.center.dy, 0.5), reason: 'the tile centres on the meta line');
      expect(ht.center.dx, closeTo(add.right - M2Layout.addSize / 2, 0.5), reason: 'the tile centres under the +');
    });

    testWidgets('several tiles centre as one group under the + at $w dp (flutter-motion-fixes Task 2, owner 2026-10-17)', (t) async {
      await open(t, '/search?q=chicken');
      final two = find.byWidgetPredicate((x) => x is HallTags && x.halls.length > 1 && x.cafe == null);
      expect(two, findsWidgets);
      final row = find.ancestor(of: two.first, matching: find.byType(DishRow)).first;
      final ht = t.getRect(two.first), meta = t.getRect(find.descendant(of: row, matching: find.byType(CalProtein))), add = t.getRect(find.descendant(of: row, matching: find.byType(RowControl)));
      expect(ht.center.dx, closeTo(add.right - M2Layout.addSize / 2, 0.5));
      expect(ht.center.dy, closeTo(meta.center.dy, 0.5));
    });

    testWidgets('the hall card at $w dp matches M2 within 1 dp', (t) async {
      await open(t, '/search?q=worcester');
      final m = dom('hall_card');
      near(t, 'hcard', find.byType(Band).first, (m['hcard'] as List).first, seam: true); // ours starts with the 1 dp seam M2 puts outside the band
    });

    testWidgets('the empty line and the custom button at $w dp match M2 within 1 dp', (t) async {
      await open(t, '/search?q=zzzq');
      final m = dom('no_match');
      near(t, 'empty', block(find.textContaining('Nothing called')), m['empty']);
      // M2's button sits under the lookup button (packaged foods, Task 3 of that brief), so only its left, width and height compare
      final c = t.getRect(find.descendant(of: find.byType(CustomFoodButton), matching: find.byType(Container)).first), v = (m['custom'] as List).cast<num>();
      expect([c.left, c.width], [v[0], v[2]].map((e) => closeTo(e, 1.0)).toList());
      expect(c.height, closeTo(52, 1.0));
    });
  }
}
