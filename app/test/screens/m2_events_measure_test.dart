// M2's own geometry for Search's events and the event page (test/m2_dom_events.json, measured with ~/.cache/udine-scratch/flutter/m2dom-events.js
// on the M2-r11 build at dpr 1) against ours, within 1 dp. Each rect is [left, top, width, height]. Every miss is reported together.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/event/event_banner.dart';
import 'package:udine/screens/search/events.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'search_screen_test.dart' show finish, settle;
import 'support.dart';

void main() {
  setUpAll(loadFonts);
  for (final w in [360, 390]) {
    Map<String, dynamic> dom(String state) => ((jsonDecode(File('test/m2_dom_events.json').readAsStringSync()) as Map<String, dynamic>)['$w'] as Map<String, dynamic>)[state] as Map<String, dynamic>;

    final misses = <String>[];
    tearDown(() => expect(misses, isEmpty, reason: 'at $w dp'));

    void near(WidgetTester t, String what, Finder f, Object? want, {bool baseline = false}) {
      final x = t.getRect(f), v = (want as List).cast<num>(), got = [x.left, x.top, x.width, x.height];
      for (var i = 0; i < 4; i++) {
        // Chrome snaps a baseline-aligned line to whole pixels: M2's title sits 2.0 under the row's top where the font metrics give 0.98 (the gold date, which sets the row, matches to 0)
        if (baseline && (i == 1 || i == 3)) continue;
        if ((got[i] - v[i]).abs() > 1.0) misses.add('$what[${const ['left', 'top', 'width', 'height'][i]}] ours ${got.map((e) => e.toStringAsFixed(1))}, M2 $v');
      }
    }

    Future<void> open(WidgetTester t, String route) async {
      await openApp(t, await bootRecorded(t), route: route, w: w.toDouble());
      await until(t, () => find.byType(EventCard).evaluate().isNotEmpty || find.text('Holiday hours').evaluate().isNotEmpty);
      FocusManager.instance.primaryFocus?.unfocus();
      await settle(t);
    }

    testWidgets('the idle band and its cards at $w dp match M2 within 1 dp', (t) async {
      await open(t, '/search');
      final m = dom('idle');
      near(t, 'sdisc', find.byType(EventsIdle), m['sdisc']);
      near(t, 'h2', find.ancestor(of: find.text('Events'), matching: find.byType(Padding)).first, m['h2']);
      for (var i = 0; i < 2; i++) {
        near(t, 'card $i', find.byType(EventCard).at(i), (m['card'] as List)[i]);
        near(t, 'patch $i', find.byType(EventBanner).at(i), (m['patch'] as List)[i]);
      }
      near(t, 'tt 0', find.text('Indigenous Peoples Day'), (m['tt'] as List)[0], baseline: true);
      near(t, 'tag 0', find.text('Mon, Oct 12'), (m['tag'] as List)[0]);
      near(t, 'tag 1', find.text('Through Oct 31'), (m['tag'] as List)[1]);
      await finish(t);
    });

    testWidgets('the event page at $w dp matches M2 within 1 dp', (t) async {
      await open(t, '/event/0');
      final m = dom('page_0');
      near(t, 'back', find.byType(BackButton), m['back']);
      // M2 centres the banner and its buttons in what the bar leaves; ours adds the flyer, so the group is taller than the screen and starts at
      // the top. Only left, width and height still map to M2 (top does not); the second button is Share the flyer, which M2 has no counterpart for.
      void across(String what, Finder f, List want) {
        final x = t.getRect(f), v = want.cast<num>(), got = [x.left, x.width, x.height], exp = [v[0], v[2], v[3]];
        for (var i = 0; i < 3; i++) {
          if ((got[i] - exp[i]).abs() > 1.0) misses.add('$what[${const ['left', 'width', 'height'][i]}] ours $got, M2 $exp');
        }
      }

      across('patch', find.byType(EventBanner), m['patch']);
      across('btn 0', find.byType(Button).at(0), (m['btn'] as List)[0]);
      across('btn 1', find.byType(Button).at(1), (m['btn'] as List)[1]);
      expect(find.text('Share the flyer'), findsOneWidget);
      await finish(t);
    });
  }
}
