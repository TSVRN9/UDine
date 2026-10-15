// You's settings (flutter-port-you Task 2): the rows, Dietary preferences, the Charles River and score toggles, Favorites, "Which was better?"
// and Export, as a user meets them. What each writes to RN's rows is checked against the store.
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/types.dart' show RankedDish;
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'support.dart';
import 'you_support.dart';

Future<void> tapText(WidgetTester t, String text) async {
  await t.ensureVisible(find.text(text));
  await t.tap(find.text(text));
  await wrote(t);
}

bool checked(WidgetTester t, String label) => t.widget<CheckRow>(find.widgetWithText(CheckRow, label)).on;
Future<T> real<T>(WidgetTester t, Future<T> Function() f) async => (await t.runAsync(f)) as T;

void main() {
  setUpAll(loadFonts);

  group('the rows', () {
    testWidgets('under Earlier: Favorites, Dietary preferences, Which was better?, Export, then Campus and Show on dishes', (t) async {
      final b = await bootYou(t);
      await openYou(t, b);
      for (final s in ['Favorites', 'None yet', 'Dietary preferences', 'Everything', 'Which was better?', '8 dishes logged', 'Export my data', '3 days', 'Campus', 'Charles River Campus', 'Show on dishes', 'Healthfulness', 'Carbon rating']) {
        await t.ensureVisible(find.text(s));
        expect(find.text(s), findsOneWidget, reason: s);
      }
      final y = [for (final s in ['Earlier', 'Favorites', 'Dietary preferences', 'Which was better?', 'Export my data', 'Charles River Campus', 'Healthfulness', 'Carbon rating']) t.getTopLeft(find.text(s)).dy];
      expect(y, orderedEquals([...y]..sort()));
      await drain(t);
    });

    testWidgets('with nothing logged there is no Export row; Which was better? counts none', (t) async {
      final b = await bootYou(t, History.none);
      await openYou(t, b);
      await t.ensureVisible(find.text('Which was better?'));
      expect(find.text('0 dishes logged'), findsOneWidget);
      expect(find.text('Export my data'), findsNothing);
      await drain(t);
    });

    testWidgets('the Charles River and score toggles tick at once and are stored', (t) async {
      final b = await bootYou(t);
      await openYou(t, b);
      expect(checked(t, 'Charles River Campus'), isFalse);
      await tapText(t, 'Charles River Campus');
      expect(checked(t, 'Charles River Campus'), isTrue);
      expect(await real(t, b.store!.charlesRiver), isTrue);
      await tapText(t, 'Carbon rating');
      expect(checked(t, 'Carbon rating'), isTrue);
      expect(await real(t, b.store!.scores), (healthfulness: false, carbon: true));
      await tapText(t, 'Healthfulness');
      expect(await real(t, b.store!.scores), (healthfulness: true, carbon: true));
      await drain(t);
    });
  });

  group('Dietary preferences', () {
    testWidgets('an RN user\'s allergens are checked under Avoid, and the row says what is avoided', (t) async {
      final b = await bootRecorded(t, avoid: ['Eggs', 'Tree Nuts'], onlyShow: ['Halal']);
      await t.runAsync(() async {
        await b.store!.addEntries(seedToday);
        await b.log!.reload();
      });
      await openYou(t, b);
      await t.ensureVisible(find.text('Dietary preferences'));
      expect(find.text('Halal, no eggs or tree nuts'), findsOneWidget);
      await tapText(t, 'Dietary preferences');
      expect(checked(t, 'Eggs'), isTrue);
      expect(checked(t, 'Tree nuts'), isTrue);
      expect(checked(t, 'Milk'), isFalse);
      expect(checked(t, 'Halal'), isTrue);
      await drain(t);
    });

    testWidgets('a tap writes the feed\'s exact string into food_preferences; the second tap takes it out', (t) async {
      final b = await bootYou(t);
      await openYou(t, b, route: '/you/diet');
      await tapText(t, 'Plant based');
      await tapText(t, 'Milk');
      expect(await real(t, b.store!.onlyShow), ['Plant Based']);
      expect(await real(t, b.store!.avoid), ['Milk']);
      await tapText(t, 'Milk');
      expect(await real(t, b.store!.avoid), isEmpty);
      expect(find.text('Only show'), findsOneWidget);
      expect(find.text('Avoid'), findsOneWidget);
      expect(find.byType(CheckRow), findsNWidgets(3 + 11));
      await drain(t);
    });
  });

  group('Which was better?', () {
    testWidgets('a pair from the log; a pick moves RN\'s Elo rows and the next pair follows; the last pick shows Your ranking, the winner first', (t) async {
      final b = await bootYou(t, History.today);
      await openYou(t, b, route: '/you/rank');
      await until(t, () => find.text('or').evaluate().isNotEmpty);
      expect(find.text('Which was better?'), findsOneWidget);
      expect(find.text('or'), findsOneWidget);
      final names = ['Hard Boiled Egg', 'Make Your Own Waffles', 'Red Potato Home Fries'];
      expect(find.byType(Press), findsWidgets);
      for (var i = 0; i < 3; i++) {
        final shown = [for (final n in names) if (find.text(n).evaluate().isNotEmpty) n];
        expect(shown, hasLength(2), reason: 'pick $i');
        await t.tap(find.text(shown.first));
        await wrote(t);
      }
      expect(find.text('Your ranking'), findsOneWidget);
      expect(find.text('or'), findsNothing);
      final dishes = await real(t, b.store!.rankedDishes);
      expect(dishes.fold<int>(0, (a, d) => a + d.comparisonCount), 6);
      expect((await real(t, b.store!.rankedFoods)).length, 3);
      expect(find.textContaining('1. '), findsOneWidget);
      expect(find.textContaining('3. '), findsOneWidget);
      await drain(t);
    });

    testWidgets('RN\'s ranked_dishes order is Your ranking before any pick', (t) async {
      final b = await bootYou(t, History.today);
      final order = ['Red Potato Home Fries', 'Hard Boiled Egg', 'Make Your Own Waffles'];
      await t.runAsync(() => b.store!.saveRankedDishes([for (final (i, n) in order.indexed) RankedDish(dishName: n, hallTid: 1, rating: 1700 - i * 50, comparisonCount: 2)]));
      await openYou(t, b, route: '/you/rank');
      await until(t, () => find.text('Your ranking').evaluate().isNotEmpty);
      expect([for (final n in order) t.getTopLeft(find.text('${order.indexOf(n) + 1}. $n')).dy], orderedEquals([for (final n in order) t.getTopLeft(find.text('${order.indexOf(n) + 1}. $n')).dy]..sort()));
      await drain(t);
    });

    testWidgets('with fewer than two dishes logged there is only the empty line, whatever RN ranked', (t) async {
      final one = await bootYou(t, History.none);
      await t.runAsync(() => one.store!.saveRankedDishes([RankedDish(dishName: 'Ghost', hallTid: 1, rating: 1600, comparisonCount: 1)]));
      await openYou(t, one, route: '/you/rank');
      await until(t, () => find.textContaining('Log a couple').evaluate().isNotEmpty);
      expect(find.text('Your ranking'), findsOneWidget);
      expect(find.text('Log a couple of meals and you can rank what you ate.'), findsOneWidget);
      expect(find.text('Ghost'), findsNothing);
      await drain(t);
    });
  });

  group('Export', () {
    testWidgets('JSON and CSV hand every device-local table to the share sheet', (t) async {
      final b = await bootYou(t);
      final sent = <Map<String, String>>[];
      b.share = (files) async => sent.add(files);
      await openYou(t, b, route: '/you/export');
      await t.tap(find.text('Export JSON'));
      await wrote(t);
      await t.tap(find.text('Export CSV'));
      await wrote(t);
      expect(sent[0].keys, ['udine-export.json', 'udine-ranked-dishes.json', 'udine-ranked-foods.json', 'udine-favorites.json', 'udine-custom-foods.json']);
      expect(sent[1].keys.first, 'udine-export.csv');
      expect(sent[0]['udine-export.json'], await real(t, () => b.store!.exportJson().then((m) => m['udine-export.json']!)));
      await drain(t);
    });
  });

  group('Favorites', () {
    testWidgets('lists the starred dishes; with none, the empty line', (t) async {
      final b = await bootYou(t);
      await openYou(t, b, route: '/you/favs');
      expect(find.text('Star a dish from its details and it shows up here, with where it\'s served today.'), findsOneWidget);
      await t.runAsync(() => b.prefs.toggleFavorite('Green Chile Posole'));
      await t.pumpAndSettle();
      expect(find.text('Green Chile Posole'), findsOneWidget);
      await drain(t);
    });
  });
}
