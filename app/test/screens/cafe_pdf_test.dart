import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:udine/data/pdf_cache.dart';
import 'package:udine/screens/cafes/pdf_page.dart';
import 'package:udine/theme/tokens.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'pdf_fake.dart';
import 'support.dart';

const lunchUrl = 'https://www.umassdining.com/sites/default/files/2026-10/Lunch.pdf';

List<int> pdf() => utf8.encode('%PDF-1.4\n%synthetic\n');

/// The whole PDF page over a real file cache and a fake network; the pages are drawn by [syntheticPages].
void main() {
  setUpAll(loadFonts);

  late Directory dir;
  late bool online;
  late int status;
  late int requests;
  late PdfCache cache;
  setUp(() {
    dir = Directory.systemTemp.createTempSync('cafe_pdf_test');
    online = true;
    status = 200;
    requests = 0;
    cache = PdfCache(dir, MockClient((req) async {
      requests++;
      if (!online) throw const SocketException('Network is unreachable');
      return http.Response.bytes(pdf(), status);
    }));
  });
  tearDown(() => dir.deleteSync(recursive: true));

  Future<SyntheticPdf> open(WidgetTester t, {String label = 'Click here for the Lunch Menu', double w = 390, int pagesCount = 2, bool reduced = false}) async {
    phone(t, w: w);
    final pages = await syntheticPages(t, count: pagesCount);
    await t.pumpWidget(Directionality(
      textDirection: TextDirection.ltr,
      child: MediaQuery(data: MediaQueryData(size: Size(w, 844), disableAnimations: reduced), child: PdfMenuPage(top: 24, url: lunchUrl, label: label, cache: cache, open: pages.call)),
    ));
    return pages;
  }

  Future<void> loaded(WidgetTester t) async {
    await until(t, () => find.byType(PdfZoomView).evaluate().isNotEmpty);
    await t.pumpAndSettle();
  }

  TransformationController zoom(WidgetTester t) => t.widget<InteractiveViewer>(find.byType(InteractiveViewer)).transformationController!;
  double scale(WidgetTester t) => zoom(t).value.getMaxScaleOnAxis();
  Rect bar(WidgetTester t) => t.getRect(find.byType(ScreenHeader));

  testWidgets('the page is titled "<Name> menu", the link text cut to the menu name', (t) async {
    await open(t, label: 'Click here for the Lite Fare Menu');
    expect(find.text('Lite fare menu'), findsOneWidget);
    await t.pumpWidget(const SizedBox());
    await t.pump(const Duration(seconds: 1));
  });

  testWidgets('first open: the spinner after 400 ms, then the pages, each at the screen width less the gutters', (t) async {
    status = 200;
    await open(t);
    await t.pump(const Duration(milliseconds: 100));
    expect(find.byType(Spinner), findsOneWidget);
    expect(t.getCenter(find.byType(Spinner)).dy, bar(t).bottom + M2Layout.pdfBodyTop + M2Size.mstate / 2, reason: '.mstate: a 160 dp block under the bar, not the body\'s middle');
    await loaded(t);
    expect(find.byType(Spinner), findsNothing);
    final pages = find.byType(Image);
    expect(pages, findsNWidgets(2));
    expect(t.getSize(pages.first), Size(390 - 2 * M2Layout.pdfGutter, (390 - 2 * M2Layout.pdfGutter) * letter));
    expect(requests, 1);
  });

  testWidgets('a menu kept on the phone opens with no request and no spinner', (t) async {
    await t.runAsync(() => cache.fetch(lunchUrl));
    requests = 0;
    await open(t);
    await t.pump();
    await t.pump();
    expect(find.byType(PdfZoomView), findsOneWidget);
    expect(find.byType(Spinner), findsNothing);
    expect(requests, 0);
  });

  testWidgets('offline and never opened: says so, with no Try again', (t) async {
    online = false;
    await open(t);
    await until(t, () => find.textContaining("You're offline").evaluate().isNotEmpty);
    expect(find.text("You're offline, and this menu isn't saved on this phone."), findsOneWidget);
    expect(find.text('Try again'), findsNothing);
  });

  testWidgets('offline with the menu kept: opens as online', (t) async {
    await t.runAsync(() => cache.fetch(lunchUrl));
    online = false;
    await open(t);
    await t.pump();
    await t.pump();
    expect(find.byType(PdfZoomView), findsOneWidget);
  });

  testWidgets('failed: "The lunch menu didn\'t load." with Try again, and Try again loads it', (t) async {
    status = 500;
    await open(t);
    await until(t, () => find.textContaining("didn't load").evaluate().isNotEmpty);
    expect(find.text("The lunch menu didn't load."), findsOneWidget);
    status = 200;
    await t.tap(find.text('Try again'));
    await loaded(t);
    expect(find.byType(PdfZoomView), findsOneWidget);
    expect(find.textContaining("didn't load"), findsNothing);
  });

  testWidgets('a PDF the renderer cannot draw is a failure, not a blank page', (t) async {
    await t.runAsync(() => cache.fetch(lunchUrl));
    phone(t);
    await t.pumpWidget(Directionality(
      textDirection: TextDirection.ltr,
      child: MediaQuery(data: const MediaQueryData(size: Size(390, 844)), child: PdfMenuPage(top: 24, url: lunchUrl, label: 'Lunch', cache: cache, open: (_) async => throw StateError('corrupt'))),
    ));
    await t.pump();
    await t.pump();
    expect(find.text("The lunch menu didn't load."), findsOneWidget);
  });

  testWidgets('pages are drawn as they near the screen, not all at open, and each once', (t) async {
    final pdf = await open(t, pagesCount: 6);
    await loaded(t);
    expect(pdf.rendered, containsAll([0, 1]));
    expect(pdf.rendered, isNot(contains(5)), reason: 'a page far below the screen is not drawn yet');
    await t.drag(find.byType(PdfZoomView), const Offset(0, -6000));
    await t.pumpAndSettle();
    expect(pdf.rendered..sort(), [0, 1, 2, 3, 4, 5]);
    await t.drag(find.byType(PdfZoomView), const Offset(0, 6000));
    await t.pumpAndSettle();
    expect(pdf.rendered, hasLength(6), reason: 'scrolling back draws nothing again');
  });

  testWidgets('the document is closed when the page goes', (t) async {
    final pdf = await open(t);
    await loaded(t);
    await t.pumpWidget(const SizedBox());
    expect(pdf.docs.single.closed, isTrue);
  });

  group('zoom', () {
    Future<void> pinch(WidgetTester t, Offset c, double from, double to) async {
      final a = await t.startGesture(c - Offset(from / 2, 0), pointer: 1), b = await t.startGesture(c + Offset(from / 2, 0), pointer: 2);
      for (var i = 1; i <= 10; i++) {
        final d = from + (to - from) * i / 10;
        await a.moveTo(c - Offset(d / 2, 0));
        await b.moveTo(c + Offset(d / 2, 0));
        await t.pump(const Duration(milliseconds: 16));
      }
      await a.up();
      await b.up();
      await t.pumpAndSettle();
    }

    testWidgets('pinch zooms from 1x up to 4x and back, and no further either way', (t) async {
      await open(t);
      await loaded(t);
      expect(scale(t), 1);
      await pinch(t, const Offset(195, 400), 60, 240);
      expect(scale(t), greaterThan(1.5));
      await pinch(t, const Offset(195, 400), 60, 600);
      expect(scale(t), 4);
      await pinch(t, const Offset(195, 400), 300, 10);
      expect(scale(t), 1);
    });

    testWidgets('double-tap zooms to 2.5x at the point tapped, and the next double-tap returns to 1x', (t) async {
      await open(t);
      await loaded(t);
      const p = Offset(250, 500);
      final local = p - t.getTopLeft(find.byType(PdfZoomView)), before = zoom(t).toScene(local);
      await t.tapAt(p);
      await t.pump(const Duration(milliseconds: 60));
      await t.tapAt(p);
      await t.pumpAndSettle();
      expect(scale(t), 2.5);
      final after = zoom(t).toScene(local);
      expect((after - before).distance, lessThan(0.5), reason: 'the point under the finger stays under it');
      await t.tapAt(p);
      await t.pump(const Duration(milliseconds: 60));
      await t.tapAt(p);
      await t.pumpAndSettle();
      expect(scale(t), 1);
    });

    Future<void> doubleTap(WidgetTester t, Offset p) async {
      await t.tapAt(p);
      await t.pump(const Duration(milliseconds: 60));
      await t.tapAt(p);
    }

    testWidgets('double-tap zoom runs over settle (200 ms), not at once, and lands on 2.5x', (t) async {
      await open(t);
      await loaded(t);
      await doubleTap(t, const Offset(250, 500));
      await t.pump(); // the tween's first frame
      await t.pump(const Duration(milliseconds: 60));
      expect(scale(t), allOf(greaterThan(1.0), lessThan(2.5)), reason: 'mid-flight');
      await t.pump(const Duration(milliseconds: 200));
      expect(scale(t), 2.5);
      await doubleTap(t, const Offset(250, 500));
      await t.pump(); // the tween's first frame
      await t.pump(const Duration(milliseconds: 60));
      expect(scale(t), allOf(greaterThan(1.0), lessThan(2.5)), reason: 'and back');
      await t.pumpAndSettle();
      expect(scale(t), 1);
    });

    testWidgets('a pinch that starts mid-animation takes over: the animation stops', (t) async {
      await open(t);
      await loaded(t);
      await doubleTap(t, const Offset(250, 500));
      await t.pump();
      await t.pump(const Duration(milliseconds: 60));
      final a = await t.startGesture(const Offset(150, 500), pointer: 1), b = await t.startGesture(const Offset(240, 500), pointer: 2);
      for (var i = 1; i <= 4; i++) {
        await a.moveBy(const Offset(0, 12));
        await b.moveBy(const Offset(0, 12));
        await t.pump(const Duration(milliseconds: 16));
      }
      final held = scale(t);
      await t.pump(const Duration(milliseconds: 300));
      expect(scale(t), closeTo(held, 0.01), reason: 'the tween no longer drives it');
      expect(held, lessThan(2.5));
      await a.up();
      await b.up();
      await t.pumpAndSettle();
    });

    testWidgets('under reduced motion the double-tap zoom snaps', (t) async {
      await open(t, reduced: true);
      await loaded(t);
      await doubleTap(t, const Offset(250, 500));
      await t.pump(const Duration(milliseconds: 16));
      expect(scale(t), 2.5);
      await t.pumpAndSettle();
    });

    testWidgets('the bar is the same rect at 1x, at 2.5x, and scrolled sideways and down at 2.5x', (t) async {
      await open(t);
      await loaded(t);
      final at1 = bar(t);
      const p = Offset(250, 500);
      await t.tapAt(p);
      await t.pump(const Duration(milliseconds: 60));
      await t.tapAt(p);
      await t.pumpAndSettle();
      expect(bar(t), at1);
      final m = zoom(t).value.clone();
      await t.drag(find.byType(PdfZoomView), const Offset(-120, -300));
      await t.pumpAndSettle();
      expect(zoom(t).value, isNot(m), reason: 'it scrolled');
      expect(bar(t), at1);
      expect(t.getRect(find.byType(PdfZoomView)).top, at1.bottom);
    });

    testWidgets('at 1x the pages scroll down under the bar, and stop at the last one', (t) async {
      await open(t, pagesCount: 3);
      await loaded(t);
      await t.drag(find.byType(PdfZoomView), const Offset(0, -3000));
      await t.pumpAndSettle();
      final last = t.getRect(find.byType(Image).last), view = t.getRect(find.byType(PdfZoomView));
      expect(last.bottom, lessThanOrEqualTo(view.bottom));
      expect(last.bottom, greaterThan(view.bottom - M2Layout.pdfBodyBottom - M2Layout.pdfPageGap - 1));
    });
  });
}
