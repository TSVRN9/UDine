import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/motion/container_transform.dart';
import 'package:udine/motion/routes.dart';
import 'package:udine/theme/tokens.dart';
import '../fonts.dart';

class Rec extends NavigatorObserver {
  final stack = <String>[];
  final pushed = <Route<dynamic>>[];
  @override
  void didPush(Route<dynamic> r, Route<dynamic>? p) {
    pushed.add(r);
    stack.add(r.settings.name ?? '?');
  }

  @override
  void didPop(Route<dynamic> r, Route<dynamic>? p) => stack.remove(r.settings.name ?? '?');
}

/// A navigator over a base route whose body has a "band" (a button that opens a card) and a "page" button (a push). Every pushed page
/// has the same two buttons, labelled by depth, so a page can push again.
class Harness {
  Harness(this.tester, {this.reduced = false});
  final WidgetTester tester;
  final bool reduced;
  final rec = Rec();
  final hider = BandHider();
  final key = GlobalKey<NavigatorState>();

  Widget body(String name, int depth) => Builder(
        builder: (context) => ColoredBox(
          color: M2Color.chalk,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name),
            GestureDetector(
              key: Key('push-$name'),
              onTap: () => Nav.push(context, (c) => body('P${depth + 1}', depth + 1)),
              child: SizedBox(width: 390, height: 40, child: Text('push from $name')),
            ),
            Builder(
              builder: (c) => GestureDetector(
                key: Key('band-$name'),
                onTap: () {
                  final r = (c.findRenderObject()! as RenderBox);
                  final o = r.localToGlobal(Offset.zero);
                  Nav.openCard(context, source: 'band-$name', hider: hider, band: o & r.size, off: 20, builder: (c, page) => card(c, page, depth + 1));
                },
                child: ListenableBuilder(
                  listenable: hider,
                  builder: (_, _) => Opacity(opacity: hider.hides('band-$name') ? 0 : 1, child: SizedBox(width: 390, height: 112, child: Text('band $name'))),
                ),
              ),
            ),
            const Spacer(),
          ]),
        ),
      );

  bool listAtTop = true;
  Widget card(BuildContext c, CardPage page, int depth) {
    page.canDragDown = () => listAtTop;
    return body('C$depth', depth);
  }

  Future<void> boot({double w = 390, double h = 844}) async {
    tester.view.physicalSize = Size(w, h);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(Directionality(
      textDirection: TextDirection.ltr,
      child: MediaQuery(
        data: MediaQueryData(size: Size(w, h), disableAnimations: reduced),
        child: Navigator(key: key, observers: [rec], onGenerateRoute: (s) => BaseRoute(settings: const RouteSettings(name: 'base'), builder: (_) => body('Base', 0))),
      ),
    ));
  }

  Future<void> tapPush(String name) async {
    await tester.tap(find.byKey(Key('push-$name')));
    await tester.pumpAndSettle();
  }

  Future<void> tapBand(String name) async {
    await tester.tap(find.byKey(Key('band-$name')));
    await tester.pumpAndSettle();
  }

  NavigatorState get nav => key.currentState!;
  int get depth => rec.stack.length;

  /// the progress of the route pushed last (a closing one still counts)
  double get p => (rec.pushed.last as TransitionRoute).animation!.value;

  Future<void> edgeSwipe({double by = 300, double from = 5, double y = 400}) async {
    final g = await tester.startGesture(Offset(from, y));
    await g.moveBy(const Offset(30, 0));
    await g.moveBy(Offset(by - 30, 0));
    await g.up();
    await tester.pumpAndSettle();
  }
}

void main() {
  setUpAll(loadFonts);

  testWidgets('a pushed page can push again and come back, in order', (tester) async {
    final h = Harness(tester);
    await h.boot();
    await h.tapPush('Base');
    expect(find.text('P1'), findsOneWidget);
    await h.tapPush('P1');
    expect(find.text('P2'), findsOneWidget);
    await h.tapBand('P2');
    expect(find.text('C3'), findsOneWidget);
    expect(h.nav.canPop(), isTrue);
    await h.nav.maybePop();
    await tester.pumpAndSettle();
    expect(find.text('P2'), findsOneWidget);
    await h.nav.maybePop();
    await tester.pumpAndSettle();
    expect(find.text('P1'), findsOneWidget);
    await h.nav.maybePop();
    await tester.pumpAndSettle();
    expect(find.text('Base'), findsOneWidget);
    expect(h.nav.canPop(), isFalse);
  });

  testWidgets('an edge swipe at each level takes exactly that level back', (tester) async {
    final h = Harness(tester);
    await h.boot();
    await h.tapPush('Base');
    await h.tapPush('P1');
    await h.tapBand('P2');
    expect(h.depth, 4); // base, P1, P2, C3
    for (final shown in ['P2', 'P1', 'Base']) {
      await h.edgeSwipe();
      expect(find.text(shown), findsOneWidget);
    }
    expect(h.nav.canPop(), isFalse);
  });

  testWidgets('a push follows the finger 1:1 over the width, and a short pull springs back', (tester) async {
    final h = Harness(tester);
    await h.boot();
    await h.tapPush('Base');
    final g = await tester.startGesture(const Offset(5, 400));
    await g.moveBy(const Offset(30, 0));
    await g.moveBy(const Offset(90, 0));
    await tester.pump();
    expect(h.p, closeTo(1 - 120 / 390, 1e-9));
    expect(tester.getTopLeft(find.text('P1')).dx, closeTo(120, 1e-6));
    await g.up();
    await tester.pumpAndSettle();
    expect(h.p, 1.0);
    expect(find.text('P1'), findsOneWidget);
  });

  testWidgets('a card closes by drag down, and springs back when short; the drag takes 480 px', (tester) async {
    final h = Harness(tester);
    await h.boot();
    await h.tapBand('Base');
    var g = await tester.startGesture(const Offset(200, 300));
    await g.moveBy(const Offset(0, 40));
    await g.moveBy(const Offset(0, 120));
    await tester.pump();
    expect(h.p, closeTo(1 - 160 / 480, 1e-9));
    await g.moveBy(const Offset(0, -140));
    await tester.pump();
    expect(h.p, closeTo(1 - 20 / 480, 1e-9));
    await g.up();
    await tester.pumpAndSettle();
    expect(h.p, 1.0);
    expect(find.text('C1'), findsOneWidget);
    g = await tester.startGesture(const Offset(200, 300));
    await g.moveBy(const Offset(0, 30));
    await g.moveBy(const Offset(0, 250));
    await g.up();
    await tester.pumpAndSettle();
    expect(find.text('Base'), findsOneWidget);
    expect(h.nav.canPop(), isFalse);
  });

  testWidgets('a drag down takes the card only while its list is at the top; the edge swipe always does', (tester) async {
    final h = Harness(tester);
    await h.boot();
    await h.tapBand('Base');
    h.listAtTop = false;
    final g = await tester.startGesture(const Offset(200, 300));
    await g.moveBy(const Offset(0, 40));
    await g.moveBy(const Offset(0, 300));
    await g.up();
    await tester.pumpAndSettle();
    expect(find.text('C1'), findsOneWidget);
    await h.edgeSwipe();
    expect(find.text('Base'), findsOneWidget);
  });

  testWidgets('a card from a pushed page closes with the edge swipe, and a card can push again', (tester) async {
    final h = Harness(tester);
    await h.boot();
    await h.tapPush('Base');
    await h.tapBand('P1');
    await h.tapPush('C2');
    expect(find.text('P3'), findsOneWidget);
    await h.edgeSwipe();
    expect(find.text('C2'), findsOneWidget);
    await h.edgeSwipe(from: 5);
    expect(find.text('P1'), findsOneWidget);
  });

  testWidgets('a push shifts the page under it by 30% and dims it by 10%; a card leaves it where it was', (tester) async {
    final h = Harness(tester);
    await h.boot();
    await h.tapPush('Base');
    // P1 is now covered by a push
    await tester.tap(find.byKey(const Key('push-P1')));
    await tester.pump();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pumpAndSettle();
    final under = find.text('P1', skipOffstage: false);
    expect(tester.getTopLeft(under).dx, closeTo(-390 * M2Motion.pushShift, 1e-6));
    final dim = tester.widgetList<ColoredBox>(find.descendant(of: find.byType(Navigator), matching: find.byType(ColoredBox, skipOffstage: false), skipOffstage: false)).where((b) => b.color.a > 0.09 && b.color.a < 0.11 && b.color.r == M2Color.scrim.r);
    expect(dim, isNotEmpty);
    await h.nav.maybePop();
    await tester.pumpAndSettle();
    await h.tapBand('P1');
    expect(tester.getTopLeft(find.text('P1', skipOffstage: false)).dx, 0);
  });

  testWidgets('the band is hidden while its card is up and shown again after the close', (tester) async {
    final h = Harness(tester);
    await h.boot();
    expect(h.hider.hides('band-Base'), isFalse);
    await h.tapBand('Base');
    expect(h.hider.hides('band-Base'), isTrue);
    await h.nav.maybePop();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(h.hider.hides('band-Base'), isTrue);
    await tester.pumpAndSettle();
    expect(h.hider.hides('band-Base'), isFalse);
  });

  testWidgets('a band tap during a close is taken: the same band opens again, and the first card going does not show it', (tester) async {
    final h = Harness(tester);
    await h.boot();
    await h.tapBand('Base');
    await h.nav.maybePop();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 150));
    expect(h.p, inExclusiveRange(0, 1));
    await tester.tap(find.byKey(const Key('band-Base'), skipOffstage: false), warnIfMissed: false);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 10));
    expect(h.nav.canPop(), isTrue);
    await tester.pumpAndSettle();
    expect(find.text('C1'), findsOneWidget);
    expect(h.hider.hides('band-Base'), isTrue);
  });

  testWidgets('the clock starts after the first drawn frame: a long first frame does not skip the curve', (tester) async {
    final h = Harness(tester);
    await h.boot();
    await tester.tap(find.byKey(const Key('band-Base')));
    await tester.pump(); // the frame that builds the page
    await tester.pump(const Duration(milliseconds: 200)); // ... took 200 ms
    expect(h.p, lessThan(0.1));
    await tester.pump(const Duration(milliseconds: 250));
    expect(h.p, inExclusiveRange(0.3, 0.99));
    await tester.pumpAndSettle();
    expect(h.p, 1.0);
  });

  testWidgets('a release settles over the token time scaled by the distance left', (tester) async {
    final h = Harness(tester);
    await h.boot();
    await h.tapPush('Base');
    final g = await tester.startGesture(const Offset(5, 400));
    await g.moveBy(const Offset(30, 0));
    await g.moveBy(const Offset(70, 0)); // p = 1 - 100/390
    final left = 100 / 390;
    await g.up(); // short: springs back to 1 over 500 ms * left
    await tester.pump();
    await tester.pump(Duration(milliseconds: (M2Motion.pushIn.ms * left).round() - 20));
    expect(h.p, lessThan(1.0));
    await tester.pump(const Duration(milliseconds: 40));
    expect(h.p, 1.0);
  });

  group('reduced motion', () {
    testWidgets('a push is a 120 ms crossfade in place: nothing slides, nothing under it moves', (tester) async {
      final h = Harness(tester, reduced: true);
      await h.boot();
      await tester.tap(find.byKey(const Key('push-Base')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 16)); // (the clock starts once the page's first frame is drawn)
      await tester.pump(const Duration(milliseconds: 60));
      expect(tester.getTopLeft(find.text('P1')).dx, 0);
      final fade = tester.widget<Opacity>(find.ancestor(of: find.text('P1'), matching: find.byType(Opacity)).first).opacity;
      expect(fade, inExclusiveRange(0.2, 0.8));
      expect(tester.getTopLeft(find.text('Base', skipOffstage: false)).dx, 0);
      await tester.pump(Duration(milliseconds: M2Motion.rmFade.ms));
      expect(h.p, 1.0);
    });

    testWidgets('a card is a crossfade too: no window, no scale, full size from the first frame', (tester) async {
      final h = Harness(tester, reduced: true);
      await h.boot();
      await tester.tap(find.byKey(const Key('band-Base')));
      await tester.pump();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 40));
      expect(find.byType(ContainerWindow), findsNothing);
      expect(find.byType(FadeTransition), findsWidgets);
      await tester.pumpAndSettle();
      expect(find.text('C1'), findsOneWidget);
      await h.nav.maybePop();
      await tester.pumpAndSettle();
      expect(find.text('Base'), findsOneWidget);
    });
  });
}
