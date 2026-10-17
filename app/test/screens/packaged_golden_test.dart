import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/app.dart';
import 'package:udine/data/recorded/flags.dart' show LookupMode, NetMode;
import 'package:udine/screens/dish/food_sheet.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'search_screen_test.dart' show finish, settle;
import 'support.dart';
import 'you_support.dart';

// Packaged foods and Your foods at 360 and 390 dp over M2's recordings and the fixed clock (Thursday Oct 8, 12:41), Chobani and the recorded
// Clif Bar Chocolate Chip seeded as M2 seeds them. The field is unfocused for the capture. Photos are never drawn.
void main() {
  setUpAll(loadFonts);

  for (final w in [360.0, 390.0]) {
    final n = w.toInt();

    Future<void> ready(WidgetTester t) async {
      for (var i = 0; i < 6; i++) {
        await drain(t);
        await t.pump(const Duration(milliseconds: 200));
      }
      FocusManager.instance.primaryFocus?.unfocus();
      await settle(t);
    }

    Future<void> shot(WidgetTester t, String name, String q, {bool track = true, NetMode net = NetMode.ok, LookupMode lookup = LookupMode.found, bool packFail = false, Future<void> Function(WidgetTester)? act, bool seeded = true}) async {
      await openApp(t, await bootRecorded(t, foods: seeded, track: track, net: net, lookup: lookup, packFail: packFail), route: '/search?q=$q', w: w);
      await until(t, () => find.byType(DishRow).evaluate().isNotEmpty || find.textContaining('Nothing called').evaluate().isNotEmpty);
      await ready(t);
      if (act != null) {
        await act(t);
        await ready(t);
      }
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/packaged_${name}_$n.png'));
      await t.pump(const Duration(seconds: 6)); // (a receipt runs out)
      await finish(t);
    }

    Future<void> ask(WidgetTester t) async {
      await t.tap(find.textContaining('Search UMass Dining for'));
      await t.pump();
    }

    testWidgets('clif: Your foods, Packaged, the lookup, $n dp', (t) => shot(t, 'clif', 'clif'));
    testWidgets('chobani: one saved food, $n dp', (t) => shot(t, 'chobani', 'chobani'));
    testWidgets('laksa: the lookup waiting, $n dp', (t) => shot(t, 'laksa', 'laksa'));
    testWidgets('laksa: found, $n dp', (t) => shot(t, 'laksa_found', 'laksa', act: (t) async {
          await ask(t);
          await until(t, () => find.text('UMass Dining').evaluate().isNotEmpty);
        }));
    testWidgets('laksa: none, $n dp', (t) => shot(t, 'laksa_none', 'laksa', lookup: LookupMode.none, act: (t) async {
          await ask(t);
          await until(t, () => find.textContaining('has nothing else').evaluate().isNotEmpty);
        }));
    testWidgets('laksa: failed, $n dp', (t) => shot(t, 'laksa_fail', 'laksa', lookup: LookupMode.fail, act: (t) async {
          await ask(t);
          await until(t, () => find.text("Couldn't reach UMass Dining.").evaluate().isNotEmpty);
        }));
    testWidgets('laksa: rate-limited, $n dp', (t) => shot(t, 'laksa_limited', 'laksa', lookup: LookupMode.limited, act: (t) async {
          await ask(t);
          await until(t, () => find.textContaining('paused until').evaluate().isNotEmpty);
        }));
    testWidgets('packaged failed, $n dp', (t) => shot(t, 'pack_fail', 'clif', packFail: true));
    testWidgets('tracking off, $n dp', (t) => shot(t, 'track_off', 'clif', track: false));
    testWidgets('offline, $n dp', (t) => shot(t, 'offline', 'clif', net: NetMode.offline));

    Future<void> open(WidgetTester t, String row) async {
      await t.tap(find.descendant(of: find.widgetWithText(ListRow, row), matching: find.text(row)).first);
      await until(t, () => find.byType(FoodSheet).evaluate().isNotEmpty);
      await t.pumpAndSettle();
    }

    testWidgets('the packaged sheet, $n dp', (t) => shot(t, 'sheet_packaged', 'clif', act: (t) => open(t, 'Clif bar')));
    testWidgets('a saved food\'s sheet, $n dp', (t) => shot(t, 'sheet_saved', 'clif', act: (t) => open(t, 'Clif Bar Chocolate Chip')));
    testWidgets('Edit, $n dp', (t) => shot(t, 'sheet_edit', 'chobani', act: (t) async {
          await open(t, 'Chobani');
          await t.tap(find.text('Edit'));
          await t.pumpAndSettle();
        }));
    testWidgets('Deleted with Undo, $n dp', (t) => shot(t, 'deleted', 'chobani', act: (t) async {
          await open(t, 'Chobani');
          await t.tap(find.text('Edit'));
          await t.pumpAndSettle();
          await t.tap(find.text('Delete'));
          await t.pumpAndSettle();
        }));

    testWidgets('You, the Your foods row, $n dp', (t) async {
      await openYou(t, await bootRecorded(t, foods: true), w: w);
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/packaged_you_$n.png'));
      await finish(t);
    });
    testWidgets('You -> Your foods, $n dp', (t) async {
      await openYou(t, await bootRecorded(t, foods: true), route: '/you/foods', w: w);
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/packaged_you_foods_$n.png'));
      await finish(t);
    });
  }
}
