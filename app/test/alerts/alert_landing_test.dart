// A tap on a favourite's notification: the app comes to the Halls home screen (the tab root). Every sheet closes except an undismissed first
// run; no hall is pushed; the Shell around it is never rebuilt.
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/alerts/alerts.dart';
import 'package:udine/screens/dish/dish_sheet.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/screens/halls/first_run.dart';
import 'package:udine/screens/halls/halls_screen.dart';
import 'package:udine/screens/you/you_screen.dart';
import 'package:udine/shell/shell.dart';
import 'package:udine/ui/ui.dart' show M2Sheet, SheetHandle;
import '../fonts.dart';
import '../screens/dish_support.dart';
import '../screens/support.dart';
import '../screens/you_support.dart';

const _route = '/hall/worcester?meal=lunch&day=2026-10-08&dish=Pork%20Adobada%20(Chicken)';

/// Halls home and nothing pushed: no hall page anywhere in the tree, the Halls tab the one on screen.
Future<void> _home(WidgetTester t) async {
  await t.pumpAndSettle();
  expect(find.byType(HallMenu, skipOffstage: false), findsNothing, reason: 'no hall is pushed');
  expect(find.byType(DishSheet), findsNothing);
  expect(find.byType(HallsScreen).hitTestable(), findsOneWidget);
  expect(find.byType(YouScreen).hitTestable(), findsNothing);
}

Future<void> _tap(WidgetTester t, {bool Function()? and}) async {
  debugTapForTest(_route);
  await t.pump();
  await until(t, () => and?.call() ?? true);
}

Widget _stub(SheetHandle handle, VoidCallback done) => M2Sheet(handle: handle, top: 20, onClosed: done, slivers: const [SliverToBoxAdapter(child: SizedBox(key: Key('stub'), height: 100))]);

void main() {
  setUpAll(loadFonts);
  setUp(takeHeldTap); // (a tap one test leaves held is not the next test's launch)

  testWidgets('backgrounded on You: Halls home, the same Shell', (t) async {
    final b = await bootYou(t);
    await openYou(t, b);
    final shell = t.state<ShellState>(find.byType(Shell));
    await _tap(t, and: () => find.byType(HallsScreen).hitTestable().evaluate().isNotEmpty);
    await _home(t);
    expect(identical(t.state<ShellState>(find.byType(Shell)), shell), isTrue, reason: 'the Shell is not rebuilt');
    await drain(t);
  });

  testWidgets('a hall open: popped to Halls home', (t) async {
    await openApp(t, await bootRecorded(t), route: '/hall/berkshire?meal=lunch');
    await until(t, () => find.byType(HallMenu).evaluate().isNotEmpty);
    await _tap(t, and: () => find.byType(HallMenu, skipOffstage: false).evaluate().isEmpty);
    await _home(t);
    await drain(t);
  });

  testWidgets('a dish sheet open over a hall: the sheet closes and the hall is popped', (t) async {
    await openHall(t, await bootRecorded(t), '/hall/berkshire?meal=lunch');
    await t.tap(find.byType(DishRow).first, warnIfMissed: false);
    await sheetUp(t);
    await _tap(t, and: () => find.byType(DishSheet).evaluate().isEmpty && find.byType(HallMenu, skipOffstage: false).evaluate().isEmpty);
    await _home(t);
    await drain(t);
  });

  testWidgets('two stacked sheets: both close', (t) async {
    await openHall(t, await bootRecorded(t), '/hall/berkshire?meal=lunch');
    await t.tap(find.byType(DishRow).first, warnIfMissed: false);
    await sheetUp(t);
    t.state<ShellState>(find.byType(Shell)).pushSheet(_stub);
    await t.pumpAndSettle();
    expect(find.byKey(const Key('stub')), findsOneWidget);
    await _tap(t, and: () => find.byType(DishSheet).evaluate().isEmpty && find.byKey(const Key('stub')).evaluate().isEmpty && find.byType(HallMenu, skipOffstage: false).evaluate().isEmpty);
    await _home(t);
    expect(find.byKey(const Key('stub')), findsNothing);
    await drain(t);
  });

  testWidgets('first run present: it stays over Halls home (onboarding is not ours to close)', (t) async {
    final b = await bootRecorded(t, firstRun: true);
    await openApp(t, b, route: '/halls?data=recorded&firstRun=1');
    await until(t, () => find.byType(FirstRunSheet).evaluate().isNotEmpty);
    await t.pumpAndSettle();
    await _tap(t);
    await _home(t);
    expect(find.byType(FirstRunSheet), findsOneWidget);
    await drain(t);
  });

  testWidgets('killed: a tap that launched the app (held before it listened) lands on Halls home, taken once', (t) async {
    debugTapForTest(_route);
    final b = await bootRecorded(t);
    await openApp(t, b, route: '/');
    await _home(t);
    expect(takeHeldTap(), isNull, reason: 'taken once');
    await drain(t);
  });
}
