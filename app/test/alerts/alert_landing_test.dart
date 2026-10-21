// A tap on a favourite's notification: the app comes to the Halls home screen (the tab root) with that dish's sheet open over it, from killed,
// backgrounded and foreground. Every other sheet closes first except an undismissed first run; no hall is pushed; the Shell is never rebuilt.
// The taps come through a fake FCM client (PushSync), as the device delivers them.
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/alerts/alerts.dart';
import 'package:udine/alerts/push.dart';
import 'package:udine/boot.dart';
import 'package:udine/core/m2/where.dart' show notServed;
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
import 'fake_messaging.dart';

const _dish = 'Pork Adobada (Chicken)', _unserved = 'Grandma’s Imaginary Pie';

PushNotice _push(String dish) => PushNotice(title: dish, body: 'Lunch, at Worcester', tag: 'dish-x-2026-10-08');

/// Halls home with the dish's sheet over it and nothing pushed: no hall page anywhere in the tree, the Halls tab the one on screen.
Future<void> _home(WidgetTester t, {String? sheetOf = _dish}) async {
  if (sheetOf != null) await sheetUp(t);
  await t.pumpAndSettle();
  expect(find.byType(HallMenu, skipOffstage: false), findsNothing, reason: 'no hall is pushed');
  expect(find.byType(HallsScreen), findsOneWidget);
  expect(find.byType(YouScreen), findsNothing);
  if (sheetOf == null) {
    expect(find.byType(HallsScreen).hitTestable(), findsOneWidget);
    expect(find.byType(DishSheet), findsNothing);
  } else {
    expect(find.byType(DishSheet), findsOneWidget, reason: 'the one sheet is the dish\'s');
    expect(t.widget<DishSheet>(find.byType(DishSheet)).dish.dishName, sheetOf);
  }
}

/// Delivers [dish]'s tap the way `source` does, and waits for its sheet (or, with none expected, for the sheets to go).
Future<void> _tap(WidgetTester t, Boot b, String source, {String dish = _dish, bool Function()? and}) async {
  final m = FakeMessaging();
  final p = PushSync(b.store!, m, show: (n) async => debugResponseForTest(n.title));
  switch (source) {
    case 'opened':
      await t.runAsync(() => p.sync(on: true));
      m.opened.add(_push(dish));
    case 'foreground':
      await t.runAsync(() => p.sync(on: true));
      m.foreground.add(_push(dish));
  }
  await t.pump();
  await until(t, () => and?.call() ?? find.byType(DishSheet).evaluate().isNotEmpty);
}

Widget _stub(SheetHandle handle, VoidCallback done) => M2Sheet(handle: handle, top: 20, onClosed: done, slivers: const [SliverToBoxAdapter(child: SizedBox(key: Key('stub'), height: 100))]);

void main() {
  setUpAll(loadFonts);
  setUp(takeHeldTap); // (a tap one test leaves held is not the next test's launch)

  testWidgets('backgrounded on You: Halls home with the dish sheet, the same Shell', (t) async {
    final b = await bootYou(t);
    await openYou(t, b);
    final shell = t.state<ShellState>(find.byType(Shell));
    await _tap(t, b, 'opened');
    await _home(t);
    expect(identical(t.state<ShellState>(find.byType(Shell)), shell), isTrue, reason: 'the Shell is not rebuilt');
    await drain(t);
  });

  testWidgets('the sheet is the one a tap on the dish in its hall opens: that hall, its meal, today', (t) async {
    final b = await bootRecorded(t);
    await openApp(t, b, route: '/halls');
    await _tap(t, b, 'opened');
    await sheetUp(t);
    final s = t.widget<DishSheet>(find.byType(DishSheet));
    expect((s.place, s.meal, s.day), ('W', 'lunch', 0));
    expect(s.dish.nutrition.blank, isEmpty, reason: 'the menu\'s own record, not a bare one');
    await drain(t);
  });

  testWidgets('a hall open: popped to Halls home, the sheet over it', (t) async {
    final b = await bootRecorded(t);
    await openApp(t, b, route: '/hall/berkshire?meal=lunch');
    await until(t, () => find.byType(HallMenu).evaluate().isNotEmpty);
    await _tap(t, b, 'opened', and: () => find.byType(HallMenu, skipOffstage: false).evaluate().isEmpty && find.byType(DishSheet).evaluate().isNotEmpty);
    await _home(t);
    await drain(t);
  });

  testWidgets('foreground with another dish\'s sheet open over a hall: that sheet closes, the hall is popped, this dish opens', (t) async {
    final b = await bootRecorded(t);
    await openHall(t, b, '/hall/berkshire?meal=lunch');
    await t.tap(find.byType(DishRow).first, warnIfMissed: false);
    await sheetUp(t);
    final first = t.widget<DishSheet>(find.byType(DishSheet)).dish.dishName;
    expect(first, isNot(_dish));
    await _tap(t, b, 'foreground', and: () => find.byType(DishSheet).evaluate().length == 1 && t.widget<DishSheet>(find.byType(DishSheet)).dish.dishName == _dish && find.byType(HallMenu, skipOffstage: false).evaluate().isEmpty);
    await _home(t);
    await drain(t);
  });

  testWidgets('foreground with two stacked sheets open: both close, then the dish opens', (t) async {
    final b = await bootRecorded(t);
    await openHall(t, b, '/hall/berkshire?meal=lunch');
    await t.tap(find.byType(DishRow).first, warnIfMissed: false);
    await sheetUp(t);
    t.state<ShellState>(find.byType(Shell)).pushSheet(_stub);
    await t.pumpAndSettle();
    expect(find.byKey(const Key('stub')), findsOneWidget);
    await _tap(t, b, 'foreground', and: () => find.byKey(const Key('stub')).evaluate().isEmpty && find.byType(DishSheet).evaluate().length == 1 && t.widget<DishSheet>(find.byType(DishSheet)).dish.dishName == _dish);
    await _home(t);
    await drain(t);
  });

  testWidgets('first run present: it stays over Halls home (onboarding is not ours to close), and the dish opens above it', (t) async {
    final b = await bootRecorded(t, firstRun: true);
    await openApp(t, b, route: '/halls?data=recorded&firstRun=1');
    await until(t, () => find.byType(FirstRunSheet).evaluate().isNotEmpty);
    await t.pumpAndSettle();
    await _tap(t, b, 'opened');
    await _home(t);
    expect(find.byType(FirstRunSheet), findsOneWidget);
    await drain(t);
  });

  testWidgets('killed: the message that launched the app (held before the Shell listened) lands on Halls home with the dish, taken once', (t) async {
    final b = await bootRecorded(t);
    final m = FakeMessaging()..initial = _push(_dish);
    await t.runAsync(() => PushSync(b.store!, m).sync(on: true));
    await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 20)));
    await openApp(t, b, route: '/');
    await until(t, () => find.byType(DishSheet).evaluate().isNotEmpty);
    await _home(t);
    expect(takeHeldTap(), isNull, reason: 'taken once');
    await drain(t);
  });

  testWidgets('a dish not served today still opens its sheet, whose where line says so', (t) async {
    final b = await bootRecorded(t);
    await openApp(t, b, route: '/halls');
    await _tap(t, b, 'opened', dish: _unserved);
    await _home(t, sheetOf: _unserved);
    expect(find.text(notServed), findsOneWidget);
    await drain(t);
  });

  testWidgets('an old payload with no dish (an empty title) lands on Halls home alone', (t) async {
    final b = await bootYou(t);
    await openYou(t, b);
    await _tap(t, b, 'opened', dish: '', and: () => find.byType(HallsScreen).hitTestable().evaluate().isNotEmpty);
    await _home(t, sheetOf: null);
    await drain(t);
  });
}
