// M2's own variant-picker geometry (test/m2_dom_variants.json, measured by ~/.cache/udine-scratch/flutter/m2dom-variants.js on a fresh build of the merged M2
// at dpr 1) against ours, within 1 dp: the chips under a name (their rects measured from the name's top, since M2's sheets sit 812 tall and translated),
// the second group a section gap below the first, a chosen chip no wider than an unchosen one, and a family row's token leading its meta line.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/dish/dish_sheet.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'dish_support.dart';
import 'support.dart';

final _dom = jsonDecode(File('test/m2_dom_variants.json').readAsStringSync()) as Map<String, dynamic>;

final _misses = <String>[];
void near(String what, double got, num want, int w) {
  if ((got - want).abs() > 1.0) _misses.add('$what ours $got, M2 $want at $w dp');
}

void flush() {
  final m = [..._misses];
  _misses.clear();
  expect(m, isEmpty, reason: m.join('\n'));
}

Rect name(WidgetTester t) => t.getRect(find.descendant(of: find.byType(DishHead), matching: find.byType(Text)).first);
List<Rect> chips(WidgetTester t) => [for (final e in find.descendant(of: find.byType(VariantPicker), matching: find.byType(AnimatedContainer)).evaluate()) t.getRect(find.byElementPredicate((x) => x == e))];

/// Our chips against M2's: left, width and height as they are, top from the name's top.
void compareChips(WidgetTester t, int w, Map<String, dynamic> m) {
  final dn = (m['dn'] as List).cast<num>(), got = chips(t), want = (m['chips'] as List).map((c) => (c as List).cast<num>()).toList(), n = name(t);
  expect(got.length, want.length, reason: 'chips');
  near('name top to height', n.height, dn[3], w);
  for (var i = 0; i < want.length; i++) {
    near('chip $i left', got[i].left, want[i][0], w);
    near('chip $i top below the name', got[i].top - n.top, want[i][1] - dn[1], w);
    near('chip $i width', got[i].width, want[i][2], w);
    near('chip $i height', got[i].height, want[i][3], w);
  }
  flush();
}

Future<void> pick(WidgetTester t, String label) async {
  await t.tap(find.descendant(of: find.byType(VariantPicker), matching: find.text(label)));
  await t.pumpAndSettle();
}

void main() {
  setUpAll(loadFonts);
  for (final w in [390, 360]) {
    Map<String, dynamic> m(String k) => (_dom['$w'] as Map<String, dynamic>)[k] as Map<String, dynamic>;

    testWidgets('a size family\'s chips at $w dp: 44 high, 8 apart, 8 under the name; choosing 20 oz moves nothing', (t) async {
      await openHall(t, await bootRecorded(t), '/cafe/12?dish=${Uri.encodeQueryComponent('16 oz Cappuccino')}', w: w.toDouble());
      await sheetUp(t);
      compareChips(t, w, m('cap16'));
      await pick(t, '20 oz');
      compareChips(t, w, m('cap20'));
      await drain(t);
    });

    testWidgets('a milk family\'s five chips wrap to two lines at $w dp, as M2\'s; Oat chosen is the same rects', (t) async {
      await openHall(t, await bootRecorded(t), '/cafe/19?dish=${Uri.encodeQueryComponent('Boba Almond Milk')}', w: w.toDouble());
      await sheetUp(t);
      compareChips(t, w, m('bobaA'));
      await pick(t, 'Oat');
      compareChips(t, w, m('bobaO'));
      await drain(t);
    });

    testWidgets('a base family\'s name wraps over its two chips at $w dp (Courtside\'s smoothie)', (t) async {
      await openHall(t, await bootRecorded(t), '/cafe/26?dish=${Uri.encodeQueryComponent('Banana Berry Coconut Smoothie')}', w: w.toDouble());
      await sheetUp(t);
      compareChips(t, w, m('smoothie'));
      await drain(t);
    });

    for (final (key, cafe) in [('star0', 7), ('whit0', 20)]) {
      testWidgets('a café pho\'s protein and broth groups at $w dp ($key): a section gap between them', (t) async {
        await openHall(t, await bootRecorded(t), '/cafe/$cafe', w: w.toDouble());
        final row = find.widgetWithText(ListRow, 'Noodle Bowl');
        final sc = t.state<ScrollableState>(find.descendant(of: find.byType(HallMenu), matching: find.byType(Scrollable)).first);
        for (var y = 0.0; row.evaluate().isEmpty && y < sc.position.maxScrollExtent; y += 300) {
          sc.position.jumpTo(y);
          await t.pump();
        }
        await t.ensureVisible(row);
        await t.pumpAndSettle();
        await t.tap(row);
        await sheetUp(t);
        compareChips(t, w, m(key));
        await drain(t);
      });
    }

    testWidgets('a family row\'s token leads its meta line at $w dp, then the figures where M2 puts them', (t) async {
      await openHall(t, await bootRecorded(t), '/cafe/12', w: w.toDouble());
      final sc = t.state<ScrollableState>(find.descendant(of: find.byType(HallMenu), matching: find.byType(Scrollable)).first);
      final row = find.byWidgetPredicate((x) => x is DishRow && x.family == 'Cappuccino');
      for (var y = 0.0; row.evaluate().isEmpty && y < sc.position.maxScrollExtent; y += 300) {
        sc.position.jumpTo(y);
        await t.pump();
      }
      await t.ensureVisible(row);
      await t.pumpAndSettle();
      final g = m('wcafe'), r = t.getRect(row), tok = t.getRect(find.descendant(of: row, matching: find.text('16 oz'))), figs = (g['figs'] as List).cast<List>();
      near('row height', r.height, (g['row'] as List)[3], w);
      near('token left', tok.left, (g['vt'] as List)[0], w);
      near('token top below the row', tok.top - r.top, (g['vt'] as List)[1] - (g['row'] as List)[1], w);
      near('token width', tok.width, (g['vt'] as List)[2], w);
      near('figures left', t.getRect(find.descendant(of: row, matching: find.text('0')).first).left, figs[0][0], w);
      flush();
      await drain(t);
    });
  }
}
