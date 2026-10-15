// Every You state of the brief at 360 and 390 dp over M2's fixed clock (Thursday Oct 8, 12:41) and a made-up history (you_support.dart).
// Photos are UMass's and never committed: nothing here draws one.
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/app.dart';
import 'package:udine/boot.dart';
import 'package:udine/screens/plate/plate_row.dart';
import '../fonts.dart';
import 'plate_support.dart';
import 'support.dart';
import 'you_support.dart';

void main() {
  setUpAll(loadFonts);

  for (final w in [360.0, 390.0]) {
    final n = w.toInt();

    Future<void> shot(WidgetTester t, String name, {History h = History.full, String route = '/you', Future<void> Function(WidgetTester t, Boot b)? act, Boot? boot}) async {
      final b = boot ?? await bootYou(t, h);
      await openYou(t, b, w: w, route: route);
      await act?.call(t, b);
      await t.pumpAndSettle();
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/you_${name}_$n.png'));
      await finish(t);
    }

    Future<void> openMeal(WidgetTester t, String title) async {
      await t.tap(find.text(title));
      await t.pumpAndSettle();
    }

    testWidgets('no history, $n dp', (t) => shot(t, 'none', h: History.none));
    testWidgets('today only, $n dp', (t) => shot(t, 'today', h: History.today));
    testWidgets('today and earlier days, $n dp', (t) => shot(t, 'full'));
    testWidgets('a day, $n dp', (t) => shot(t, 'day', route: '/you/day/2026-10-07'));
    testWidgets('a meal in the sheet, $n dp', (t) => shot(t, 'meal', route: '/you/day/2026-10-07', act: (t, b) => openMeal(t, 'Lunch at Worcester')));
    testWidgets('an item removed: Removed with Undo, $n dp', (t) => shot(t, 'removed', route: '/you/day/2026-10-07', act: (t, b) async {
          await openMeal(t, 'Lunch at Worcester');
          final row = find.byType(PlateRow).first;
          for (var i = 0; i < 2; i++) {
            await t.tap(find.descendant(of: row, matching: find.bySemanticsLabel('Less')));
            await wrote(t);
          }
        }));
    testWidgets("the meal's full label, $n dp", (t) => shot(t, 'label', route: '/you/day/2026-10-07', act: (t, b) async {
          await openMeal(t, 'Lunch at Worcester');
          await t.tap(find.text('Full label'));
        }));
    testWidgets('the Deleted receipt, $n dp', (t) => shot(t, 'deleted', route: '/you/day/2026-10-07', act: (t, b) async {
          await openMeal(t, 'Lunch at Worcester');
          await t.tap(find.text('Delete meal'));
          await wrote(t);
        }));
    testWidgets('a newer database, $n dp', (t) async {
      final rec = await bootRecorded(t);
      await shot(t, 'newer', boot: Boot(rec.repo, null, rec.prefs));
    });
  }
}
