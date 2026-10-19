// M2's own Halls geometry (m2_dom.json, `halls` per width, measured with ~/.cache/udine-scratch/flutter/m2dom.js on src.html at dpr 1, the
// Oct 8 12:41 state with ?pins=5, and the net line at ?net=offline and ?net=fail) against ours, within 1 dp. Each rect is
// [left, top, width, height].
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/data/recorded/recorded.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'support.dart';

final _dom = jsonDecode(File('test/m2_dom.json').readAsStringSync()) as Map<String, dynamic>;
const _five = ['Wasabi', 'Tamales', "Peet's Coffee & Tea", 'Harvest Market', 'Procrastination Station'];

void main() {
  setUpAll(loadFonts);
  for (final w in [360, 390]) {
    final m = (_dom['$w'] as Map<String, dynamic>)['halls'] as Map<String, dynamic>;

    List<double> r(WidgetTester t, Finder f) {
      final x = t.getRect(f);
      return [x.left, x.top, x.width, x.height];
    }

    // `block`: M2's rect is a block that spans its column, ours is the text; the width is not compared
    void near(String what, List<double> got, Object? want, {bool block = false}) {
      final v = (want as List).cast<num>();
      for (var i = 0; i < 4; i++) {
        if (block && i == 2) continue;
        expect(got[i], closeTo(v[i], 1.0), reason: '$what[${const ['left', 'top', 'width', 'height'][i]}] ours $got, M2 $v at $w dp');
      }
    }

    // a band's own rect: ours starts with the 1 dp seam above it, which M2 puts outside (margin-top)
    List<double> band(WidgetTester t, Finder f) {
      final x = r(t, f);
      return [x[0], x[1] + 1, x[2], x[3] - 1];
    }

    testWidgets('Halls at $w dp: header, date line, bands, pins, section and area rows match M2 within 1 dp', (t) async {
      await openApp(t, await bootRecorded(t, pins: _five), w: w.toDouble());
      await until(t, () => find.byType(Meter).evaluate().isNotEmpty);
      await t.pumpAndSettle();
      near('hhead', r(t, find.byType(ScreenHeader).first), m['hhead']);
      near('date', r(t, find.text('Thursday, October 8').first), m['date']);
      near('h1', r(t, find.text('Lunch')), m['h1'], block: true);
      final bands = find.byType(Band);
      List l(String k) => m[k] as List;
      for (var i = 0; i < 9; i++) {
        final b = bands.at(i), hall = i < 4;
        near('band $i', band(t, b), l(hall ? 'bands' : 'pins')[hall ? i : i - 4]);
        final name = t.widget<Band>(b).name;
        near('nm $i', r(t, find.descendant(of: b, matching: find.text(name))), l(hall ? 'nm' : 'pinNm')[hall ? i : i - 4], block: true);
        final status = t.widget<Band>(b).status!;
        near('st $i', r(t, find.descendant(of: b, matching: find.text(status))), l(hall ? 'st' : 'pinSt')[hall ? i : i - 4], block: true);
        if (hall) near('bz $i', r(t, find.descendant(of: find.descendant(of: b, matching: find.byType(BusyRow)), matching: find.byType(Wrap))), l('bz')[i], block: true);
      }
      near('sec', r(t, find.text('Cafés & markets')), m['sec']);
      final rows = find.byType(LRow);
      for (var i = 0; i < 4; i++) {
        final row = t.widget<LRow>(rows.at(i));
        near('area $i', r(t, rows.at(i)), l('areas')[i]);
        near('areaA $i', r(t, find.descendant(of: rows.at(i), matching: find.text(row.title))), l('areaA')[i], block: true);
        near('areaB $i', r(t, find.descendant(of: rows.at(i), matching: find.text(row.subtitle!))), l('areaB')[i], block: true);
      }
      await drain(t); // the stars' menus, read once Halls is at rest
    });

    testWidgets('the offline line under the date at $w dp matches M2 within 1 dp', (t) async {
      await openApp(t, await bootRecorded(t, net: NetMode.offline), w: w.toDouble());
      await until(t, () => find.text("You're offline").evaluate().isNotEmpty);
      await t.pumpAndSettle();
      near('netl offline', r(t, find.text("You're offline")), m['netlOffline']);
    });

    testWidgets('the failed line and Try again at $w dp match M2 within 1 dp', (t) async {
      await openApp(t, await bootRecorded(t, net: NetMode.fail), w: w.toDouble());
      await until(t, () => find.text("Couldn't connect").evaluate().isNotEmpty);
      await t.pumpAndSettle();
      near('netl fail', r(t, find.text("Couldn't connect")), m['netlFail']);
      near('try again', r(t, find.byType(Button)), m['tryagain']);
    });
  }
}
