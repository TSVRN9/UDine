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

    void checkBar(WidgetTester t, Map<String, dynamic> b, {bool plateText = true}) {
      _near('bar', t.getRect(bar), b['bar'], w);
      if (plateText) {
        _near('l1', t.getRect(inBar(find.textContaining(RegExp(r'items?$'))).first), b['l1'], w, block: true);
        _near('cal', t.getRect(inBar(find.text('404'))), b['cal'], w);
        _near('gbtn', t.getRect(find.descendant(of: bar, matching: find.widgetWithText(Button, 'Log'))), b['gbtn'], w, block: true);
      }
    }

    testWidgets('the bar with the benchmark plate at $w dp matches M2 within 1 dp', skip: _dom == null, (t) async {
      await openPlate(t, w: w.toDouble());
      checkBar(t, (m()['bar'] as Map).cast<String, dynamic>());
      _flush();
      await drain(t);
    });

    testWidgets('the sheet at mid and at the top at $w dp matches M2 within 1 dp', skip: _dom == null, (t) async {
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

    testWidgets('the receipt at $w dp matches M2 within 1 dp', skip: _dom == null, (t) async {
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
