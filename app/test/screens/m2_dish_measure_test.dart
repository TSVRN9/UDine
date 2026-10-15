// M2's own dish-sheet geometry (m2_dom.json `dish` per width: Golden BBQ Chicken Thigh opened from Worcester lunch, both score toggles
// on, measured with ~/.cache/udine-scratch/flutter/m2dom.js on src.html at dpr 1) against ours, within 1 dp. Each rect is
// [left, top, width, height]; a block's width is the column's, not the text's, so those compare left, top and height only.
//
// States the file has no numbers for yet (a café price, avoided allergens, an unscored dish, ingredients open, favourite on, the plate's
// label, a later group in "where") are measured by ~/.cache/udine-scratch/flutter/m2dom-dish.js into test/m2_dom_dish.json; until
// that file exists they are skipped.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/dish/dish_sheet.dart';
import 'package:udine/screens/dish/full_label.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/core/m2/board.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'dish_support.dart';
import 'support.dart';

final _dom = jsonDecode(File('test/m2_dom.json').readAsStringSync()) as Map<String, dynamic>;
final _more = File('test/m2_dom_dish.json').existsSync() ? jsonDecode(File('test/m2_dom_dish.json').readAsStringSync()) as Map<String, dynamic> : null;

const route = '/hall/worcester?meal=lunch&dish=Golden+BBQ+Chicken+Thigh';

List<double> rect(WidgetTester t, Finder f) {
  final x = t.getRect(f.first);
  return [x.left, x.top, x.width, x.height];
}

void near(String what, List<double> got, Object? want, int w, {bool block = false, bool origin = false}) {
  final v = (want as List).cast<num>();
  for (var i = 0; i < 4; i++) {
    if ((block && i == 2) || (origin && i > 1)) continue;
    expect(got[i], closeTo(v[i], 1.0), reason: '$what[${const ['left', 'top', 'width', 'height'][i]}] ours $got, M2 $v at $w dp');
  }
}

/// A rect's left and top, for a block compared by its position only.
List<double> left(Object? r) => [(r as List)[0].toDouble(), r[1].toDouble()];


/// What the sheet shows, against the M2 rects `m` (a `dish` block): every key M2 measured and the sheet has a widget for.
void compareSheet(WidgetTester t, int w, Map<String, dynamic> m) {
  const frame = 844.0;
  final sheet = t.widget<M2Sheet>(find.byType(M2Sheet));
  expect(frame - sheet.handle.px, closeTo((m['sheet'] as List)[1] as num, 1.0), reason: 'resting top');
  near('grab', rect(t, find.byType(SheetGrab)), m['grab'], w);
  final name = find.byType(DishSheet).evaluate().isEmpty ? 'Your plate' : t.widget<DishSheet>(find.byType(DishSheet)).dish.dishName;
  near('dn', rect(t, find.text(name)), m['dn'] ?? m['sh1h2'], w, block: true);
  if (m['dsv'] != null) near('dsv', rect(t, find.byWidgetPredicate((x) => x is RichText && x.text.toPlainText().contains(' each') && !x.text.toPlainText().contains('Nutrition'))), m['dsv'], w, block: true);
  if (m['mks'] != null) near('mks', rect(t, find.byType(MarkPatch)), m['mks'], w, block: true);
  if (m['dal'] != null) near('dal', rect(t, find.textContaining('Contains', findRichText: true)), m['dal'], w, block: true);
  if (m['dadd'] != null) near('dadd', rect(t, find.byType(Button)), m['dadd'], w);
  if (m['where'] != null) near('where', rect(t, find.textContaining(RegExp(r'now|Tomorrow|from', caseSensitive: false), findRichText: true)), m['where'], w, origin: true);
  if (m['hchip'] != null && (m['hchip'] as List).isNotEmpty) {
    final c = m['hchip'] as List; // one rect (m2_dom.json) or every chip's (m2_dom_dish.json)
    near('hchip', rect(t, find.byType(HallChip)), c.first is List ? c.first : c, w);
  }
  near('label', rect(t, find.byType(NutritionLabel)), m['label'], w);
  near('cal', rect(t, find.ancestor(of: find.text('Calories'), matching: find.byType(Container))), m['cal'], w);
  if (m['grades'] != null) near('grades', rect(t, find.byType(RatingsPanel)), m['grades'], w);
  if (m['ingh'] != null) near('ingh', rect(t, find.text('Ingredients')), m['ingh'], w, block: true);
}

void main() {
  setUpAll(loadFonts);
  for (final w in [360, 390]) {
    final m = (_dom['$w'] as Map<String, dynamic>)['dish'] as Map<String, dynamic>;
    testWidgets('the dish sheet of Golden BBQ Chicken Thigh at $w dp: every block where M2 puts it (within 1 dp)', (t) async {
      await openHall(t, await bootRecorded(t, health: true, carbon: true), route, w: w.toDouble());
      await sheetUp(t);
      final sheet = t.widget<M2Sheet>(find.byType(M2Sheet));
      // the sheet's top edge is where it rests (M2 `IS.mid`, 4 dp fix: the label's rule under Calories plus a 6 dp sliver)
      expect(sheet.handle.px, closeTo(844 - (m['mid'] as num), 1.0), reason: 'IS.mid');
      compareSheet(t, w, m);
      near('favb', rect(t, find.descendant(of: find.byType(FavoriteStar), matching: find.byType(Press))), m['favb'], w);
      await drain(t);
    });
  }

  // The states below wait for the numbers M2's own page gives (m2dom-dish.js, not run in phase 1: no Chromium). Their bodies are written
  // against that file's keys and have never run.
  const states = {
    'cafe': 'a café dish with its price (Buffalo Chicken Salad, Green Fields)',
    'avoid': 'an avoided allergen in Contains',
    'bare': 'a dish with no marks and no ratings',
    'favOn': 'the favourite star on',
    'ingOpen': 'the ingredients open',
    'whereTwo': 'where it is served: two places',
    'whereTomorrow': 'where it is served: tomorrow',
    'rowFav': 'a favourite\'s star in a list row',
    'plateLabel': 'the plate\'s Full label (benchmark plate)',
  };
  for (final w in [360, 390]) {
    for (final MapEntry(key: key, value: what) in states.entries) {
      testWidgets('$what at $w dp matches M2 within 1 dp', (t) async {
        if (_more == null) {
          markTestSkipped('no M2 numbers yet: test/m2_dom_dish.json comes from ~/.cache/udine-scratch/flutter/m2dom-dish.js against the round-11 build');
          return;
        }
        final m = (_more!['$w'] as Map<String, dynamic>)[key] as Map<String, dynamic>;
        final boot = await bootRecorded(t, health: true, carbon: true);
        await openHall(t, boot, '/hall/worcester?meal=lunch', w: w.toDouble());
        final hall = t.state<HallMenuState>(find.byType(HallMenu));
        final ctx = t.element(find.byType(HallMenu));
        final items = await lunchDishes(t, boot, 1, '2026-10-08');
        MenuItem named(String n) => items.firstWhere((d) => d.dishName == n);
        void sheetOf(MenuItem d, {List<String> avoid = const []}) => openDishSheet(ctx, dish: d, place: 'W', meal: 'lunch', day: 0, fx: hall.fx, avoid: avoid, onServe: (_, _) {});
        switch (key) {
          case 'avoid':
            final d = items.firstWhere((d) => d.allergens.contains('Milk') && d.allergens.length > 1);
            sheetOf(d, avoid: ['Milk']);
          case 'bare':
            final d = items.first;
            sheetOf(MenuItem(dishName: d.dishName, category: d.category, mealPeriod: d.mealPeriod, hallTid: d.hallTid, date: d.date, nutrition: d.nutrition, allergens: const [], dietTags: const []));
          case 'whereTwo':
            sheetOf(named('Black Bean Burger'));
          case 'plateLabel':
            for (final n in ['Beef Brisket Noodle Bowl', 'Golden BBQ Chicken Thigh', 'Golden BBQ Chicken Thigh']) {
              boot.plate.add('lunch', n, {'W': named(n)});
            }
            openPlateLabel(ctx, plate: boot.plate.state.plates.single, fx: hall.fx);
          case 'rowFav':
            await boot.prefs.toggleFavorite('Golden BBQ Chicken Thigh');
          default:
            sheetOf(named('Golden BBQ Chicken Thigh'));
        }
        await sheetUp(t);
        if (key == 'favOn') {
          await t.tap(find.byType(FavoriteStar));
          await t.pumpAndSettle();
          near('favb', rect(t, find.descendant(of: find.byType(FavoriteStar), matching: find.byType(Press))), m['favb'], w);
        } else if (key == 'rowFav') {
          near('star', rect(t, find.byType(StarMark)), m['star'], w);
        } else {
          compareSheet(t, w, m);
        }
        await drain(t);
      });
    }
  }
}
