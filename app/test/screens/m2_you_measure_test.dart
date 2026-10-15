// M2's own You geometry (test/m2_dom_you.json: You, a day, a meal's sheet and its Removed row, measured by
// ~/.cache/udine-scratch/flutter/m2dom-you.js on the approved build at dpr 1) against ours, within 1 dp. Each rect is [left, top, width, height].
//
// The file does not exist yet: the dispatch that built You had no Chromium, so the script is written and not run. Every test here is
// skipped until test/m2_dom_you.json is in. NOT MEASURED: every figure below. M2's `?state=you` has today's breakfast and lunch and the
// seeded Oct 1-7 under Earlier; ours seeds today's two meals and two earlier days, so only the first rows are compared by index.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/types.dart';
import 'package:udine/screens/plate/plate_row.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'support.dart';
import 'you_support.dart';

final _file = File('test/m2_dom_you.json');
final _dom = _file.existsSync() ? jsonDecode(_file.readAsStringSync()) as Map<String, dynamic> : null;
const _why = 'test/m2_dom_you.json is missing: run ~/.cache/udine-scratch/flutter/m2dom-you.js (phase 1 had no Chromium)';

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

// M2 draws a day's sections 20 dp further in: `dayBlock` (its `.sec` carries 20) is reused inside `.pbody` (20), so the padding doubles. Every
// other page body, and You, sit at 20; the day page is built at 20, so M2's x is 20 less and its width 40 more.
Object? _day(Object? r) => r is List ? [r[0] - 20, r[1], r[2] + 40, r[3]] : r;

Object? _at(Object? list, int i) => list is List && i < list.length ? list[i] : null;

void main() {
  setUpAll(loadFonts);
  for (final w in [360, 390]) {
    Map<String, dynamic> m(String k) => ((_dom![w.toString()] as Map)[k] as Map).cast<String, dynamic>();

    testWidgets('You at $w dp matches M2 within 1 dp', (t) async {
      final b = await bootYou(t);
      await t.runAsync(() async {
        await b.store!.addEntries([LogEntry(id: 'l0', loggedAt: '2026-10-08T12:41:00.000', source: const UmassMenuSource(dishName: 'Beef Brisket Noodle Bowl', hallTid: 1), servings: 1, nutrition: seedToday.first.nutrition)]);
        await b.log!.reload();
      });
      await openYou(t, b, w: w.toDouble());
      final y = m('you');
      _near('title', t.getRect(find.text('You').first), y['h1'], w, block: true);
      _near('date', t.getRect(find.text('Thursday, October 8')), y['date'], w, origin: true);
      _near('Today', t.getRect(find.text('Today')), _at(y['h2'], 0), w, block: true);
      _near('facts', t.getRect(find.byType(Facts)), _at(y['facts'], 0), w);
      _near('Meals', t.getRect(find.text('Meals')), _at(y['h2'], 1), w, block: true);
      final rows = find.byType(LRow);
      for (var i = 0; i < 4; i++) {
        _near('row $i', t.getRect(rows.at(i)), _at(y['lrows'], i), w);
      }
      _near('Earlier', t.getRect(find.text('Earlier')), _at(y['h2'], 2), w, block: true);
      _flush();
      await drain(t);
    }, skip: _dom == null);

    testWidgets('a day at $w dp matches M2 within 1 dp', (t) async {
      final b = await bootYou(t);
      await openYou(t, b, w: w.toDouble(), route: '/you/day/2026-10-07');
      final d = m('day');
      _near('facts', t.getRect(find.byType(Facts)), _day(_at(d['facts'], 0)), w);
      final rows = find.byType(LRow);
      for (var i = 0; i < 2; i++) {
        _near('row $i', t.getRect(rows.at(i)), _day(_at(d['lrows'], i)), w);
      }
      _flush();
      await drain(t);
    }, skip: _dom == null);

    testWidgets("a meal's sheet and its Removed row at $w dp match M2 within 1 dp", (t) async {
      final b = await bootYou(t);
      await openYou(t, b, w: w.toDouble(), route: '/you/day/2026-10-07');
      await t.tap(find.text('Lunch at Worcester'));
      await t.pumpAndSettle();
      final s = m('meal');
      final rows = find.byType(PlateRow);
      for (var i = 0; i < 3; i++) {
        _near('prow $i', t.getRect(rows.at(i)), _at(s['prow'], i), w, block: true);
      }
      _near('facts', t.getRect(find.descendant(of: find.byType(Facts).last, matching: find.byType(Container)).first), s['facts'], w, block: true);
      _near('Full label', t.getRect(find.widgetWithText(TextAction, 'Full label')), _at(s['tbtn'], 0), w, block: true);
      final row = rows.first;
      for (var i = 0; i < 2; i++) {
        await t.tap(find.descendant(of: row, matching: find.bySemanticsLabel('Less')));
        await wrote(t);
      }
      final r = m('removed');
      _near('Removed', t.getRect(find.textContaining('Removed')), r['lgoneTx'], w, block: true);
      _near('Undo', t.getRect(find.widgetWithText(TextAction, 'Undo')), r['lgoneBtn'], w);
      _flush();
      await drain(t);
    }, skip: _dom == null);
  }
  test('the You DOM numbers are in', skip: _dom == null ? _why : null, () => expect(_dom, isNotNull));
}
