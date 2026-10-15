import 'package:flutter_test/flutter_test.dart';
import 'package:udine/boot.dart';
import 'package:udine/core/m2/board.dart';
import 'package:udine/screens/plate/plate_bar.dart';
import 'package:udine/screens/plate/plate_sheet.dart';
import 'package:udine/theme/tokens.dart';
import 'package:udine/ui/ui.dart';
import 'dish_support.dart';
import 'support.dart';

const benchmarkRoute = '/plate?seed=benchmark';

/// The app at `route` over M2's recordings, with the benchmark plate seeded when the route says so, Halls loaded behind the bar.
Future<Boot> openPlate(WidgetTester t, {double w = 390, String route = benchmarkRoute, Boot? boot, bool reduced = false}) async {
  final b = boot ?? await bootRecorded(t);
  await t.runAsync(() => b.seedPlate(route));
  await openApp(t, b, route: route, w: w, reduced: reduced);
  await until(t, () => find.byType(Meter).evaluate().isNotEmpty);
  await t.pumpAndSettle();
  return b;
}

/// What a plate's refs are for `name` on `places`' lunch menus, as Search would add it.
Future<Map<String, MenuItem>> servings(WidgetTester t, Boot b, String name, List<String> places) async => {
      for (final p in places) p: (await lunchDishes(t, b, halls.indexOf(p) + 1, '2026-10-08')).firstWhere((d) => d.key == dishKey(name)),
    };

final bar = find.byType(PlateBar);
Finder inBar(Finder f) => find.descendant(of: bar, matching: f);

SheetHandle plateHandle(WidgetTester t) => t.widget<M2Sheet>(find.descendant(of: find.byType(PlateSheet), matching: find.byType(M2Sheet))).handle;

/// Real time for the store's write, then the frames it causes.
Future<void> logged(WidgetTester t, Boot b) async {
  await until(t, () => b.plate.receipt != null || b.plate.failed);
  await t.pumpAndSettle();
}

/// Lets a receipt that is still showing time out (its timer would outlive the test), then drains the repository's I/O.
Future<void> finish(WidgetTester t) async {
  await t.pump(Duration(milliseconds: M2Motion.receiptD + 50));
  await t.pumpAndSettle();
  await drain(t);
}
