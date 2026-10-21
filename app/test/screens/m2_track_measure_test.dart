// M2 R13 §3, tracking off as a layer lifting away (test/m2_dom_track.json, measured on the round-13 build, dpr 1, the lift paused and seeked):
// our timeline at M2's frames, and the rows it ends in (a name-only 48, the control column gone, the hall tiles centred in the row).
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:udine/motion/track_lift.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'search_screen_test.dart' show finish;
import 'support.dart';

final _dom = jsonDecode(File('test/m2_dom_track.json').readAsStringSync()) as Map<String, dynamic>;

void main() {
  setUpAll(loadFonts);
  for (final w in [360, 390]) {
    final m = _dom['$w'] as Map<String, dynamic>;
    List<Map<String, dynamic>> frames(String k) => ((m[k] as Map)['frames'] as List).cast<Map<String, dynamic>>();
    List<Map<String, dynamic>> rows(String k) => (m[k] as List).cast<Map<String, dynamic>>();

    test('the lift at $w dp: Today and the bar follow M2 at every frame it measured', () {
      final off = frames('you_off'), on = frames('you_on');
      final today = off.first['today'] as num, down = off.last['barDy'] as num;
      for (final f in off) {
        final t = (f['t'] as num).toDouble(), a = liftAt(on: false, ms: t);
        // (frame 0 of the first row is the rest state: M2 reads Today whole there)
        expect(a.size, closeTo((f['today'] as num) / today, 0.02), reason: 'off, Today at $t ms');
        expect(a.bar, closeTo(f['barOp'] as num, 0.02), reason: 'off, the bar fades at $t ms');
        expect(1 - a.bar, closeTo((f['barDy'] as num) / down, 0.02), reason: 'off, the bar leaves downward at $t ms');
      }
      final full = on.last['today'] as num;
      for (final f in on) {
        final t = (f['t'] as num).toDouble(), a = liftAt(on: true, ms: t);
        expect(a.size, closeTo((f['today'] as num) / full, 0.02), reason: 'on, Today at $t ms');
        expect(a.bar, closeTo(f['barOp'] as num, 0.02), reason: 'on, the bar at $t ms');
        expect(1 - a.bar, closeTo((f['barDy'] as num) / down, 0.02), reason: 'on, the bar rides at $t ms');
      }
    });

    testWidgets('Search at $w dp, tracking off: every row is a name-only 48 or the height M2 gives it, the tiles centred in it', (t) async {
      final b = await bootRecorded(t, track: false);
      await openApp(t, b, route: '/search?q=chicken', w: w.toDouble());
      await until(t, () => find.byType(DishRow).evaluate().isNotEmpty);
      await t.pumpAndSettle();
      final n = find.byType(DishRow).evaluate().length, want = rows('search_off').take(n).toList(), got = [for (var i = 0; i < want.length; i++) t.getSize(find.byType(DishRow).at(i)).height];
      expect(got, [for (final r in want) closeTo(r['h'] as num, 1.0)]);
      for (var i = 0; i < want.length; i++) {
        final row = t.getRect(find.byType(DishRow).at(i)), tags = find.descendant(of: find.byType(DishRow).at(i), matching: find.byType(HallTags));
        if (tags.evaluate().isEmpty) continue;
        final tg = want[i]['tags'] as List, r = tags.evaluate().isEmpty ? null : t.getRect(tags.first);
        expect(r!.top - row.top, closeTo(tg[1] as num, 1.0), reason: 'row $i: the tiles sit as M2 sets them');
      }
      expect(find.byType(CalProtein), findsNothing);
      await finish(t);
    });

    testWidgets('a hall menu at $w dp, tracking off: rows are 48 (or what their name needs), no control column, the name takes the width', (t) async {
      final b = await bootRecorded(t, track: false);
      await openHall(t, b, '/hall/worcester?meal=lunch');
      final n = find.byType(DishRow).evaluate().length, want = rows('menu_off').take(n).toList();
      expect(n, greaterThan(3));
      expect([for (var i = 0; i < want.length; i++) t.getSize(find.byType(DishRow).at(i)).height], [for (final r in want) closeTo(r['h'] as num, 1.0)]);
      expect(find.byType(RowControl), findsNothing);
      await drain(t);
    });
  }
}
