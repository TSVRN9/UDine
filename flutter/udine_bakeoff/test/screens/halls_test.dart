import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine_bakeoff/main.dart';
import 'package:udine_bakeoff/motion/container_math.dart';
import 'package:udine_bakeoff/motion/container_transform.dart';
import 'package:udine_bakeoff/screens/hall_menu.dart';
import 'package:udine_bakeoff/screens/halls.dart';
import 'package:udine_bakeoff/ui/ui.dart';
import '../fonts.dart';
import '../logic/support.dart';

Future<Handle> boot(WidgetTester tester) async {
  Photos.enabled = false;
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(BakeoffApp(fx: fx));
  return Handle(tester);
}

class Handle {
  Handle(this.tester);
  final WidgetTester tester;
  ContainerTransform get t => tester.state<HallsTabState>(find.byType(HallsTab)).t;
  double get p => t.progress.value;
  Phase get phase => t.phase;
}

void main() {
  setUpAll(loadFonts);
  testWidgets('the shell shows Halls: the meal, four halls, two pins, the tab bar; Search is inert', (tester) async {
    await boot(tester);
    expect(find.text('Lunch'), findsOneWidget);
    expect(find.text('Thursday, October 8'), findsWidgets);
    for (final n in ['Worcester', 'Franklin', 'Hampshire', 'Berkshire', 'Wasabi', 'Tamales']) {
      expect(find.text(n), findsOneWidget, reason: n);
    }
    expect(find.text('Open until midnight'), findsNWidgets(2)); // Worcester, Berkshire
    for (final n in ['Halls', 'Search', 'You']) {
      expect(find.text(n), findsOneWidget);
    }
    await tester.tap(find.text('Search'));
    await tester.pump();
    expect(find.text('Lunch'), findsOneWidget);
  });

  testWidgets('a band opens its hall by the container transform and the back button closes it', (tester) async {
    final h = await boot(tester);
    await tester.tap(find.text('Hampshire'));
    await tester.pump();
    await tester.pump(); // (the clock starts once the page's first frame is drawn)
    expect(h.phase, Phase.opening);
    expect(find.byType(HallMenu), findsOneWidget);
    await tester.pump(const Duration(milliseconds: 250));
    expect(h.p, inInclusiveRange(0.5, 0.99));
    await tester.pumpAndSettle();
    expect((h.phase, h.p), (Phase.open, 1.0));
    await tester.tap(find.bySemanticsLabel('Back'));
    await tester.pumpAndSettle();
    expect((h.phase, h.p), (Phase.closed, 0.0));
    expect(find.byType(HallMenu), findsNothing);
  });

  testWidgets('Review Focus 4: a back during the open, then a second tap during the close, land in one consistent state', (tester) async {
    final h = await boot(tester);
    await tester.tap(find.text('Franklin'));
    await tester.pump();
    await tester.pump(); // (the clock starts once the page's first frame is drawn)
    await tester.pump(const Duration(milliseconds: 120));
    h.t.close(); // the quick back-swipe, mid-open
    await tester.pump(const Duration(milliseconds: 100));
    expect(h.phase, Phase.closing);
    final mid = h.p;
    expect(mid, inExclusiveRange(0, 1));
    // the band is still hidden under the closing window, so the tap lands on the window: its back is not there yet, so reopen via the band's API
    h.t.open(h.t.rect!);
    await tester.pump();
    expect(h.phase, Phase.opening);
    await tester.pumpAndSettle();
    expect((h.phase, h.p), (Phase.open, 1.0));
    expect(find.byType(HallMenu), findsOneWidget);
    h.t.close();
    await tester.pumpAndSettle();
    expect((h.phase, h.p), (Phase.closed, 0.0));
    expect(find.byType(HallMenu), findsNothing);
    // and the band is back, hittable
    await tester.tap(find.text('Franklin'));
    await tester.pumpAndSettle();
    expect(h.phase, Phase.open);
  });

  testWidgets('drag down tracks the finger, a release past the commit point closes, a short one springs back', (tester) async {
    final h = await boot(tester);
    await tester.tap(find.text('Worcester'));
    await tester.pumpAndSettle();
    var g = await tester.startGesture(const Offset(200, 300));
    await g.moveBy(const Offset(0, 40));
    await g.moveBy(const Offset(0, 120));
    await tester.pump();
    expect(h.phase, Phase.dragging);
    expect(h.p, closeTo(1 - 160 / 480, 1e-9));
    await g.moveBy(const Offset(0, -140)); // back up: 20 px down from the start
    await tester.pump();
    expect(h.p, closeTo(1 - 20 / 480, 1e-9));
    await g.up();
    await tester.pumpAndSettle();
    expect((h.phase, h.p), (Phase.open, 1.0));
    g = await tester.startGesture(const Offset(200, 300));
    await g.moveBy(const Offset(0, 30));
    await g.moveBy(const Offset(0, 250));
    await g.up();
    await tester.pumpAndSettle();
    expect((h.phase, h.p), (Phase.closed, 0.0));
  });

  testWidgets('a swipe in from the left edge tracks the finger and closes; the same swipe from the middle does nothing', (tester) async {
    final h = await boot(tester);
    await tester.tap(find.text('Berkshire'));
    await tester.pumpAndSettle();
    var g = await tester.startGesture(const Offset(200, 400));
    await g.moveBy(const Offset(30, 0));
    await g.moveBy(const Offset(200, 0));
    await tester.pump();
    expect(h.phase, Phase.open, reason: 'only an edge touch may swipe in');
    await g.up();
    await tester.pumpAndSettle();
    g = await tester.startGesture(const Offset(5, 400));
    await g.moveBy(const Offset(30, 0));
    await g.moveBy(const Offset(120, 0));
    await tester.pump();
    expect(h.phase, Phase.dragging);
    expect(h.p, closeTo(1 - 150 / 480, 1e-9));
    await g.up();
    await tester.pumpAndSettle();
    expect((h.phase, h.p), (Phase.closed, 0.0));
  });

  testWidgets('a cancelled grab settles by position and leaves dragging', (tester) async {
    final h = await boot(tester);
    await tester.tap(find.text('Hampshire'));
    await tester.pumpAndSettle();
    final g = await tester.startGesture(const Offset(200, 300));
    await g.moveBy(const Offset(0, 30));
    await g.moveBy(const Offset(0, 300));
    await tester.pump();
    expect(h.phase, Phase.dragging);
    await g.cancel();
    await tester.pumpAndSettle();
    expect(h.phase, Phase.closed);
  });

  testWidgets('the band hides while its screen is up and is back after a finished close', (tester) async {
    final h = await boot(tester);
    Finder hidden() => find.ancestor(of: find.text('Hampshire'), matching: find.byType(Opacity));
    double opacity() => tester.widgetList<Opacity>(hidden()).map((o) => o.opacity).reduce((a, b) => a < b ? a : b);
    expect(opacity(), 1);
    await tester.tap(find.text('Hampshire'));
    await tester.pump();
    await tester.pump(); // (the clock starts once the page's first frame is drawn)
    expect(opacity(), 0);
    await tester.pumpAndSettle();
    h.t.close();
    await tester.pump(const Duration(milliseconds: 100));
    expect(opacity(), 0);
    await tester.pumpAndSettle();
    expect(opacity(), 1);
  });

  group('jitter is a tap, not a drag', () {
    for (final d in const [Offset(0, 3), Offset(0, -5), Offset(4, 0), Offset(-2, 2), Offset(5, 5), Offset(-5, -5)]) {
      testWidgets('Back with a ${d.dx},${d.dy} px wobble still closes', (tester) async {
        final h = await boot(tester);
        await tester.tap(find.text('Hampshire'));
        await tester.pumpAndSettle();
        final g = await tester.startGesture(tester.getCenter(find.bySemanticsLabel('Back')));
        await g.moveBy(d);
        await g.up();
        await tester.pumpAndSettle();
        expect((h.phase, h.p), (Phase.closed, 0.0));
      });
      testWidgets('a tap in the edge zone with a ${d.dx},${d.dy} px wobble does not grab', (tester) async {
        final h = await boot(tester);
        await tester.tap(find.text('Hampshire'));
        await tester.pumpAndSettle();
        final g = await tester.startGesture(const Offset(5, 400));
        await g.moveBy(d);
        await tester.pump();
        expect(h.phase, Phase.open);
        await g.up();
        await tester.pumpAndSettle();
        expect((h.phase, h.p), (Phase.open, 1.0));
      });
    }
    testWidgets('a drag past the slop still grabs', (tester) async {
      final h = await boot(tester);
      await tester.tap(find.text('Hampshire'));
      await tester.pumpAndSettle();
      final g = await tester.startGesture(const Offset(200, 300));
      await g.moveBy(const Offset(0, 40));
      await tester.pump();
      expect(h.phase, Phase.dragging);
      await g.up();
      await tester.pumpAndSettle();
    });
  });

  testWidgets('a grab during a running open takes over: it tracks the finger, the open never finishes under it, and the release settles to closed', (tester) async {
    final h = await boot(tester);
    await tester.tap(find.text('Hampshire'));
    await tester.pump();
    await tester.pump(); // (the clock starts once the page's first frame is drawn)
    await tester.pump(const Duration(milliseconds: 150));
    final at = h.p;
    expect(h.phase, Phase.opening);
    final g = await tester.startGesture(const Offset(200, 600));
    await g.moveBy(const Offset(0, 40));
    await g.moveBy(const Offset(0, 100));
    await tester.pump();
    expect(h.phase, Phase.dragging);
    expect(h.p, closeTo(1 - 140 / 480, 1e-9));
    expect(h.p, isNot(closeTo(at, 1e-3)));
    await tester.pump(const Duration(milliseconds: 600)); // the stopped open's own end time passes: it must not finish
    expect(h.phase, Phase.dragging);
    await g.up();
    await tester.pumpAndSettle();
    expect((h.phase, h.p), (Phase.closed, 0.0));
  });
}
