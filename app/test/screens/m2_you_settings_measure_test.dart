// M2's own geometry for You's settings (test/m2_dom_you2.json, measured by ~/.cache/udine-scratch/flutter/m2dom-you2.js on the approved build at
// dpr 1) against ours, within 1 dp. Each rect is [left, top, width, height]. M2's You has five rows ("Your foods" is Task 3's) and a Track and
// Health section above, so the choices are compared by what is relative to each other; the pages by their absolute rects.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/types.dart' show RankedDish;
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'support.dart';
import 'you_support.dart';

final _file = File('test/m2_dom_you2.json');
final _dom = jsonDecode(_file.readAsStringSync()) as Map<String, dynamic>;

final _misses = <String>[];
void _near(String what, Object got, Object? want, int w, {bool block = false, bool origin = false}) {
  if (want == null) return;
  final v = (want as List).cast<num>(), r = got is Rect ? got : null, g = r != null ? [r.left, r.top, r.width, r.height] : (got as List).cast<num>();
  for (var i = 0; i < 4; i++) {
    if ((block && i == 2) || (origin && i > 1)) continue;
    if ((g[i] - v[i]).abs() > 1.0) _misses.add('$what[${const ['left', 'top', 'width', 'height'][i]}] ours $g, M2 $v at $w dp');
  }
}

void _flush() {
  final m = [..._misses];
  _misses.clear();
  expect(m, isEmpty, reason: m.join('\n'));
}

num _n(Object? l, int i, int k) => ((l as List)[i] as List)[k] as num;

void main() {
  setUpAll(loadFonts);
  for (final w in [360, 390]) {
    Map<String, dynamic> m(String k) => ((_dom[w.toString()] as Map)[k] as Map).cast<String, dynamic>();
    final wd = w.toDouble();

    testWidgets('You\'s choices at $w dp match M2 within 1 dp', (t) async {
      final b = await bootYou(t);
      await openYou(t, b, w: wd);
      await t.ensureVisible(find.text('Show on dishes'));
      final y = m('you'), lr = y['lrows'] as List, nl = lr.length; // the last five are the choices: Favorites, Your foods, Dietary, Which, Export
      final ours = [for (final s in ['Favorites', 'Dietary preferences', 'Which was better?', 'Export my data']) t.getRect(find.widgetWithText(LRow, s))];
      final theirs = [lr[nl - 5], lr[nl - 3], lr[nl - 2], lr[nl - 1]];
      for (var i = 0; i < 4; i++) {
        _near('row $i', ours[i], [theirs[i][0], ours[i].top, theirs[i][2], theirs[i][3]], w);
      }
      // M2's Track/Health section (secs[3]) sits between Earlier and the choices; with it absent, its end is where Earlier's list ends
      final earlierEnd = t.getRect(find.widgetWithText(LRow, 'Tuesday, October 6')).bottom, secs = y['secs'] as List;
      expect(ours[0].top - earlierEnd, closeTo(_n(lr, nl - 5, 1) - (_n(secs, 3, 1) + _n(secs, 3, 3)), 1.0), reason: 'the choices under Earlier');
      expect(ours[3].top - ours[2].top, closeTo(_n(lr, nl - 1, 1) - _n(lr, nl - 2, 1), 1.0));
      final h2 = y['h2'] as List, ck = y['checks'] as List;
      final campus = t.getRect(find.text('Campus')), show = t.getRect(find.text('Show on dishes'));
      expect(campus.top - ours[3].bottom, closeTo(_n(h2, 3, 1) - (_n(lr, nl - 1, 1) + _n(lr, nl - 1, 3)), 1.0), reason: 'Campus under the last row');
      final ch = t.getRect(find.widgetWithText(CheckRow, 'Charles River Campus'));
      expect(ch.top - campus.top, closeTo(_n(ck, 2, 1) - _n(h2, 3, 1), 1.0), reason: 'the check under Campus');
      expect(show.top - ch.bottom, closeTo(_n(h2, 4, 1) - (_n(ck, 2, 1) + _n(ck, 2, 3)), 1.0), reason: 'Show on dishes under Campus');
      final hf = t.getRect(find.widgetWithText(CheckRow, 'Healthfulness')), cr = t.getRect(find.widgetWithText(CheckRow, 'Carbon rating'));
      expect(hf.top - show.top, closeTo(_n(ck, 3, 1) - _n(h2, 4, 1), 1.0));
      _near('Charles River', ch, [ck[2][0], ch.top, ck[2][2], ck[2][3]], w);
      _near('Healthfulness', hf, [ck[3][0], hf.top, ck[3][2], ck[3][3]], w);
      _near('Carbon rating', cr, [ck[4][0], cr.top, ck[4][2], ck[4][3]], w);
      expect(cr.top - hf.top, closeTo(_n(ck, 4, 1) - _n(ck, 3, 1), 1.0));
      // the box: 26 square, 14.5 under the row's top, at the right gutter
      final box = t.getRect(find.descendant(of: find.widgetWithText(CheckRow, 'Healthfulness'), matching: find.byType(CustomPaint)).last), bx = (y['box'] as List)[3] as List;
      _near('box', box, [bx[0], hf.top + _n(y['box'], 3, 1) - _n(ck, 3, 1), bx[2], bx[3]], w);
      final tile = t.getRect(find.descendant(of: find.widgetWithText(CheckRow, 'Healthfulness'), matching: find.byType(ScoreBadge)));
      final tl = (y['tile'] as List)[0] as List;
      _near('tile', tile, [tl[0], hf.top + tl[1] - _n(ck, 3, 1), tl[2], tl[3]], w);
      final line = t.getRect(find.text('Newton')), label = t.getRect(find.text('Charles River Campus')), cb = (y['cb'] as List)[2] as List, cl = (y['cl'] as List)[2] as List;
      expect(label.top - ch.top, closeTo(cl[1] - ck[2][1], 1.0), reason: 'the label in the row');
      expect(line.top - ch.top, closeTo(cb[1] - ck[2][1], 1.0), reason: 'the quiet line in the row');
      _flush();
      await drain(t);
    });

    testWidgets('Dietary preferences at $w dp matches M2 within 1 dp', (t) async {
      final b = await bootYou(t);
      await openYou(t, b, w: wd, route: '/you/diet');
      final d = m('diet'), ck = d['checks'] as List, h3 = d['h3'] as List;
      _near('bar', t.getRect(find.byType(ScreenHeader)), _at(d['pbar'], 0), w);
      _near('Only show', t.getRect(find.text('Only show')), h3[0], w, block: true);
      _near('Avoid', t.getRect(find.text('Avoid')), h3[1], w, block: true);
      final rows = find.byType(CheckRow);
      for (var i = 0; i < 14; i++) {
        _near('check $i', t.getRect(rows.at(i)), ck[i], w);
      }
      _flush();
      await drain(t);
    });

    testWidgets('Which was better? at $w dp matches M2 within 1 dp', (t) async {
      final b = await bootYou(t, History.today);
      await openYou(t, b, w: wd, route: '/you/rank');
      await until(t, () => find.text('or').evaluate().isNotEmpty);
      final r = m('rank');
      _near('bar', t.getRect(find.byType(ScreenHeader)), _at(r['pbar'], 0), w);
      final tiles = [for (final e in find.byType(Press).evaluate()) t.getRect(find.byWidget(e.widget))].where((x) => x.height >= 90).toList();
      _near('first', tiles[0], (r['btn'] as List)[0], w);
      _near('second', tiles[1], (r['btn'] as List)[1], w);
      final or = t.getRect(find.text('or')), o = (r['or'] as List)[0] as List; // M2's is a full-width block with the word centred in it
      _near('or', or, [or.left, o[1], or.width, o[3]], w);
      expect(or.center.dx, closeTo(o[0] + o[2] / 2, 1.0));
      _flush();
      await drain(t);
    });

    testWidgets('Your ranking at $w dp matches M2 within 1 dp', (t) async {
      final b = await bootYou(t, History.today);
      await t.runAsync(() => b.store!.saveRankedDishes([for (final (i, n) in ['Hard Boiled Egg', 'Make Your Own Waffles', 'Red Potato Home Fries'].indexed) RankedDish(dishName: n, hallTid: 1, rating: 1600 - i * 40, comparisonCount: 2)]));
      await openYou(t, b, w: wd, route: '/you/rank');
      await until(t, () => find.text('Your ranking').evaluate().isNotEmpty);
      final k = m('ranking');
      _near('bar', t.getRect(find.byType(ScreenHeader)), _at(k['pbar'], 0), w);
      for (var i = 0; i < 3; i++) {
        _near('row $i', t.getRect(find.byType(LRow).at(i)), _at(k['lrows'], i), w);
      }
      _flush();
      await drain(t);
    });

    testWidgets('Export at $w dp matches M2 within 1 dp', (t) async {
      final b = await bootYou(t);
      await openYou(t, b, w: wd, route: '/you/export');
      final e = m('export');
      _near('bar', t.getRect(find.byType(ScreenHeader)), _at(e['pbar'], 0), w);
      _near('JSON', t.getRect(find.widgetWithText(Button, 'Export JSON')), (e['btn'] as List)[0], w);
      _near('CSV', t.getRect(find.widgetWithText(Button, 'Export CSV')), (e['btn'] as List)[1], w);
      _flush();
      await drain(t);
    });
  }
}

Object? _at(Object? list, int i) => list is List && i < list.length ? list[i] : null;
