// Glide on a keystroke (M2 `renderSearch` FLIP): a row in both results never fades, even one that was below the fold and so was never
// built; only a row that was not in the old result fades up, and from the first frame it is there.
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/search/glide.dart';

void main() {
  testWidgets('a row in both results stays at full opacity every frame, a new one is already fading on its first frame', (t) async {
    final tracker = GlideTracker();
    var ids = [for (var i = 0; i < 10; i++) 'r$i'];
    var gen = 0;
    Widget list() => Directionality(
          textDirection: TextDirection.ltr,
          child: MediaQuery(
            data: const MediaQueryData(),
            child: SizedBox(
              height: 300,
              child: ListView(scrollCacheExtent: const ScrollCacheExtent.pixels(0), children: [for (final id in ids) SizedBox(key: ValueKey(id), height: 100, child: Glide(id: id, tracker: tracker, generation: gen, child: Text(id)))]),
            ),
          ),
        );
    double opacityOf(String id) {
      final o = find.ancestor(of: find.text(id), matching: find.byType(Opacity));
      return o.evaluate().isEmpty ? 1 : t.widget<Opacity>(o.first).opacity;
    }

    await t.pumpWidget(list());
    expect(find.text('r8'), findsNothing, reason: 'below the fold: never built');
    tracker.snapshot(ids);
    ids = ['new', ...ids.skip(6)]; // r8 is now on screen, and was in the old result
    gen++;
    await t.pumpWidget(list());
    expect(find.text('r8'), findsOneWidget);
    expect(opacityOf('new'), lessThan(1), reason: 'a new row is never on screen at full opacity first');
    for (var f = 0; f < 20; f++) {
      expect(opacityOf('r8'), 1, reason: 'frame $f');
      expect(opacityOf('r6'), 1, reason: 'frame $f');
      await t.pump(const Duration(milliseconds: 16));
    }
  });

  testWidgets('a row that moves is drawn at its old place in the first frame it is laid out at the new one, then glides', (t) async {
    final tracker = GlideTracker();
    var ids = ['a', 'b', 'c'];
    var gen = 0;
    Widget list() => Directionality(
          textDirection: TextDirection.ltr,
          child: MediaQuery(
            data: const MediaQueryData(),
            child: ListView(children: [for (final id in ids) SizedBox(key: ValueKey(id), height: 100, child: Glide(id: id, tracker: tracker, generation: gen, child: Text(id)))]),
          ),
        );
    await t.pumpWidget(list());
    expect(t.getTopLeft(find.text('c')).dy, 200);
    tracker.snapshot(ids);
    ids = ['b', 'c']; // 'a' leaves: b and c move up 100
    gen++;
    await t.pumpWidget(list());
    expect(t.getTopLeft(find.text('c')).dy, 200, reason: 'frame 0 is at the old place');
    final seen = <double>[];
    for (var f = 0; f < 20; f++) {
      await t.pump(const Duration(milliseconds: 16));
      seen.add(t.getTopLeft(find.text('c')).dy);
    }
    expect(seen.reduce((a, b) => a < b ? a : b), 100, reason: 'comes to rest at the new place');
    for (var f = 1; f < seen.length; f++) {
      expect(seen[f], lessThanOrEqualTo(seen[f - 1]), reason: 'frame ${f + 1} never goes back');
    }
  });
}
