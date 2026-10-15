// M2's own dish-sheet geometry (m2_dom.json `dish` per width: Golden BBQ Chicken Thigh opened from Worcester lunch, both score toggles
// on, measured with ~/.cache/udine-scratch/flutter/m2dom.js on src.html at dpr 1) against ours, within 1 dp. Each rect is
// [left, top, width, height]; a block's width is the column's, not the text's, so those compare left, top and height only.
//
// The other states (a café price, an avoided allergen, no marks, the favourite on, ingredients open, two places, tomorrow, the row star and
// the plate's label) read test/m2_dom_dish.json, measured by m2dom-dish.js against the round-11 build.
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
final _more = jsonDecode(File('test/m2_dom_dish.json').readAsStringSync()) as Map<String, dynamic>;

const route = '/hall/worcester?meal=lunch&dish=Golden+BBQ+Chicken+Thigh';

List<double> rect(WidgetTester t, Finder f) {
  final x = t.getRect(f.first);
  return [x.left, x.top, x.width, x.height];
}

/// Every rect that differs, reported together at the end of a state.
final _misses = <String>[];
void flush() {
  final m = [..._misses];
  _misses.clear();
  expect(m, isEmpty, reason: m.join('\n'));
}

void near(String what, List<double> got, Object? want, int w, {bool block = false, bool origin = false}) {
  final v = (want as List).cast<num>();
  for (var i = 0; i < 4; i++) {
    if ((block && i == 2) || (origin && i > 1)) continue;
    if ((got[i] - v[i]).abs() > 1.0) _misses.add('$what[${const ['left', 'top', 'width', 'height'][i]}] ours $got, M2 $v at $w dp');
  }
}

/// A rect's left and top, for a block compared by its position only.
List<double> left(Object? r) => [(r as List)[0].toDouble(), r[1].toDouble()];


/// What the sheet shows, against the M2 rects `m` (a `dish` block): every key M2 measured and the sheet has a widget for.
void compareSheet(WidgetTester t, int w, Map<String, dynamic> m) {
  const frame = 844.0;
  final sheet = t.widget<M2Sheet>(find.byType(M2Sheet).last);
  if ((frame - sheet.handle.px - ((m['sheet'] as List)[1] as num)).abs() > 1.0) _misses.add('resting top ours ${frame - sheet.handle.px}, M2 ${m['sheet']}');
  near('grab', rect(t, find.byType(SheetGrab)), m['grab'], w);
  final name = find.byType(DishSheet).evaluate().isEmpty ? 'Your plate' : t.widget<DishSheet>(find.byType(DishSheet)).dish.dishName;
  near('dn', rect(t, find.descendant(of: find.byType(M2Sheet).last, matching: find.text(name))), m['dn'] ?? m['sh1h2'], w, block: true);
  if (m['dsv'] != null && find.byType(DishSheet).evaluate().isNotEmpty) {
    final serving = t.widget<DishSheet>(find.byType(DishSheet)).dish.nutrition.servingSize.trim().toLowerCase();
    near('dsv', rect(t, find.byWidgetPredicate((x) => x is RichText && x.text.toPlainText().endsWith(serving) && !x.text.toPlainText().contains('Nutrition'))), m['dsv'], w, block: true);
  }
  if (m['mks'] != null) near('mks', rect(t, find.byType(MarkPatch)), m['mks'], w, block: true);
  if (m['dal'] != null) near('dal', rect(t, find.textContaining('Contains', findRichText: true)), m['dal'], w, block: true);
  if (m['dadd'] != null) near('dadd', rect(t, find.byType(Button)), m['dadd'], w);
  if (m['where'] != null) near('where', rect(t, find.textContaining(RegExp(r'now|Tomorrow|from', caseSensitive: false), findRichText: true)), m['where'], w, origin: true);
  if (m['hchip'] != null && (m['hchip'] as List).isNotEmpty) {
    final c = m['hchip'] as List; // one rect (m2_dom.json) or every chip's (m2_dom_dish.json)
    near('hchip', rect(t, find.byType(HallChip)), c.first is List ? c.first : c, w);
  }
  if (m['kv'] != null) near('kv', rect(t, find.textContaining('Beef Brisket', findRichText: true).last), m['kv'], w, block: true);
  near('label', rect(t, find.byType(NutritionLabel)), m['label'], w);
  near('cal', rect(t, find.ancestor(of: find.text('Calories'), matching: find.byType(Container))), m['cal'], w);
  if (m['grades'] != null) near('grades', rect(t, find.byType(RatingsPanel)), m['grades'], w);
  if (m['ingh'] != null) near('ingh', rect(t, find.text('Ingredients')), m['ingh'], w, block: true);
  flush();
}

void main() {
  setUpAll(loadFonts);
  for (final w in [360, 390]) {
    final m = (_dom['$w'] as Map<String, dynamic>)['dish'] as Map<String, dynamic>;
    testWidgets('the dish sheet of Golden BBQ Chicken Thigh at $w dp: every block where M2 puts it (within 1 dp)', (t) async {
      await openHall(t, await bootRecorded(t, health: true, carbon: true), route, w: w.toDouble());
      await sheetUp(t);
      final sheet = t.widget<M2Sheet>(find.byType(M2Sheet).last);
      // the sheet's top edge is where it rests (M2 `IS.mid`, 4 dp fix: the label's rule under Calories plus a 6 dp sliver)
      expect(sheet.handle.px, closeTo(844 - (m['mid'] as num), 1.0), reason: 'IS.mid');
      near('favb', rect(t, find.descendant(of: find.byType(FavoriteStar), matching: find.byType(Press))), m['favb'], w);
      compareSheet(t, w, m);
      await drain(t);
    });
  }

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
        final m = (_more['$w'] as Map<String, dynamic>)[key] as Map<String, dynamic>;
        final boot = await bootRecorded(t, health: true, carbon: true);
        final items = await lunchDishes(t, boot, 1, '2026-10-08'); // (before the page: the sheet's prefetch holds the repository's slots)
        // (M2's first café dish with a price today: the Terrace's breakfast sandwich)
        final route = key == 'cafe' ? '/cafe/27?meal=breakfast&dish=${Uri.encodeQueryComponent('Bacon, Egg & Cheese on English Muffin')}'
            : key == 'whereTomorrow' ? dishRoute('Tofu Scramble', meal: 'breakfast', day: '2026-10-09') : '/hall/worcester?meal=lunch';
        await openHall(t, boot, route, w: w.toDouble(), h: key == 'rowFav' ? 3000 : 844);
        final hall = t.state<HallMenuState>(find.byType(HallMenu));
        final ctx = t.element(find.byType(HallMenu));
        MenuItem named(String n) => items.firstWhere((d) => d.dishName == n);
        void sheetOf(MenuItem d, {List<String> avoid = const []}) => openDishSheet(ctx, dish: d, place: 'W', meal: 'lunch', day: 0, fx: hall.fx, avoid: avoid, onServe: (_, _) {});
        switch (key) {
          case 'avoid':
            final d = items.firstWhere((d) => d.allergens.contains('Milk') && d.allergens.length > 1);
            sheetOf(d, avoid: ['Milk']);
          case 'bare':
            final d = items.first;
            sheetOf(MenuItem(dishName: d.dishName, category: d.category, mealPeriod: d.mealPeriod, hallTid: d.hallTid, date: d.date, nutrition: d.nutrition, allergens: const [], dietTags: const [], ingredients: d.ingredients, price: d.price));
          case 'whereTwo':
            sheetOf(named('Black Bean Burger'));
          case 'plateLabel':
            for (final n in ['Beef Brisket Noodle Bowl', 'Golden BBQ Chicken Thigh', 'Golden BBQ Chicken Thigh']) {
              boot.plate.add('lunch', n, {'W': named(n)});
            }
            openPlateLabel(ctx, plate: boot.plate.state.plates.single, fx: hall.fx);
          case 'rowFav':
            await t.runAsync(() => boot.prefs.toggleFavorite('Golden BBQ Chicken Thigh'));
          case 'cafe' || 'whereTomorrow':
            break; // opened by the route
          default:
            sheetOf(named('Golden BBQ Chicken Thigh'));
        }
        if (key == 'rowFav' || key == 'plateLabel') {
          await t.pumpAndSettle();
        } else {
          await sheetUp(t);
        }
        if (key == 'favOn') {
          await t.tap(find.byType(FavoriteStar));
          await t.pumpAndSettle();
          near('favb', rect(t, find.descendant(of: find.byType(FavoriteStar), matching: find.byType(Press))), m['favb'], w);
          flush();
        } else if (key == 'rowFav') {
          near('star', rect(t, find.descendant(of: find.byType(StarMark), matching: find.byType(CustomPaint)).first), m['star'], w, block: true);
          flush();
        } else if (key == 'ingOpen') {
          // M2 scrolled to the button first, so only the distances inside the sheet are comparable
          await t.flingFrom(Offset(w / 2.0, 600), const Offset(0, -600), 1800);
          await t.pumpAndSettle();
          await t.ensureVisible(find.text('Show all'));
          await t.pumpAndSettle();
          await t.tap(find.text('Show all'));
          await t.pumpAndSettle();
          await t.ensureVisible(find.text('Show less'));
          await t.pumpAndSettle();
          final g = rect(t, find.byType(RatingsPanel)), h = rect(t, find.text('Ingredients')), more = rect(t, find.ancestor(of: find.text('Show less'), matching: find.byType(Press)));
          final mg = (m['grades'] as List).cast<num>(), mh = (m['ingh'] as List).cast<num>(), mm = (m['ingmore'] as List).cast<num>(), mi = (m['ing'] as List).cast<num>();
          expect(h[1] - (g[1] + g[3]), closeTo(mh[1] - (mg[1] + mg[3]), 1.0), reason: 'grades to Ingredients');
          // the engine rounds each 22.5 dp line of ingredients up to 23, so ours is between 0 and half a dp per line longer than M2's
          final lines = (mi[3] / 22.5).round();
          expect(more[1] - h[1], closeTo(mm[1] - mh[1] + 0.25 * lines, 0.25 * lines + 1), reason: 'Ingredients to Show less (the button is 44 here, 40 in M2: same top)');
          expect(more[1] - h[1], greaterThan(mi[3]), reason: 'every line is showing');
        } else {
          compareSheet(t, w, m);
        }
        await drain(t);
      });
    }
  }
}
