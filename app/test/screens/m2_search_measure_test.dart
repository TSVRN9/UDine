// M2's own Search geometry (test/m2_dom_search.json, measured with ~/.cache/udine-scratch/flutter/m2dom-search.js on the M2-r11 build at dpr 1)
// against ours, within 1 dp. Each rect is [left, top, width, height]. SKIPPED until that script has been run and its output copied to
// test/m2_dom_search.json: phase 1 of this task had no Chromium to measure with.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'search_screen_test.dart' show finish, settle;
import 'support.dart';

const _why = 'needs test/m2_dom_search.json: run ~/.cache/udine-scratch/flutter/m2dom-search.js (M2-r11 build) and copy m2dom-search.json there';

void main() {
  setUpAll(loadFonts);
  for (final w in [360, 390]) {
    Map<String, dynamic> dom(String state) => ((jsonDecode(File('test/m2_dom_search.json').readAsStringSync()) as Map<String, dynamic>)['$w'] as Map<String, dynamic>)[state] as Map<String, dynamic>;

    void near(WidgetTester t, String what, Finder f, Object? want, {bool block = false}) {
      final x = t.getRect(f), v = (want as List).cast<num>(), got = [x.left, x.top, x.width, x.height];
      for (var i = 0; i < 4; i++) {
        if (block && i == 2) continue;
        expect(got[i], closeTo(v[i], 1.0), reason: '$what[${const ['left', 'top', 'width', 'height'][i]}] ours $got, M2 $v at $w dp');
      }
    }

    Future<void> open(WidgetTester t, String route) async {
      await openApp(t, await bootRecorded(t), route: route, w: w.toDouble());
      await until(t, () => find.byType(DishRow).evaluate().isNotEmpty || find.textContaining('Places').evaluate().isNotEmpty);
      await finish(t);
      FocusManager.instance.primaryFocus?.unfocus();
      await settle(t);
    }

    testWidgets('the field, the lens chips and the group title at $w dp match M2 within 1 dp', skip: true, (t) async {
      await open(t, '/search?q=green');
      final m = dom('every_group');
      near(t, 'shead', find.byType(SearchField).first, m['field']);
      for (var i = 0; i < 7; i++) {
        near(t, 'chip $i', find.byType(FilterChipButton).at(i), (m['chips'] as List)[i]);
      }
      near(t, 'sgrp', find.text('Places'), (m['sgrp'] as List).first, block: true);
      near(t, 'prow', find.byType(PlaceRow).first, (m['prow'] as List).first);
      near(t, 'row', find.byType(DishRow).first, (m['rows'] as List).first);
      near(t, 'tags', find.byType(HallTags).first, (m['tags'] as List).first, block: true);
    });

    testWidgets('the hall card at $w dp matches M2 within 1 dp', skip: true, (t) async {
      await open(t, '/search?q=worcester');
      final m = dom('hall_card');
      near(t, 'hcard', find.byType(Band).first, [for (final (i, x) in (m['hcard'] as List).first.indexed) i == 1 ? x - 1 : i == 3 ? x + 1 : x]); // ours starts with the 1 dp seam M2 puts outside
    });

    testWidgets('the empty line and the custom button at $w dp match M2 within 1 dp', skip: true, (t) async {
      await open(t, '/search?q=zzzq');
      final m = dom('no_match');
      near(t, 'empty', find.textContaining('Nothing called'), m['empty'], block: true);
      near(t, 'custom', find.byType(CustomFoodButton), m['custom']);
    });
  }
  test(_why, () {}, skip: _why);
}
