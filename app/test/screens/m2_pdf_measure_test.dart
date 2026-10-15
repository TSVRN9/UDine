// M2's café PDF rows and page geometry (m2_dom.json, `pdf` per width, from ~/.cache/udine-scratch/flutter/m2dom-pdf.js) against ours, within 1 dp.
// Skipped until that script has been run (Chromium, a heavy job) and its `pdf` section merged into m2_dom.json. Rects are [left, top, width, height].
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/cafes/pdf_page.dart';
import 'package:udine/data/recorded/flags.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'pdf_fake.dart';
import 'support.dart';

final _dom = jsonDecode(File('test/m2_dom.json').readAsStringSync()) as Map<String, dynamic>;

void main() {
  setUpAll(loadFonts);
  for (final w in [360, 390]) {
    final m = (_dom['$w'] as Map<String, dynamic>)['pdf'] as Map<String, dynamic>?;

    List<double> r(WidgetTester t, Finder f) {
      final x = t.getRect(f);
      return [x.left, x.top, x.width, x.height];
    }

    void near(String what, List<double> got, Object? want) {
      final v = (want as List).cast<num>();
      for (var i = 0; i < 4; i++) {
        expect(got[i], closeTo(v[i], 1.0), reason: '$what[${const ['left', 'top', 'width', 'height'][i]}] ours $got, M2 $v at $w dp');
      }
    }

    testWidgets('the café page of PDF menus at $w dp: Menus, the rows, the button and the description match M2 within 1 dp', (t) async {
      final c = m!['cafe'] as Map<String, dynamic>;
      await openApp(t, await bootRecorded(t, pages: await syntheticPages(t)), route: '/cafe/29', w: w.toDouble());
      await until(t, () => find.text('Menus').evaluate().isNotEmpty);
      await drain(t);
      await t.pumpAndSettle();
      near('h3', r(t, find.text('Menus')), c['h3']);
      for (var i = 0; i < 4; i++) {
        // the row is the Container around the title (the title's own box is M2's text width, ours the row's)
        near('row $i', r(t, find.ancestor(of: find.text((c['names'] as List)[i] as String), matching: find.byType(Container)).first), (c['rows'] as List)[i]);
      }
      near('btn', r(t, find.byType(Button)), c['btn']);
      await t.pumpWidget(const SizedBox());
      await t.pump(const Duration(seconds: 2));
    }, skip: m == null);

    testWidgets('the menu page at $w dp: bar, the first page and the unsaved and failed lines match M2 within 1 dp', (t) async {
      final p = m!['page'] as Map<String, dynamic>;
      await openApp(t, await bootRecorded(t, pages: await syntheticPages(t)), route: '/cafe/29/menu/0', w: w.toDouble());
      await until(t, () => find.byType(PdfZoomView).evaluate().isNotEmpty);
      await t.pumpAndSettle();
      near('pbar', r(t, find.byType(ScreenHeader)), p['pbar']);
      near('page 0', r(t, find.byType(Image).first), (p['pages'] as List).first);
      await t.pumpWidget(const SizedBox());
      await t.pump(const Duration(seconds: 2));
    }, skip: m == null);

    testWidgets('the unsaved and failed lines at $w dp start where M2\'s do, and Try again is M2\'s rect', (t) async {
      final u = m!['unsaved'] as Map<String, dynamic>, f = m['failed'] as Map<String, dynamic>;
      await openApp(t, await bootRecorded(t, net: NetMode.offline, pages: await syntheticPages(t)), route: '/cafe/29/menu/0', w: w.toDouble());
      await until(t, () => find.textContaining("You're offline").evaluate().isNotEmpty);
      final line = r(t, find.text(u['emptyText'] as String));
      expect([line[0], line[1]], [closeTo((u['empty'] as List)[0], 1.0), closeTo((u['empty'] as List)[1], 1.0)], reason: 'unsaved line ours $line, M2 ${u['empty']} at $w dp');
      await t.pumpWidget(const SizedBox());
      await t.pump(const Duration(seconds: 2));
      await openApp(t, await bootRecorded(t, pages: await syntheticPages(t), pdfsLinked: false), route: '/cafe/29/menu/0', w: w.toDouble());
      await until(t, () => find.textContaining("didn't load").evaluate().isNotEmpty);
      final fl = r(t, find.text(f['emptyText'] as String));
      expect([fl[0], fl[1]], [closeTo((f['empty'] as List)[0], 1.0), closeTo((f['empty'] as List)[1], 1.0)], reason: 'failed line ours $fl, M2 ${f['empty']} at $w dp');
      near('Try again', r(t, find.byType(Button)), f['retry']);
      await t.pumpWidget(const SizedBox());
      await t.pump(const Duration(seconds: 2));
    }, skip: m == null);
  }
}
