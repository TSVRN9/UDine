// M2 R13 §2, the hall-card star (test/m2_dom_stars.json, measured on the round-13 build with the Oct 8 12:41 state, a favourite served at
// Worcester and one at Hampshire, dpr 1) against ours within 1 dp: 22 px tall, 8 px after the name, its top 7 px under the name line's
// (0 on Search's card), named for a screen reader and never captioned. A hall with no favourite at its meal has none.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'search_screen_test.dart' show finish, settle;
import 'support.dart';

final _dom = jsonDecode(File('test/m2_dom_stars.json').readAsStringSync()) as Map<String, dynamic>;

void main() {
  setUpAll(loadFonts);
  for (final w in [360, 390]) {
    final m = _dom['$w'] as Map<String, dynamic>;
    List<num> row(String hall, String k) => (((m['rows'] as Map)[hall] as Map)[k] as List).cast<num>();
    List<num> name(String h) => row(h, 'name');
    List<num> star(String h) => row(h, 'star');
    List<num> nm(String h) => row(h, 'nm');

    Future<void> ready(WidgetTester t, String route, List<String> favs) async {
      final boot = await bootRecorded(t);
      for (final f in favs) {
        await t.runAsync(() => boot.prefs.toggleFavorite(f));
      }
      await openApp(t, boot, route: route, w: w.toDouble());
      await until(t, () => find.byType(Band).evaluate().isNotEmpty && find.byType(Meter).evaluate().isNotEmpty);
      if (!route.startsWith('/search')) await t.pumpAndSettle();
      addTearDown(() => drain(t));
    }

    Finder starOf(Finder band) => find.descendant(of: band, matching: find.text('★'));

    testWidgets('Halls at $w dp: a star after Worcester and Hampshire, none on Franklin or Berkshire, placed as M2 places it', (t) async {
      await ready(t, '/halls', ['Golden BBQ Chicken Thigh', 'Black Beans']);
      await until(t, () => starOf(find.byType(Band)).evaluate().isNotEmpty);
      final bands = find.byType(Band);
      expect([for (var i = 0; i < 4; i++) starOf(bands.at(i)).evaluate().isNotEmpty], [true, false, true, false]);
      for (final (i, h) in [(0, 'W'), (2, 'H')]) {
        final b = bands.at(i), s = t.getRect(starOf(b)), n = t.getRect(find.descendant(of: b, matching: find.text(t.widget<Band>(b).name)));
        final gap = star(h)[0] - (name(h)[0] + name(h)[2]), top = star(h)[1] - nm(h)[1];
        expect(s.left - n.right, closeTo(gap, 1.0), reason: '$h: the star is 8 after the name (M2 $gap)');
        expect(s.top - n.top, closeTo(top, 1.0), reason: '$h: the star sits 7 under the name line (M2 $top)');
        expect(s.height, closeTo(star(h)[3], 1.0));
      }
      final sem = t.ensureSemantics();
      expect(find.bySemanticsLabel(RegExp('^(Worcester|Hampshire), serves a favorite')), findsNWidgets(2));
      expect(find.bySemanticsLabel(RegExp('^(Franklin|Berkshire),.*favorite')), findsNothing);
      sem.dispose();
    });

    testWidgets('Halls at $w dp: a dinner-only favourite does not star a hall while lunch is on; a toggled favourite stars at once', (t) async {
      final boot = await bootRecorded(t);
      await t.runAsync(() => boot.prefs.toggleFavorite('Korean BBQ Chicken'));
      await openApp(t, boot, w: w.toDouble());
      await until(t, () => find.byType(Meter).evaluate().isNotEmpty);
      await t.pumpAndSettle();
      expect(starOf(find.byType(Band)), findsNothing);
      await t.runAsync(() => boot.prefs.toggleFavorite('Golden BBQ Chicken Thigh'));
      await t.pumpAndSettle();
      expect(starOf(find.byType(Band)), findsOneWidget);
      await t.runAsync(() => boot.prefs.toggleFavorite('Golden BBQ Chicken Thigh'));
      await t.pumpAndSettle();
      expect(starOf(find.byType(Band)), findsNothing);
    });

    testWidgets('Search at $w dp: the hall card carries the star, flush with the top of its name line', (t) async {
      await ready(t, '/search?q=worcester', ['Golden BBQ Chicken Thigh']);
      await until(t, () => starOf(find.byType(Band)).evaluate().isNotEmpty);
      await finish(t);
      FocusManager.instance.primaryFocus?.unfocus();
      await settle(t);
      final c = (m['card'] as Map).cast<String, dynamic>(), b = find.byType(Band).first;
      final s = t.getRect(starOf(b)), n = t.getRect(find.descendant(of: b, matching: find.text('Worcester')));
      final nameBox = (c['name'] as List).cast<num>(), st = (c['star'] as List).cast<num>(), line = (c['nm'] as List).cast<num>();
      expect(s.left - n.right, closeTo(st[0] - (nameBox[0] + nameBox[2]), 1.0));
      expect(s.top - n.top, closeTo(st[1] - line[1], 1.0));
    });
  }
}
