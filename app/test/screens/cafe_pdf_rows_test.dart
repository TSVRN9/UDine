import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/boot.dart';
import 'package:udine/data/pdf_cache.dart';
import 'package:udine/data/repository.dart';
import 'package:udine/data/source.dart';
import 'package:udine/shell/prefs.dart';
import 'package:udine/data/recorded/flags.dart';
import 'package:udine/screens/cafes/pdf_page.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'pdf_fake.dart';
import 'support.dart';

/// The Commonwealth Restaurant (c29) over M2's recordings: the Oct 11 capture's four PDF links, served by a synthetic stand-in.
const commonwealth = 'The Commonwealth Restaurant';

void main() {
  setUpAll(loadFonts);
  Photos.enabled = false;

  Future<void> cafe(WidgetTester t, {NetMode net = NetMode.ok, List<String> pins = const []}) async {
    await openApp(t, await bootRecorded(t, net: net, pins: pins, pages: (await syntheticPages(t)).call), route: '/cafe/29');
    await until(t, () => find.text('Menus').evaluate().isNotEmpty);
    await drain(t); // the café's own dishes lookup is still in flight
    await t.pumpAndSettle();
  }

  double top(WidgetTester t, String s) => t.getTopLeft(find.text(s)).dy;

  testWidgets('the café page: Menus, the four PDFs in the feed order, Add a custom food, then the description', (t) async {
    await cafe(t);
    final names = ['Lunch', 'Lite fare', 'Dinner', 'Dessert'];
    for (final n in names) {
      expect(find.text(n), findsOneWidget);
    }
    final ys = [top(t, 'Menus'), for (final n in names) top(t, n), top(t, 'Add a custom food'), top(t, 'We proudly welcome you to The Commonwealth Restaurant. Located on the top floor of Worcester Commons, our elegantly modern restaurant offers a relaxed atmosphere featuring beautiful views of campus. Enjoy a delicious, fresh, local, and sustainable menu along with a full bar service, five days a week. Whether you’re visiting campus, entertaining campus guests, or simply grabbing a bite to eat, dining with us is an experience worth repeating.\nReservations and walk-ins welcome. Please contact thecommonwealth@umass.edu or call 413-545-0255 to best accommodate your reservation.')];
    expect(ys, orderedEquals([...ys]..sort()));
    expect(find.text('Not saved'), findsNothing);
    expect(top(t, 'Dessert'), lessThan(844), reason: 'the rows are above the fold');
  });

  testWidgets('a row pushes the menu page, titled "<Name> menu", and back returns to the café', (t) async {
    await cafe(t);
    await t.tap(find.text('Lite fare'));
    await t.pump();
    await until(t, () => find.byType(PdfZoomView).evaluate().isNotEmpty);
    await t.pumpAndSettle();
    expect(find.text('Lite fare menu'), findsOneWidget);
    expect(find.byType(Image), findsNWidgets(2));
    await t.tap(find.byType(BackButton));
    await t.pumpAndSettle();
    expect(find.byType(PdfZoomView), findsNothing);
    expect(find.byType(HallMenu), findsOneWidget);
  });

  testWidgets('offline, nothing opened, not pinned: every row says Not saved and its page says so', (t) async {
    await cafe(t, net: NetMode.offline);
    expect(find.text('Not saved'), findsNWidgets(4));
    await t.tap(find.text('Dinner'));
    await until(t, () => find.textContaining("You're offline").evaluate().isNotEmpty);
    expect(find.text("You're offline, and this menu isn't saved on this phone."), findsOneWidget);
  });

  testWidgets('offline with the café pinned: its PDFs were fetched at launch, so no row says Not saved and a menu opens', (t) async {
    await cafe(t, net: NetMode.offline, pins: const [commonwealth]);
    expect(find.text('Not saved'), findsNothing);
    await t.tap(find.text('Lunch'));
    await until(t, () => find.byType(PdfZoomView).evaluate().isNotEmpty);
    expect(find.text('Lunch menu'), findsOneWidget);
  });

  testWidgets('the launch route /cafe/29/menu/1 opens the second menu', (t) async {
    await openApp(t, await bootRecorded(t, pages: (await syntheticPages(t)).call), route: '/cafe/29/menu/1');
    await until(t, () => find.byType(PdfZoomView).evaluate().isNotEmpty);
    expect(find.text('Lite fare menu'), findsOneWidget);
  });

  testWidgets('a café with no PDFs has no Menus rows', (t) async {
    await openApp(t, await bootRecorded(t, pages: (await syntheticPages(t)).call), route: '/cafe/2');
    await until(t, () => find.text('Add a custom food').evaluate().isNotEmpty);
    expect(find.text('Menus'), findsNothing);
  });

  for (final viaRow in [true, false]) {
    testWidgets(
      "${viaRow ? "a row's page" : 'the /cafe/29/menu/0 page'}: Try again forgets the repository's offline window, so a deliberate retry is attempted",
      (t) async {
        var pdfStatus = 500, menusReachable = true, pdfRequests = 0;
        final pdf = await syntheticPages(t);
        final boot = (await t.runAsync(() async {
          sqfliteFfiInit();
          final db = await databaseFactoryFfi.openDatabase(
            inMemoryDatabasePath,
          );
          addTearDown(db.close);
          await db.execute(
            'CREATE TABLE preferences_kv (key TEXT PRIMARY KEY NOT NULL, value_json TEXT NOT NULL)',
          );
          final client = MockClient((req) async {
            if (req.url.path.endsWith('.pdf')) {
              pdfRequests++;
              return http.Response.bytes(
                utf8.encode('%PDF-1.4\n%synthetic\n'),
                pdfStatus,
              );
            }
            if (!menusReachable) {
              throw const SocketException('Network is unreachable');
            }
            return http.Response.bytes(
              utf8.encode(
                req.url.path == '/uapp/get_infov2'
                    ? await readRecorded('locations-2026-10-11.json')
                    : '{}',
              ),
              200,
            );
          });
          final dir = Directory.systemTemp.createTempSync('rows_retry_test');
          addTearDown(() => dir.deleteSync(recursive: true));
          final repo = Repository(
            UmassSource(client),
            db,
            now: () => lunch,
            pdfs: PdfCache(dir, client),
          );
          return Boot(repo, null, await AppPrefs.load(null), pdfOpen: pdf.call);
        }))!;
        await openApp(t, boot, route: viaRow ? '/cafe/29' : '/cafe/29/menu/0');
        if (viaRow) {
          await until(t, () => find.text('Menus').evaluate().isNotEmpty);
          await drain(t);
          await t.pumpAndSettle();
          await t.tap(find.text('Lunch').hitTestable());
        }
        await until(
          t,
          () => find.text("The lunch menu didn't load.").evaluate().isNotEmpty,
        );
        await t.pumpAndSettle(); // the page has finished sliding in
        menusReachable = false;
        await t.runAsync(
          () => boot.repo.menu(2, '2026-10-08').drain<void>(),
        ); // a menu finds no route: the pool's 30 s offline window opens
        pdfStatus = 200;
        final before = pdfRequests;
        await t.tap(find.text('Try again'));
        await until(t, () => find.byType(PdfZoomView).evaluate().isNotEmpty);
        expect(
          pdfRequests,
          before + 1,
          reason: 'the retry reached the network',
        );
        await drain(t);
      },
    );
  }
}
