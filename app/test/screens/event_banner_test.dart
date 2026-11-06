// The event banner's three picture states: saved (first frame), loading (shimmer, then a fade in over `settle`), and failed / offline (still felt).
import 'dart:async';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:udine/data/pdf_cache.dart';
import 'package:udine/screens/event/event_banner.dart';
import 'package:udine/theme/tokens.dart';
import 'package:udine/ui/ui.dart';

const url = 'https://cdn.example.org/events/a.jpg';
final sweep = find.byKey(const ValueKey('ev-sweep')), still = find.byKey(const ValueKey('ev-still'));
List<int> jpeg() => [0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3];

void main() {
  late Directory dir;
  late List<Uri> calls;
  late Completer<http.Response> answer;
  late bool offline;
  late PdfCache cache;

  setUp(() {
    Photos.enabled = true;
    dir = Directory.systemTemp.createTempSync('event_banner_test');
    calls = [];
    offline = false;
    answer = Completer();
    cache = PdfCache.images(dir, MockClient((req) {
      calls.add(req.url);
      if (offline) throw const SocketException('Network is unreachable');
      return answer.future;
    }), stillLoadingAfter: Duration.zero);
  });
  tearDown(() {
    Photos.enabled = false;
    dir.deleteSync(recursive: true);
  });

  Future<void> show(WidgetTester t, {bool reduced = false, PdfCache? c}) => t.pumpWidget(Directionality(
        textDirection: TextDirection.ltr,
        child: MediaQuery(data: MediaQueryData(disableAnimations: reduced), child: Center(child: SizedBox(width: 300, child: EventBanner(image: url, cache: c ?? cache)))),
      ));
  // the cache's file I/O is real: each step of it needs real time to finish and a pump to hand its result back to the widget
  Future<void> land(WidgetTester t, [http.Response? r]) async {
    answer.complete(r ?? http.Response.bytes(jpeg(), 200));
    for (var i = 0; i < 20; i++) {
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 10)));
      await t.pump();
    }
  }

  Future<void> save(WidgetTester t) async {
    answer.complete(http.Response.bytes(jpeg(), 200));
    await t.runAsync(() => cache.fetch(url));
    calls.clear();
  }

  testWidgets('saved: the picture is in the first frame, no request, no shimmer, no fade', (t) async {
    await save(t);
    await show(t);
    expect(find.byType(Image), findsOneWidget);
    expect(sweep, findsNothing);
    expect(find.byType(AnimatedOpacity), findsNothing);
    expect(calls, isEmpty);
  });

  testWidgets('loading: the shimmer sweeps; the picture then fades in over settle and the shimmer is gone', (t) async {
    await show(t);
    await t.pump();
    expect(sweep, findsOneWidget);
    expect(find.byType(Image), findsNothing);
    double at() => ((t.widget<DecoratedBox>(sweep).decoration as BoxDecoration).gradient as LinearGradient).transform!.transform(const Rect.fromLTWH(0, 0, 100, 10))!.storage[12];
    final x0 = at();
    await t.pump(Duration(milliseconds: EventShimmer.sweep.ms ~/ 2));
    expect(at(), isNot(x0)); // the band moved
    await land(t);
    final fade = t.widget<AnimatedOpacity>(find.byType(AnimatedOpacity));
    expect(fade.duration, M2Motion.settle.duration);
    expect(fade.curve, M2Motion.settle.curve);
    expect(fade.opacity, 1);
    expect(sweep, findsNothing);
    expect(find.byType(Image), findsOneWidget);
    await t.pump(M2Motion.settle.duration);
  });

  testWidgets('failed: the shimmer stops and the felt stays', (t) async {
    await show(t);
    await t.pump();
    expect(sweep, findsOneWidget);
    await land(t, http.Response('boom', 500));
    expect(sweep, findsNothing);
    expect(find.byType(Image), findsNothing);
    expect(find.byType(Felt), findsOneWidget);
  });

  testWidgets('offline with a saved picture draws it; with nothing saved the felt is still, with no endless shimmer', (t) async {
    await save(t);
    offline = true;
    await show(t);
    expect(find.byType(Image), findsOneWidget);
    await t.pumpWidget(const SizedBox());
    await t.runAsync(() => File(cache.file(url).path).delete());
    await show(t);
    await t.pump();
    for (var i = 0; i < 5; i++) {
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 10)));
      await t.pump();
    }
    expect(sweep, findsNothing);
    expect(find.byType(Image), findsNothing);
  });

  testWidgets('photos off: no request, no shimmer', (t) async {
    Photos.enabled = false;
    await show(t);
    await t.pump();
    expect(calls, isEmpty);
    expect(sweep, findsNothing);
    expect(still, findsNothing);
  });

  testWidgets('reduce-motion: a still lighter tint, no sweep', (t) async {
    await show(t, reduced: true);
    await t.pump();
    expect(sweep, findsNothing);
    expect(still, findsOneWidget);
    expect(t.widget<ColoredBox>(still).color.a, closeTo(EventShimmer.stillAlpha, 0.01));
    await t.pump(const Duration(seconds: 3)); // nothing is animating
    await land(t);
  });
}
