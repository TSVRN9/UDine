// The settings states of the brief at 360 and 390 dp over M2's fixed clock and the made-up history (you_support.dart): the choices under
// Earlier with the toggles on, Dietary preferences with several Avoids, a pair, the ranking, too little history, Export and Favorites.
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/app.dart';
import 'package:udine/boot.dart';
import 'package:udine/core/types.dart' show RankedDish;
import '../fonts.dart';
import 'plate_support.dart';
import 'support.dart';
import 'you_support.dart';

void main() {
  setUpAll(loadFonts);

  for (final w in [360.0, 390.0]) {
    final n = w.toInt();

    Future<void> shot(WidgetTester t, String name, {History h = History.full, String route = '/you', Future<void> Function(WidgetTester t, Boot b)? act, Future<Boot> Function(WidgetTester t)? make, Future<void> Function(WidgetTester t)? ready}) async {
      final b = await (make?.call(t) ?? bootYou(t, h));
      await openYou(t, b, w: w, route: route);
      await ready?.call(t);
      await act?.call(t, b);
      await t.pumpAndSettle();
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/you_settings_${name}_$n.png'));
      await finish(t);
    }

    testWidgets('the choices with Charles River and both scores on, $n dp', (t) => shot(t, 'choices', act: (t, b) async {
          await t.runAsync(() async {
            await b.prefs.setCharlesRiver(true);
            await b.prefs.setScore(health: true, carbon: true);
          });
          await t.pumpAndSettle();
          await t.drag(find.byType(SingleChildScrollView).first, const Offset(0, -2000));
        }));
    testWidgets('Dietary preferences with several Avoids, $n dp', (t) => shot(t, 'diet', route: '/you/diet', make: (t) => bootRecorded(t, avoid: ['Milk', 'Eggs', 'Peanuts'], onlyShow: ['Vegetarian'])));
    testWidgets('a pair, $n dp', (t) => shot(t, 'pair', route: '/you/rank', ready: (t) => until(t, () => find.text('or').evaluate().isNotEmpty)));
    testWidgets('Your ranking, $n dp', (t) => shot(t, 'ranking', route: '/you/rank', make: (t) async {
          final b = await bootYou(t, History.today);
          await t.runAsync(() => b.store!.saveRankedDishes([for (final (i, d) in ['Hard Boiled Egg', 'Make Your Own Waffles', 'Red Potato Home Fries'].indexed) RankedDish(dishName: d, hallTid: 1, rating: 1600 - i * 40, comparisonCount: 2)]));
          return b;
        }, ready: (t) => until(t, () => find.text('Your ranking').evaluate().isNotEmpty)));
    testWidgets('too little history to rank, $n dp', (t) => shot(t, 'ranking_empty', route: '/you/rank', h: History.none, ready: (t) => until(t, () => find.textContaining('Log a couple').evaluate().isNotEmpty)));
    testWidgets('Export, $n dp', (t) => shot(t, 'export', route: '/you/export'));
    testWidgets('Favorites with none, $n dp', (t) => shot(t, 'favs', route: '/you/favs'));
  }
}
