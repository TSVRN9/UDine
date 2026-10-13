// Task 13: the network states. Positions are M2's own, measured in its DOM (`?net=` states, 390 wide; tool notes in the PR body); the
// arrival is M2's `arrive()`: the failure text goes at once, then tabs, station name and list fade in from nothing over `settle`.
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine_bakeoff/logic/net.dart';
import 'package:udine_bakeoff/logic/menu_view.dart';
import 'package:udine_bakeoff/logic/schedule.dart';
import 'package:udine_bakeoff/logic/status.dart';
import 'package:udine_bakeoff/main.dart';
import 'package:udine_bakeoff/motion/push.dart';
import 'package:udine_bakeoff/screens/dish_row.dart';
import 'package:udine_bakeoff/screens/event_page.dart';
import 'package:udine_bakeoff/screens/meal_tabs.dart';
import 'package:udine_bakeoff/shell.dart';
import 'package:udine_bakeoff/state/net.dart';
import 'package:udine_bakeoff/theme/tokens.dart';
import 'package:udine_bakeoff/ui/ui.dart';
import '../fonts.dart';
import '../logic/support.dart';
import 'flows_test.dart' show boot, openHall, menu;
import 'harness.dart';

const settleMs = 200;
Duration ms(int n) => Duration(milliseconds: n);

Future<void> hall(WidgetTester t, Net net, {String place = 'W', int day = 0, FakeShell? shell, bool reduced = false}) async {
  Photos.enabled = false;
  sized(t);
  await t.pumpWidget(hallApp(store: freshStore(), shell: shell ?? FakeShell(), place: place, day: day, net: net, reduced: reduced));
  await t.pump(ms(50));
}

Future<void> halls(WidgetTester t, Net net) async {
  Photos.enabled = false;
  sized(t);
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async => null);
  addTearDown(() => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
  await t.pumpWidget(BakeoffApp(fx: fx, store: freshStore(), net: net));
  await t.pump(ms(50));
}

Rect at(WidgetTester t, Finder f) => t.getRect(f.first);
void near(Rect r, List<double> m2, {double tol = 1.5}) {
  expect(r.left, closeTo(m2[0], tol));
  expect(r.top, closeTo(m2[1], tol));
  expect(r.width, closeTo(m2[2], tol));
  expect(r.height, closeTo(m2[3], tol));
}

/// What every Opacity above a widget multiplies to.
double opacityOf(WidgetTester t, Finder f) => t.widgetList<Opacity>(find.ancestor(of: f, matching: find.byType(Opacity))).fold(1.0, (a, o) => a * o.opacity);
Finder get underline => find.descendant(of: find.byType(MealTabs), matching: find.byWidgetPredicate((w) => w is ColoredBox && w.color == M2Color.gold));
Finder get tabLabel => find.descendant(of: find.byType(MealTabs), matching: find.text('Lunch'));
Finder stationName() => find.descendant(of: find.byType(StationRow), matching: find.byType(Text)).first;
double listOpacity(WidgetTester t) => t.widget<Opacity>(find.byKey(const ValueKey('fade-list'))).opacity;
double tabsOpacity(WidgetTester t) => t.widgetList<Opacity>(find.descendant(of: find.byType(MealTabs), matching: find.byType(Opacity))).first.opacity;
final status = statusLine(fx, 'W', 0);
Finder get spinnerBox => find.descendant(of: find.byType(Spinner), matching: find.byType(Opacity));
Finder get rows => find.byType(DishRow);

void main() {
  setUpAll(loadFonts);

  group('Halls', () {
    testWidgets('slow: no hours or busy until they arrive, then they fade in from nothing over settle', (t) async {
      await halls(t, Net(fx, mode: NetMode.slow));
      expect(find.text(statusText(fx.hours['W']!, DateTime.parse(fx.clock))), findsNothing);
      expect(find.byType(BusyRow), findsNothing);
      expect(find.textContaining('open now'), findsNothing);
      await t.pump(ms(M2Motion.netSlow.round())); // the load lands; this frame draws the first of the fade
      final fade = find.ancestor(of: find.textContaining('open now'), matching: find.byType(FadeTransition)).first;
      expect(t.widget<FadeTransition>(fade).opacity.value, lessThan(0.05));
      await t.pump(ms(settleMs ~/ 2));
      final mid = t.widget<FadeTransition>(fade).opacity.value;
      expect(mid, inExclusiveRange(0.1, 0.99));
      await t.pump(ms(settleMs));
      expect(t.widget<FadeTransition>(fade).opacity.value, 1);
      expect(find.byType(BusyRow), findsWidgets);
    });

    testWidgets('offline: "You\'re offline" under the date where M2 puts it, hours kept, no busy, no Try again', (t) async {
      await halls(t, Net(fx, mode: NetMode.offline));
      near(at(t, find.text("You're offline")), [277.8, 64, 92.2, 18]);
      expect(find.text('Try again'), findsNothing);
      expect(find.byType(BusyRow), findsNothing);
      expect(find.textContaining('open now'), findsWidgets);
    });

    testWidgets('failed: "Couldn\'t connect" with Try again beneath at M2\'s positions, no hours and no busy; Try again brings it all back', (t) async {
      final net = Net(fx, mode: NetMode.fail);
      await halls(t, net);
      near(at(t, find.text("Couldn't connect")), [250.8, 64, 119.2, 18]);
      near(at(t, find.widgetWithText(Press, 'Try again')), [275.1, 88, 94.9, 44]);
      expect(find.textContaining('open now'), findsNothing);
      expect(find.byType(BusyRow), findsNothing);
      await t.tap(find.text('Try again'));
      await t.pump(ms(10));
      expect(find.text("Couldn't connect"), findsNothing);
      expect(find.text('Try again'), findsNothing);
      await t.pump(ms(settleMs * 2));
      expect(find.textContaining('open now'), findsWidgets);
      expect(find.byType(BusyRow), findsWidgets);
    });
  });

  group('hall menu', () {
    testWidgets('loading: the spinner is drawn only after 400 ms, centred in the 160 dp state box at M2\'s place; no status, tabs or station name', (t) async {
      await hall(t, Net(fx, mode: NetMode.slow, hold: true));
      expect(t.widget<Opacity>(spinnerBox.first).opacity, 0);
      await t.pump(ms(300));
      expect(t.widget<Opacity>(spinnerBox.first).opacity, 0);
      await t.pump(ms(100));
      expect(t.widget<Opacity>(spinnerBox.first).opacity, 1);
      final c = t.getCenter(find.byType(Spinner));
      expect(c.dx, closeTo(195, 1));
      expect(c.dy, closeTo(482, 1));
      expect(rows, findsNothing);
      expect(find.text(status), findsNothing);
      expect(find.text('Lunch'), findsNothing);
    });

    testWidgets('loading under reduced motion: the spinner is there at once, not turning', (t) async {
      await hall(t, Net(fx, mode: NetMode.slow, hold: true), reduced: true);
      expect(t.widget<Opacity>(spinnerBox.first).opacity, 1);
    });

    testWidgets('a slow menu arrives: status and busy at once, tabs, station name and list from nothing over settle', (t) async {
      final net = Net(fx, mode: NetMode.slow);
      await hall(t, net);
      expect(rows, findsNothing);
      await t.pump(ms(M2Motion.netSlow.round()));
      expect(rows, findsWidgets);
      expect(find.text(status), findsOneWidget); // at once: nothing fades it
      expect(opacityOf(t, find.text(status)), 1);
      expect(opacityOf(t, stationName()), lessThan(0.05)); // the station name fades with the tabs and the list
      expect(opacityOf(t, underline), closeTo(opacityOf(t, tabLabel), 1e-6)); // the underline is part of the tab row (`.mts .ul`): it fades with the labels
      expect(opacityOf(t, underline), lessThan(0.05));
      expect(find.byType(BusyRow), findsWidgets);
      expect(listOpacity(t), lessThan(0.05));
      expect(tabsOpacity(t), lessThan(0.05));
      await t.pump(ms(settleMs ~/ 2));
      expect(listOpacity(t), inExclusiveRange(0.1, 0.99));
      expect(tabsOpacity(t), closeTo(listOpacity(t), 1e-6));
      expect(opacityOf(t, stationName()), closeTo(listOpacity(t), 1e-6));
      expect(opacityOf(t, underline), closeTo(opacityOf(t, tabLabel), 1e-6));
      expect(opacityOf(t, underline), inExclusiveRange(0.1, 0.99));
      await t.pump(ms(settleMs));
      expect(listOpacity(t), 1);
      expect(tabsOpacity(t), 1);
      expect(opacityOf(t, stationName()), 1);
    });

    testWidgets('offline, a day that is not saved: the copy at M2\'s place, no rows, no Try again, no station name', (t) async {
      await hall(t, Net(fx, mode: NetMode.offline), day: 5);
      final text = find.text("You're offline, and the menu for ${dayFull(fx, 5)} isn't saved on this phone.");
      near(at(t, text), [20, 446, 350, 46.4]);
      expect(rows, findsNothing);
      expect(find.text('Try again'), findsNothing);
    });

    testWidgets('offline, today and tomorrow are saved: the menu is there', (t) async {
      await hall(t, Net(fx, mode: NetMode.offline), day: 1);
      expect(rows, findsWidgets);
      expect(find.textContaining("isn't saved"), findsNothing);
    });

    testWidgets('failed: the copy and Try again where M2 puts them, and never together with rows', (t) async {
      await hall(t, Net(fx, mode: NetMode.fail));
      near(at(t, find.text("Worcester's menu didn't load.")), [20, 446, 350, 23.2]);
      near(at(t, find.widgetWithText(Press, 'Try again')), [20, 501.2, 350, 52]);
      expect(rows, findsNothing);
      expect(find.text(status), findsNothing);
    });

    testWidgets('Try again: the failure text goes at once, the list arrives from nothing; the text and the rows are never on screen together', (t) async {
      final net = Net(fx, mode: NetMode.fail);
      await hall(t, net);
      await t.tap(find.text('Try again'));
      var frames = 0;
      for (var i = 0; i < 30; i++) {
        await t.pump(ms(20));
        final text = find.text("Worcester's menu didn't load.").evaluate().isNotEmpty, any = rows.evaluate().isNotEmpty;
        expect(text && any, isFalse, reason: 'frame $i');
        if (any) frames++;
      }
      expect(frames, greaterThan(5));
      expect(find.text("Worcester's menu didn't load."), findsNothing);
      expect(listOpacity(t), 1);
    });

    testWidgets('the arrival begins from nothing on the retry frame', (t) async {
      final net = Net(fx, mode: NetMode.fail);
      await hall(t, net);
      await t.tap(find.text('Try again'));
      await t.pump(ms(1)); // (retry awaits a fetch; this frame draws the result)
      await t.pump(ms(1));
      expect(rows, findsWidgets);
      expect(listOpacity(t), lessThan(0.1));
      await t.pump(ms(settleMs ~/ 2));
      expect(listOpacity(t), inExclusiveRange(0.1, 0.99));
    });
  });

  group('cafés without a dish menu', () {
    testWidgets('a café\'s title block sits where M2 puts it: the empty busy row keeps its 8 under the status (name 211, status line 258)', (t) async {
      for (final k in ['c13', 'c5']) {
        await hall(t, Net(fx), place: k);
        final name = fx.places.firstWhere((q) => q.key == k).name;
        expect(at(t, find.text(name)).top, closeTo(211, 1), reason: k);
        expect(at(t, find.textContaining('Open')).top, closeTo(258, 1), reason: k);
        await t.pumpWidget(const SizedBox());
      }
    });

    testWidgets('the description, "Menu", and the line that says so; no custom food button, no tabs', (t) async {
      await hall(t, Net(fx), place: 'c13');
      final p = fx.places.firstWhere((q) => q.key == 'c13');
      expect(find.textContaining(p.description.substring(0, 30)), findsOneWidget);
      near(at(t, find.textContaining(p.description.substring(0, 30))), [20, 326, 350, 96]);
      near(at(t, find.text('Menu')), [20, 446, 350, 26.4]);
      near(at(t, find.text("ISB Café doesn't list its menu in the app.")), [20, 487.4, 350, 22.5]);
      expect(find.textContaining('custom'), findsNothing);
      expect(find.byType(MealTabs), findsNothing);
    });
  });

  group('the holiday', () {
    testWidgets('Monday\'s list leads with the note, no date tag; it is a row of 52 at the top of the list', (t) async {
      await hall(t, Net(fx), day: 4);
      final r = at(t, find.text('Indigenous Peoples Day'));
      expect([r.left, r.top, r.height], everyElement(isA<double>()));
      expect(r.left, closeTo(20, 1));
      expect(r.top, closeTo(416, 1.5));
      expect(r.height, closeTo(19.5, 1.5));
      expect(find.text('Mon, Oct 12'), findsNothing);
    });

    testWidgets('tapping it pushes the event page', (t) async {
      final shell = FakeShell();
      await hall(t, Net(fx), day: 4, shell: shell);
      await t.tap(find.text('Indigenous Peoples Day'));
      expect(shell.pages, hasLength(1));
    });

    testWidgets('the event page in the app: pushed over the hall (it shifts 30% and dims 10%, the shadow only while moving), the date in gold, the banner link gold, the rest outlined', (t) async {
      await boot(t, net: Net(fx));
      await openHall(t, 'Worcester');
      menu(t).changeDay(4); // (its future ends with the animation: pump, do not await)
      await t.pumpAndSettle();
      await t.tap(find.text('Indigenous Peoples Day'));
      await t.pump();
      await t.pump();
      await t.pump(ms(150));
      final shell = t.state<ShellState>(find.byType(Shell));
      final p = shell.push.p.value;
      expect(p, closeTo(M2Motion.pushIn.curve.transform(150 / 500), 0.04));
      final under = t.widget<Transform>(find.ancestor(of: find.byType(FadeThroughTabs), matching: find.byType(Transform)).first).transform.getTranslation().x;
      expect(under, closeTo(-390 * M2Motion.pushShift * p, 0.5));
      final dim = t.widgetList<ColoredBox>(find.byType(ColoredBox)).where((b) => b.color.a > 0 && b.color.a < 0.12 && b.color.toARGB32() & 0xFFFFFF == 0x240A0E);
      expect(dim.single.color.a, closeTo(M2Motion.pushDim * p, 0.01));
      expect(find.byWidgetPredicate((w) => w is DecoratedBox && w.decoration is BoxDecoration && (w.decoration as BoxDecoration).boxShadow?.length == 2), findsOneWidget);
      await t.pumpAndSettle();
      expect(find.byType(EventPage), findsOneWidget);
      expect(find.text('Mon, Oct 12'), findsOneWidget);
      near(t.getRect(find.descendant(of: find.byType(EventPage), matching: find.byType(Felt))), [20, 172.7, 350, 147.7]);
      final d = at(t, find.text('Mon, Oct 12')); // M2's `.pstat b`
      expect([d.left, d.top, d.height], [closeTo(20, 1), closeTo(348.3, 1.5), closeTo(39, 1.5)]);
      near(at(t, find.widgetWithText(Press, 'See the menu')), [20, 411.3, 350, 52]);
      near(at(t, find.widgetWithText(Press, 'Holiday hours')), [20, 475.3, 350, 52]);
    });

    testWidgets('the event page at 360 x 640: its scroll runs to the screen\'s bottom edge (the foot is scrollable room, not a smaller viewport) and every button can be reached', (t) async {
      Photos.enabled = false;
      sized(t, w: 360, h: 640);
      await t.pumpWidget(BakeoffApp(fx: fx, store: freshStore(), net: Net(fx)));
      await t.pump(ms(50));
      await t.tap(find.text('Franklin').first);
      await t.pumpAndSettle();
      menu(t).changeDay(4);
      await t.pumpAndSettle();
      await t.tap(find.text('Indigenous Peoples Day'));
      await t.pumpAndSettle();
      final page = t.getRect(find.byType(EventPage)), scroll = t.getRect(find.descendant(of: find.byType(EventPage), matching: find.byType(SingleChildScrollView)));
      expect(scroll.bottom, closeTo(page.bottom, 0.5));
      await t.drag(find.descendant(of: find.byType(EventPage), matching: find.byType(SingleChildScrollView)), const Offset(0, -400));
      await t.pumpAndSettle();
      expect(t.getRect(find.widgetWithText(Press, 'Holiday hours')).bottom, lessThanOrEqualTo(page.bottom));
    });

    testWidgets('the schedule: the holiday\'s row says "Holiday hours" and opens the event, the hall behind it unmoved', (t) async {
      final s = schedule(fx, 'W', 4);
      expect(s.days[4].right, 'Holiday hours');
      expect(s.days[4].event!.index, fx.events.indexWhere((e) => e.title == 'Indigenous Peoples Day'));
    });
  });
}
