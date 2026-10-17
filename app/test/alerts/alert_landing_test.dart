// A tap on a favourite's notification (M2 R11 §2): the app opens on Halls and pushes the hall at that meal, scrolled to the dish and marked,
// the way a where-served tap does. The Shell around it is never rebuilt, and no dish sheet opens.
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/halls/first_run.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/ui/ui.dart' show M2Sheet;
import 'package:udine/alerts/alerts.dart';
import 'package:udine/screens/dish/dish_sheet.dart';
import 'package:udine/screens/halls/halls_screen.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/screens/hall/hall_route.dart';
import 'package:udine/screens/you/you_screen.dart';
import 'package:udine/shell/shell.dart';
import '../fonts.dart';
import '../screens/dish_support.dart';
import '../screens/support.dart';
import '../screens/you_support.dart';

const _route = '/hall/worcester?meal=lunch&day=2026-10-08&dish=Pork%20Adobada%20(Chicken)';

void main() {
  setUpAll(loadFonts);
  setUp(takeHeldTap); // (a tap one test leaves held is not the next test's launch)

  test('the notification route is read as a place, a meal, a day offset and the dish\'s key', () {
    final l = alertLanding('/hall/franklin?meal=dinner&day=2026-10-10&dish=Chicken%20Katsu', '2026-10-08')!;
    expect((l.place, l.meal, l.day, l.dish), ('F', 'dinner', 2, 'chicken katsu'));
    expect(alertLanding('/hall/nowhere?meal=lunch&dish=A', '2026-10-08'), isNull);
    expect(alertLanding('/hall/worcester?meal=lunch', '2026-10-08'), isNull, reason: 'no dish: nothing to land on');
    expect(alertLanding('/you', '2026-10-08'), isNull);
  });

  testWidgets('a tap while the app is open on You: Halls, the hall pushed at the dish and marked, the same Shell, no sheet', (t) async {
    final b = await bootYou(t);
    await openYou(t, b);
    final shell = t.state<ShellState>(find.byType(Shell));
    debugTapForTest(_route);
    await until(t, () => here(t) != null);
    await t.pumpAndSettle();
    expect(identical(t.state<ShellState>(find.byType(Shell)), shell), isTrue, reason: 'the Shell is not rebuilt');
    expect(top(t).place, 'W');
    expect(here(t)?.dish.dishName, 'Pork Adobada (Chicken)');
    expect(top(t).atTop, isFalse, reason: 'scrolled to a dish far down the list');
    expect(find.byType(DishSheet), findsNothing);
    shell.navigator.currentState!.pop(); // (back from the hall: the tab under it is Halls, not the You it was tapped from)
    await t.pumpAndSettle();
    expect(find.byType(HallsScreen).hitTestable(), findsOneWidget);
    expect(find.byType(YouScreen).hitTestable(), findsNothing);
    await drain(t);
  });

  testWidgets('a tap with a hall already open replaces nothing deeper: one hall over Halls', (t) async {
    final b = await bootRecorded(t);
    await openApp(t, b, route: '/hall/berkshire?meal=lunch');
    await until(t, () => find.byType(HallMenu).evaluate().isNotEmpty);
    debugTapForTest(_route);
    await until(t, () => here(t) != null);
    await t.pumpAndSettle();
    expect(find.byType(HallMenu, skipOffstage: false), findsNWidgets(1));
    expect(top(t).place, 'W');
    await drain(t);
  });

  testWidgets('a tap that launched the app (held before it listened) lands the same way, over Halls', (t) async {
    debugTapForTest(_route);
    final b = await bootRecorded(t);
    await openApp(t, b, route: '/');
    await until(t, () => here(t) != null);
    await t.pumpAndSettle();
    expect(top(t).place, 'W');
    expect(here(t)?.dish.dishName, 'Pork Adobada (Chicken)');
    expect(find.byType(DishSheet), findsNothing);
    expect(takeHeldTap(), isNull, reason: 'taken once');
    await drain(t);
  });

  Widget stub(handle, done) => M2Sheet(handle: handle, top: 20, onClosed: done, slivers: const [SliverToBoxAdapter(child: SizedBox(key: Key('stub'), height: 100))]);

  testWidgets('a dish sheet open: a tap closes it, and the hall lands and is marked', (t) async {
    await openHall(t, await bootRecorded(t), '/hall/berkshire?meal=lunch');
    await t.tap(find.byType(DishRow).first, warnIfMissed: false);
    await sheetUp(t);
    debugTapForTest(_route);
    await until(t, () => here(t) != null && find.byType(DishSheet).evaluate().isEmpty);
    await t.pumpAndSettle();
    expect(find.byType(DishSheet), findsNothing);
    expect(top(t).place, 'W');
    expect(here(t)?.dish.dishName, 'Pork Adobada (Chicken)');
    await drain(t);
  });

  testWidgets('two stacked sheets: both close', (t) async {
    await openHall(t, await bootRecorded(t), '/hall/berkshire?meal=lunch');
    await t.tap(find.byType(DishRow).first, warnIfMissed: false);
    await sheetUp(t);
    t.state<ShellState>(find.byType(Shell)).pushSheet(stub);
    await t.pumpAndSettle();
    expect(find.byKey(const Key('stub')), findsOneWidget);
    debugTapForTest(_route);
    await until(t, () => here(t) != null && find.byType(DishSheet).evaluate().isEmpty && find.byKey(const Key('stub')).evaluate().isEmpty);
    await t.pumpAndSettle();
    expect(find.byType(DishSheet), findsNothing);
    expect(find.byKey(const Key('stub')), findsNothing);
    expect(top(t).place, 'W');
    await drain(t);
  });

  testWidgets('first run present: it stays over the landed hall (onboarding is not ours to close)', (t) async {
    final b = await bootRecorded(t, firstRun: true);
    await openApp(t, b, route: '/halls?data=recorded&firstRun=1');
    await until(t, () => find.byType(FirstRunSheet).evaluate().isNotEmpty);
    await t.pumpAndSettle();
    debugTapForTest(_route);
    await until(t, () => here(t) != null);
    await t.pumpAndSettle();
    expect(find.byType(FirstRunSheet), findsOneWidget);
    expect(top(t).place, 'W');
    expect(here(t)?.dish.dishName, 'Pork Adobada (Chicken)');
    await drain(t);
  });
}
