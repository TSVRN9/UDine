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
    testWidgets('the + and steppers go, the lane stays: every row is the height it was, and names wrap where they did', (t) async {
      final b = await bootRecorded(t);
      await openHall(t, b, '/hall/worcester?meal=lunch');
      List<Size> sizes() => [for (final r in t.widgetList<DishRow>(find.byType(DishRow)).take(12)) t.getSize(find.byWidget(r))];
      List<double> names() => [for (final r in t.widgetList<DishRow>(find.byType(DishRow)).take(12)) t.getSize(find.descendant(of: find.byWidget(r), matching: find.byType(RichText)).first).width];
      final on = sizes(), wrap = names();
      expect(find.byType(RowControl), findsWidgets);
      await setTrack(t, b, false);
      expect(find.byType(RowControl), findsNothing);
      expect(find.byType(AddButton), findsNothing);
      expect(sizes(), on);
      expect(names(), wrap);
      await setTrack(t, b, true);
      expect(find.byType(RowControl), findsWidgets);
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
      expect(whereBlock(t).top - t.getRect(find.descendant(of: find.byType(DishSheet), matching: find.textContaining('Contains')).first).bottom, closeTo(M2Layout.whereTopOff, 0.5));
      await drain(t);
    });

    testWidgets('with tracking on the sheet has Add to plate, and where is 24 under it', (t) async {
      final b = await bootRecorded(t);
      await openHall(t, b, dishRoute('Golden BBQ Chicken Thigh'));
      await sheetUp(t);
      expect(find.text('Add to plate'), findsOneWidget);
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
      expect(tags.top - row.top, closeTo(M2Layout.laneOffTop + M2Layout.rowPadTop, 1.0), reason: 'the letters ride at the top of the lane');
      await t.enterText(find.byType(EditableText), 'zzzq');
      await t.pumpAndSettle();
      expect(find.text('Nothing called “zzzq” is on any menu today or tomorrow.'), findsOneWidget);
      expect(find.textContaining('as a custom food'), findsNothing);
      await settleSearch(t);
    });

    testWidgets('a row is the height it was with the + there', (t) async {
      final on = await bootRecorded(t);
      await openApp(t, on, route: '/search?q=brisket');
      await until(t, () => find.byType(DishRow).evaluate().isNotEmpty);
      await t.pumpAndSettle();
      final h = t.getSize(find.byType(DishRow).first).height;
      await setTrack(t, on, false);
      expect(t.getSize(find.byType(DishRow).first).height, h);
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
