// M2 R13 §4, `test.js` "a hall opens as one continuous card": the letter, title, status line and busy meter are drawn at full opacity
// at every p, the header's are where the card drew them at p 0 and on the straight line to where the header draws them in between,
// and only what the header adds (the chevron, "Calmer around") crossfades on top.
import 'dart:math' as math;
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/motion/travel.dart';
import 'package:udine/motion/container_math.dart' show incomingOpacity;
import 'package:udine/screens/hall/hall_header.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/theme/tokens.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import '../screens/support.dart';

/// What a widget's pixels are multiplied by on the way down the tree: every `Opacity` and `FadeTransition` above it.
double opacityAbove(WidgetTester t, Finder f) {
  var o = 1.0;
  t.element(f).visitAncestorElements((e) {
    final w = e.widget;
    if (w is Opacity) o *= w.opacity;
    if (w is FadeTransition) o *= w.opacity.value;
    return true;
  });
  return o;
}

class Shared {
  Shared(this.letter, this.name, this.status, this.meter);
  final Rect letter, name, status, meter;
  List<Rect> get all => [letter, name, status, meter];
}

Rect lerpRect(Rect a, Rect b, double p) => Rect.lerp(a, b, p)!;

/// Real time for the store and fake time for the transition and whatever fades in after it, until the page is at rest.
Future<void> settle(WidgetTester t) async {
  for (var i = 0; i < 30; i++) {
    await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    await t.pump(const Duration(milliseconds: 60));
  }
}

void main() {
  setUpAll(loadFonts);

  /// The card's rects before the tap, in the screen's coordinates.
  Shared card(WidgetTester t, String name) {
    final band = find.ancestor(of: find.text(name), matching: find.byType(Band)).first;
    Finder within(Finder f) => find.descendant(of: band, matching: f);
    final texts = within(find.byType(Text)).evaluate().map((e) => e.widget as Text).toList();
    expect(texts.length, greaterThanOrEqualTo(2), reason: 'the band has a name and a status');
    return Shared(t.getRect(within(find.byType(HallLetter))), t.getRect(within(find.text(name))), t.getRect(within(find.text(texts[1].data!))), t.getRect(within(find.byType(Meter))));
  }

  Shared header(WidgetTester t, String name, String status) {
    Finder within(Finder f) => find.descendant(of: find.byType(HallHeader), matching: f);
    return Shared(t.getRect(within(find.byType(HallLetter)).first), t.getRect(within(find.text(name)).last), t.getRect(within(find.text(status)).last), t.getRect(within(find.byType(Meter)).last));
  }

  /// Everything the test.js scenario asserts at one frame, at the progress the route is at.
  void shared(WidgetTester t, String name, String status, Shared from, Shared? home, {required String at, bool opaque = true}) {
    final p = t.widget<HallMenu>(find.byType(HallMenu)).progress.value, now = header(t, name, status);
    Finder within(Finder f) => find.descendant(of: find.byType(HallHeader), matching: f);
    final finders = [within(find.byType(HallLetter)).first, within(find.text(name)).last, within(find.text(status)).last, within(find.byType(Meter)).last];
    for (var i = 0; i < 4; i++) {
      final k = ['letter', 'title', 'status', 'meter'][i];
      // (`home == null`: where the element is drawing toward this frame, for a page whose own layout is still settling: Franklin's has no
      // second line, so its block closes by 22 dp as its reading lands, which the late-busy-reading task owns)
      final tr = t.renderObject<RenderTravel>(find.descendant(of: find.byType(HallHeader), matching: find.byType(Travel)).at(i));
      final want = home == null ? lerpRect(from.all[i], tr.lastHome!, p) : lerpRect(from.all[i], home.all[i], p);
      if (opaque) expect(opacityAbove(t, finders[i]), 1, reason: '$at (p $p): the $k is never faded');
      final tx = finders[i].evaluate().first.widget;
      if (opaque && i == 1 && tx is Text) expect(tx.style!.color!.a, 1, reason: '$at (p $p): the $k text is opaque');
      // the letter and the title scale from the card's size; the status and the meter keep their own
      final scaled = i < 2;
      expect((now.all[i].left - want.left).abs(), lessThan(1.5), reason: '$at (p $p): the $k is on the line from the card (x ${now.all[i].left} vs ${want.left})');
      expect((now.all[i].top - want.top).abs(), lessThan(1.5), reason: '$at (p $p): the $k is on the line from the card (y ${now.all[i].top} vs ${want.top})');
      if (scaled) expect((now.all[i].width - want.width).abs(), lessThan(1.5), reason: '$at (p $p): the $k is the line\'s size');
    }
  }

  Future<void> boot(WidgetTester t, String hall, {double w = 390, double h = 844}) async {
    await openApp(t, await bootRecorded(t), w: w, h: h);
    await t.pump();
    final band = find.ancestor(of: find.text(hall), matching: find.byType(Band));
    await until(t, () => band.evaluate().isNotEmpty && find.descendant(of: band.first, matching: find.byType(Text)).evaluate().length >= 2 && find.descendant(of: band.first, matching: find.byType(Meter)).evaluate().isNotEmpty);
  }

  for (final hall in [('Worcester', 390.0), ('Franklin', 360.0)]) {
    testWidgets('${hall.$1} at ${hall.$2.toInt()}: every frame of the open is the card, then the line to the header, nothing faded', (t) async {
      await boot(t, hall.$1, w: hall.$2);
      final from = card(t, hall.$1);
      final status = (find.descendant(of: find.ancestor(of: find.text(hall.$1), matching: find.byType(Band)).first, matching: find.byType(Text)).evaluate().toList()[1].widget as Text).data!;
      // the homes: where the header draws them once open (the line's far end at every frame)
      await t.tap(find.text(hall.$1));
      await settle(t);
      final home = header(t, hall.$1, status);
      final seen = <double>[];
      await t.tap(find.byType(BackButton));
      await settle(t);
      await t.tap(find.text(hall.$1));
      // the first frame the page is drawn at is p of 0, and it is the card
      for (var i = 0; i < 5 && find.byType(HallMenu).evaluate().isEmpty; i++) {
        await t.pump();
      }
      for (var i = 0; i < 80; i++) {
        final p = t.widget<HallMenu>(find.byType(HallMenu)).progress.value;
        seen.add(p);
        shared(t, hall.$1, status, from, hall.$1 == 'Franklin' ? null : home, at: 'open frame $i');
        if (p >= 0.95) break;
        await t.pump(const Duration(milliseconds: 16));
      }
      expect(seen.first, 0, reason: 'the first frame is p 0');
      for (final want in [0.1, 0.3, 0.5, 0.8]) {
        expect(seen.any((p) => (p - want).abs() < 0.12), isTrue, reason: 'a frame near p $want was checked: $seen');
      }
      await t.pump(const Duration(seconds: 1));
      await drain(t);
    });
  }

  testWidgets('a back-button close plays the same line backwards, and ends on the card', (t) async {
    await boot(t, 'Worcester');
    final from = card(t, 'Worcester');
    final status = (find.descendant(of: find.ancestor(of: find.text('Worcester'), matching: find.byType(Band)).first, matching: find.byType(Text)).evaluate().toList()[1].widget as Text).data!;
    await t.tap(find.text('Worcester'));
    await settle(t);
    final home = header(t, 'Worcester', status);
    await t.tap(find.byType(BackButton));
    await t.pump();
    final seen = <double>[];
    for (var i = 0; i < 60 && find.byType(HallMenu).evaluate().isNotEmpty; i++) {
      await t.pump(const Duration(milliseconds: 16));
      if (find.byType(HallMenu).evaluate().isEmpty) break;
      seen.add(t.widget<HallMenu>(find.byType(HallMenu)).progress.value);
      shared(t, 'Worcester', status, from, home, at: 'close frame $i');
    }
    expect(seen.length, greaterThan(5));
    await drain(t);
  });

  testWidgets('a drag-back scrub at p .1, .3 and .5 holds the card whole', (t) async {
    await boot(t, 'Worcester');
    final from = card(t, 'Worcester');
    final status = (find.descendant(of: find.ancestor(of: find.text('Worcester'), matching: find.byType(Band)).first, matching: find.byType(Text)).evaluate().toList()[1].widget as Text).data!;
    await t.tap(find.text('Worcester'));
    await settle(t);
    final home = header(t, 'Worcester', status);
    final g = await t.startGesture(const Offset(200, 300));
    var y = 0.0;
    for (final want in [0.9, 0.7, 0.5]) {
      final to = (1 - want) * 480;
      while (y < to) {
        final dy = math.min(20.0, to - y);
        await g.moveBy(Offset(0, dy));
        y += dy;
        await t.pump(const Duration(milliseconds: 16));
      }
      final p = t.widget<HallMenu>(find.byType(HallMenu)).progress.value;
      expect(p, closeTo(want, 0.06));
      shared(t, 'Worcester', status, from, home, at: 'scrub to $want');
    }
    await g.up();
    await t.pump(const Duration(seconds: 2));
    await drain(t);
  });

  testWidgets('a close from a scrolled list still ends on the card: the header\'s scroll is not in the line', (t) async {
    await boot(t, 'Worcester');
    final from = card(t, 'Worcester');
    final status = (find.descendant(of: find.ancestor(of: find.text('Worcester'), matching: find.byType(Band)).first, matching: find.byType(Text)).evaluate().toList()[1].widget as Text).data!;
    await t.tap(find.text('Worcester'));
    await settle(t);
    final home = header(t, 'Worcester', status);
    t.state<ScrollableState>(find.descendant(of: find.byType(HallMenu), matching: find.byType(Scrollable)).first).position.jumpTo(60);
    await t.pump(const Duration(milliseconds: 100));
    await t.tap(find.byType(BackButton));
    await t.pump();
    var n = 0;
    while (find.byType(HallMenu).evaluate().isNotEmpty && n++ < 60) {
      await t.pump(const Duration(milliseconds: 16));
      if (find.byType(HallMenu).evaluate().isEmpty) break;
      shared(t, 'Worcester', status, from, home, at: 'scrolled close frame $n', opaque: false);
    }
    expect(n, greaterThan(5));
    await drain(t);
  });

  testWidgets('the chevron and the "Calmer around" line crossfade over p .2 to .8 on top of the travelling status and meter', (t) async {
    await boot(t, 'Worcester');
    await t.tap(find.text('Worcester'));
    for (var i = 0; i < 5 && find.byType(HallMenu).evaluate().isEmpty; i++) {
      await t.pump();
    }
    final seen = <(double, double, double)>[];
    for (var i = 0; i < 60; i++) {
      // the reading and the hours land in real time; frames follow
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
      await t.pump(const Duration(milliseconds: 16));
      final p = t.widget<HallMenu>(find.byType(HallMenu)).progress.value;
      final chev = t.widgetList<CustomPaint>(find.descendant(of: find.byType(HallHeader), matching: find.byType(CustomPaint))).where((c) => c.size == const Size.square(M2Layout.statusChevron)).toList();
      // (the invisible copy that holds the line's room is not the line)
      final extra = [
        for (final x in find.descendant(of: find.byType(HallHeader), matching: find.textContaining('Calmer around')).evaluate())
          if (opacityAbove(t, find.byWidget(x.widget)) > 0) x.widget as Text,
      ];
      if (chev.isEmpty || extra.isEmpty) {
        if (p >= 1) break;
        continue;
      }
      final c = ((chev.first.painter! as dynamic).color as Color).a / M2Color.onDmQuiet.a, e = extra.first.style!.color!.a / M2Color.onDmSoft.a;
      seen.add((p, c, e));
      expect(c, closeTo(incomingOpacity(p), 0.02), reason: 'the chevron is at fin at p $p');
      expect(e, closeTo(incomingOpacity(p), 0.02), reason: 'the second line is at fin at p $p');
      if (p >= 1) break;
    }
    expect(seen.any((x) => x.$1 < 0.2 && x.$2 < 0.01), isTrue, reason: 'invisible early: $seen');
    expect(seen.any((x) => x.$2 > 0.05 && x.$2 < 0.95), isTrue, reason: 'part-faded between: $seen');
    expect(seen.last.$2, closeTo(1, 0.01));
    await drain(t);
  });

  testWidgets('under reduced motion nothing travels: the page crossfades', (t) async {
    await openApp(t, await bootRecorded(t), reduced: true);
    await t.pump();
    await until(t, () => find.text('Worcester').evaluate().isNotEmpty);
    await t.tap(find.text('Worcester'));
    await settle(t);
    expect(find.descendant(of: find.byType(HallHeader), matching: find.byType(Travel)), findsNothing);
    await drain(t);
  });

  testWidgets('a hall card from Search has no letter to carry: its title, status and meter travel, the letter comes in with the page', (t) async {
    await openApp(t, await bootRecorded(t), route: '/search');
    await t.pump();
    await until(t, () => find.byType(EditableText).evaluate().isNotEmpty);
    await t.enterText(find.byType(EditableText), 'worcester');
    await until(t, () => find.byType(Band).evaluate().isNotEmpty && find.descendant(of: find.byType(Band), matching: find.byType(Meter)).evaluate().isNotEmpty);
    await t.pump(const Duration(milliseconds: 300));
    final band = find.byType(Band).first;
    Finder within(Finder f) => find.descendant(of: band, matching: f);
    final name = t.getRect(within(find.text('Worcester'))), meter = t.getRect(within(find.byType(Meter)));
    await t.tap(band);
    for (var i = 0; i < 5 && find.byType(HallMenu).evaluate().isEmpty; i++) {
      await t.pump();
    }
    var n = 0;
    for (; n < 80; n++) {
      final p = t.widget<HallMenu>(find.byType(HallMenu)).progress.value;
      final travels = find.descendant(of: find.byType(HallHeader), matching: find.byType(Travel));
      final tr = [for (var i = 0; i < travels.evaluate().length; i++) t.renderObject<RenderTravel>(travels.at(i))];
      // letter, title, status, meter: the letter's Travel has no card to read and stays where it is
      final title = t.getRect(find.descendant(of: find.byType(HallHeader), matching: find.text('Worcester')).last);
      expect((title.left - lerpRect(name, tr[1].lastHome ?? title, p).left).abs(), lessThan(1.5), reason: 'the card\'s title travels (p $p)');
      expect(t.getRect(find.descendant(of: find.byType(HallHeader), matching: find.byType(Meter)).last).top - lerpRect(meter, tr[3].lastHome ?? meter, p).top, lessThan(1.5), reason: 'the card\'s meter travels (p $p)');
      expect(opacityAbove(t, find.descendant(of: find.byType(HallHeader), matching: find.byType(HallLetter)).first), closeTo(incomingOpacity(p), 0.01), reason: 'the letter comes in with the page at p $p');
      if (p >= 0.95) break;
      await t.pump(const Duration(milliseconds: 16));
    }
    expect(n, greaterThan(5));
    await t.pump(const Duration(seconds: 1));
    for (var k = 0; k < 12; k++) {
      await drain(t);
    }
  });
}
