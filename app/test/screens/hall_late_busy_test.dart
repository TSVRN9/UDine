// M2 R13 §4 last bullet, `test.js` "a busy reading that lands late": the title and the letter do not move at any frame of the reading's
// arrival, the block grows in below the status line (the header grows by its height D, the tabs and the list ride down by D), and its
// text and the chart fade in only once the box is whole (so no glyph is ever cut by a growing box or the header's edge).
import 'dart:convert';
import 'dart:io';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/occupancy.dart';
import 'package:udine/motion/routes.dart';
import 'package:udine/screens/halls/halls_screen.dart';
import 'package:udine/screens/halls/hall_page.dart';
import 'package:udine/screens/hall/busy.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/screens/hall/hall_header.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/screens/hall/meal_tabs.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'support.dart';

double opacityOf(WidgetTester t, Finder f) {
  var o = 1.0;
  t.element(f).visitAncestorElements((e) {
    final w = e.widget;
    if (w is Opacity) o *= w.opacity;
    return true;
  });
  return o;
}

typedef Snap = ({Rect title, Rect letter, double tabs, double rowOpacity, double boardOpacity, bool landed, Rect? word, Rect head});

void main() {
  setUpAll(loadFonts);

  /// A hall opened before its reading (M2 `?busy=late`), frame by frame until the reading has landed and settled.
  Future<List<Snap>> arrival(WidgetTester t, String key, String name, {bool reduced = false, bool viaHalls = false, bool stale = false}) async {
    if (viaHalls) {
      // a hall pushed with no card (a dish sheet's "served at" chip, Search, the plate sheet) while Halls has read its busy
      await openApp(t, await bootRecorded(t));
      await t.pump();
      await until(t, () => find.descendant(of: find.byType(HallsScreen), matching: find.byType(Meter)).evaluate().length >= 4);
      Nav.push<void>(t.element(find.byType(HallsScreen)), (_) => HallMenuPage(place: key == 'franklin' ? 'F' : 'W', top: 24));
      await t.pump();
    } else {
      final boot = await bootRecorded(t, busyLate: true);
      // (what an earlier read left in the cache, which the live reading then disagrees with: it has no second line, the live one has one)
      if (stale) boot.repo.lastBusy['Worcester Commons'] = const OccupancyRead(level: 2, vsUsual: null, usuallyClearsAt: null, confidence: Confidence.good, lamps: 4);
      await openApp(t, boot, route: '/hall/$key?meal=lunch', reduced: reduced);
    }
    final out = <Snap>[];
    var landedAt = -1;
    for (var i = 0; i < 400 && (landedAt < 0 || i < landedAt + 40); i++) {
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 5)));
      await t.pump(const Duration(milliseconds: 16));
      if (find.byType(HallHeader).evaluate().isEmpty || find.byType(MealTabs).evaluate().isEmpty) continue;
      final head = find.byType(HallHeader);
      final landed = t.state<HallMenuState>(find.byType(HallMenu)).c.busy != null;
      if (landed && landedAt < 0) landedAt = i;
      final word = find.descendant(of: head, matching: find.byType(BusyRow));
      final board = find.descendant(of: head, matching: find.byType(BusyBoard));
      out.add((
        title: t.getRect(find.descendant(of: head, matching: find.text(name)).last),
        letter: t.getRect(find.descendant(of: head, matching: find.byType(HallLetter)).first),
        tabs: t.getRect(find.byType(MealTabs)).top,
        // (the invisible copy that held the block's room, on main, is not the line)
        rowOpacity: landed && word.evaluate().isNotEmpty ? opacityOf(t, word.last) : 0,
        boardOpacity: board.evaluate().isEmpty ? 0 : t.widget<BusyBoard>(board.first).opacity * opacityOf(t, board.first),
        landed: landed,
        word: landed && word.evaluate().isNotEmpty ? t.getRect(word.last) : null,
        head: t.getRect(head),
      ));
    }
    expect(landedAt, greaterThan(0), reason: 'the reading landed');
    await drain(t);
    return out;
  }

  for (final h in [('worcester', 'Worcester', 47.0), ('franklin', 'Franklin', 47.0)]) { // a cold open guesses two lines; a one-line reading keeps their room, so the header ends at M2's 306
    testWidgets('${h.$2}: the reading lands late, the title and the letter never move and the tabs ride down by ${h.$3.toInt()} dp', (t) async {
      final s = await arrival(t, h.$1, h.$2);
      final first = s.first, last = s.last;
      for (var i = 0; i < s.length; i++) {
        expect((s[i].title.top - first.title.top).abs(), lessThan(0.01), reason: 'frame $i: the title is where it was (${s[i].title} vs ${first.title})');
        expect((s[i].title.left - first.title.left).abs(), lessThan(0.01), reason: 'frame $i: the title is where it was');
        expect(s[i].letter, first.letter, reason: 'frame $i: the letter is where it was');
      }
      expect(last.tabs - first.tabs, closeTo(h.$3, 0.6), reason: 'the tabs ride down by D');
      expect(last.head.height - first.head.height, closeTo(h.$3, 0.6), reason: 'the header grows by D');
      // a header that never gets a reading is the short one
      expect(first.tabs, closeTo(last.tabs - h.$3, 0.6));
    });

    testWidgets('${h.$2}: no frame shows the line cut, and the chart is not drawn before the box is whole', (t) async {
      final s = await arrival(t, h.$1, h.$2);
      final base = s.first.tabs;
      var sawLine = false, sawGrowing = false;
      for (var i = 0; i < s.length; i++) {
        final f = s[i], grown = f.tabs - base;
        if (f.landed && grown > 0.5 && grown < h.$3 - 0.5) sawGrowing = true;
        if (f.rowOpacity > 0 || f.boardOpacity > 0) {
          expect(grown, closeTo(h.$3, 0.6), reason: 'frame $i: the line (${f.rowOpacity}) or the chart (${f.boardOpacity}) has opacity, so the box is whole');
        }
        if (f.rowOpacity > 0) {
          sawLine = true;
          expect(f.word!.bottom, lessThanOrEqualTo(f.head.bottom + 0.5), reason: 'frame $i: the line is inside the header');
        }
        if (!f.landed) expect(f.boardOpacity, 0, reason: 'frame $i: the chart is not drawn before the reading');
      }
      expect(sawGrowing, isTrue, reason: 'the box was seen growing');
      expect(sawLine, isTrue);
      expect(s.last.rowOpacity, 1);
    });
  }

  testWidgets('under reduced motion the box is whole at once and the title still does not move', (t) async {
    final s = await arrival(t, 'franklin', 'Franklin', reduced: true);
    final base = s.first.tabs;
    for (var i = 0; i < s.length; i++) {
      expect(s[i].title, s.first.title, reason: 'frame $i: the title is where it was');
      if (s[i].landed) expect(s[i].tabs - base, closeTo(47, 0.6), reason: 'frame $i: no growing under reduced motion');
    }
    expect(s.last.rowOpacity, 1);
  });

  // M2's measured titles (m2_dom.json: Worcester's mtn top, Franklin's 22 dp lower: it has no "Calmer around" line)
  for (final h in [('worcester', 'Worcester', 0.0, 47.0), ('franklin', 'Franklin', 22.0, 25.0)]) {
    testWidgets('${h.$2} pushed with no card, after Halls read its busy: it opens at the height it keeps, the title at M2\'s top', (t) async {
      final s = await arrival(t, h.$1, h.$2, viaHalls: true);
      final mtn = (((jsonDecode(File('test/m2_dom.json').readAsStringSync()) as Map)['390'] as Map)['head'] as Map)['mtn'] as List;
      for (var i = 0; i < s.length; i++) {
        expect(s[i].title.top, closeTo((mtn[1] as num) + h.$3, 1), reason: 'frame $i: the title is at M2\'s top from the first frame');
      }
      expect(s.last.tabs - s.first.tabs, closeTo(h.$4, 0.6));
    });
  }

  // a hall pushed at a dish scrolls to it before the reading is in; the reading landing must not give the header back the room it scrolled away
  for (final h in [('worcester', 'Worcester'), ('franklin', 'Franklin')]) {
    testWidgets('${h.$2}: scrolled down when the reading lands, the header stays as collapsed and the tabs stay put', (t) async {
      await openApp(t, await bootRecorded(t, busyLate: true), route: '/hall/${h.$1}?meal=lunch');
      for (var i = 0; i < 400 && (find.byType(MealTabs).evaluate().isEmpty || find.byType(DishRow).evaluate().isEmpty); i++) {
        await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 5)));
        await t.pump(const Duration(milliseconds: 16));
      }
      final menu = t.state<HallMenuState>(find.byType(HallMenu));
      expect(menu.c.busy, isNull, reason: 'scrolled before the reading');
      await t.drag(find.byType(DishRow).first, const Offset(0, -600));
      await t.pump(const Duration(milliseconds: 600));
      final head = find.byType(HallHeader);
      Rect title() => t.getRect(find.descendant(of: head, matching: find.text(h.$2)).last);
      final before = (title: title(), tabs: t.getRect(find.byType(MealTabs)).top);
      for (var i = 0; i < 400 && menu.c.busy == null; i++) {
        await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 5)));
        await t.pump(const Duration(milliseconds: 16));
      }
      expect(menu.c.busy, isNotNull, reason: 'the reading landed');
      for (var i = 0; i < 60; i++) {
        await t.pump(const Duration(milliseconds: 16));
        expect((title().top - before.title.top).abs(), lessThan(0.6), reason: 'frame $i: the collapsed title stays (${title()} vs ${before.title})');
        expect((t.getRect(find.byType(MealTabs)).top - before.tabs).abs(), lessThan(0.6), reason: 'frame $i: the pinned tabs stay');
      }
      await drain(t);
    });
  }

  testWidgets('a stale cached read (no second line) against a live one with: the title never moves and the block ends at the live value', (t) async {
    final s = await arrival(t, 'worcester', 'Worcester', stale: true);
    for (var i = 0; i < s.length; i++) {
      expect((s[i].title.top - s.first.title.top).abs(), lessThan(0.01), reason: 'frame $i: the title is where it was');
    }
    // (it opened for the 25 dp it guessed; the live block is Worcester's 47)
    expect(s.last.tabs - s.first.tabs, closeTo(47, 0.6), reason: 'the block ends at the live value');
    expect(s.last.rowOpacity, 1);
  });
}
