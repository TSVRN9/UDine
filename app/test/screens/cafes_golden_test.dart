import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/app.dart';
import 'package:udine/core/hours.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'support.dart';

// Every cafés and café-page state of the brief at 360 and 390 dp, over M2's recordings and a fixed clock. Photos are UMass's and never
// committed: headers show their maroon ground and grade, thumbnails their hair ground. The recorded hours are the Oct 11 capture.
// 7:30 on the Thursday is where Open now matters (most places are closed); 23:59 is where every area is empty.
final early = easternInstant(DateTime.utc(2026, 10, 8, 7, 30));
final night = easternInstant(DateTime.utc(2026, 10, 8, 23, 59, 30));

void main() {
  setUpAll(loadFonts);
  Photos.enabled = false;

  for (final w in [360.0, 390.0]) {
    final n = w.toInt();
    Future<void> shot(WidgetTester t, String name, String route, {DateTime? at, List<String> pins = const [], bool charlesRiver = false, Future<void> Function(WidgetTester)? then, bool page = false}) async {
      await openApp(t, await bootRecorded(t, at: at, pins: pins, charlesRiver: charlesRiver), route: route, w: w);
      await until(t, () => (route.startsWith('/cafes') ? find.textContaining(RegExp(r'^Open until|^Nothing open')) : find.byType(HallMenu)).evaluate().isNotEmpty);
      await t.pump(const Duration(milliseconds: 600));
      await until(t, () => find.byType(Spinner).evaluate().isEmpty);
      await t.pump(const Duration(milliseconds: 600));
      if (then != null) await then(t);
      await t.pumpAndSettle();
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/$name$n.png'));
      await t.pumpWidget(const SizedBox());
      await t.pump(const Duration(seconds: 2));
    }

    testWidgets('Cafés & markets, Open now on (7:30), $n dp', (t) => shot(t, 'cafes_on_', '/cafes', at: early));
    testWidgets('Cafés & markets, Open now off (7:30), $n dp', (t) => shot(t, 'cafes_off_', '/cafes', at: early, then: (t) async => t.tap(find.byType(FilterChipButton))));
    testWidgets('Cafés & markets, every area empty (23:59), $n dp', (t) => shot(t, 'cafes_empty_', '/cafes', at: night));
    testWidgets('Cafés & markets, Open now off, end of the list, Charles River Campus on, $n dp', (t) => shot(t, 'cafes_cr_', '/cafes', charlesRiver: true, then: (t) async {
          await t.tap(find.byType(FilterChipButton));
          await t.pumpAndSettle();
          await t.drag(find.byType(CustomScrollView), const Offset(0, -6000));
        }));
    testWidgets('Cafés & markets from a Halls row (Campus Center, second in the list), $n dp', (t) => shot(t, 'cafes_area_', '/cafes?area=0'));
    testWidgets('a café page with dishes and several meals, pinned, $n dp', (t) => shot(t, 'cafe_dishes_', '/cafe/4', pins: const ['Tamales']));
    testWidgets('a café page with one meal (no tab row), $n dp', (t) => shot(t, 'cafe_one_', '/cafe/17'));
    testWidgets('a café page with a names list, $n dp', (t) => shot(t, 'cafe_names_', '/cafe/2'));
    testWidgets('a café page with no menu, $n dp', (t) => shot(t, 'cafe_nomenu_', '/cafe/0'));
    testWidgets("a café page with a long name (People's Organic Coffee), $n dp", (t) => shot(t, 'cafe_long_', '/cafe/9'));
  }
}
