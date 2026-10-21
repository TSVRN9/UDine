// M2 R12d's Fountain Drink (test/m2_dom_fountain.json, measured by ~/.cache/udine-scratch/flutter/m2dom-fountain.js on a fresh build of M2 at dpr 1)
// against ours, within 1 dp: the last Beverages station's row (no marks, dashes), its sheet (no star, so the name has the whole line) and the plate it joins.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/dish/dish_sheet.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'dish_support.dart';
import 'plate_support.dart';
import 'support.dart';

final _dom = jsonDecode(File('test/m2_dom_fountain.json').readAsStringSync()) as Map<String, dynamic>;
final _misses = <String>[];
void near(String what, double got, num want, int w) {
  if ((got - want).abs() > 1.0) _misses.add('$what ours $got, M2 $want at $w dp');
}

void flush() {
  final m = [..._misses];
  _misses.clear();
  expect(m, isEmpty, reason: m.join('\n'));
}

Finder get row => find.widgetWithText(ListRow, 'Fountain Drink');

Future<void> toBeverages(WidgetTester t) async {
  final sc = t.state<ScrollableState>(find.descendant(of: find.byType(HallMenu), matching: find.byType(Scrollable)).first);
  for (var i = 0; i < 5 && row.evaluate().isEmpty; i++) {
    sc.position.jumpTo(sc.position.maxScrollExtent);
    await t.pumpAndSettle();
  }
  await Scrollable.ensureVisible(t.element(row), alignment: 0.3);
  await t.pumpAndSettle();
}

void main() {
  setUpAll(loadFonts);
  for (final w in [390, 360]) {
    Map<String, dynamic> m(String k) => (_dom['$w'] as Map<String, dynamic>)[k] as Map<String, dynamic>;
    List<num> r(Map<String, dynamic> g, String k) => (g[k] as List).cast<num>();

    testWidgets('the row under Beverages at $w dp: 64 high below a 50 high header, dashes, no marks, the + where M2 puts it', (t) async {
      await openHall(t, await bootRecorded(t), '/hall/worcester?meal=lunch', w: w.toDouble());
      await toBeverages(t);
      final g = m('menu'), head = t.getRect(find.text('Beverages')), rr = t.getRect(row);
      near('header text to row', rr.top - head.top, r(g, 'row')[1] - r(g, 'sthT')[1], w);
      near('row height', rr.height, r(g, 'row')[3], w);
      near('name left', t.getRect(find.descendant(of: row, matching: find.text('Fountain Drink'))).left, r(g, 'n')[0], w);
      near('name top below the row', t.getRect(find.descendant(of: row, matching: find.text('Fountain Drink'))).top - rr.top, r(g, 'n')[1] - r(g, 'row')[1], w);
      near('first figure left', t.getRect(find.descendant(of: row, matching: find.text('–')).first).left, (g['figs'] as List)[0][0], w);
      near('+ right edge', t.getRect(find.descendant(of: row, matching: find.byType(RowControl))).right, r(g, 'ctl')[0] + r(g, 'ctl')[2], w);
      expect(g['tg'], 0);
      flush();
      await drain(t);
    });

    testWidgets('its sheet at $w dp: no star, the name on the whole line, the label where M2 puts it', (t) async {
      await openHall(t, await bootRecorded(t), '/hall/worcester?meal=lunch', w: w.toDouble());
      await toBeverages(t);
      await t.tap(row);
      await sheetUp(t);
      final g = m('sheet'), dn = r(g, 'dn'), n = t.getRect(find.descendant(of: find.byType(DishHead), matching: find.byType(Text)).first);
      expect(find.byType(FavoriteStar), findsNothing);
      near('name width', n.width, dn[2], w);
      near('name height', n.height, dn[3], w);
      flush();
      await drain(t);
    });

    testWidgets('on the plate at $w dp: one item, dashes for calories and protein, the stepper in the row', (t) async {
      final b = await bootRecorded(t);
      await openHall(t, b, '/hall/worcester?meal=lunch', w: w.toDouble());
      await toBeverages(t);
      await t.tap(find.descendant(of: row, matching: find.byType(AddButton)).first);
      await t.pumpAndSettle();
      final g = m('plate'), bb = t.getRect(bar);
      expect(b.plate.state.plates.single.items.single.name, 'Fountain Drink');
      near('bar height', bb.height, r(g, 'bar')[3], w);
      near('bar cal left', t.getRect(inBar(find.text('–')).first).left, r(g, 'cal')[0], w);
      near('bar cal centre below the bar', t.getRect(inBar(find.text('–')).first).center.dy - bb.top, r(g, 'cal')[1] + r(g, 'cal')[3] / 2 - r(g, 'bar')[1], w);
      near('stepper left', t.getRect(find.descendant(of: row, matching: find.byType(RowControl))).left, ((g['row'] as Map)['ctl'] as List)[0], w);
      flush();
      await finish(t);
    });
  }
}
