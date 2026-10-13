import 'dart:convert';
import 'dart:io';
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine_bakeoff/logic/menu_view.dart';
import 'package:udine_bakeoff/screens/hall_header.dart';
import 'package:udine_bakeoff/shell_api.dart';
import 'package:udine_bakeoff/theme/tokens.dart';
import 'package:udine_bakeoff/ui/ui.dart';
import '../logic/support.dart';
import '../fonts.dart';
import 'harness.dart';

// M2's own DOM, measured with Playwright on the built prototype (test/m2_dom.json): Worcester lunch at 390 and 360 wide.
final m2 = jsonDecode(File('test/m2_dom.json').readAsStringSync()) as Map<String, dynamic>;

/// The list's children in order, as [kind, height]: 'sth' for a station head, 'row' for a dish, 'dietnote'.
List<List<Object>> listHeights(WidgetTester t) {
  final list = t.renderObject<RenderSliverMultiBoxAdaptor>(find.byType(SliverList).first);
  final out = <List<Object>>[];
  for (var c = list.firstChild; c != null; c = list.childAfter(c)) {
    out.add([c.size.height]);
  }
  return out;
}

void main() {
  setUpAll(loadFonts);
  testWidgets('a hall pushed at a dish arrives with its header collapsed to match the scroll (recorded: the list was at the dish, the header still whole)', (t) async {
    Photos.enabled = false;
    sized(t);
    final iso = dayIsos(fx)[0];
    final dish = fx.days[iso]!['H']!['lunch']!.expand((st) => st.dishes).firstWhere((d) => d.name == 'Local Roasted Sweet Potatoes');
    await t.pumpWidget(hallApp(store: freshStore(), shell: FakeShell(), place: 'H', land: HallTarget(place: 'H', meal: 'lunch', day: 0, dishKey: dish.key)));
    await t.pump();
    final r = headerHeight(24) - (24 + M2Layout.barH);
    final offset = t.widget<CustomScrollView>(find.byType(CustomScrollView)).controller!.offset;
    expect(offset, greaterThan(r)); // landed past the header's whole collapse
    await t.pump(); // (told after the landing layout: the next frame draws it; the first one of a push is off screen)
    expect(t.getTopLeft(find.byType(HallHeader)).dy, closeTo(-r, 0.5), reason: 'next frame');
    await t.pump(const Duration(milliseconds: 100));
    expect(t.getTopLeft(find.byType(HallHeader)).dy, closeTo(-r, 0.5), reason: '100 ms on');
  });
  for (final w in [390.0, 360.0]) {
    testWidgets('every row of Worcester lunch is the height M2 draws it at $w wide (names wrap where M2 wraps them)', (t) async {
      Photos.enabled = false;
      sized(t, w: w, h: 8000); // (tall: the list is lazy, and this reads every row)
      await t.pumpWidget(hallApp(store: freshStore(), shell: FakeShell(), w: w, h: 8000));
      await t.pumpAndSettle();
      final rows = [for (final r in m2['${w.round()}']['rows'] as List) if (r[0] != 'pad-b') r]; // (the 150 dp pad under the list is the screen's, not the list's)
      final want = [for (final r in rows) (r[1] as num).toDouble()];
      final got = [for (final h in listHeights(t)) h.first as double];
      final names = [for (final r in rows) r[2]];
      final bad = [for (var i = 0; i < want.length && i < got.length; i++) if ((want[i] - got[i]).abs() > 0.6) '#$i ${names[i]}: M2 ${want[i]}, here ${got[i]}'];
      expect(got.length, want.length);
      expect(bad, isEmpty);
    });

    testWidgets('a row is the same height with every score toggle on or off, and for a dish with no score (Review Focus 5) at $w wide', (t) async {
      Photos.enabled = false;
      sized(t, w: w, h: 8000); // (tall: the list is lazy, and this reads every row)
      await t.pumpWidget(hallApp(store: freshStore(), shell: FakeShell(), w: w, h: 8000));
      await t.pumpAndSettle();
      final off = listHeights(t);
      await t.pumpWidget(hallApp(store: freshStore('scores=health,carbon'), shell: FakeShell(), w: w, h: 8000, key: UniqueKey()));
      await t.pumpAndSettle();
      final on = listHeights(t);
      expect(on, off);
      expect([for (final r in m2['${w.round()}']['rowsOn'] as List) if (r[0] != 'pad-b') (r[1] as num).toDouble()], [for (final h in on) h.first as double]);
    });
  }
}
