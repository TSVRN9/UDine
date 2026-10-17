// M2's own Search geometry offline and failed (test/m2_dom_search_net.json, measured with ~/.cache/udine-scratch/flutter/m2dom-net.js on the
// M2-r11 build at dpr 1) against ours, within 1 dp. Each rect is [left, top, width, height].
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/data/recorded/flags.dart' show NetMode;
import 'package:udine/screens/search/events.dart' show EventCard;
import 'package:udine/screens/search/net_line.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'search_screen_test.dart' show finish, settle;
import 'support.dart';

void main() {
  setUpAll(loadFonts);
  for (final w in [360, 390]) {
    Map<String, dynamic> dom(String state) => ((jsonDecode(File('test/m2_dom_search_net.json').readAsStringSync()) as Map<String, dynamic>)['$w'] as Map<String, dynamic>)[state] as Map<String, dynamic>;

    final misses = <String>[];
    setUp(misses.clear);
    tearDown(() => expect(misses, isEmpty, reason: 'at $w dp'));

    // [tol]: Flutter rounds each line of a fractional line height to whole dp (19.6 draws 20), so a three-line note is 3 x 0.4 taller than M2's
    void near(WidgetTester t, String what, Finder f, Object? want, {double tol = 1.0}) {
      final x = t.getRect(f), v = (want as List).cast<num>(), got = [x.left, x.top, x.width, x.height];
      for (var i = 0; i < 4; i++) {
        if ((got[i] - v[i]).abs() > tol) misses.add('$what[${const ['left', 'top', 'width', 'height'][i]}] ours ${got.map((e) => e.toStringAsFixed(1))}, M2 $v');
      }
    }

    Future<void> open(WidgetTester t, NetMode net, String route, {Set<String> cafes = const {}}) async {
      await openApp(t, await bootRecorded(t, net: net, savedCafes: cafes), route: route, w: w.toDouble());
      await until(t, () => find.byType(NetNote).evaluate().isNotEmpty || find.byType(NetFail).evaluate().isNotEmpty);
      await until(t, () => find.byType(DishRow).evaluate().isNotEmpty || net == NetMode.fail || find.textContaining('Nothing called').evaluate().isNotEmpty);
      await finish(t);
      FocusManager.instance.primaryFocus?.unfocus();
      await settle(t);
    }

    testWidgets('offline idle at $w dp: the line, then Events under it, then the first group', (t) async {
      await open(t, NetMode.offline, '/search');
      await until(t, () => find.byType(EventCard).evaluate().isNotEmpty);
      final m = dom('offline_idle');
      near(t, 'netnote', find.byType(NetNote), m['netnote']);
      near(t, 'sdisc', find.ancestor(of: find.text('Events'), matching: find.byType(Container)).last, m['sdisc']);
    });

    testWidgets('offline with Green Fields saved at $w dp: the line wraps to three lines', (t) async {
      await open(t, NetMode.offline, '/search?q=bbq', cafes: {'Green Fields'});
      near(t, 'netnote', find.byType(NetNote), dom('offline_saved')['netnote'], tol: 1.5);
    });

    testWidgets('offline, no match at $w dp: the empty line sits under the note', (t) async {
      await open(t, NetMode.offline, '/search?q=clif');
      final m = dom('offline_nomatch');
      near(t, 'netnote', find.byType(NetNote), m['netnote']);
      expect(t.getTopLeft(find.textContaining('Nothing called')).dy, greaterThan((m['netnote'] as List)[1] + (m['netnote'] as List)[3]));
    });

    testWidgets('failed at $w dp: the pair, its label and its button', (t) async {
      await open(t, NetMode.fail, '/search');
      final m = dom('fail_idle');
      near(t, 'netfail', find.byType(NetFail), m['netfail']);
      near(t, 'label', find.text("Couldn't connect"), m['netfailSpan']);
      near(t, 'button', find.widgetWithText(Button, 'Try again'), m['netfailBtn']);
    });

    testWidgets('failed with a place query at $w dp: the hall card follows the pair', (t) async {
      await open(t, NetMode.fail, '/search?q=worcester');
      final m = dom('fail_bbq');
      near(t, 'netfail', find.byType(NetFail), m['netfail']);
      near(t, 'hcards', find.byType(Band).first, m['hcards']);
    });
  }
}


