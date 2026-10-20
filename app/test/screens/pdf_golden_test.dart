import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/app.dart';
import 'package:udine/core/content.dart';
import 'package:udine/data/recorded/flags.dart';
import 'package:udine/screens/cafes/pdf_page.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'pdf_fake.dart';
import 'support.dart';

// The café PDF states of flutter-port-cafe-pdf at 360 and 390 dp, over M2's recordings. Every page drawn here is synthetic (pdf_fake.dart): a
// golden never shows a UMass PDF, and the renderer is never run.
const commonwealth = 'The Commonwealth Restaurant';

void main() {
  setUpAll(loadFonts);
  Photos.enabled = false;

  for (final w in [360.0, 390.0]) {
    final n = w.toInt();
    Future<void> shot(WidgetTester t, String name, String route, {NetMode net = NetMode.ok, List<String> pins = const [], bool saveLunch = false, bool menu = false, bool linked = true, bool loading = false, Future<void> Function(WidgetTester)? then}) async {
      final boot = await bootRecorded(t, net: net, pins: pins, pages: (await syntheticPages(t)).call, pdfsLinked: linked);
      if (saveLunch) {
        final feed = jsonDecode(File('assets/recorded/locations-2026-10-11.json').readAsStringSync()) as List;
        final html = feed.cast<Map<String, dynamic>>().firstWhere((l) => l['location_title'] == commonwealth)['breakfast_menu'] as String;
        final f = boot.repo.pdfs!.file((parseRetailMenuHtml(html) as RetailMenuPdf).url)..parent.createSync(recursive: true);
        f.writeAsBytesSync(utf8.encode('%PDF-1.4\n%synthetic\n'));
      }
      await openApp(t, boot, route: route, w: w);
      await until(t, () => (loading ? find.byType(PdfMenuPage).evaluate().isNotEmpty : menu ? find.byType(PdfZoomView).evaluate().isNotEmpty || find.textContaining(RegExp(r"^(You.re offline|The .* menu didn.t load)")).evaluate().isNotEmpty : find.text('Menus').evaluate().isNotEmpty));
      if (then != null) await then(t);
      if (!loading) {
        await drain(t);
        await t.pumpAndSettle();
      }
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/$name$n.png'));
      await t.pumpWidget(const SizedBox());
      await t.pump(const Duration(seconds: 2));
      await writesLanded(t);
    }

    Future<void> doubleTap(WidgetTester t, Offset p) async {
      await t.tapAt(p);
      await t.pump(const Duration(milliseconds: 60));
      await t.tapAt(p);
      await t.pumpAndSettle();
    }

    testWidgets('café page with the four menu rows, $n dp', (t) => shot(t, 'pdf_rows_', '/cafe/29'));
    testWidgets('café page offline: Lunch saved, the rest Not saved, $n dp', (t) => shot(t, 'pdf_rows_offline_', '/cafe/29', net: NetMode.offline, saveLunch: true));
    testWidgets('pinned café offline: every row opens, $n dp', (t) => shot(t, 'pdf_rows_pinned_', '/cafe/29', net: NetMode.offline, pins: const [commonwealth]));
    testWidgets('a menu page at 1x, $n dp', (t) => shot(t, 'pdf_page_', '/cafe/29/menu/0', menu: true));
    testWidgets('a menu page at 2.5x, $n dp', (t) => shot(t, 'pdf_zoom_', '/cafe/29/menu/0', menu: true, then: (t) async {
          await t.pumpAndSettle();
          await doubleTap(t, Offset(w * 0.6, 420));
        }));
    testWidgets('a menu page at 2.5x scrolled sideways, $n dp', (t) => shot(t, 'pdf_zoom_side_', '/cafe/29/menu/0', menu: true, then: (t) async {
          await t.pumpAndSettle();
          await doubleTap(t, Offset(w * 0.3, 420));
          await t.drag(find.byType(PdfZoomView), const Offset(-160, -80));
        }));
    testWidgets('a menu page loading (the indicator after 400 ms), $n dp', (t) => shot(t, 'pdf_loading_', '/cafe/29/menu/0', net: NetMode.slow, menu: true, loading: true, then: (t) async {
          await t.pump(const Duration(milliseconds: 900));
        }));
    testWidgets('an offline menu page, never opened, $n dp', (t) => shot(t, 'pdf_unsaved_', '/cafe/29/menu/0', net: NetMode.offline, menu: true));
    testWidgets('a menu page that failed, $n dp', (t) => shot(t, 'pdf_failed_', '/cafe/29/menu/0', linked: false, menu: true));
  }
}
