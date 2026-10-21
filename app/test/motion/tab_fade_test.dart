import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/motion/fade_through.dart';
import 'package:udine/screens/hall/meal_pager.dart';
import 'package:udine/theme/tokens.dart';
import 'package:udine/ui/screen_header.dart';

// M2 round 14, "Fade content, keep ground": at every frame of a tab switch or a meal change the old and the new content are never
// both above a sliver of opacity (no doubled text), and the ground (the header band, the page background) is never faded.
void main() {
  const frame = Duration(milliseconds: 16), sliver = 0.05;
  Widget pane(String n) => ColoredBox(
        color: M2Color.chalk,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [ScreenHeader.title(top: 24, title: 'T$n'), Expanded(child: Text('content $n'))]),
      );
  // a pane whose header is pinned (Search's field) draws no ScreenHeader here: its band is the `pinned` height
  Widget pinnedPane(String n) => ColoredBox(color: M2Color.chalk, child: Column(children: [const ColoredBox(color: M2Color.dm, child: SizedBox(height: 80, width: double.infinity)), Expanded(child: Text('content $n'))]));
  // 0 when the text is off screen (an Offstage pane is not found)
  double opacityOf(WidgetTester t, String text) {
    final os = find.ancestor(of: find.text(text), matching: find.byType(FadeTransition)).evaluate().map((e) => (e.widget as FadeTransition).opacity.value).toList();
    return os.isEmpty ? 0 : os.reduce((a, b) => a * b);
  }
  Widget host(GlobalKey k, int index) => Directionality(
        textDirection: TextDirection.ltr,
        child: MediaQuery(
          data: const MediaQueryData(size: Size(360, 780)),
          child: RepaintBoundary(key: k, child: ColoredBox(color: M2Color.chalk, child: FadeThroughTabs(index: index, pinned: const [0, 0, 80], children: [pane('A'), pane('B'), pinnedPane('C')]))),
        ),
      );
  // dm, give or take the 1 px antialiasing where the settling pane's own edge crosses the band (chalk is .97 red against dm's .23)
  bool isGround(Color c) => (c.r - M2Color.dm.r).abs() < .25 && (c.g - M2Color.dm.g).abs() < .25;
  Future<Color> pixel(WidgetTester t, GlobalKey k, int x, int y) async => (await t.runAsync(() async {
        final b = k.currentContext!.findRenderObject()! as RenderRepaintBoundary, img = await b.toImage();
        final d = (await img.toByteData(format: ui.ImageByteFormat.rawRgba))!;
        final i = (y * img.width + x) * 4;
        return Color.fromARGB(d.getUint8(i + 3), d.getUint8(i), d.getUint8(i + 1), d.getUint8(i + 2));
      }))!;

  Future<void> switchTo(WidgetTester t, int from, int to, {bool checkGround = true}) async {
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetDevicePixelRatio);
    final k = GlobalKey(), names = ['A', 'B', 'C'];
    await t.pumpWidget(host(k, from));
    await t.pumpWidget(host(k, to));
    for (var i = 0; i < 20; i++) {
      await t.pump(frame);
      final o = opacityOf(t, 'content ${names[from]}'), n = opacityOf(t, 'content ${names[to]}');
      expect(o < sliver || n < sliver, isTrue, reason: 'frame $i shows both: old $o, new $n');
      if (checkGround) {
        // inside the header band, clear of its text: dm at every frame, whichever pane's content is showing
        // the whole band, edges and corners included: the incoming pane settles from .97, which pulls its own edges in
        for (final (x, y) in [(300, 50), (1, 1), (1, 60), (358, 1), (358, 60), (1, 78), (358, 78)]) {
          final p = await pixel(t, k, x, y);
          expect(isGround(p), isTrue, reason: 'frame $i: the header band at ($x, $y) is not ground ($p)');
        }
      }
    }
    await t.pumpAndSettle();
    expect(opacityOf(t, 'content ${names[to]}'), 1);
  }

  testWidgets('Halls to You: the content goes out, then comes in; the header band stays', (t) => switchTo(t, 0, 2));
  testWidgets('Search to You: the same', (t) => switchTo(t, 2, 1));

  testWidgets('a pane with a pinned header keeps it when the switch starts', (t) async {
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.resetDevicePixelRatio);
    final k = GlobalKey();
    await t.pumpWidget(host(k, 2));
    await t.pumpWidget(host(k, 0));
    await t.pump();
    await t.pump(frame * 3); // the old pane's content is mostly gone
    for (final (x, y) in [(300, 60), (1, 1), (358, 1), (1, 60)]) {
      expect(isGround(await pixel(t, k, x, y)), isTrue, reason: '($x, $y)');
    }
    await t.pumpAndSettle();
  });

  testWidgets('a meal change: the new list waits for the old one to be gone', (t) async {
    final k = GlobalKey<SharedAxisLayerState>();
    await t.pumpWidget(Directionality(textDirection: TextDirection.ltr, child: MediaQuery(data: const MediaQueryData(size: Size(360, 780)), child: SharedAxisLayer(key: k, child: const Text('new')))));
    k.currentState!.run(1, const Text('old'));
    await t.pump();
    final outs = find.byKey(const ValueKey('axis-out')), ins = find.byKey(const ValueKey('axis-in'));
    for (var i = 0; i < 40; i++) {
      await t.pump(frame);
      final o = outs.evaluate().isEmpty ? 0.0 : t.widget<Opacity>(outs).opacity, n = t.widget<Opacity>(ins).opacity;
      expect(o < sliver || n < sliver, isTrue, reason: 'frame $i shows both: old $o, new $n');
    }
    await t.pumpAndSettle();
    expect(t.widget<Opacity>(ins).opacity, 1);
  });
}
