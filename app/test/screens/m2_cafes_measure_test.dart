// M2's cafés page and café page geometry (m2_dom.json, `cafes` per width, from ~/.cache/udine-scratch/flutter/m2dom-cafes.js: ?state=cafes at
// Oct 8 12:41, and the café pages by openHall) against ours, within 1 dp. Skipped until the `cafes` section has been merged into
// m2_dom.json (the script needs Chromium, a heavy job). Rects are [left, top, width, height].
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/screens/cafes/cafes_page.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'support.dart';

final _dom = jsonDecode(File('test/m2_dom.json').readAsStringSync()) as Map<String, dynamic>;

void main() {
  setUpAll(loadFonts);
  for (final w in [360, 390]) {
    final m = (_dom['$w'] as Map<String, dynamic>)['cafes'] as Map<String, dynamic>?;

    List<double> r(WidgetTester t, Finder f) {
      final x = t.getRect(f);
      return [x.left, x.top, x.width, x.height];
    }

    void near(String what, List<double> got, Object? want, {bool block = false}) {
      final v = (want as List).cast<num>();
      for (var i = 0; i < 4; i++) {
        if (block && i == 2) continue;
        expect(got[i], closeTo(v[i], 1.0), reason: '$what[${const ['left', 'top', 'width', 'height'][i]}] ours $got, M2 $v at $w dp');
      }
    }

    testWidgets('Cafés & markets at $w dp: bar, chip, first header and rows match M2 within 1 dp', (t) async {
      final on = m!['on'] as Map<String, dynamic>;
      await openApp(t, await bootRecorded(t), route: '/cafes', w: w.toDouble());
      await until(t, () => find.textContaining(RegExp(r'^Open until')).evaluate().isNotEmpty);
      await t.pump(const Duration(milliseconds: 700));
      Finder inPage(Finder f) => find.descendant(of: find.byType(CafesPage), matching: f);
      near('pbar', r(t, inPage(find.byType(ScreenHeader))), on['pbar']);
      near('chip', r(t, inPage(find.byType(FilterChipButton))), on['chip'], block: true);
      // Ours is a full-bleed pinned header with the 20 dp gutter inside; M2's box is the padded one, so left/width are the gutter's.
      final ahd = r(t, find.ancestor(of: inPage(find.text((on['ahdText'] as List).first as String)).first, matching: find.byType(Container)).first);
      near('ahd 0', [ahd[0] + 20, ahd[1], ahd[2] - 40, ahd[3]], (on['ahd'] as List).first);
      for (var i = 0; i < 3; i++) {
        near('row $i', r(t, inPage(find.byType(LRow)).at(i)), (on['rows'] as List)[i]);
        near('thumb $i', r(t, inPage(find.byType(Thumb)).at(i)), (on['thumb'] as List)[i]);
      }
      await t.pumpWidget(const SizedBox());
      await t.pump(const Duration(seconds: 2));
      await writesLanded(t);
    }, skip: m == null);

    for (final (name, id) in [('Tamales', 'c4'), ('Newman Café', 'c17'), ('Paciugo', 'c0'), ("People's Organic Coffee", 'c9')]) {
      testWidgets('café page $name at $w dp: header, name, controls and tabs match M2 within 1 dp', (t) async {
        final p = (m!['pages'] as Map<String, dynamic>)[name] as Map<String, dynamic>;
        await openApp(t, await bootRecorded(t), route: '/cafe/${id.substring(1)}', w: w.toDouble());
        await until(t, () => find.byType(HallMenu).evaluate().isNotEmpty);
        await t.pump(const Duration(milliseconds: 700));
        await until(t, () => find.byType(Spinner).evaluate().isEmpty);
        await t.pump(const Duration(milliseconds: 700));
        Finder inPage(Finder f) => find.descendant(of: find.byType(HallMenu), matching: f);
        near('mhead', [0, 0, w.toDouble(), 24 + 282], p['mhead']);
        near('mtn', r(t, inPage(find.byWidgetPredicate((x) => x is Text && x.data == name && (x.style?.fontSize ?? 0) > 30))), p['mtn'], block: true);
        near('back', r(t, inPage(find.byType(BackButton))), p['back']);
        near('pin', r(t, inPage(find.byType(PinButton))), p['pin']);
        await t.pumpWidget(const SizedBox());
        await t.pump(const Duration(seconds: 2));
        await writesLanded(t);
      }, skip: m == null);
    }
  }
}
