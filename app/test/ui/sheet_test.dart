import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/theme/tokens.dart';
import 'package:udine/ui/sheet.dart';

import '../screens/support.dart' show phone;

class Host extends StatefulWidget {
  final SheetHandle handle;
  final bool Function() closed;
  final void Function()? onClosed;
  final double inset;
  const Host(this.handle, {super.key, required this.closed, this.onClosed, this.inset = 0});
  @override
  State<Host> createState() => _HostState();
}

class _HostState extends State<Host> {
  bool shut = false;
  @override
  Widget build(BuildContext context) => Directionality(
        textDirection: TextDirection.ltr,
        child: MediaQuery(
          data: MediaQueryData(size: const Size(390, 844), padding: EdgeInsets.only(top: widget.inset)),
          child: shut
              ? const SizedBox()
              : M2Sheet(
                  handle: widget.handle, top: 32, mid: (m) => 400,
                  onClosed: () {
                    widget.onClosed?.call();
                    setState(() => shut = true);
                  },
                  slivers: [SliverToBoxAdapter(child: Container(height: 1400, color: const Color(0xFFEEEEEE)))],
                ),
        ),
      );
}

/// A content-sized sheet (`mid` null) whose content can grow: the sheet re-snaps to the new resting height after the rebuild.
class Grower extends StatefulWidget {
  final SheetHandle handle;
  const Grower(this.handle, {super.key});
  @override
  State<Grower> createState() => GrowerState();
}

class GrowerState extends State<Grower> {
  double h = 300;
  void grow() => setState(() => h = 500);
  @override
  Widget build(BuildContext context) => Directionality(
        textDirection: TextDirection.ltr,
        child: MediaQuery(
          data: const MediaQueryData(size: Size(390, 844)),
          child: M2Sheet(handle: widget.handle, top: 32, slivers: [SliverToBoxAdapter(child: Container(height: h, color: const Color(0xFFEEEEEE)))]),
        ),
      );
}

void main() {
  Future<void> boot(WidgetTester t, SheetHandle h, {void Function()? onClosed, double inset = 0}) async {
    t.view.physicalSize = const Size(390, 844);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(Host(h, closed: () => false, onClosed: onClosed, inset: inset));
  }

  testWidgets('opens on the spring from nothing to its resting height, and arrives at mount (the first frames already move)', (t) async {
    final h = SheetHandle();
    await boot(t, h);
    expect(h.px, 0);
    await t.pump(const Duration(milliseconds: 16));
    await t.pump(const Duration(milliseconds: 16));
    expect(h.px, greaterThan(0));
    await t.pumpAndSettle();
    expect(h.px, closeTo(400, 0.5));
  });

  testWidgets('settled, asked right after a rebuild that grows the content, resolves only once the re-snap that follows has rested', (t) async {
    final h = SheetHandle();
    phone(t);
    await t.pumpWidget(Grower(h));
    await t.pumpAndSettle();
    final rest0 = h.px;
    t.state<GrowerState>(find.byType(Grower)).grow();
    var done = false;
    h.settled.then((_) => done = true); // (before the frame that rebuilds: its post-frame measure starts the spring)
    var last = h.px, moved = 0, restAt = -1;
    for (var i = 0; i < 120 && restAt < 0; i++) {
      await t.pump(const Duration(milliseconds: 16));
      if ((h.px - last).abs() > 0.5) {
        moved++;
        expect(done, isFalse, reason: 'frame $i: settled resolved while the sheet re-snapped');
      } else if (done) {
        restAt = i;
      }
      last = h.px;
    }
    expect(moved, greaterThan(3), reason: 'the content grew, so the sheet re-snapped');
    expect(restAt, greaterThan(0));
    expect(h.px, greaterThan(rest0 + 100));
  });

  testWidgets('settled never waits past the rest cap: a sheet kept moving by retargets still releases it', (t) async {
    final h = SheetHandle();
    await boot(t, h);
    await t.pumpAndSettle();
    h.to(300);
    var done = false;
    h.settled.then((_) => done = true); // (asked while the sheet moves)
    final frames = M2Layout.sheetRestCap.inMilliseconds ~/ 16;
    for (var i = 1; i < frames - 4; i++) {
      if (i % 4 == 0) h.to(i % 8 == 0 ? 300 : 500); // (never lets a spring finish)
      await t.pump(const Duration(milliseconds: 16));
      expect(done, isFalse, reason: 'frame $i: the sheet is still moving and the cap is not up');
    }
    for (var i = 0; i < 10; i++) {
      await t.pump(const Duration(milliseconds: 16));
    }
    expect(done, isTrue, reason: 'the cap fell through');
    h.close();
    await t.pumpAndSettle();
  });

  testWidgets('away runs its callback once the sheet is half-way out, before it is shut', (t) async {
    final h = SheetHandle();
    var closed = false;
    await boot(t, h, onClosed: () => closed = true);
    await t.pumpAndSettle();
    final log = <String>[];
    h.away(() => log.add('half@${h.px.round()}'));
    for (var i = 0; i < 60 && !closed; i++) {
      await t.pump(const Duration(milliseconds: 16));
    }
    expect(log, hasLength(1));
    final at = int.parse(log.single.split('@')[1]);
    expect(at, inInclusiveRange(150, 260)); // half-way out of 400, not at the bottom
    expect(closed, isTrue);
  });

  testWidgets('a drag down past the resting height snaps it shut and tells the owner', (t) async {
    final h = SheetHandle();
    var closed = false;
    await boot(t, h, onClosed: () => closed = true);
    await t.pumpAndSettle();
    await t.flingFrom(const Offset(195, 600), const Offset(0, 500), 1800);
    await t.pumpAndSettle();
    expect(closed, isTrue);
  });

  testWidgets('a drag up takes it to the top detent (status inset + 8 from the top)', (t) async {
    final h = SheetHandle();
    await boot(t, h);
    await t.pumpAndSettle();
    await t.flingFrom(const Offset(195, 600), const Offset(0, -600), 1800);
    await t.pumpAndSettle();
    expect(h.px, closeTo(844 - 32, 1));
  });

  testWidgets('the scrim follows the sheet and a tap on it closes', (t) async {
    final h = SheetHandle();
    var closed = false;
    await boot(t, h, onClosed: () => closed = true);
    await t.pumpAndSettle();
    final scrim = t.widgetList<ColoredBox>(find.byType(ColoredBox)).firstWhere((b) => b.color.a > 0 && b.color != const Color(0xFFEEEEEE));
    expect(scrim.color.a, closeTo(M2Motion.plateScrim, 0.01));
    await t.tapAt(const Offset(195, 100));
    await t.pumpAndSettle();
    expect(closed, isTrue);
  });

  testWidgets('reduced motion snaps: no frame between closed and resting', (t) async {
    final h = SheetHandle();
    t.view.physicalSize = const Size(390, 844);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(Directionality(textDirection: TextDirection.ltr, child: MediaQuery(data: const MediaQueryData(size: Size(390, 844), disableAnimations: true), child: M2Sheet(handle: h, top: 32, mid: (m) => 400, slivers: [SliverToBoxAdapter(child: Container(height: 1400))]))));
    await t.pump(const Duration(milliseconds: 16));
    await t.pump(const Duration(milliseconds: 16));
    expect(h.px, closeTo(400, 0.5));
  });

  /// A finger from `from` moving `step` per frame for `n` frames of `ms` each, left on the glass (the caller lifts it).
  Future<TestGesture> drag(WidgetTester t, Offset from, double step, int n, {int ms = 16}) async {
    final g = await t.startGesture(from);
    for (var i = 1; i <= n; i++) {
      await g.moveBy(Offset(0, step), timeStamp: Duration(milliseconds: ms * i));
      await t.pump(Duration(milliseconds: ms));
    }
    return g;
  }

  testWidgets('a fast release settles where the velocity projected 180 ms ahead lands, not at the nearest detent (M2 release)', (t) async {
    final h = SheetHandle();
    await boot(t, h);
    await t.pumpAndSettle();
    // 8 frames of 14 dp at 16 ms: about 875 dp/s up, lifted at about 490 dp, nearer the resting 400 than the top 812; projected 180 ms, it is past 640
    final g = await drag(t, const Offset(195, 600), -14, 8);
    expect(h.px, inInclusiveRange(450, 540));
    await g.up();
    await t.pumpAndSettle();
    expect(h.px, closeTo(844 - 32, 1));
  });

  testWidgets('a slow release settles at the nearest detent', (t) async {
    final h = SheetHandle();
    await boot(t, h);
    await t.pumpAndSettle();
    final g = await drag(t, const Offset(195, 600), -12, 6, ms: 100);
    await g.up();
    await t.pumpAndSettle();
    expect(h.px, closeTo(400, 1));
  });

  testWidgets('a fling to the top is the spring, and never carries the sheet past the top: its head stays under the status bar', (t) async {
    final h = SheetHandle();
    await boot(t, h);
    await t.pumpAndSettle();
    final g = await drag(t, const Offset(195, 600), -20, 8);
    await g.up();
    var peak = 0.0;
    for (var i = 0; i < 80; i++) {
      await t.pump(const Duration(milliseconds: 16));
      if (h.px > peak) peak = h.px;
      expect(t.getTopLeft(find.byType(CustomScrollView)).dy, greaterThanOrEqualTo(32 - 0.01), reason: 'frame $i');
    }
    expect(peak, closeTo(844 - 32, 0.01), reason: 'it arrives at the top and no higher');
    expect(t.getTopLeft(find.byType(CustomScrollView)).dy, closeTo(32, 0.01));
  });

  testWidgets('dragging past the top rubber-bands: the sheet follows the finger less and less, the body does not scroll, and it springs back', (t) async {
    final h = SheetHandle();
    await boot(t, h);
    await t.pumpAndSettle();
    final g = await drag(t, const Offset(195, 700), -20, 35); // 700 dp up, 270 past the top
    final top = t.getTopLeft(find.byType(CustomScrollView)).dy;
    expect(top, lessThan(32 - 20)); // (the band has taken it)
    expect(top, greaterThanOrEqualTo(0), reason: 'but never off the screen: the head stays visible');
    expect(t.state<ScrollableState>(find.byType(Scrollable)).position.pixels, 0);
    await g.up();
    await t.pumpAndSettle();
    expect(t.getTopLeft(find.byType(CustomScrollView)).dy, closeTo(32, 0.5));
    expect(h.px, closeTo(844 - 32, 1));
  });

  testWidgets('under a status bar the band stops at the status bar: a long over-pull and its release keep the head below the inset on every frame', (t) async {
    final h = SheetHandle();
    await boot(t, h, inset: 24); // the sheet's top is inset + 8 = 32
    await t.pumpAndSettle();
    double top() => t.getTopLeft(find.byType(CustomScrollView)).dy;
    final g = await drag(t, const Offset(195, 700), -20, 50); // 1000 dp up
    expect(top(), lessThan(32));
    for (var i = 0; i < 5; i++) {
      await g.moveBy(const Offset(0, -20), timeStamp: Duration(milliseconds: 16 * (51 + i)));
      await t.pump(const Duration(milliseconds: 16));
      expect(top(), greaterThanOrEqualTo(24 - 0.01), reason: 'held, frame $i');
    }
    await g.up();
    for (var i = 0; i < 60; i++) {
      await t.pump(const Duration(milliseconds: 16));
      expect(top(), greaterThanOrEqualTo(24 - 0.01), reason: 'released, frame $i');
    }
  });

  testWidgets('reversing past the top, the sheet follows the finger 1:1 through the rubber curve on every frame, then on down', (t) async {
    final h = SheetHandle();
    await boot(t, h);
    await t.pumpAndSettle();
    final g = await drag(t, const Offset(195, 700), -20, 35);
    double top() => t.getTopLeft(find.byType(CustomScrollView)).dy;
    final past = 32 - top(); // how far the rubber band has taken it
    expect(past, greaterThan(20));
    // the finger's own excess past the top: the inverse of the curve
    final excess = 32 / M2Motion.sheetReleaseRubber * (1 / (1 - past / 32) - 1);
    var worst = 0.0;
    for (var k = 1; k <= 60; k++) {
      await g.moveBy(const Offset(0, 10), timeStamp: Duration(milliseconds: 16 * (35 + k)));
      await t.pump(const Duration(milliseconds: 16));
      final left = excess - 10 * k;
      final want = left > 0 ? 32 - sheetRubber(left, 32) : 32 - left; // past the unwound band it is 1:1 with the finger
      worst = [worst, (top() - want).abs()].reduce((a, b) => a > b ? a : b);
    }
    expect(worst, lessThan(1));
    await g.up();
    await t.pumpAndSettle();
  });

  test('sheetReleaseTarget: the nearest detent to the projection; a mid at the top is no detent', () {
    double to(double px, double v, {double? mid = 400}) => sheetReleaseTarget(px: px, v: v, min: 0, max: 812, mid: mid);
    expect(to(540, 0), 400);
    expect(to(540, 1250), 812); // 540 + 225
    expect(to(540, 9000), 812); // (clamped to 4000 dp/s: 540 + 720)
    expect(to(300, -1000), 0);
    expect(to(790, 0, mid: 810), 812); // the mid within 4 of the top is the top
    expect(to(500, 0, mid: 810), 0); // ... and more than 80 short of it, closed
    expect(to(100, 0, mid: null), 0);
    expect(sheetRubber(1e9, 32), lessThan(32));
    expect(sheetRubber(270, 32), closeTo(26.3, 0.1));
  });
}
