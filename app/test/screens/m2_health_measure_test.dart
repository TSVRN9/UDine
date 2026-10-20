// M2's own geometry for You's Health row in each state (test/m2_dom_health.json, measured by ~/.cache/udine-scratch/flutter/m2dom-health.js on the
// approved build at dpr 1) against ours, within 1 dp. M2's You is longer than the test's, so tops are compared relative to the row (`.hrow`), lefts
// and sizes as they are. Each rect is [left, top, width, height].
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/you/health_row.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'health_support.dart';
import 'support.dart';
import 'you_support.dart';

final _dom = jsonDecode(File('test/m2_dom_health.json').readAsStringSync()) as Map<String, dynamic>;

void main() {
  setUpAll(loadFonts);
  for (final w in [360, 390]) {
    for (final (state, os, health, tap) in [('off', 'android', 'allow', false), ('allowed', 'android', 'allow', true), ('denied', 'android', 'deny', true), ('revoked', 'android', 'revoked', false), ('ios', 'ios', 'deny', true)]) {
      testWidgets('the Health row, $state, matches M2 within 1 dp at $w dp', (t) async {
        final m = ((_dom['$w'] as Map)[state] as Map).cast<String, dynamic>();
        List<num> one(String k) => ((m[k] as List).first as List).cast<num>();
        final b = await bootYou(t, History.none);
        await bootHealth(t, b, os: os, health: health);
        await openYou(t, b, w: w.toDouble());
        if (tap) {
          await t.tap(find.byType(CheckRow).at(1));
          await wrote(t);
        }
        final hrow = t.getRect(find.byType(HealthRow)), check = t.getRect(find.byType(CheckRow).at(1)), misses = <String>[];
        void near(String what, Rect got, List<num> want, {bool relTop = true}) {
          final g = [got.left, got.top - (relTop ? hrow.top : 0), got.width, got.height], v = [want[0], want[1] - (relTop ? one('hrow')[1] : 0), want[2], want[3]];
          for (var i = 0; i < 4; i++) {
            if ((g[i] - v[i]).abs() > 1.0) misses.add('$what[${const ['left', 'top', 'width', 'height'][i]}] ours $g, M2 $v at $w dp');
          }
        }

        near('hrow', hrow, one('hrow'));
        near('check', check, one('check'));
        near('box', t.getRect(find.descendant(of: find.byType(CheckRow).at(1), matching: find.byType(CustomPaint)).last), one('box'));
        near('label', t.getRect(find.textContaining('Write to')), (m['label'] as List).cast<num>());
        final btn = (m['obtn'] as List);
        if (btn.isEmpty) {
          expect(find.byType(Button), findsNothing);
        } else {
          near('button', t.getRect(find.byType(Button)), one('obtn'));
        }
        expect(misses, isEmpty, reason: misses.join('\n'));
        expect(t.getRect(find.byType(CheckRow).first).bottom, closeTo(hrow.top, 0.01)); // (M2: the row hangs directly under Track what I eat)
        await drain(t);
      });
    }
  }
}
