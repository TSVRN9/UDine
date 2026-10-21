// M2's own geometry for the Favorites "Notify me" row (test/m2_dom_alerts.json, measured by ~/.cache/udine-scratch/flutter/m2dom-alerts.js on
// the approved build, dpr 1, `?alerts=allow|deny|revoked|bgoff&os=android|ios`) against ours, within 1 dp. Rects are [left, top, width, height];
// tops are read from the row's own top, the page's header being the page's. M2 squeezes the box to 20 to 23 dp when the line wraps (a flex
// shrink), so a box is compared by its right edge, top and height, not its width.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart' show TargetPlatform, debugDefaultTargetPlatformOverride;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/you/favorites_notify.dart';
import 'package:udine/ui/ui.dart';
import '../alerts/fake_os.dart';
import '../fonts.dart';
import 'support.dart';
import 'you_support.dart';

final _dom = jsonDecode(File('test/m2_dom_alerts.json').readAsStringSync()) as Map<String, dynamic>;

void main() {
  setUpAll(loadFonts);
  for (final w in [360, 390]) {
    final wd = w.toDouble();
    Future<void> check(WidgetTester t, String state, {required FakeAlertsOs os, bool on = false, bool tap = false, bool ios = false}) async {
      if (ios) debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      final m = ((_dom['$w'] as Map)[state] as Map).cast<String, dynamic>();
      final b = await bootYou(t, History.full, os, on);
      await t.runAsync(() => b.prefs.toggleFavorite('Golden BBQ Chicken Thigh'));
      await openYou(t, b, w: wd, route: '/you/favs');
      await placesLoaded(t);
      if (tap) {
        await t.tap(find.text('Notify me'));
        await wrote(t);
      }
      List<double> at(List<num> v) => [for (final x in v) x.toDouble()];
      final row = t.getRect(find.byType(CheckRow)), want = at(((m['check'] as List)[0] as List).cast<num>()), top = want[1];
      final miss = <String>[];
      void near(String what, num got, num exp) {
        if ((got - exp).abs() > 1.0) miss.add('$what ours $got, M2 $exp at $w dp, $state');
      }

      // the check row: left, width, height
      near('check left', row.left, want[0]);
      near('check width', row.width, want[2]);
      near('check height', row.height, want[3]);
      // the box: right edge, top and height from the row's top
      final box = t.getRect(find.descendant(of: find.byType(CheckRow), matching: find.byType(CustomPaint)).last), bx = at(((m['box'] as List)[0] as List).cast<num>());
      near('box right', box.right, bx[0] + bx[2]);
      near('box top', box.top - row.top, bx[1] - top);
      near('box height', box.height, bx[3]);
      // the label and the line
      final label = t.getRect(find.text('Notify me')), lw = at((m['label'] as List).cast<num>());
      near('label left', label.left, lw[0]);
      near('label top', label.top - row.top, lw[1] - top);
      final cbW = at(((m['cb'] as List)[0] as List).cast<num>()), line = t.getRect(find.byWidgetPredicate((x) => x is Text && x.data != 'Notify me' && x.data != 'Open Settings' && (x.data ?? '').length > 25).first);
      near('line top', line.top - row.top, cbW[1] - top);
      near('line height', line.height, cbW[3]);
      // the button: 12 dp under the line, 44 tall
      final ob = m['obtn'] as List;
      if (ob.isEmpty) {
        expect(find.text('Open Settings'), findsNothing);
      } else {
        final bw = at((ob[0] as List).cast<num>()), btn = t.getRect(find.widgetWithText(Button, 'Open Settings'));
        near('button left', btn.left, bw[0]);
        near('button top', btn.top - row.top, bw[1] - top);
        near('button height', btn.height, bw[3]);
        near('button width', btn.width, bw[2]);
      }
      // the whole row (its hairline) and the gap to the first favourite
      final hr = at(((m['hrow'] as List)[0] as List).cast<num>()), first = t.getRect(find.widgetWithText(LRow, 'Golden BBQ Chicken Thigh')), l0 = at(((m['lrows'] as List)[0] as List).cast<num>());
      near('row height', t.getRect(find.byType(NotifyRow)).height - 8, hr[3]);
      near('first favourite under the row', first.top - row.top, l0[1] - top);
      expect(miss, isEmpty, reason: miss.join('\n'));
      debugDefaultTargetPlatformOverride = null;
      await drain(t);
    }

    testWidgets('off at $w dp matches M2 within 1 dp', (t) => check(t, 'off', os: FakeAlertsOs()));
    testWidgets('allowed at $w dp matches M2 within 1 dp', (t) => check(t, 'allowed', os: FakeAlertsOs(), tap: true));
    testWidgets('denied at $w dp matches M2 within 1 dp', (t) => check(t, 'denied', os: FakeAlertsOs(willAllow: false), tap: true));
    testWidgets('revoked at $w dp matches M2 within 1 dp', (t) => check(t, 'revoked', os: FakeAlertsOs(permitted: false), on: true));
  }
}
