import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/app.dart';
import 'package:udine/data/recorded/recorded.dart';
import 'package:udine/screens/hall/meal_tabs.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'support.dart';

// Every hall-menu state of the brief at 360 and 390 dp, over M2's recordings and the fixed clock (Thursday Oct 8, 12:41). Photos are
// UMass's and never committed: the header shows its maroon ground, grade and chenille letter.
void main() {
  setUpAll(loadFonts);

  for (final w in [360.0, 390.0]) {
    final n = w.toInt();

    /// Opens `route` (or a place by a push), runs `act`, and compares the screen with `hall_<name>_<n>.png`.
    Future<void> shot(WidgetTester t, String name, String route, {NetMode net = NetMode.ok, bool health = false, bool carbon = false, String? place, Future<void> Function(WidgetTester)? act, bool settle = true, bool raw = false}) async {
      final boot = await bootRecorded(t, net: net, health: health, carbon: carbon);
      if (raw) {
        await openApp(t, boot, route: route, w: w);
      } else if (place != null) {
        await openPlace(t, boot, place, w: w);
      } else {
        await openHall(t, boot, route, w: w);
      }
      await act?.call(t);
      if (settle) await t.pumpAndSettle();
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/hall_${name}_$n.png'));
      if (net == NetMode.slow) {
        for (var i = 0; i < 6; i++) {
          await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 30)));
          await t.pump(const Duration(seconds: 2)); // the slow calls still to come
        }
      }
      await drain(t);
    }

    Future<void> scrollTo(WidgetTester t, double y) async {
      t.state<ScrollableState>(find.byType(Scrollable).first).position.jumpTo(y);
      await t.pumpAndSettle();
    }

    const base = '/hall/worcester?meal=lunch';
    testWidgets('Worcester lunch, $n dp', (t) => shot(t, 'lunch', base));
    testWidgets('header collapsed, $n dp', (t) => shot(t, 'collapsed', base, act: (t) => scrollTo(t, 520)));
    for (final m in ['breakfast', 'dinner', 'late', 'grab']) {
      testWidgets('$m tab, $n dp', (t) => shot(t, 'tab_$m', '/hall/worcester?meal=$m'));
    }
    testWidgets('a meal tab picked, $n dp', (t) => shot(t, 'tab_picked', base, act: (t) async {
          await t.tap(find.text('Dinner'));
          await t.pumpAndSettle();
        }));
    testWidgets('the station switcher open, $n dp', (t) => shot(t, 'stations', base, act: (t) async {
          await scrollTo(t, 520);
          await t.tap(find.descendant(of: find.byType(StationRow), matching: find.byType(Press)).first);
          await t.pumpAndSettle();
        }));
    testWidgets('a day with an event note (Mon Oct 12), $n dp', (t) => shot(t, 'event', '/hall/worcester?meal=lunch&day=2026-10-12'));
    testWidgets('the empty day (Sat Oct 10), $n dp', (t) => shot(t, 'empty', '/hall/worcester?meal=lunch&day=2026-10-10'));
    testWidgets('the stepper at 1, $n dp', (t) => shot(t, 'step1', base, act: (t) async {
          await t.tap(find.byType(AddButton).first);
          await t.pumpAndSettle();
        }));
    testWidgets('the stepper at ½, $n dp', (t) => shot(t, 'step_half', base, act: (t) async {
          await t.tap(find.byType(AddButton).first);
          await t.pumpAndSettle();
          await t.tap(find.descendant(of: find.byType(Stepper), matching: find.byType(Press)).first);
          await t.pumpAndSettle();
        }));
    testWidgets('the stepper removed again, $n dp', (t) => shot(t, 'step_removed', base, act: (t) async {
          await t.tap(find.byType(AddButton).first);
          await t.pumpAndSettle();
          for (var i = 0; i < 2; i++) {
            await t.tap(find.descendant(of: find.byType(Stepper), matching: find.byType(Press)).first);
            await t.pumpAndSettle();
          }
        }));
    testWidgets('scores: both, $n dp', (t) => shot(t, 'scores_both', base, health: true, carbon: true));
    testWidgets('scores: health, $n dp', (t) => shot(t, 'scores_health', base, health: true));
    testWidgets('scores: carbon, $n dp', (t) => shot(t, 'scores_carbon', base, carbon: true));
    testWidgets('scores: an unscored dish among scored ones, $n dp', (t) => shot(t, 'scores_unscored', base, health: true, carbon: true, act: (t) => scrollTo(t, 1900)));
    testWidgets('a café with prices (Green Fields), $n dp', (t) => shot(t, 'cafe_prices', '', place: 'c3'));
    testWidgets('a single-meal café (Worcester Café), $n dp', (t) => shot(t, 'cafe_one', '', place: 'c12'));
    testWidgets('loading: the indicator after 400 ms, $n dp', (t) => shot(t, 'loading', base, net: NetMode.slow, settle: false, raw: true, act: (t) async {
          await until(t, () => find.byType(Spinner).evaluate().isNotEmpty);
          // the spinner turns on frame time: one frame to start its ticker, then a fixed time on (past its 400 ms delay), so the capture is the same every run
          await t.pump(const Duration(milliseconds: 16));
          await t.pump(const Duration(milliseconds: 490));
        }));
    testWidgets('offline with the day saved, $n dp', (t) => shot(t, 'offline', base, net: NetMode.offline));
    testWidgets('offline, the day not saved, $n dp', (t) => shot(t, 'offline_unsaved', '/hall/worcester?meal=lunch&day=2026-10-12', net: NetMode.offline));
    testWidgets('failed, $n dp', (t) => shot(t, 'failed', base, net: NetMode.fail));
  }
}
