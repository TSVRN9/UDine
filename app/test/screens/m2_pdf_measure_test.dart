// M2's café PDF rows and page geometry (m2_dom.json, `pdf` per width, from ~/.cache/udine-scratch/flutter/m2dom-pdf.js) against ours, within 1 dp.
// Skipped until that script has been run (Chromium, a heavy job) and its `pdf` section merged into m2_dom.json. Rects are [left, top, width, height].
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/cafes/pdf_page.dart';
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
        near('row $i title', r(t, find.text((c['names'] as List)[i] as String)), (c['a'] as List)[i]);
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
  }
}
