// M2's own plate geometry (test/m2_dom_plate.json: the bar, the choose bar, the receipt, two plates and the sheet at mid and at the top,
// measured by ~/.cache/udine-scratch/flutter/m2dom-plate.js on the approved build at dpr 1) against ours, within 1 dp. Each rect is
// [left, top, width, height]; a block's width is the column's, so blocks compare left, top and height only, and M2's #psheet is as tall as
// the frame and translated, so the sheet compares left and top only.
//
// The file does not exist yet: the dispatch that built the plate had no Chromium, so the script is written and not run. Every test
// here is skipped until test/m2_dom_plate.json is in. NOT MEASURED: every figure below, in particular the mid detent for the
// benchmark plate (this build sizes it by M2's formula, `min(36% of the frame, tab bar - content)`, which for the benchmark plate
// is the content, not the 36% line).
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/plate/plate_row.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'plate_support.dart';
import 'support.dart';

final _file = File('test/m2_dom_plate.json');
final _dom = _file.existsSync() ? jsonDecode(_file.readAsStringSync()) as Map<String, dynamic> : null;
const _why = 'test/m2_dom_plate.json is missing: run ~/.cache/udine-scratch/flutter/m2dom-plate.js (phase 1 had no Chromium)';

final _misses = <String>[];
void _near(String what, Rect got, Object? want, int w, {bool block = false, bool origin = false}) {
  if (want == null) return;
  final v = (want as List).cast<num>(), g = [got.left, got.top, got.width, got.height];
  for (var i = 0; i < 4; i++) {
    if ((block && i == 2) || (origin && i > 1)) continue;
    if ((g[i] - v[i]).abs() > 1.0) _misses.add('$what[${const ['left', 'top', 'width', 'height'][i]}] ours $g, M2 $v at $w dp');
  }
}

void _flush() {
  final m = [..._misses];
  _misses.clear();
  expect(m, isEmpty, reason: m.join('\n'));
}

void main() {
  setUpAll(loadFonts);
  for (final w in [360, 390]) {
    Map<String, dynamic> m() => (_dom![w.toString()] as Map).cast<String, dynamic>();

    // M2's `?state=plate` boots with the bar already part of an open sheet (its top is 253, not the 709 slot), so the bar's insides are
    // compared by where they sit in the bar; the slot itself is checked on the receipt and the two-plate bar, which boot closed.
    void checkBar(WidgetTester t, Map<String, dynamic> b, {bool absolute = false}) {
      final r = t.getRect(bar), top = absolute ? 0.0 : r.top - ((b['bar'] as List)[1] as num);
      Rect up(Rect x) => x.shift(Offset(0, -top));
      _near('bar', absolute ? r : Rect.fromLTWH(r.left, ((b['bar'] as List)[1] as num).toDouble(), r.width, r.height), b['bar'], w);
      _near('l1', up(t.getRect(inBar(find.textContaining(RegExp(r'items?$'))).first)), b['l1'], w, block: true);
      // (M2's rect for the number is its inline box, the font's 39; the line is 26: compare where they are centred)
      final cal = up(t.getRect(inBar(find.text('404')))), want = (b['cal'] as List).cast<num>();
      if ((cal.center.dy - (want[1] + want[3] / 2)).abs() > 1.0) _misses.add('cal centre ours ${cal.center.dy}, M2 ${want[1] + want[3] / 2} at $w dp');
      if ((cal.left - want[0]).abs() > 1.0) _misses.add('cal left ours ${cal.left}, M2 ${want[0]} at $w dp');
      _near('gbtn', up(t.getRect(find.descendant(of: bar, matching: find.widgetWithText(Button, 'Log')))), b['gbtn'], w, block: true);
    }

    testWidgets('the bar with the benchmark plate at $w dp matches M2 within 1 dp', (t) async {
      final bt = await openPlate(t, w: w.toDouble());
      checkBar(t, (m()['bar'] as Map).cast<String, dynamic>());
      // the two-plate bar boots closed: its slot and its dots
      final b2 = await servings(t, bt, 'Golden BBQ Chicken Thigh', ['W']);
      bt.plate.add('dinner', 'Golden BBQ Chicken Thigh', b2);
      await t.pumpAndSettle();
      _near('split bar', t.getRect(bar), (m()['split'] as Map)['bar'], w);
      _flush();
      await drain(t);
    });

    testWidgets('the sheet at mid and at the top at $w dp matches M2 within 1 dp', (t) async {
      await openPlate(t, w: w.toDouble());
      final h = plateHandle(t), region = 844 - t.getSize(find.byType(M2TabBar)).height;
      await t.tap(inBar(find.textContaining(RegExp(r'items?$'))));
      await t.pumpAndSettle();
      final mid = (m()['sheetMid'] as Map).cast<String, dynamic>();
      _near('psheet(mid)', Rect.fromLTWH(0, region - h.px, w.toDouble(), h.px), mid['psheet'], w, origin: true);
      final rows = (mid['prows'] as List?) ?? const [];
      for (var i = 0; i < rows.length; i++) {
        _near('prow$i', t.getRect(find.byType(PlateRow).at(i)), rows[i], w, block: true);
      }
      _near('facts', t.getRect(find.byType(Facts)), mid['facts'], w, block: true);
      _near('custom', t.getRect(find.byType(CustomButton)), mid['custom'], w, block: true);
      await t.fling(bar, const Offset(0, -500), 2500);
      await t.pumpAndSettle();
      _near('psheet(top)', Rect.fromLTWH(0, region - h.px, w.toDouble(), h.px), ((m()['sheetTop'] as Map)['psheet']), w, origin: true);
      _flush();
      await drain(t);
    });

    testWidgets('the Log at bar at $w dp matches M2 within 1 dp (by where it sits in the bar)', (t) async {
      final b = await openPlate(t, w: w.toDouble(), route: '/halls');
      b.plate.add('lunch', 'Beef Brisket Noodle Bowl', await servings(t, b, 'Beef Brisket Noodle Bowl', ['W', 'B']));
      await t.pumpAndSettle();
      await t.tap(inBar(find.text('Log')));
      await t.pumpAndSettle();
      final c = (m()['choose'] as Map).cast<String, dynamic>(), top = t.getRect(bar).top - ((c['bar'] as List)[1] as num);
      final btns = c['btns'] as List;
      for (final (i, name) in ['Worcester', 'Berkshire'].indexed) {
        _near('log at $name', t.getRect(find.descendant(of: bar, matching: find.widgetWithText(Button, name))).shift(Offset(0, -top)), btns[i], w);
      }
      _flush();
      await drain(t);
    });

    testWidgets('the receipt at $w dp matches M2 within 1 dp', (t) async {
      final b = await openPlate(t, w: w.toDouble());
      await t.tap(inBar(find.text('Log')));
      await logged(t, b);
      final r = (m()['logged'] as Map).cast<String, dynamic>();
      _near('bar', t.getRect(bar), r['bar'], w);
      _near('undo', t.getRect(find.descendant(of: bar, matching: find.widgetWithText(Button, 'Undo'))), r['obtn'], w, block: true);
      _flush();
      await finish(t);
    });
  }
  test('the plate DOM numbers are in', skip: _dom == null ? _why : null, () => expect(_dom, isNotNull));
}
