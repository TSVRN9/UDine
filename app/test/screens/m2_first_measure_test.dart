// M2's own geometry for the first-run sheet (test/m2_dom_first.json, measured by ~/.cache/udine-scratch/flutter/m2dom-first.js on the
// photo-free copy of the approved round-11 build, ?first=1, dpr 1) against ours, within 1 dp. Each rect is [left, top, width, height].
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/halls/first_run.dart';
import 'package:udine/screens/you/you_parts.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'first_run_test.dart' show openFirstRun, sheetTop;
import 'support.dart';

final _dom = jsonDecode(File('test/m2_dom_first.json').readAsStringSync()) as Map<String, dynamic>;

void main() {
  setUpAll(loadFonts);
  for (final w in [360, 390]) {
    testWidgets('the first-run sheet at $w dp matches M2 within 1 dp', (t) async {
      final m = (_dom['$w'] as Map).cast<String, dynamic>();
      List<num> at(String k, int i) => ((m[k] as List)[i] as List).cast<num>();
      final misses = <String>[];
      void near(String what, Rect got, List<num> want, {bool origin = false}) {
        final g = [got.left, got.top, got.width, got.height];
        for (var i = 0; i < (origin ? 2 : 4); i++) {
          if ((g[i] - want[i]).abs() > 1.0) misses.add('$what[${const ['left', 'top', 'width', 'height'][i]}] ours ${g[i]}, M2 ${want[i]} at $w dp');
        }
      }

      await openFirstRun(t, w: w.toDouble());
      final inSheet = find.byType(FirstRunSheet);
      Rect rect(Finder f) => t.getRect(find.descendant(of: inSheet, matching: f).first);

      expect(sheetTop(t), closeTo(at('sheet', 0)[1], 1.0), reason: 'the sheet rests under the fourth band');
      final top = sheetTop(t);
      near('title', rect(find.text('You')), at('title', 0));
      near('done', rect(find.byType(TextAction)), at('done', 0));
      final checks = ['Track what I eat', 'Vegetarian', 'Plant based', 'Halal'];
      for (final (i, l) in checks.indexed) {
        near(l, t.getRect(find.widgetWithText(CheckRow, l)), at('checks', i));
      }
      near('Only show', rect(find.text('Only show')), at('h2', 0));
      expect((rect(find.text('Calories, protein, carbs and fat'))).top, closeTo(at('cb', 0)[1], 1.0), reason: 'the line under Track what I eat');
      // below the fold: everything after Halal is compared at the offset Halal sits at (the M2 list runs past the sheet's visible part)
      final dy = t.getRect(find.widgetWithText(CheckRow, 'Halal')).top - at('checks', 3)[1];
      List<num> shifted(List<num> r) => [r[0], r[1] + dy, r[2], r[3]];
      near('Avoid', rect(find.text('Avoid')), shifted(at('h2', 1)));
      final alg = find.descendant(of: find.byType(AvoidRows), matching: find.byType(CheckRow));
      near('first allergen', t.getRect(alg.first), shifted(at('checks', 4)));
      near('last allergen', t.getRect(alg.last), shifted(at('checks', 14)));
      near('Show on dishes', rect(find.text('Show on dishes')), shifted(at('h2', 2)));
      near('Healthfulness', t.getRect(find.widgetWithText(CheckRow, 'Healthfulness')), shifted(at('checks', 15)));
      near('Carbon rating', t.getRect(find.widgetWithText(CheckRow, 'Carbon rating')), shifted(at('checks', 16)));
      near('tile', t.getRect(find.descendant(of: find.widgetWithText(CheckRow, 'Healthfulness'), matching: find.byType(ScoreBadge))), shifted(at('tile', 0)));
      expect(top, greaterThan(0));
      expect(misses, isEmpty, reason: misses.join('\n'));
      await drain(t);
    });
  }
}
