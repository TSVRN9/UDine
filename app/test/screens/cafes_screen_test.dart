import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/boot.dart';
import 'package:udine/core/hours.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/screens/hall/meal_list.dart';
import 'package:udine/screens/hall/meal_tabs.dart';
import 'package:udine/screens/cafes/cafes_page.dart';
import 'package:udine/shell/prefs.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'support.dart';

/// 7:30 on the Thursday: of North, ISB Café and Peet's (7 AM) are open and Worcester Café (8 AM) is not; the 11 AM places are all closed.
final early = easternInstant(DateTime.utc(2026, 10, 8, 7, 30));

void main() {
  setUpAll(loadFonts);

  Finder inPage(Type page, String s) => find.descendant(of: find.byType(page), matching: find.text(s));
  Finder inList(String s) => inPage(CafesPage, s);
  Finder inCafe(String s) => inPage(HallMenu, s);
  Future<void> ready(WidgetTester t, String text) => until(t, () => inList(text).evaluate().isNotEmpty);
  double topOf(WidgetTester t, String s) => t.getTopLeft(inList(s).first).dy;
  // each test ends with the app gone and the clock run out, so no repository or spinner timer is left pending
  void tw(String name, Future<void> Function(WidgetTester) body) => testWidgets(name, (t) async {
        await body(t);
        await t.pumpWidget(const SizedBox());
        await t.pump(const Duration(seconds: 2));
        await writesLanded(t);
      });
  /// A pushed café page is done when its slide has ended and its menu is in (the spinner turns until then).
  Future<void> pushed(WidgetTester t) async {
    await t.pump(const Duration(milliseconds: 600));
    await until(t, () => find.byType(Spinner).evaluate().isEmpty);
    await t.pump(const Duration(milliseconds: 600));
  }

  Future<void> openPage(WidgetTester t, Boot boot, String route) async {
    await openApp(t, boot, route: route);
    await until(t, () => (route.startsWith('/cafes') ? find.textContaining(RegExp(r'^Open until|^Nothing open')) : find.byType(HallMenu)).evaluate().isNotEmpty);
    await t.pump(const Duration(milliseconds: 600));
  }

  group('Cafés & markets', () {
    tw('opens with Open now on, the area nearest the last hall first (Worcester: North), then the rest in order', (t) async {
      await openPage(t, await bootRecorded(t, at: early), '/cafes');
      await ready(t, 'ISB Café');
      expect(find.byType(CafesPage), findsOneWidget);
      expect(t.widget<FilterChipButton>(find.byType(FilterChipButton)).selected, isTrue);
      expect(topOf(t, 'North, by Worcester'), lessThan(topOf(t, 'Campus Center')));
      await t.drag(find.byType(CustomScrollView), const Offset(0, -1500));
      await t.pump();
      expect(topOf(t, 'Campus Center'), lessThan(topOf(t, 'Library and academic core')));
      expect(inList('Wasabi'), findsNothing); // opens at 11
    });

    tw('the chip toggles the closed places in and out, and the open ones sort first', (t) async {
      await openPage(t, await bootRecorded(t, at: early), '/cafes');
      await ready(t, 'ISB Café');
      expect(inList('Worcester Café'), findsNothing); // opens at 8
      await t.tap(find.byType(FilterChipButton));
      await t.pumpAndSettle();
      expect(t.widget<FilterChipButton>(find.byType(FilterChipButton)).selected, isFalse);
      expect(inList('Worcester Café'), findsOneWidget);
      expect(topOf(t, "Peet's Coffee & Tea"), lessThan(topOf(t, 'Morrill Café'))); // open, then closed
      expect(topOf(t, 'ISB Café'), lessThan(topOf(t, "Peet's Coffee & Tea")));
      expect(topOf(t, 'Morrill Café'), lessThan(topOf(t, 'Worcester Café')));
      await t.tap(find.byType(FilterChipButton));
      await t.pumpAndSettle();
      expect(inList('Worcester Café'), findsNothing);
    });

    tw('an area with nothing open says so, under its own header', (t) async {
      await openPage(t, await bootRecorded(t, at: easternInstant(DateTime.utc(2026, 10, 8, 23, 59, 30))), '/cafes');
      await ready(t, 'Nothing open here right now.');
      expect(inList('Nothing open here right now.'), findsWidgets);
      expect(inList('North, by Worcester'), findsOneWidget);
    });

    tw('?area=0 scrolls Campus Center, second in the list, under the bar', (t) async {
      await openPage(t, await bootRecorded(t), '/cafes?area=0');
      await ready(t, 'Campus Center');
      await t.pumpAndSettle();
      final bar = 24 + 52; // status inset 24, `.pbar`
      expect(topOf(t, 'Campus Center'), closeTo(bar + 16, 1.5)); // the header's 16 dp of padding above its text
    });

    for (final on in [false, true]) {
      tw('Charles River Campus is ${on ? 'last' : 'absent'} with the toggle ${on ? 'on' : 'off'}; Terrace is always in', (t) async {
        await openPage(t, await bootRecorded(t, at: early, charlesRiver: on), '/cafes');
        await ready(t, 'ISB Café');
        await t.tap(find.byType(FilterChipButton)); // Open now off: every place listed
        await t.pumpAndSettle();
        await t.drag(find.byType(CustomScrollView), const Offset(0, -6000));
        await t.pumpAndSettle();
        expect(inList('Terrace'), findsOneWidget);
        expect(inList('Charles River Campus'), on ? findsOneWidget : findsNothing);
        expect(inList('Charles River Campus, Newton'), on ? findsOneWidget : findsNothing);
      });
    }

    tw('a row pushes the café page and Back returns to the list', (t) async {
      await openPage(t, await bootRecorded(t, at: early), '/cafes');
      await ready(t, 'ISB Café');
      await t.tap(inList('ISB Café'));
      await pushed(t);
      expect(find.byType(HallMenu), findsOneWidget);
      await t.binding.handlePopRoute();
      await t.pumpAndSettle();
      expect(find.byType(HallMenu), findsNothing);
      expect(find.byType(CafesPage), findsOneWidget);
    });
  });

  group('a café page', () {
    Future<void> cafe(WidgetTester t, String id, {Boot? boot}) async {
      await openPage(t, boot ?? await bootRecorded(t), '/cafe/${id.substring(1)}');
      await pushed(t);
    }

    tw('pin adds to and removes from the pins, saved on the device', (t) async {
      final boot = await bootRecorded(t, persistPins: true);
      await cafe(t, 'c4', boot: boot); // Tamales
      expect(boot.prefs.pins, isEmpty);
      await t.tap(find.byType(PinButton));
      await t.pump();
      expect(boot.prefs.pins, ['Tamales']);
      expect((await t.runAsync(() => AppPrefs.load(boot.store))) !.pins, ['Tamales']);
      expect(find.bySemanticsLabel('Unpin from Halls'), findsOneWidget);
      await t.tap(find.byType(PinButton));
      await t.pump();
      expect(boot.prefs.pins, isEmpty);
      expect((await t.runAsync(() => AppPrefs.load(boot.store)))!.pins, isEmpty);
    });

    tw('dishes: a café with several meals has the tab row', (t) async {
      await cafe(t, 'c4'); // Tamales: lunch, dinner
      await until(t, () => find.byType(MealTabs).evaluate().isNotEmpty);
      expect(inCafe('Lunch'), findsOneWidget);
      expect(inCafe('Dinner'), findsOneWidget);
    });

    tw('dishes: a café with one meal has no tab row', (t) async {
      await cafe(t, 'c17'); // Newman Café: lunch only
      await until(t, () => find.byType(MealSliver).evaluate().isNotEmpty);
      expect(find.byType(MealTabs), findsNothing);
      expect(inCafe('Dinner'), findsNothing);
      expect(inCafe('Lunch'), findsNothing);
    });

    tw('a names list, with the description first and Add a custom food after', (t) async {
      await cafe(t, 'c2'); // Yum! Bakery
      await until(t, () => inCafe('Menu').evaluate().isNotEmpty);
      expect(inCafe('Yum! Bakery is a full-service bakery located in the Blue Wall. Enjoy our homemade cookies, pastries, cakes, French macarons as well as many seasonal treats.'), findsOneWidget);
      expect(find.byType(MealSliver), findsNothing);
      expect(inCafe('Add a custom food'), findsOneWidget);
      expect(find.textContaining("doesn't list its menu"), findsNothing);
    });

    tw('no menu: says the café does not list it', (t) async {
      await cafe(t, 'c0'); // Paciugo
      await until(t, () => inCafe("Paciugo doesn't list its menu in the app.").evaluate().isNotEmpty);
      expect(inCafe("Paciugo doesn't list its menu in the app."), findsOneWidget);
      expect(inCafe('Add a custom food'), findsOneWidget);
    });

    tw('a pushed café page can unpin itself from the pin it was opened from and Back does not throw', (t) async {
      final boot = await bootRecorded(t, pins: const ['Tamales']);
      await openApp(t, boot);
      await until(t, () => find.text('Tamales').evaluate().isNotEmpty && find.byType(Meter).evaluate().isNotEmpty);
      await t.tap(find.text('Tamales'));
      await pushed(t);
      await t.tap(find.byType(PinButton));
      await t.pump();
      expect(boot.prefs.pins, isEmpty);
      await t.binding.handlePopRoute();
      await t.pumpAndSettle();
      expect(find.byType(HallMenu), findsNothing);
      expect(t.takeException(), isNull);
    });
  });
}
