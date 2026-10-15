import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
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
}
