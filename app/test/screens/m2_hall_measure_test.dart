// M2's own hall-menu geometry (m2_dom.json `head`, `rows`, `rowsOn` per width, measured with ~/.cache/udine-scratch/flutter/m2dom.js on
// src.html at dpr 1, Worcester lunch on Thursday Oct 8 12:41) against ours, within 1 dp. Each rect is [left, top, width, height].
import 'dart:convert';
import 'dart:io';

import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/hall/meal_tabs.dart';
import 'package:udine/screens/hall/hall_header.dart';
import 'package:udine/theme/tokens.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'support.dart';

final _dom = jsonDecode(File('test/m2_dom.json').readAsStringSync()) as Map<String, dynamic>;

/// The list's children in order, as heights: the rows M2 lists as `sth` and `row`.
List<double> listHeights(WidgetTester t) {
  final list = t.renderObject<RenderSliverMultiBoxAdaptor>(find.byType(SliverList).first);
  return [for (var c = list.firstChild; c != null; c = list.childAfter(c)) c.size.height];
}

void main() {
  setUpAll(loadFonts);
  for (final w in [360, 390]) {
    final m = _dom['$w'] as Map<String, dynamic>, head = m['head'] as Map<String, dynamic>;

    List<double> r(WidgetTester t, Finder f) {
      final x = t.getRect(f.first);
      return [x.left, x.top, x.width, x.height];
    }

    void near(String what, List<double> got, Object? want, {bool block = false}) {
      final v = (want as List).cast<num>();
      for (var i = 0; i < 4; i++) {
        if (block && i == 2) continue;
        expect(got[i], closeTo(v[i], 1.0), reason: '$what[${const ['left', 'top', 'width', 'height'][i]}] ours $got, M2 $v at $w dp');
      }
    }

    testWidgets('Worcester lunch header, tabs, station row and day cell at $w dp match M2 within 1 dp', (t) async {
      await openHall(t, await bootRecorded(t), '/hall/worcester?meal=lunch', w: w.toDouble());
      near('mhead', r(t, find.byType(HallHeader)), head['mhead']);
      near('mtn', r(t, find.text('Worcester')), head['mtn']);
      // the status line's target is 44 dp where M2's is 42 (owner-accepted): the same centre, left and width
      final mts = r(t, find.ancestor(of: find.text('Open until midnight'), matching: find.byType(Press))), want = (head['mts'] as List).cast<num>();
      expect(mts[3], 44);
      near('mts', [mts[0], mts[1] + mts[3] / 2, mts[2], 0], [want[0], want[1] + want[3] / 2, want[2], 0]);
      // (M2's `#mbz` has its 8 dp top margin outside its box; ours is padding inside BusyRow)
      final bz = r(t, find.byType(BusyRow));
      near('mbz', [bz[0], bz[1] + M2Layout.busyTopHeader, bz[2], bz[3] - M2Layout.busyTopHeader], head['mbz']);
      near('mtabs', r(t, find.byType(MealTabs)), head['mtabs']);
      near('mswitch', r(t, find.byType(StationRow)), head['mswitch']);
      final presses = find.descendant(of: find.byType(StationRow), matching: find.byType(Press));
      near('swbtn', r(t, presses.at(0)), head['swbtn']);
      near('dayc', r(t, presses.at(1)), head['dayc']);
      for (final tab in head['tabs'] as List) {
        final x = r(t, find.ancestor(of: find.text(tab[0] as String), matching: find.byType(Press)));
        expect(x[1], closeTo(306, 1), reason: '${tab[0]} top');
        expect(x[0], closeTo((tab[1] as num).toDouble(), 1), reason: '${tab[0]} left at $w dp');
        expect(x[2], closeTo((tab[2] as num).toDouble(), 1), reason: '${tab[0]} width at $w dp');
      }
      // `ul`: M2's placeUL puts it at the selected tab's left + 8 with the tab's width - 16. The recorded transform is 2 dp left of that
      // (it is placed in the frame before the tab labels reach their final widths), so the rule is checked against the recorded tabs.
      final lunch = (head['tabs'] as List).firstWhere((x) => x[0] == 'Lunch') as List;
      final gold = r(t, find.descendant(of: find.byType(MealTabs), matching: find.byWidgetPredicate((x) => x is ColoredBox && x.color == M2Color.gold)));
      expect(gold[0], closeTo((lunch[1] as num) + 8, 1), reason: 'underline left');
      expect(gold[2], closeTo((lunch[2] as num) - 16, 1), reason: 'underline width');
      expect(gold[3], 3);
      near('let', r(t, find.byType(HallLetter)), head['let'], block: true);
      near('back', r(t, find.byType(BackButton)), head['back']);
      await drain(t);
    });

    for (final on in [false, true]) {
      testWidgets('every row of Worcester lunch is the height M2 draws it at $w dp, scores ${on ? 'on' : 'off'} (names wrap where M2 wraps them)', (t) async {
        final rows = [for (final x in m2Rows(m, on)) x];
        await openHall(t, await bootRecorded(t, health: on, carbon: on), '/hall/worcester?meal=lunch', w: w.toDouble(), h: 8000);
        final got = listHeights(t), want = [for (final x in rows) (x[1] as num).toDouble()];
        final bad = [for (var i = 0; i < want.length && i < got.length; i++) if ((want[i] - got[i]).abs() > 0.6) '#$i ${rows[i].length > 2 ? rows[i][2] : ''}: M2 ${want[i]}, here ${got[i]}'];
        expect(got.length, want.length);
        expect(bad, isEmpty);
        await drain(t);
      });
    }
  }
}

/// M2's list children for a width, without the 150 dp pad under the list (the screen's, not the list's); `rowsOn` carries no text.
Iterable<List<Object>> m2Rows(Map<String, dynamic> m, bool on) =>
    [for (final r in m[on ? 'rowsOn' : 'rows'] as List) if (r[0] != 'pad-b') (r as List).cast<Object>()];
