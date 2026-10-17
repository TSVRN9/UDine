// M2's own custom food form (test/m2_dom_custom.json, measured by ~/.cache/udine-scratch/flutter/m2dom-custom.js on the approved build at
// dpr 1) against ours, within 1 dp: the title, the labels, the five fields and the button, at 390 and 360 dp, empty and with a name. Each
// rect is [left, top, width, height]; widths compare for the fields and the button only (a label or title is as wide as its text).
//
// The file does not exist yet (the dispatch that built the form had no Chromium): every test here is skipped until it is in.
// NOT MEASURED: every figure. Missing file: run ~/.cache/udine-scratch/flutter/m2dom-custom.js and copy its JSON to test/m2_dom_custom.json.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/plate/custom_food.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'support.dart';

final _file = File('test/m2_dom_custom.json');
final _dom = _file.existsSync() ? jsonDecode(_file.readAsStringSync()) as Map<String, dynamic> : null;


void main() {
  setUpAll(loadFonts);

  for (final w in [390, 360]) {
    for (final (state, route) in [('empty', '/custom'), ('named', '/custom?name=chobani')]) {
      testWidgets('the form, $state, $w dp: every part within 1 dp of M2', skip: _dom == null, (t) async {
        final b = await bootRecorded(t);
        await openApp(t, b, route: route, w: w.toDouble());
        await until(t, () => find.byType(CustomFoodSheet).evaluate().isNotEmpty);
        await t.pumpAndSettle();
        final m = _dom![w.toString()][state] as Map<String, dynamic>, misses = <String>[];
        void near(String what, Rect got, Object? want, {bool width = false}) {
          final v = (want as List).cast<num>(), g = [got.left, got.top, got.width, got.height];
          for (var i = 0; i < 4; i++) {
            if (i == 2 && !width) continue;
            if ((g[i] - v[i]).abs() > 1.0) misses.add('$what[${const ['left', 'top', 'width', 'height'][i]}] ours $g, M2 $v');
          }
        }

        near('title', t.getRect(find.text('Custom food')), m['h2']);
        const labels = ['Name', 'Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)'];
        for (var i = 0; i < labels.length; i++) {
          near('label ${labels[i]}', t.getRect(find.text(labels[i])), (m['labels'] as List)[i]);
          near('field ${labels[i]}', t.getRect(find.ancestor(of: find.byType(EditableText).at(i), matching: find.byType(Container)).first), (m['inputs'] as List)[i], width: true);
        }
        near('button', t.getRect(find.byType(Button)), m['btn'], width: true);
        expect(misses, isEmpty, reason: misses.join('\n'));
        await drain(t);
      });
    }
  }
}
