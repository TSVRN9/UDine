import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/app.dart';
import 'package:udine/core/hours.dart';
import 'package:udine/data/recorded/recorded.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'support.dart';

// Every Halls state of the brief at 360 and 390 dp, over M2's recordings and the fixed clock. Photos are UMass's and never committed;
// the bands show their maroon ground, grade and chenille letter. The recorded hours are the Oct 11 capture (a Sunday): most cafés are
// closed in it, where M2's own Oct 8 render has them open.
const five = ['Wasabi', 'Tamales', "Peet's Coffee & Tea", 'Harvest Market', 'Procrastination Station'];

void main() {
  setUpAll(loadFonts);
  Photos.enabled = false;

  for (final w in [360.0, 390.0]) {
    final n = w.toInt();
    Future<void> shot(WidgetTester t, String name, {NetMode net = NetMode.ok, DateTime? at, List<String> pins = const [], bool end = false, Future<void> Function(WidgetTester)? settle}) async {
      await openApp(t, await bootRecorded(t, net: net, at: at, pins: pins), w: w);
      if (settle != null) {
        await settle(t);
      } else {
        await until(t, () => find.byType(Meter).evaluate().isNotEmpty || net != NetMode.ok);
        await until(t, () => find.textContaining('open now').evaluate().isNotEmpty || net == NetMode.fail);
      }
      if (end) {
        await t.drag(find.byType(SingleChildScrollView), const Offset(0, -3000));
      }
      await t.pumpAndSettle();
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/halls_${name}_$n.png'));
      if (net == NetMode.slow) {
        for (var i = 0; i < 6; i++) {
          await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 30)));
          await t.pump(const Duration(seconds: 2)); // the slow calls still to come
        }
      }
    }

    testWidgets('Halls at rest, 2 pins, top of the list, $n dp', (t) => shot(t, 'rest', pins: const ['Wasabi', 'Tamales']));
    testWidgets('Halls with 0 pins, end of the list, $n dp', (t) => shot(t, 'pins0', end: true));
    testWidgets('Halls with 2 pins, end of the list, $n dp', (t) => shot(t, 'pins2', pins: const ['Wasabi', 'Tamales'], end: true));
    testWidgets('Halls with 5 pins, end of the list, $n dp', (t) => shot(t, 'pins5', pins: five, end: true));
    testWidgets('Halls with every hall closed for the day, $n dp', (t) => shot(t, 'closed', at: easternInstant(DateTime.utc(2026, 10, 8, 23, 59, 30))));
    testWidgets('Halls loading: names and letters, hours and busy still to come, $n dp', (t) => shot(t, 'loading', net: NetMode.slow, settle: (t) => t.pump(const Duration(milliseconds: 500))));
    testWidgets('Halls offline, $n dp', (t) => shot(t, 'offline', net: NetMode.offline, settle: (t) => until(t, () => find.text("You're offline").evaluate().isNotEmpty)));
    testWidgets('Halls failed, $n dp', (t) => shot(t, 'failed', net: NetMode.fail, settle: (t) => until(t, () => find.text("Couldn't connect").evaluate().isNotEmpty)));
  }

  testWidgets('a band mid-transform, 390 dp', (t) async {
    await openApp(t, await bootRecorded(t));
    await until(t, () => find.byType(Meter).evaluate().isNotEmpty);
    await t.pumpAndSettle();
    await t.tap(find.text('Hampshire'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 16)); // the page's first frame
    await t.pump(const Duration(milliseconds: 16)); // the tick the curve starts on
    await t.pump(const Duration(milliseconds: 200));
    await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/halls_xf_mid_390.png'));
    await until(t, () => find.byType(DishRow).evaluate().isNotEmpty);
    await t.pumpAndSettle();
    await drain(t);
  });
}
