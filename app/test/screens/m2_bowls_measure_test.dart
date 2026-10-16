// M2's own bowl-builder geometry (test/m2_dom_bowls.json, measured by ~/.cache/udine-scratch/flutter/m2dom-bowls.js on a fresh build of main's M2 at dpr 1)
// against ours, within 1 dp: the add-in rows, the heading, the pinned foot, the plate's "with" line, a past meal's. Each rect is [left, top, width, height];
// a block's width is the column's, so blocks compare left, top and height only; M2's sheets are 812 tall and translated, so a sheet compares its top.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/boot.dart';
import 'package:udine/screens/dish/bowl_foot.dart';
import 'package:udine/screens/dish/dish_sheet.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/screens/plate/plate_row.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'dish_support.dart';
import 'plate_support.dart';
import 'support.dart';
import 'you_support.dart';

final _dom = jsonDecode(File('test/m2_dom_bowls.json').readAsStringSync()) as Map<String, dynamic>;

final _misses = <String>[];
void near(String what, Rect got, Object? want, int w, {bool block = false, bool origin = false}) {
  if (want == null) return;
  final v = (want as List).cast<num>(), g = [got.left, got.top, got.width, got.height];
  for (var i = 0; i < 4; i++) {
    if ((block && i == 2) || (origin && i > 1)) continue;
    if ((g[i] - v[i]).abs() > 1.0) _misses.add('$what[${const ['left', 'top', 'width', 'height'][i]}] ours $g, M2 $v at $w dp');
  }
}

void flush() {
  final m = [..._misses];
  _misses.clear();
  expect(m, isEmpty, reason: m.join('\n'));
}

/// What the builder sheet shows against the M2 block `m`.
void compareBuilder(WidgetTester t, int w, Map<String, dynamic> m, {required int rows}) {
  final sheet = t.widget<M2Sheet>(find.byType(M2Sheet).last);
  if ((844 - sheet.handle.px - ((m['sheet'] as List)[1] as num)).abs() > 1.0) _misses.add('resting top ours ${844 - sheet.handle.px}, M2 ${m['sheet']}');
  near('grab', t.getRect(find.byType(SheetGrab)), m['grab'], w);
  final name = t.widget<DishSheet>(find.byType(DishSheet));
  final foot = t.getRect(find.byType(BowlFoot));
  near('foot', foot, m['foot'], w);
  final nums = t.widgetList<Text>(find.descendant(of: find.byType(BowlFoot), matching: find.byType(Text))).toList();
  expect(nums.length, 5, reason: 'cal, unit, protein, unit, button');
  final txt = find.descendant(of: find.byType(BowlFoot), matching: find.byType(Text));
  final bt = (m['footBtn'] as List).cast<num>();
  near('foot button', t.getRect(find.descendant(of: find.byType(BowlFoot), matching: find.byType(Button))), bt, w);
  // (M2's rect for a figure is its inline box, the font's 39; the line is 26: compare where they are centred, and the left)
  final cal = t.getRect(txt.at(0)), want = (m['footNum'] as List)[0] as List;
  if ((cal.center.dy - (want[1] + want[3] / 2)).abs() > 1.0) _misses.add('foot cal centre ours ${cal.center.dy}, M2 ${want[1] + want[3] / 2} at $w dp');
  if ((cal.left - want[0]).abs() > 1.0) _misses.add('foot cal left ours ${cal.left}, M2 ${want[0]} at $w dp');
  final pro = t.getRect(txt.at(2)), wp = (m['footNum'] as List)[1] as List;
  if ((pro.left - wp[0]).abs() > 1.0) _misses.add('foot protein left ours ${pro.left}, M2 ${wp[0]} at $w dp');
  final disabled = (m['footDis'] as List)[0] as bool;
  expect(disabled, name.build != null && t.widget<BowlFoot>(find.byType(BowlFoot)).off, reason: 'Add off');
  final browM = (m['brow'] as List?) ?? const [], ctl = (m['browCtl'] as List?) ?? const [];
  expect(browM.length, rows, reason: 'add-in rows');
  for (var i = 0; i < browM.length; i++) {
    final row = find.byKey(ValueKey('brow:$i'));
    near('brow$i', t.getRect(row), browM[i], w);
    // (M2's rect is the + (48) or the stepper (114 by 44) inside our control's box: the + is the box, the stepper sits at its right and middle)
    final c = t.getRect(find.descendant(of: row, matching: find.byType(RowControl))), v = (ctl[i] as List).cast<num>();
    if (v[2] == 48) {
      near('brow$i +', c, v, w);
    } else if ((c.right - (v[0] + v[2])).abs() > 1.0 || (c.center.dy - (v[1] + v[3] / 2)).abs() > 1.0 || (c.width - v[2]).abs() > 1.0) {
      _misses.add('brow$i stepper ours $c, M2 $v at $w dp');
    }
  }
}

Future<void> tapPlus(WidgetTester t, int i, [int times = 1]) async {
  for (var k = 0; k < times; k++) {
    final r = t.getRect(find.descendant(of: find.byKey(ValueKey('brow:$i')), matching: find.byType(RowControl)));
    await t.tapAt(Offset(r.right - 24, r.center.dy));
    await t.pumpAndSettle();
  }
}

void main() {
  setUpAll(loadFonts);
  for (final w in [360, 390]) {
    Map<String, dynamic> m(String k) => ((_dom['$w'] as Map)[k] as Map).cast<String, dynamic>();
    Future<Boot> open(WidgetTester t, String route) async {
      final b = await bootRecorded(t, health: true, carbon: true);
      await openHall(t, b, route, w: w.toDouble());
      await sheetUp(t);
      return b;
    }

    testWidgets('a Noodle Bowl with nothing chosen, then two parts, at $w dp matches M2 within 1 dp', (t) async {
      await open(t, dishRoute('Beef Brisket Noodle Bowl'));
      compareBuilder(t, w, m('noodle'), rows: 5);
      near('heading', t.getRect(find.text('Noodle Bowl')), (m('noodle')['bh'] as List)[0], w, block: true);
      flush();
      await tapPlus(t, 0);
      await tapPlus(t, 1, 2);
      compareBuilder(t, w, m('noodle2'), rows: 5);
      flush();
      await drain(t);
    });

    testWidgets('a café dish with add-ons, its price summing, at $w dp matches M2 within 1 dp', (t) async {
      await open(t, '/cafe/27?meal=dinner&dish=${Uri.encodeQueryComponent('Harissa Chicken')}');
      compareBuilder(t, w, m('cafe0'), rows: 6);
      flush();
      final part = _dom['$w']['cafePart'] as String;
      final i = t.widget<DishSheet>(find.byType(DishSheet)).build!.parts.indexWhere((x) => x.dishName == part);
      await tapPlus(t, i);
      compareBuilder(t, w, m('cafe1'), rows: 6);
      flush();
      await drain(t);
    });

    testWidgets('a synthetic base at 0 (Add off) and its row in the list, at $w dp, match M2 within 1 dp', (t) async {
      final b = await bootRecorded(t, health: true, carbon: true);
      await openHall(t, b, '/hall/franklin?meal=lunch', w: w.toDouble());
      final row = find.widgetWithText(ListRow, 'Deli Bar');
      final sc = t.state<ScrollableState>(find.descendant(of: find.byType(HallMenu), matching: find.byType(Scrollable)).first);
      for (var y = 0.0; row.evaluate().isEmpty && y < sc.position.maxScrollExtent; y += 300) {
        sc.position.jumpTo(y);
        await t.pump();
      }
      await t.pumpAndSettle();
      await Scrollable.ensureVisible(t.element(row), alignment: 0.5);
      await t.pumpAndSettle();
      final r = t.getRect(row), want = (m('synRow')['row'] as List)[0] as List;
      if ((r.height - want[3]).abs() > 1.0 || (r.left - want[0]).abs() > 1.0 || (r.width - want[2]).abs() > 1.0) _misses.add('syn row ours $r, M2 $want at $w dp');
      flush();
      await t.tap(row);
      await sheetUp(t);
      compareBuilder(t, w, m('syn0'), rows: 7);
      expect(t.widget<BowlFoot>(find.byType(BowlFoot)).off, isTrue);
      flush();
      await drain(t);
    });

    testWidgets('a bowl on the plate reopens with the foot reading Update, and the plate shows its "with" line, at $w dp, matching M2 within 1 dp', (t) async {
      final b = await openPlate(t, w: w.toDouble(), route: '/plate?seed=bowls');
      await t.tap(inBar(find.textContaining(RegExp(r'items?$'))));
      await t.pumpAndSettle();
      final pm = m('plate');
      final rows = pm['prows'] as List, pws = pm['pws'] as List, texts = pm['pwText'] as List;
      // (M2's sheet rests where its content was before the rows were drawn: the rows are compared from the first one's top)
      final dy = t.getRect(find.byType(PlateRow).first).top - ((rows[0] as List)[1] as num);
      for (var i = 0; i < rows.length; i++) {
        near('prow$i', t.getRect(find.byType(PlateRow).at(i)).shift(Offset(0, -dy)), rows[i], w, block: true);
      }
      for (final (i, txt) in texts.indexed) {
        near('pw$i', t.getRect(find.text(txt as String)).shift(Offset(0, -dy)), pws[i], w, block: true);
      }
      flush();
      await t.tap(find.byType(PlateRow).first);
      await sheetUp(t);
      compareBuilder(t, w, m('update'), rows: 5);
      expect(t.widget<BowlFoot>(find.byType(BowlFoot)).update, isTrue);
      expect(find.widgetWithText(Button, 'Update'), findsOneWidget);
      flush();
      await drain(t);
      expect(b.plate.state.plates, isNotEmpty);
    });

    testWidgets('a past meal with a bowl shows its parts, at $w dp, matching M2 within 1 dp', (t) async {
      final b = await bootRecorded(t);
      await t.runAsync(() async {
        await b.seedLog('/you?data=recorded&history=bowl');
      });
      await openYou(t, b, w: w.toDouble(), route: '/you/day/2026-10-05');
      await t.tap(find.textContaining('Lunch').first);
      await t.pumpAndSettle();
      final pm = m('meal');
      near('prow', t.getRect(find.byType(PlateRow)), (pm['prow'] as List).last, w, block: true);
      near('pw', t.getRect(find.text((_dom['$w']['mealPw'] as List)[0] as String)), (pm['pw'] as List).last, w, block: true);
      flush();
      await drain(t);
    });
  }
}
