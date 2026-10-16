// First run and tracking off (flutter-port-you Task 3) at 360 and 390 dp over M2's recordings and fixed clock (Thursday Oct 8, 12:41).
// Photos are UMass's and never committed: nothing here draws one.
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/app.dart';
import 'package:udine/boot.dart';
import 'package:udine/screens/dish/dish_sheet.dart';
import 'package:udine/screens/halls/first_run.dart';
import 'package:udine/screens/hall/dish_row.dart';
import '../fonts.dart';
import 'dish_support.dart';
import 'search_screen_test.dart' show finish, settle;
import 'support.dart';
import 'you_support.dart';

void main() {
  setUpAll(loadFonts);

  for (final w in [360.0, 390.0]) {
    final n = w.toInt();

    Future<void> shot(WidgetTester t, String name, Boot b, String route, {required bool Function() ready, Future<void> Function()? act}) async {
      await openApp(t, b, route: route, w: w);
      await until(t, ready);
      await t.pumpAndSettle();
      await act?.call();
      for (var i = 0; i < 3; i++) {
        await drain(t);
      }
      await t.pumpAndSettle();
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/$name$n.png'));
      await finish(t);
    }

    bool firstRunUp() => find.byType(FirstRunSheet).evaluate().isNotEmpty;
    bool rows() => find.byType(DishRow).evaluate().isNotEmpty;

    testWidgets('first run over Halls, $n dp', (t) async => shot(t, 'first_run_rest_', await bootRecorded(t, firstRun: true), '/halls', ready: firstRunUp));
    testWidgets('first run scrolled to the top, $n dp', (t) async => shot(t, 'first_run_scrolled_', await bootRecorded(t, firstRun: true), '/halls', ready: firstRunUp, act: () async {
          await t.drag(find.text('Track what I eat'), const Offset(0, -300));
          await t.pumpAndSettle();
        }));
    testWidgets('first run with every choice made, $n dp', (t) async => shot(t, 'first_run_chosen_', await bootRecorded(t, firstRun: true, avoid: ['Milk', 'Eggs'], onlyShow: ['Halal'], health: true, carbon: true, track: false), '/halls', ready: firstRunUp));
    testWidgets('tracking off: Halls, $n dp', (t) async => shot(t, 'track_off_halls_', await bootRecorded(t, track: false), '/halls', ready: () => find.text('Berkshire').evaluate().isNotEmpty));
    testWidgets('tracking off: a hall menu, $n dp', (t) async => shot(t, 'track_off_hall_', await bootRecorded(t, track: false), '/hall/worcester?meal=lunch', ready: rows));
    testWidgets('tracking off: a dish sheet, $n dp', (t) async {
      final b = await bootRecorded(t, track: false);
      final name = (await lunchDishes(t, b, 1, '2026-10-08')).firstWhere((d) => d.allergens.isNotEmpty).dishName;
      await shot(t, 'track_off_dish_', b, dishRoute(name), ready: () => find.byType(DishSheet).evaluate().isNotEmpty && t.widget<DishSheet>(find.byType(DishSheet)).book.complete);
    });
    testWidgets('tracking off: Search results, $n dp', (t) async => shot(t, 'track_off_search_', await bootRecorded(t, track: false), '/search?q=green', ready: rows));
    testWidgets('tracking off: Search with no match, $n dp', (t) async => shot(t, 'track_off_nomatch_', await bootRecorded(t, track: false), '/search?q=zzzq', ready: () => find.textContaining('Nothing called').evaluate().isNotEmpty));
    testWidgets('tracking off: You with history, $n dp', (t) async {
      final b = await bootYou(t);
      await t.runAsync(() => b.prefs.setTrack(false));
      await shot(t, 'track_off_you_', b, '/you', ready: () => find.text('Track what I eat').evaluate().isNotEmpty);
    });
  }
}
