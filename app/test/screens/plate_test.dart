// The plate bar, its sheet, Log and Undo as a user meets them (flutter-port-dish-and-plate Task 2). The store-level guarantees are in
// test/shell/plate_log_test.dart.
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/boot.dart';
import 'package:udine/data/recorded/flags.dart' show NetMode;
import 'package:udine/screens/halls/halls_screen.dart';
import 'package:udine/core/m2/board.dart' show dishKey, servingOn;
import 'package:udine/core/types.dart';
import 'package:udine/screens/dish/dish_sheet.dart';
import 'package:udine/screens/dish/full_label.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/screens/plate/plate_row.dart';
import 'package:udine/theme/tokens.dart';
import 'package:udine/ui/ui.dart';
import '../core/m2/support.dart' as fx;
import '../fonts.dart';
import 'dish_support.dart';
import 'plate_support.dart';
import 'support.dart';

/// Search's field holds focus and its cursor never stops blinking, so pumpAndSettle can't settle there: pump the motion out and let its real I/O land.
Future<void> settleSearch(WidgetTester t) async {
  for (var i = 0; i < 12; i++) {
    await t.pump(const Duration(milliseconds: 100));
    await drain(t);
  }
}

void main() {
  setUpAll(loadFonts);

  Future<List<LogEntry>> rows(WidgetTester t, Boot b) async => (await t.runAsync(() => b.store!.allEntries()))!;

  group('the bar', () {
    testWidgets('says the plate, its items, calories and protein, with Log', (t) async {
      final b = await openPlate(t);
      expect(inBar(find.text('Worcester lunch, 3 items')), findsOneWidget);
      expect(inBar(find.text('404')), findsOneWidget);
      expect(inBar(find.text('38.9g')), findsOneWidget);
      expect(inBar(find.text('Log')), findsOneWidget);
      expect(t.getRect(bar).height, M2Layout.barMin);
      await drain(t);
      expect(b.plate.state.plates, hasLength(1));
    });

    testWidgets('sits on the tab bar and leaves the list above it tappable', (t) async {
      final b = await bootRecorded(t);
      await openHall(t, b, '/hall/worcester?meal=lunch');
      final row = find.byType(DishRow).first;
      b.plate.add('lunch', 'Golden BBQ Chicken Thigh', await servings(t, b, 'Golden BBQ Chicken Thigh', ['W']));
      await t.pumpAndSettle();
      expect(t.getBottomLeft(bar).dy, t.getTopLeft(find.byType(M2TabBar)).dy);
      await t.tap(find.descendant(of: row, matching: find.byType(AddButton)).first);
      await t.pumpAndSettle();
      expect(b.plate.state.plates.single.items, hasLength(2));
      await drain(t);
    });

    testWidgets('is not there with an empty plate, or when a newer build owns the database', (t) async {
      final b = await openPlate(t, route: '/halls');
      expect(bar, findsNothing);
      await drain(t);
      final none = Boot(b.repo, null, b.prefs);
      none.plate.add('lunch', 'Golden BBQ Chicken Thigh', await servings(t, b, 'Golden BBQ Chicken Thigh', ['W']));
      await openPlate(t, route: '/halls', boot: none);
      expect(bar, findsNothing);
      await drain(t);
    });
  });

  group('the sheet', () {
    testWidgets('a tap on the bar opens it to its mid detent, and a fling takes it to the top, where it stops', (t) async {
      final b = await openPlate(t);
      final h = plateHandle(t), region = 844 - t.getSize(find.byType(M2TabBar)).height;
      expect(h.px, M2Layout.barMin);
      await t.tap(find.text('Worcester lunch, 3 items'));
      await t.pumpAndSettle();
      final top = 24 + M2Layout.sheetTop;
      expect(h.px, greaterThan(M2Layout.barMin));
      expect(h.px, lessThan(region - top));
      await t.fling(bar, const Offset(0, -500), 2500);
      await t.pumpAndSettle();
      expect(h.px, closeTo(region - top, 0.5));
      expect(find.text('Add something else'), findsOneWidget);
      await drain(t);
      expect(b.plate.state.plates, hasLength(1));
    });

    testWidgets('drawn down past the mid detent it closes into the bar', (t) async {
      await openPlate(t);
      final h = plateHandle(t);
      await t.tap(find.text('Worcester lunch, 3 items'));
      await t.pumpAndSettle();
      await t.fling(bar, const Offset(0, 600), 3000);
      await t.pumpAndSettle();
      expect(h.px, M2Layout.barMin);
      await drain(t);
    });

    testWidgets('lists the plate: a row per item with its stepper, the totals, and the plate\'s actions', (t) async {
      await openPlate(t);
      await t.tap(find.text('Worcester lunch, 3 items'));
      await t.pumpAndSettle();
      expect(find.byType(PlateRow), findsNWidgets(2));
      expect(find.textContaining('218 cal each', findRichText: true), findsOneWidget);
      expect(find.byType(Facts), findsOneWidget);
      for (final s in ['Add something else', 'Full label', 'Clear plate']) {
        expect(find.text(s), findsOneWidget);
      }
      await drain(t);
    });

    testWidgets('the stepper steps a quantity, and the last half closes its row up before the item leaves', (t) async {
      final b = await openPlate(t, route: '/halls');
      b.plate.add('lunch', 'Golden BBQ Chicken Thigh', await servings(t, b, 'Golden BBQ Chicken Thigh', ['W']));
      b.plate.add('lunch', 'Beef Brisket Noodle Bowl', await servings(t, b, 'Beef Brisket Noodle Bowl', ['W']));
      await t.pumpAndSettle();
      await t.tap(find.text('Worcester lunch, 2 items'));
      await t.pumpAndSettle();
      final more = find.descendant(of: find.byType(PlateRow).first, matching: find.bySemanticsLabel('More'));
      await t.tap(more);
      await t.pumpAndSettle();
      expect(b.plate.state.plates.single.items.first.qty, 2);
      final less = find.descendant(of: find.byType(PlateRow).first, matching: find.bySemanticsLabel('Less'));
      await t.tap(less);
      await t.pumpAndSettle();
      await t.tap(less);
      await t.pumpAndSettle();
      expect(b.plate.state.plates.single.items.first.qty, 0.5);
      await t.tap(less);
      await t.pump(); // the item is still on the plate while its row closes up
      expect(b.plate.state.plates.single.items, hasLength(2));
      await t.pump(M2Motion.exit.duration + const Duration(milliseconds: 20));
      expect(b.plate.state.plates.single.items, hasLength(1));
      await drain(t);
    });

    testWidgets('a row opens its dish over the plate', (t) async {
      await openPlate(t);
      await t.tap(find.text('Worcester lunch, 3 items'));
      await t.pumpAndSettle();
      await t.tap(find.descendant(of: find.byType(PlateRow).last, matching: find.text('Golden BBQ Chicken Thigh')));
      await until(t, () => find.byType(DishSheet).evaluate().isNotEmpty);
      await t.pumpAndSettle();
      expect(find.text('Add another'), findsOneWidget);
      t.widget<DishSheet>(find.byType(DishSheet)).handle.close();
      await t.pumpAndSettle();
      await drain(t);
    });

    testWidgets('Android back puts an open sheet into the bar and moves nothing else', (t) async {
      await openPlate(t);
      await t.tap(inBar(find.textContaining(RegExp(r'items?$'))));
      await t.pumpAndSettle();
      expect(plateHandle(t).px, greaterThan(M2Layout.barMin));
      await t.binding.handlePopRoute();
      await t.pumpAndSettle();
      expect(plateHandle(t).px, M2Layout.barMin);
      expect(find.byType(HallsScreen), findsOneWidget);
      await drain(t);
    });

    testWidgets('a dish opened from the plate says where it is served as it does from its hall, and a tap there leaves both sheets for that hall', (t) async {
      final b = await bootRecorded(t);
      await openHall(t, b, dishRoute('Beef Brisket Noodle Bowl'));
      await sheetUp(t);
      List<String> chips() => [for (final c in t.widgetList<HallChip>(find.descendant(of: find.byType(DishSheet), matching: find.byType(HallChip)))) c.name];
      final fromHall = chips();
      expect(fromHall, contains('Berkshire'));
      t.widget<DishSheet>(find.byType(DishSheet)).handle.close();
      await t.pumpAndSettle();
      b.plate.add('lunch', 'Beef Brisket Noodle Bowl', await servings(t, b, 'Beef Brisket Noodle Bowl', ['W', 'B']));
      await t.pumpAndSettle();
      await t.tap(inBar(find.textContaining(RegExp(r'items?$'))));
      await t.pumpAndSettle();
      await t.tap(find.descendant(of: find.byType(PlateRow), matching: find.text('Beef Brisket Noodle Bowl')));
      await sheetUp(t);
      expect(chips(), fromHall);
      await tapChip(t, 'Berkshire');
      expect(find.byType(DishSheet), findsNothing);
      expect(plateHandle(t).px, M2Layout.barMin);
      expect(top(t).place, 'B');
      await drain(t);
    });

    testWidgets('Full label opens the plate\'s label; Clear plate empties the plate and the bar leaves; Add something else goes to Search', (t) async {
      final b = await openPlate(t);
      await t.tap(find.text('Worcester lunch, 3 items'));
      await t.pumpAndSettle();
      await t.tap(find.text('Full label'));
      await t.pumpAndSettle();
      expect(find.byType(PlateLabelSheet), findsOneWidget);
      t.widget<PlateLabelSheet>(find.byType(PlateLabelSheet)).handle.close();
      await t.pumpAndSettle();
      await t.tap(find.text('Add something else'));
      await t.pump();
      await settleSearch(t);
      expect(t.widget<M2TabBar>(find.byType(M2TabBar)).selected, 1);
      expect(plateHandle(t).px, M2Layout.barMin);
      await t.tap(find.text('Worcester lunch, 3 items'));
      await settleSearch(t);
      await t.tap(find.text('Clear plate'));
      await settleSearch(t);
      expect(b.plate.state.plates, isEmpty);
      expect(bar, findsNothing);
    });
  });

  group('plates', () {
    Future<Boot> two(WidgetTester t, {double w = 390}) async {
      final b = await openPlate(t, w: w);
      b.plate.add('dinner', 'Golden BBQ Chicken Thigh', await servings(t, b, 'Golden BBQ Chicken Thigh', ['W']));
      await t.pumpAndSettle();
      return b;
    }

    testWidgets('a second place set is a second plate: dots on the bar, tabs on the sheet', (t) async {
      final b = await two(t);
      expect(b.plate.state.plates, hasLength(2));
      expect(b.plate.state.front, 1);
      expect(inBar(find.text('Worcester dinner, 1 item')), findsOneWidget);
      await t.tap(find.text('Worcester dinner, 1 item'));
      await t.pumpAndSettle();
      expect(find.text('Worcester lunch'), findsOneWidget);
      await t.tap(find.text('Worcester lunch'));
      await t.pumpAndSettle();
      expect(b.plate.state.front, 0);
      expect(inBar(find.text('Worcester lunch, 3 items')), findsOneWidget);
      await drain(t);
    });

    testWidgets('swiping the bar sideways steps through the plates', (t) async {
      final b = await two(t);
      await t.drag(bar, const Offset(-200, 0));
      await t.pumpAndSettle();
      expect(b.plate.state.front, 0);
      await t.drag(bar, const Offset(200, 0));
      await t.pumpAndSettle();
      expect(b.plate.state.front, 1);
      await drain(t);
    });

    testWidgets('with one plate a swipe only stretches the bar and it comes back', (t) async {
      final b = await openPlate(t);
      await t.drag(bar, const Offset(-200, 0));
      await t.pumpAndSettle();
      expect(b.plate.state.front, 0);
      expect(t.getRect(bar).left, 0);
      await drain(t);
    });
  });

  group('Log and Undo', () {
    testWidgets('Log writes the plate, the receipt says where and what the day holds, Undo puts the plate back', (t) async {
      final b = await openPlate(t);
      await t.tap(inBar(find.text('Log')));
      await t.pump();
      await logged(t, b);
      expect(b.plate.state.plates, isEmpty);
      expect(inBar(find.text('Logged Worcester lunch')), findsOneWidget);
      expect(inBar(find.text('404')), findsOneWidget);
      expect(inBar(find.text('Undo')), findsOneWidget);
      expect((await rows(t, b)).fold<num>(0, (a, e) => a + e.nutrition.calories * e.servings), 404);
      await t.tap(inBar(find.text('Undo')));
      await until(t, () => b.plate.receipt == null);
      await t.pumpAndSettle();
      expect(b.plate.state.plates, hasLength(1));
      expect(await rows(t, b), isEmpty);
      expect(inBar(find.text('Worcester lunch, 3 items')), findsOneWidget);
      await finish(t);
    });

    testWidgets('a double tap on Log writes once', (t) async {
      final b = await openPlate(t);
      await t.tap(inBar(find.text('Log')));
      await t.tap(inBar(find.text('Log')), warnIfMissed: false);
      await logged(t, b);
      expect(await rows(t, b), hasLength(2));
      await finish(t);
    });

    testWidgets('the receipt times out: the bar leaves, and Undo is gone with it', (t) async {
      final b = await openPlate(t);
      await t.tap(inBar(find.text('Log')));
      await logged(t, b);
      await t.pump(Duration(milliseconds: M2Motion.receiptD + 50));
      await t.pumpAndSettle();
      expect(b.plate.receipt, isNull);
      expect(find.text('Undo'), findsNothing);
      expect(bar, findsNothing);
      expect(await rows(t, b), hasLength(2));
      await finish(t);
    });

    testWidgets('Log closes an open sheet into the bar', (t) async {
      final b = await openPlate(t);
      await t.tap(find.text('Worcester lunch, 3 items'));
      await t.pumpAndSettle();
      await t.tap(inBar(find.text('Log')));
      await logged(t, b);
      expect(plateHandle(t).px, M2Layout.barMin);
      await finish(t);
    });

    testWidgets('a plate that can be logged at two places asks first; the bar says Log at, and the choice is the place written', (t) async {
      final b = await openPlate(t, route: '/halls');
      b.plate.add('lunch', 'Beef Brisket Noodle Bowl', await servings(t, b, 'Beef Brisket Noodle Bowl', ['W', 'B']));
      await t.pumpAndSettle();
      await t.tap(inBar(find.text('Log')));
      await t.pumpAndSettle();
      expect(inBar(find.text('Log at')), findsOneWidget);
      expect(inBar(find.text('Worcester')), findsOneWidget);
      await t.tap(inBar(find.text('Log at')));
      await t.pumpAndSettle();
      expect(inBar(find.text('Log')), findsOneWidget);
      await t.tap(inBar(find.text('Log')));
      await t.pumpAndSettle();
      await t.tap(inBar(find.text('Berkshire')));
      await logged(t, b);
      expect(inBar(find.text('Logged Berkshire lunch')), findsOneWidget);
      final e = (await rows(t, b)).single;
      expect([(e.source as UmassMenuSource).hallTid, e.nutrition.calories], [4, 220]);
      await finish(t);
    });

    testWidgets('logs with no network: the plate never needed it', (t) async {
      final b = await bootRecorded(t, net: NetMode.offline);
      for (final n in ['Beef Brisket Noodle Bowl', 'Golden BBQ Chicken Thigh']) {
        b.plate.add('lunch', n, {'W': servingOn(fx.board, fx.today, 'W', 'lunch', dishKey(n))!});
      }
      await openApp(t, b, route: '/halls');
      await until(t, () => bar.evaluate().isNotEmpty);
      await t.pumpAndSettle();
      await t.tap(inBar(find.text('Log')));
      await logged(t, b);
      expect(inBar(find.text('Undo')), findsOneWidget);
      expect(await rows(t, b), hasLength(2));
      await finish(t);
    });

    testWidgets('Log buzzes as M2 does: a light pulse, then a firmer one 72 ms later', (t) async {
      final calls = <String>[];
      t.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (c) async {
        if (c.method == 'HapticFeedback.vibrate') calls.add(c.arguments as String);
        return null;
      });
      addTearDown(() => t.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
      final b = await openPlate(t);
      calls.clear();
      await t.tap(inBar(find.text('Log')));
      await logged(t, b);
      await t.pump(const Duration(milliseconds: 200));
      expect(calls.where((c) => c.contains('Impact')).toList(), ['HapticFeedbackType.lightImpact', 'HapticFeedbackType.mediumImpact']);
      await finish(t);
    });

    testWidgets('nothing flies to the You tab on Log (M2 round 2 cut the toss)', (t) async {
      final b = await openPlate(t);
      await t.tap(inBar(find.text('Log')));
      await until(t, () => b.plate.receipt != null);
      await t.pump(const Duration(milliseconds: 50));
      expect(find.text('+404'), findsNothing);
      await finish(t);
    });

    testWidgets('a failed Log says so in the bar, keeps the plate, and Try again logs it', (t) async {
      final b = await openPlate(t);
      await t.runAsync(() => b.store!.db.execute("CREATE TRIGGER boom BEFORE INSERT ON log_entries BEGIN SELECT RAISE(ABORT, 'no'); END"));
      await t.tap(inBar(find.text('Log')));
      await until(t, () => b.plate.failure != null);
      await t.pumpAndSettle();
      expect(inBar(find.text("Couldn't save this meal.")), findsOneWidget);
      expect(b.plate.state.plates, hasLength(1));
      expect(await rows(t, b), isEmpty);
      await t.runAsync(() => b.store!.db.execute('DROP TRIGGER boom'));
      await t.tap(inBar(find.text('Try again')));
      await logged(t, b);
      expect(b.plate.failure, isNull);
      expect(inBar(find.text('Logged Worcester lunch')), findsOneWidget);
      expect(await rows(t, b), hasLength(2));
      await finish(t);
    });

    testWidgets('a failed Undo says so, keeps the rows, and Try again undoes', (t) async {
      final b = await openPlate(t);
      await t.tap(inBar(find.text('Log')));
      await logged(t, b);
      await t.runAsync(() => b.store!.db.execute("CREATE TRIGGER boom BEFORE DELETE ON log_entries BEGIN SELECT RAISE(ABORT, 'no'); END"));
      await t.tap(inBar(find.text('Undo')));
      await until(t, () => b.plate.failure != null);
      await t.pumpAndSettle();
      expect(inBar(find.text("Couldn't undo.")), findsOneWidget);
      expect(await rows(t, b), hasLength(2));
      await t.runAsync(() => b.store!.db.execute('DROP TRIGGER boom'));
      await t.tap(inBar(find.text('Try again')));
      await until(t, () => b.plate.receipt == null);
      await t.pumpAndSettle();
      expect(await rows(t, b), isEmpty);
      expect(b.plate.state.plates, hasLength(1));
      await finish(t);
    });
  });
}
