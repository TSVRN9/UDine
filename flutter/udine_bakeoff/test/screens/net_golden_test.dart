import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine_bakeoff/logic/net.dart';
import 'package:udine_bakeoff/main.dart';
import 'package:udine_bakeoff/screens/halls.dart' show defaultPins;
import 'package:udine_bakeoff/screens/hall_menu.dart';
import 'package:udine_bakeoff/state/net.dart';
import 'package:udine_bakeoff/ui/ui.dart';
import '../fonts.dart';
import '../logic/support.dart';
import 'harness.dart';

// Every network state as the whole app draws it, against M2's render of the same state (`?net=`, flows/M2). Committed goldens draw no
// photos; BAKEOFF_PHOTO_SHOTS=<dir> writes the same screens with them. The loading states are held (`Net.hold`, a test seam).
Future<void> net(WidgetTester t, String name, NetMode mode, {bool hold = false, double w = 390, List<String> pins = defaultPins, required Future<void> Function(WidgetTester) act}) async {
  sized(t, w: w);
  for (final withPhotos in [false, if (photoShots != null) true]) {
    Photos.enabled = withPhotos;
    final key = GlobalKey();
    await t.pumpWidget(RepaintBoundary(key: key, child: BakeoffApp(fx: fx, store: freshStore(), pins: pins, net: Net(fx, mode: mode, hold: hold))));
    if (withPhotos) await t.runAsync(() => Future.delayed(const Duration(milliseconds: 600)));
    await t.pump(const Duration(milliseconds: 100));
    await act(t);
    if (withPhotos) await t.runAsync(() => Future.delayed(const Duration(milliseconds: 600))); // (images the act brought in)
    await frames(t, 1200); // past the 400 ms spinner delay and every settle
    if (!withPhotos) {
      await expectLater(find.byKey(key), matchesGoldenFile('net_${name}_${w.round()}.png'));
    } else {
      await savePng(t, key, '$photoShots/net_$name-${w.round()}-photos.png');
    }
  }
}

/// Time passes in frames: an animation that follows another starts on the frame after the first ends.
Future<void> frames(WidgetTester t, int ms) async {
  for (var k = 0; k < ms ~/ 50; k++) {
    await t.pump(const Duration(milliseconds: 50));
  }
}

Future<void> open(WidgetTester t, String name) async {
  await t.tap(find.text(name).first);
  await frames(t, 1000);
}

Future<void> day(WidgetTester t, int i) async {
  t.state<HallMenuState>(find.byType(HallMenu).last).changeDay(i);
  await frames(t, 1500);
}

void main() {
  setUpAll(loadFonts);
  testWidgets('Halls loading', (t) => net(t, 'halls_slow', NetMode.slow, hold: true, act: (_) async {}));
  testWidgets('Halls offline', (t) => net(t, 'halls_offline', NetMode.offline, act: (_) async {}));
  for (final w in [390.0, 360.0]) {
    testWidgets('Halls failed at $w', (t) => net(t, 'halls_fail', NetMode.fail, w: w, act: (_) async {}));
    testWidgets('hall failed at $w', (t) => net(t, 'hall_fail', NetMode.fail, w: w, act: (t) => open(t, 'Worcester')));
    testWidgets('event page at $w', (t) => net(t, 'ipd_page', NetMode.ok, w: w, act: (t) async {
          await open(t, 'Worcester');
          await day(t, 4);
          await t.tap(find.text('Indigenous Peoples Day'));
          await frames(t, 1000);
        }));
  }
  testWidgets('hall loading', (t) => net(t, 'hall_slow', NetMode.slow, hold: true, act: (t) => open(t, 'Worcester')));
  testWidgets('hall offline, today', (t) => net(t, 'hall_offline', NetMode.offline, act: (t) => open(t, 'Worcester')));
  testWidgets('hall offline, a day not saved', (t) => net(t, 'hall_offline_day', NetMode.offline, act: (t) async {
        await open(t, 'Worcester');
        await day(t, 5);
      }));
  testWidgets('schedule offline', (t) => net(t, 'hall_offline_sched', NetMode.offline, act: (t) async {
        await open(t, 'Worcester');
        await t.tap(find.text('Today'));
        await frames(t, 1000);
      }));
  testWidgets('café without a dish menu', (t) => net(t, 'cafe_nomenu', NetMode.ok, pins: const ['ISB Café', 'Tamales'], act: (t) => open(t, 'ISB Café')));
  testWidgets('holiday note on Monday', (t) => net(t, 'ipd_note', NetMode.ok, act: (t) async {
        await open(t, 'Worcester');
        await day(t, 4);
      }));
  testWidgets('schedule on the holiday', (t) => net(t, 'ipd_sched', NetMode.ok, act: (t) async {
        await open(t, 'Worcester');
        await day(t, 4);
        await t.tap(find.text('Mon 12'));
        await frames(t, 1000);
      }));
}
