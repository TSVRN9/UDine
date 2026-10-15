// You and the past logs as a user meets them (flutter-port-you Task 1): Today and Earlier, a day, a meal's sheet with its steppers, the
// inline Removed row, the Deleted receipt, and the newer-database message. The store-level guarantees are in test/core/store/log_book_test.dart.
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/boot.dart';
import 'package:udine/core/m2/history.dart' show cafeIdsOf;
import 'package:udine/core/types.dart';
import 'package:udine/data/repository.dart' show HoursData, Loaded;
import 'package:udine/screens/plate/plate_bar.dart';
import 'package:udine/screens/plate/plate_row.dart';
import 'package:udine/screens/you/day_page.dart';
import 'package:udine/screens/you/meal_sheet.dart';
import 'package:udine/screens/you/you_screen.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'plate_support.dart';
import 'support.dart';
import 'you_support.dart';

void main() {
  setUpAll(loadFonts);

  group('You', () {
    testWidgets('with no history: the date and title, Today with zeroes, nothing logged, no Earlier', (t) async {
      final b = await bootYou(t, History.none);
      await openYou(t, b);
      expect(find.text('Thursday, October 8'), findsOneWidget);
      expect(find.text('You'), findsWidgets);
      expect(find.text('Today'), findsOneWidget);
      expect(find.text('Nothing logged yet today.'), findsOneWidget);
      expect(find.text('Earlier'), findsNothing);
      expect(t.widget<Facts>(find.byType(Facts)).cal, 0);
      await drain(t);
    });

    testWidgets('with today only: the totals box and the meal row', (t) async {
      final b = await bootYou(t, History.today);
      await openYou(t, b);
      expect(t.widget<Facts>(find.byType(Facts)).cal, 720); // 70 + 2 x 250 + 150
      expect(find.text('Breakfast at Worcester'), findsOneWidget);
      expect(find.text('8:42 AM'), findsOneWidget);
      expect(find.text('Earlier'), findsNothing);
      await drain(t);
    });

    testWidgets('with earlier days: one row each, newest first, with their calories', (t) async {
      final b = await bootYou(t);
      await openYou(t, b);
      expect(find.text('Earlier'), findsOneWidget);
      final a = t.getTopLeft(find.text('Wednesday, October 7')).dy, c = t.getTopLeft(find.text('Tuesday, October 6')).dy;
      expect(a, lessThan(c));
      expect(find.descendant(of: find.widgetWithText(LRow, 'Wednesday, October 7'), matching: find.text('1,300')), findsOneWidget); // lunch 620 + dinner 680
      await drain(t);
    });

    testWidgets('a day row pushes the day: its date in the bar, totals and meals, back returns', (t) async {
      final b = await bootYou(t);
      await openYou(t, b);
      await t.tap(find.text('Wednesday, October 7'));
      await t.pumpAndSettle();
      expect(find.byType(DayPage), findsOneWidget);
      expect(find.text('Lunch at Worcester'), findsOneWidget);
      expect(find.text('Dinner at Hampshire'), findsOneWidget);
      expect(find.text('Nothing logged yet today.'), findsNothing);
      await t.tap(find.bySemanticsLabel('Back'));
      await t.pumpAndSettle();
      expect(find.byType(DayPage), findsNothing);
      await drain(t);
    });

    testWidgets('/you/day/<date> opens that day over You', (t) async {
      final b = await bootYou(t);
      await openYou(t, b, route: '/you/day/2026-10-07');
      expect(find.byType(DayPage), findsOneWidget);
      await drain(t);
    });

    testWidgets('a café meal is titled by the location id the saved hours give it; an id nothing lists stays "Lunch"', (t) async {
      final b = await bootRecorded(t);
      final ids = await t.runAsync(() async => cafeIdsOf(((await b.repo.hours(b.repo.today).firstWhere((s) => s is Loaded<HoursData>)) as Loaded<HoursData>).value.feed));
      expect(ids!['c5'], isNotNull, reason: 'the recorded hours carry Wasabi\'s id');
      LogEntry at(String id, String when, int tid) => LogEntry(id: id, loggedAt: when, source: UmassMenuSource(dishName: 'Sushi', hallTid: tid), servings: 1, nutrition: seedToday.first.nutrition);
      await t.runAsync(() async {
        await b.store!.addEntries([at('w', '2026-10-08T12:30:00.000', ids['c5']!), at('x', '2026-10-08T18:30:00.000', -7)]);
        await b.log!.reload();
      });
      await openYou(t, b);
      await until(t, () => find.text('Lunch at Wasabi').evaluate().isNotEmpty);
      expect(find.text('Dinner'), findsOneWidget);
      await drain(t);
    });

    testWidgets('a newer database: the one line, no log, no Today', (t) async {
      final rec = await bootRecorded(t);
      final b = Boot(rec.repo, null, rec.prefs);
      await openYou(t, b);
      expect(find.text(YouScreen.newerDatabase), findsOneWidget);
      expect(find.text('Today'), findsNothing);
      expect(b.menusOnly, isTrue);
      await drain(t);
    });

    testWidgets('a meal logged from the plate is in Today at once', (t) async {
      final b = await bootRecorded(t);
      await t.runAsync(() => b.log!.reload());
      await openPlate(t, boot: b);
      await t.runAsync(() => b.plate.log(place: 'W'));
      await t.pump();
      expect(b.log!.meals, hasLength(1));
      expect(b.log!.meals.single.day, '2026-10-08');
      await finish(t);
    });
  });

  group('a past meal', () {
    Future<Boot> meal(WidgetTester t, {String title = 'Lunch at Worcester', History h = History.full, String day = '2026-10-07'}) async {
      final b = await bootYou(t, h);
      await openYou(t, b, route: '/you/day/$day');
      await t.tap(find.text(title));
      await t.pumpAndSettle();
      return b;
    }

    testWidgets('opens as plate rows with steppers, the totals, Full label and Delete meal', (t) async {
      await meal(t);
      expect(find.byType(MealSheet), findsOneWidget);
      expect(find.byType(PlateRow), findsNWidgets(3));
      expect(find.text('Golden BBQ Chicken Thigh'), findsOneWidget);
      expect(find.textContaining('180 cal each', findRichText: true), findsOneWidget);
      expect(find.text('Full label'), findsOneWidget);
      expect(find.text('Delete meal'), findsOneWidget);
      expect(t.widget<Facts>(find.descendant(of: find.byType(MealSheet), matching: find.byType(Facts))).cal, 620);
      await drain(t);
    });

    testWidgets('More and Less change the servings in the store as you go', (t) async {
      final b = await meal(t);
      final row = find.byType(PlateRow).first;
      await t.tap(find.descendant(of: row, matching: find.bySemanticsLabel('More')));
      await wrote(t);
      expect((await logRows(t, b)).firstWhere((r) => r['id'] == 'e1')['servings'], 2);
      expect(t.widget<Facts>(find.descendant(of: find.byType(MealSheet), matching: find.byType(Facts))).cal, 800);
      for (var i = 0; i < 2; i++) {
        await t.tap(find.descendant(of: row, matching: find.bySemanticsLabel('Less')));
        await wrote(t);
      }
      expect((await logRows(t, b)).firstWhere((r) => r['id'] == 'e1')['servings'], 0.5);
      expect(find.text('½'), findsOneWidget);
      await drain(t);
    });

    testWidgets('the last half of an item leaves "Removed ..." with Undo where it was; Undo puts back the very row', (t) async {
      final b = await meal(t);
      final before = await logRows(t, b), row = find.byType(PlateRow).first;
      await t.tap(find.descendant(of: row, matching: find.bySemanticsLabel('Less'))); // 1 -> ½
      await wrote(t);
      await t.tap(find.descendant(of: row, matching: find.bySemanticsLabel('Less'))); // ½ -> out
      await wrote(t);
      expect(find.text('Removed Golden BBQ Chicken Thigh'), findsOneWidget);
      expect(find.byType(PlateRow), findsNWidgets(2));
      expect((await logRows(t, b)).where((r) => r['id'] == 'e1'), isEmpty);
      await t.tap(find.text('Undo'));
      await wrote(t);
      expect(find.textContaining('Removed'), findsNothing);
      expect(find.byType(PlateRow), findsNWidgets(3));
      final after = await logRows(t, b);
      expect(after.firstWhere((r) => r['id'] == 'e1')['servings'], 0.5); // the stepper edit before the removal is part of what was there
      expect([for (final r in after) {...r}..remove('servings')], [for (final r in before) {...r}..remove('servings')]);
      await drain(t);
    });

    testWidgets('Delete meal puts the sheet away and shows "Deleted Worcester lunch" with Undo; Undo puts back exactly those rows', (t) async {
      final b = await meal(t);
      final before = await logRows(t, b);
      await t.tap(find.text('Delete meal'));
      await wrote(t);
      expect(find.byType(MealSheet), findsNothing);
      expect(find.descendant(of: find.byType(PlateBar), matching: find.text('Deleted Worcester lunch')), findsOneWidget);
      expect((await logRows(t, b)).map((r) => r['id']), isNot(contains('e1')));
      expect(find.text('Lunch at Worcester'), findsNothing); // the day page behind it has let it go
      await t.tap(find.descendant(of: find.byType(PlateBar), matching: find.text('Undo')));
      await wrote(t);
      expect(await logRows(t, b), before);
      expect(find.text('Lunch at Worcester'), findsOneWidget);
      await finish(t);
    });

    testWidgets('taking the last half off the last item deletes the meal, with the receipt', (t) async {
      final b = await meal(t, title: 'Dinner at Hampshire');
      // two items: take one out, then the other down to nothing
      for (var i = 0; i < 2; i++) {
        final row = find.byType(PlateRow).first;
        await t.tap(find.descendant(of: row, matching: find.bySemanticsLabel('Less')));
        await wrote(t);
        await t.tap(find.descendant(of: row, matching: find.bySemanticsLabel('Less')));
        await wrote(t);
      }
      expect(find.descendant(of: find.byType(PlateBar), matching: find.text('Deleted Hampshire dinner')), findsOneWidget);
      expect((await logRows(t, b)).map((r) => r['id']), isNot(anyOf(contains('e4'), contains('e5'))));
      await finish(t);
    });

    testWidgets('Full label swaps the sheet to the summed label', (t) async {
      await meal(t);
      await t.tap(find.text('Full label'));
      await t.pumpAndSettle();
      expect(find.text('Nutrition Facts'), findsOneWidget);
      expect(find.text('Delete meal'), findsNothing);
      await drain(t);
    });
  });
}
