// Track what I eat off (flutter-port-you Task 3): UDine is a menu. On every screen it touches, no +, plate, custom food or Add;
// the lane keeps its size so a list never reflows; and turning it back on brings the plate back as it was.
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/boot.dart';
import 'package:udine/screens/dish/bowl_foot.dart';
import 'package:udine/screens/dish/dish_sheet.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/shell/prefs.dart';
import 'package:udine/theme/tokens.dart';
import 'package:udine/ui/ui.dart';
import 'package:udine/screens/hall/dish_row.dart' show CalProtein;
import '../fonts.dart';
import 'dish_support.dart';
import 'plate_support.dart';
import 'support.dart';
import 'you_support.dart';

/// Search's cafés keep loading behind the halls': let that land before the test ends.
Future<void> settleSearch(WidgetTester t) async {
  for (var i = 0; i < 12; i++) {
    await drain(t);
  }
}

Future<void> setTrack(WidgetTester t, Boot b, bool on) async {
  await t.runAsync(() => b.prefs.setTrack(on));
  await t.pumpAndSettle();
}

void main() {
  setUpAll(loadFonts);

  group('a hall menu', () {
    testWidgets('the figures, the + and steppers go and the control column leaves layout: rows are a name-only 48 and names take the width; on, all back', (t) async {
      final b = await bootRecorded(t);
      await openHall(t, b, '/hall/worcester?meal=lunch');
      List<double> heights() => [for (final r in t.widgetList<DishRow>(find.byType(DishRow)).take(12)) t.getSize(find.byWidget(r)).height];
      List<double> names() => [for (final r in t.widgetList<DishRow>(find.byType(DishRow)).take(12)) t.getSize(find.descendant(of: find.byWidget(r), matching: find.byType(RichText)).first).width];
      final on = heights(), wrap = names();
      expect(find.byType(RowControl), findsWidgets);
      expect(find.byType(CalProtein), findsWidgets);
      expect(on.every((h) => h >= M2Size.row), isTrue);
      await setTrack(t, b, false);
      expect(find.byType(RowControl), findsNothing);
      expect(find.byType(AddButton), findsNothing);
      expect(find.byType(CalProtein), findsNothing);
      final off = heights().take(on.length).toList();
      expect(off.every((h) => h >= M2Size.rowOff), isTrue);
      expect(off.where((h) => h == M2Size.rowOff), isNotEmpty, reason: 'a name-only row is 48');
      expect([for (var i = 0; i < off.length; i++) off[i] < on[i]], everyElement(isTrue), reason: 'every row is shorter');
      final nm = names();
      expect([for (var i = 0; i < wrap.length; i++) nm[i] >= wrap[i]], everyElement(isTrue));
      expect([for (var i = 0; i < wrap.length; i++) nm[i] > wrap[i]], contains(true), reason: 'the control column no longer takes the width');
      await setTrack(t, b, true);
      expect(find.byType(RowControl), findsWidgets);
      expect(find.byType(CalProtein), findsWidgets);
      expect(heights().take(on.length).toList(), on);
      await drain(t);
    });

    testWidgets('a plate in progress leaves the bar while tracking is off and returns, as it was, when it is on', (t) async {
      final b = await openPlate(t);
      final before = [for (final p in b.plate.state.plates) [for (final i in p.items) (i.key, i.qty)]];
      expect(bar, findsOneWidget);
      await setTrack(t, b, false);
      await t.pump(const Duration(milliseconds: 600));
      expect(bar, findsNothing);
      expect(b.plate.canLog, isFalse);
      await setTrack(t, b, true);
      await t.pump(const Duration(milliseconds: 600));
      expect(bar, findsOneWidget);
      expect([for (final p in b.plate.state.plates) [for (final i in p.items) (i.key, i.qty)]], before);
      await finish(t);
    });
  });

  group('the dish sheet', () {
    Rect whereBlock(WidgetTester t) => t.getRect(find.ancestor(of: find.byType(HallChip).first, matching: find.byType(Column)).first);

    testWidgets('no Add to plate, and "where it\'s served" takes its place, 16 after the identity group', (t) async {
      final b = await bootRecorded(t, track: false);
      final name = (await lunchDishes(t, b, 1, '2026-10-08')).firstWhere((d) => d.allergens.isNotEmpty).dishName; // (a Contains line ends the identity group)
      await openHall(t, b, dishRoute(name));
      await sheetUp(t);
      expect(find.text('Add to plate'), findsNothing);
      expect(find.text('Add another'), findsNothing);
      expect(find.byType(NutritionLabel), findsNothing, reason: 'the label goes with the figures');
      expect(whereBlock(t).top - t.getRect(find.descendant(of: find.byType(DishSheet), matching: find.textContaining('Contains')).first).bottom, closeTo(M2Layout.whereTopOff, 0.5));
      await drain(t);
    });

    testWidgets('with tracking on the sheet has Add to plate, and where is 24 under it', (t) async {
      final b = await bootRecorded(t);
      await openHall(t, b, dishRoute('Golden BBQ Chicken Thigh'));
      await sheetUp(t);
      expect(find.text('Add to plate'), findsOneWidget);
      expect(find.byType(NutritionLabel), findsOneWidget);
      expect(whereBlock(t).top - t.getRect(find.byType(Button).first).bottom, closeTo(M2Layout.whereTop, 0.5));
      await drain(t);
    });
  });

  group('a build station', () {
    testWidgets('with tracking off its dishes are just dishes: no synthetic row, no builder, no Add; on, both are there', (t) async {
      for (final track in [true, false]) {
        final b = await bootRecorded(t, track: track);
        await openHall(t, b, '/hall/franklin?meal=lunch');
        final sc = t.state<ScrollableState>(find.descendant(of: find.byType(HallMenu), matching: find.byType(Scrollable)).first);
        for (var y = 0.0; find.widgetWithText(ListRow, 'Deli Bar').evaluate().isEmpty && y < sc.position.maxScrollExtent; y += 300) {
          sc.position.jumpTo(y);
          await t.pump();
        }
        expect(find.widgetWithText(ListRow, 'Deli Bar'), track ? findsOneWidget : findsNothing);
        await settleSearch(t);
        await t.pumpWidget(const SizedBox());
      }
    });

    testWidgets('a Noodle Bowl dish opens as a plain dish: no builder rows, no foot', (t) async {
      for (final track in [true, false]) {
        final b = await bootRecorded(t, track: track);
        await openHall(t, b, dishRoute('Beef Brisket Noodle Bowl'));
        await sheetUp(t);
        expect(t.widget<DishSheet>(find.byType(DishSheet)).build, track ? isNotNull : isNull);
        expect(find.byType(BowlFoot), track ? findsOneWidget : findsNothing);
        expect(find.text('Add to plate'), findsNothing);
        await drain(t);
        await t.pumpWidget(const SizedBox());
      }
    });
  });

  group('Search', () {
    testWidgets('a result row has no + and its hall letters rise into the + slot; no match offers no custom food', (t) async {
      final b = await bootRecorded(t, track: false);
      await openApp(t, b, route: '/search?q=brisket');
      await until(t, () => find.byType(DishRow).evaluate().isNotEmpty);
      await t.pumpAndSettle();
      expect(find.byType(RowControl), findsNothing);
      final row = t.getRect(find.byType(DishRow).first), tags = t.getRect(find.byType(HallTags).first);
      expect(tags.center.dy - row.center.dy, closeTo(0, 1.0), reason: 'the letters centre in the name-only row');
      await t.enterText(find.byType(EditableText), 'zzzq');
      await t.pumpAndSettle();
      expect(find.text('Nothing called “zzzq” is on any menu today or tomorrow.'), findsOneWidget);
      expect(find.textContaining('as a custom food'), findsNothing);
      await settleSearch(t);
    });

    testWidgets('a row closes to the name-only 48 when tracking goes off', (t) async {
      final on = await bootRecorded(t);
      await openApp(t, on, route: '/search?q=brisket');
      await until(t, () => find.byType(DishRow).evaluate().isNotEmpty);
      await t.pumpAndSettle();
      expect(t.getSize(find.byType(DishRow).first).height, greaterThanOrEqualTo(M2Size.row));
      await setTrack(t, on, false);
      expect(t.getSize(find.byType(DishRow).first).height, M2Size.rowOff);
      await settleSearch(t);
    });

    testWidgets('the keyboard\'s search key puts nothing on the plate', (t) async {
      final b = await bootRecorded(t, track: false);
      await openApp(t, b, route: '/search?q=brisket');
      await until(t, () => find.byType(DishRow).evaluate().isNotEmpty);
      await t.testTextInput.receiveAction(TextInputAction.search);
      await t.pumpAndSettle();
      expect(b.plate.state.plates, isEmpty);
      await settleSearch(t);
    });
  });

  group('a café with no menu', () {
    testWidgets('Add a custom food is there with tracking on and gone with it off', (t) async {
      for (final track in [true, false]) {
        final b = await bootRecorded(t, track: track);
        await openApp(t, b, route: '/cafe/2'); // Yum! Bakery: a names list
        await until(t, () => find.text('Menu').evaluate().isNotEmpty);
        await t.pumpAndSettle();
        expect(find.text('Add a custom food'), track ? findsOneWidget : findsNothing);
        await settleSearch(t);
        await t.pumpWidget(const SizedBox());
      }
    });
  });

  group('You', () {
    testWidgets('Track what I eat turns it off: Today and Earlier go, Export stays, the title stays; back on, they return', (t) async {
      final b = await bootYou(t);
      await openYou(t, b);
      expect(find.text('Today'), findsOneWidget);
      await t.ensureVisible(find.text('Track what I eat'));
      await t.tap(find.text('Track what I eat'));
      await wrote(t);
      expect(await t.runAsync(b.store!.tracking), isFalse);
      expect(find.text('Today'), findsNothing);
      expect(find.text('Earlier'), findsNothing);
      expect(find.text('Meals'), findsNothing);
      expect(find.text('You'), findsWidgets);
      expect(find.text('Track what I eat'), findsOneWidget);
      expect(find.text('Export my data'), findsOneWidget);
      expect(find.text('Which was better?'), findsNothing);
      await t.tap(find.text('Track what I eat'));
      await wrote(t);
      expect(find.text('Today'), findsOneWidget);
      expect(find.text('Earlier'), findsOneWidget);
      await drain(t);
    });

    testWidgets('Track off is a lift: Today fades while it keeps its height, then closes, and on, it opens then fades in', (t) async {
      final b = await bootYou(t);
      await openYou(t, b);
      Finder today() => find.ancestor(of: find.text('Today'), matching: find.byType(LiftFold));
      double alpha() => t.widget<Opacity>(find.descendant(of: today(), matching: find.byType(Opacity)).first).opacity;
      final h0 = t.getSize(today()).height;
      await t.ensureVisible(find.text('Track what I eat'));
      expect(h0, greaterThan(100));
      await t.tap(find.text('Track what I eat'));
      await t.pump();
      await t.pump(const Duration(milliseconds: 70));
      expect(alpha(), allOf(greaterThan(0), lessThan(1)));
      expect(t.getSize(today()).height, h0, reason: 'at 70 ms it has not started to close');
      await t.pump(const Duration(milliseconds: 220));
      expect(alpha(), 0);
      expect(t.getSize(today()).height, allOf(greaterThan(0), lessThan(h0)), reason: 'then it closes');
      await t.pump(const Duration(milliseconds: 200));
      expect(today(), findsNothing);
      await t.tap(find.text('Track what I eat'));
      await t.pump();
      await t.pump(const Duration(milliseconds: 40));
      expect(t.getSize(today()).height, allOf(greaterThan(0), lessThan(h0)), reason: 'on: it opens from nothing');
      expect(alpha(), 0, reason: 'empty while it opens');
      await t.pump(const Duration(milliseconds: 600));
      expect(t.getSize(today()).height, h0);
      await drain(t);
    });

    testWidgets('with no history Export is gone too', (t) async {
      final b = await bootYou(t, History.none);
      await openYou(t, b);
      await t.runAsync(() => b.prefs.setTrack(false));
      await t.pumpAndSettle();
      expect(find.text('Export my data'), findsNothing);
      await drain(t);
    });

    testWidgets('a newer database: no Track row, and tracking stays off', (t) async {
      final rec = await bootRecorded(t);
      final b = Boot(rec.repo, null, (await t.runAsync(() => AppPrefs.load(null)))!);
      await openYou(t, b);
      expect(find.text('Track what I eat'), findsNothing);
      expect(b.prefs.track, isFalse);
      await drain(t);
    });
  });
}
