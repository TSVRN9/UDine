// M2's own geometry for the packaged groups, the lookup's states, a food's sheet and Your foods (test/m2_dom_packaged.json, measured with
// ~/.cache/udine-scratch/flutter/m2dom-packaged.js on the M2-r11 build at dpr 1) against ours, within 1 dp. Each rect is [left, top, width, height].
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/data/recorded/flags.dart' show LookupMode;
import 'package:udine/screens/dish/food_sheet.dart';
import 'package:udine/screens/search/lookup_slots.dart';
import 'package:udine/screens/you/settings_pages.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'packaged_test.dart' show openQ;
import 'search_screen_test.dart' show finish, settle;
import 'support.dart';
import 'you_support.dart';

void main() {
  setUpAll(loadFonts);
  for (final w in [360, 390]) {
    Map<String, dynamic> dom(String state) => ((jsonDecode(File('test/m2_dom_packaged.json').readAsStringSync()) as Map<String, dynamic>)['$w'] as Map<String, dynamic>)[state] as Map<String, dynamic>;
    List<num> rect(Object? r) => (r as List).cast<num>();
    Map<String, dynamic> kid(String state, String cls, [String? text]) => (dom(state)['kids'] as List).cast<Map<String, dynamic>>().firstWhere((k) => (k['cls'] as String).split(' ').first == cls && (text == null || (k['text'] as String).startsWith(text)));

    final misses = <String>[];
    setUp(misses.clear);
    tearDown(() => expect(misses, isEmpty, reason: 'at $w dp'));

    void near(WidgetTester t, String what, Finder f, Object? want, {double tol = 1.0}) {
      final x = t.getRect(f.first), v = rect(want), got = [x.left, x.top, x.width, x.height];
      for (var i = 0; i < 4; i++) {
        if ((got[i] - v[i]).abs() > tol) misses.add('$what[${const ['left', 'top', 'width', 'height'][i]}] ours ${got.map((e) => e.toStringAsFixed(1))}, M2 $v');
      }
    }

    Finder head(String text) => find.ancestor(of: find.text(text), matching: find.byType(Padding)).first;
    Finder row(String name) => find.widgetWithText(ListRow, name);
    Finder custom() => find.descendant(of: find.byType(CustomFoodButton), matching: find.byType(Container)).first;

    Future<void> ask(WidgetTester t, String q) async {
      await t.tap(find.text('Search UMass Dining for “$q”'));
      await t.pump();
    }

    testWidgets('"clif" at $w dp: the heads, the rows, and the first rows\' own lines', (t) async {
      await openQ(t, 'clif', w: w.toDouble());
      near(t, 'Your foods', head('Your foods'), kid('clif', 'sgrp', 'Your foods')['rect']);
      near(t, 'Packaged', head('Packaged'), kid('clif', 'sgrp', 'Packaged')['rect']);
      near(t, 'saved row', row('Clif Bar Chocolate Chip'), kid('clif', 'row', 'Clif Bar Chocolate')['rect']);
      near(t, 'first hit', row('Clif bar'), kid('clif', 'row', 'Clif bar')['rect']);
      near(t, 'second hit', row('Clif Bar Duos'), kid('clif', 'row', 'Clif Bar Duos')['rect']);
      await finish(t);
    });

    testWidgets('"chobani" at $w dp: one saved food, then the lookup button and the custom button', (t) async {
      await openQ(t, 'chobani', w: w.toDouble());
      near(t, 'Your foods', head('Your foods'), kid('chobani', 'sgrp')['rect']);
      near(t, 'row', row('Chobani'), kid('chobani', 'row')['rect']);
      near(t, 'lookup button', find.descendant(of: find.byType(LookupButton), matching: find.byType(Press)), dom('chobani')['lkb']);
      near(t, 'custom', custom(), dom('chobani')['custom']);
      await finish(t);
    });

    testWidgets('"laksa", waiting, at $w dp: the button sits 8 under the empty line, the custom button under it', (t) async {
      await openQ(t, 'laksa', w: w.toDouble());
      near(t, 'lookup button', find.descendant(of: find.byType(LookupButton), matching: find.byType(Press)), dom('laksa_idle')['lkb']);
      near(t, 'custom', custom(), dom('laksa_idle')['custom']);
      await finish(t);
    });

    testWidgets('lookup in flight at $w dp: a 52 slot the size of the button', (t) async {
      final hang = HangingClient();
      await openQ(t, 'laksa', w: w.toDouble(), hang: hang);
      await ask(t, 'laksa');
      await t.pump(const Duration(milliseconds: 100));
      near(t, 'slot', find.byType(LookupStatus), dom('laksa_loading')['lkst']);
      near(t, 'custom', custom(), dom('laksa_loading')['custom']);
      hang.release();
      await finish(t);
    });

    testWidgets('lookup none at $w dp', (t) async {
      await openQ(t, 'laksa', lookup: LookupMode.none, w: w.toDouble());
      await ask(t, 'laksa');
      await until(t, () => find.textContaining('has nothing else').evaluate().isNotEmpty);
      await settle(t);
      near(t, 'slot', find.byType(LookupStatus), dom('laksa_none')['lkst'], tol: 1.5);
      near(t, 'custom', custom(), dom('laksa_none')['custom'], tol: 1.5);
      await finish(t);
    });

    testWidgets('lookup rate-limited at $w dp', (t) async {
      await openQ(t, 'laksa', lookup: LookupMode.limited, w: w.toDouble());
      await ask(t, 'laksa');
      await until(t, () => find.textContaining('paused until').evaluate().isNotEmpty);
      await settle(t);
      near(t, 'slot', find.byType(LookupStatus), dom('laksa_limited')['lkst'], tol: 1.5);
      await finish(t);
    });

    testWidgets('lookup failed at $w dp: the line and its Try again', (t) async {
      await openQ(t, 'laksa', lookup: LookupMode.fail, w: w.toDouble());
      await ask(t, 'laksa');
      await until(t, () => find.text("Couldn't reach UMass Dining.").evaluate().isNotEmpty);
      await settle(t);
      near(t, 'slot', find.byType(LookupStatus), dom('laksa_fail')['lkst'], tol: 1.5);
      near(t, 'Try again', find.widgetWithText(Button, 'Try again'), dom('laksa_fail')['lkstBtn'], tol: 1.5);
      await finish(t);
    });

    testWidgets('packaged failed at $w dp: the heading, the slot, then the lookup button', (t) async {
      await openQ(t, 'clif', packFail: true, w: w.toDouble());
      near(t, 'Packaged', head('Packaged'), kid('pack_fail', 'sgrp', 'Packaged')['rect']);
      near(t, 'slot', find.byType(PackFail), dom('pack_fail')['lkst'], tol: 1.5);
      near(t, 'lookup button', find.descendant(of: find.byType(LookupButton), matching: find.byType(Press)), dom('pack_fail')['lkb'], tol: 1.5);
      await finish(t);
    });

    testWidgets('a saved food\'s sheet at $w dp: name, Edit, serving, Add to plate, the label', (t) async {
      await openQ(t, 'chobani', w: w.toDouble());
      await t.tap(find.descendant(of: row('Chobani'), matching: find.text('Chobani')).first);
      await until(t, () => find.byType(FoodSheet).evaluate().isNotEmpty);
      await t.pumpAndSettle();
      final m = dom('sheet_chobani');
      near(t, 'name', find.descendant(of: find.byType(FoodSheet), matching: find.text('Chobani')), m['dn'], tol: 1.5);
      near(t, 'Edit', find.widgetWithText(TextAction, 'Edit'), m['fedit'], tol: 1.5);
      near(t, 'serving', find.descendant(of: find.byType(FoodSheet), matching: find.text('1 serving')), m['dsv'], tol: 1.5);
      near(t, 'Add to plate', find.widgetWithText(Button, 'Add to plate'), m['dadd'], tol: 1.5);
      await finish(t);
    });

    testWidgets('You -> Your foods at $w dp: each row, its name and its line', (t) async {
      await openYou(t, await bootRecorded(t, foods: true), route: '/you/foods', w: w.toDouble());
      final rows = (dom('you_foods')['rows'] as List).cast<Map<String, dynamic>>();
      for (final r in rows) {
        near(t, '${r['a']} row', find.widgetWithText(LRow, r['a'] as String), r['rect']);
        final l = t.getRect(find.text(r['b'] as String)), v = rect(r['brect']); // (M2's line is a block: its width is the row's, ours the text's)
        if ((l.top - v[1]).abs() > 1 || (l.height - v[3]).abs() > 1) misses.add('${r['a']} line ours $l, M2 $v');
      }
      expect(find.byType(FoodsPage), findsOneWidget);
      await finish(t);
    });
  }
}
