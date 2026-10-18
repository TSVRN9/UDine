// The dish sheet over a hall menu (recorded data, M2's fixed clock): opening it from a row, the favourite star, Add to plate, and
// "where it's served" going to another place, another day, or scrolling the list that is already showing.
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/m2/board.dart' show MenuItem;
import 'package:udine/screens/dish/dish_sheet.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/theme/tokens.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'dish_support.dart';
import 'support.dart';

const base = '/hall/worcester?meal=lunch';

Future<void> tapRow(WidgetTester t, int i) async {
  await t.tap(find.byType(DishRow).at(i), warnIfMissed: false);
  await t.pump();
  await sheetUp(t); // (the where answer's requests end before the test does)
}

void main() {
  whereTiming();
  setUpAll(loadFonts);

  testWidgets('a row tap opens the dish sheet over the list, which stays where it was', (t) async {
    await openHall(t, await bootRecorded(t), base);
    final first = t.widget<DishRow>(find.byType(DishRow).first).dish;
    await tapRow(t, 0);
    expect(find.byType(DishSheet), findsOneWidget);
    expect(find.descendant(of: find.byType(DishSheet), matching: find.text(first.dishName)), findsOneWidget);
    expect(find.byType(DishRow), findsWidgets);
    await drain(t);
  });

  testWidgets('the favourite star fills, shows a star after the name in the list, and is saved on the device; again takes it off', (t) async {
    final boot = await bootRecorded(t);
    await openHall(t, boot, base);
    final name = t.widget<DishRow>(find.byType(DishRow).first).dish.dishName;
    await tapRow(t, 0);
    expect(find.byType(StarMark), findsNothing);
    await t.tap(find.byType(FavoriteStar));
    await t.pumpAndSettle();
    expect(find.byType(StarMark), findsOneWidget);
    expect(boot.prefs.isFavorite(name), isTrue);
    await drain(t); // the write is several steps on the database's isolate
    expect([for (final f in (await t.runAsync(boot.store!.favorites))!) f.key], ['dish:$name']);
    await t.tap(find.byType(FavoriteStar));
    await t.pumpAndSettle();
    expect(find.byType(StarMark), findsNothing);
    await drain(t);
    expect(await t.runAsync(boot.store!.favorites), isEmpty);
    await drain(t);
  });

  testWidgets('the favourite star takes a tap anywhere in its 48 x 48 dp box, its glyph where M2 draws it', (t) async {
    final boot = await bootRecorded(t);
    await openHall(t, boot, base);
    final name = t.widget<DishRow>(find.byType(DishRow).first).dish.dishName;
    await tapRow(t, 0);
    final box = t.getRect(find.descendant(of: find.byType(FavoriteStar), matching: find.byType(Press)));
    expect((box.width, box.height), (48.0, 48.0));
    for (final p in [box.topLeft + const Offset(2, 2), box.topRight + const Offset(-2, 2), box.bottomLeft + const Offset(2, -2), box.bottomRight + const Offset(-2, -2)]) {
      await t.tapAt(p);
      await t.pumpAndSettle();
      expect(boot.prefs.isFavorite(name), isTrue, reason: 'a tap at $p of $box');
      await t.tapAt(box.center);
      await t.pumpAndSettle();
      expect(boot.prefs.isFavorite(name), isFalse);
    }
    await drain(t);
  });

  testWidgets('Add to plate puts the dish on the plate and puts the sheet away; reopened, the button says Add another', (t) async {
    final boot = await bootRecorded(t);
    await openHall(t, boot, base);
    final d = t.widget<DishRow>(find.byType(DishRow).first).dish;
    await tapRow(t, 0);
    await t.tap(find.text('Add to plate'));
    await t.pumpAndSettle();
    expect(find.byType(DishSheet), findsNothing);
    final plate = boot.plate.state.plates.single;
    expect((plate.meal, plate.items.single.name, plate.items.single.qty), ('lunch', d.dishName, 1));
    await tapRow(t, 0);
    expect(find.text('Add another'), findsOneWidget);
    await t.tap(find.text('Add another'));
    await t.pumpAndSettle();
    expect(boot.plate.state.plates.single.items.single.qty, 2);
    await drain(t);
  });

  testWidgets('another day\'s dish has no Add (the plate is today\'s)', (t) async {
    await openHall(t, await bootRecorded(t), '$base&day=2026-10-09');
    await tapRow(t, 0);
    expect(find.byType(DishSheet), findsOneWidget);
    expect(find.text('Add to plate'), findsNothing);
    await drain(t);
  });

  testWidgets('dragging the sheet down puts it away', (t) async {
    await openHall(t, await bootRecorded(t), base);
    await tapRow(t, 0);
    await t.flingFrom(const Offset(195, 600), const Offset(0, 500), 1800);
    await t.pumpAndSettle();
    expect(find.byType(DishSheet), findsNothing);
    await drain(t);
  });

  testWidgets('Show all opens the ingredients and Show less closes them', (t) async {
    await openHall(t, await bootRecorded(t), dishRoute('Golden BBQ Chicken Thigh'));
    await sheetUp(t);
    await t.flingFrom(const Offset(195, 600), const Offset(0, -600), 1800); // up to the top detent, then down the sheet's own scroll
    await t.pumpAndSettle();
    await t.ensureVisible(find.text('Show all'));
    await t.pumpAndSettle();
    await t.tap(find.text('Show all'));
    await t.pumpAndSettle();
    expect(find.text('Show less'), findsOneWidget);
    await t.ensureVisible(find.text('Show less'));
    await t.pumpAndSettle();
    await t.tap(find.text('Show less'));
    await t.pumpAndSettle();
    expect(find.text('Show all'), findsOneWidget);
    await drain(t);
  });

  testWidgets('an avoided allergen is bold in Contains; the others are not', (t) async {
    final boot = await bootRecorded(t);
    await openHall(t, boot, base);
    final d = (await lunchDishes(t, boot, 1, '2026-10-08')).firstWhere((d) => d.allergens.isNotEmpty);
    openDishSheet(t.element(find.byType(HallMenu)), dish: d, place: 'W', meal: 'lunch', day: 0, fx: (t.state(find.byType(HallMenu)) as HallMenuState).fx, avoid: [d.allergens.first], onServe: (_, _) {});
    await t.pumpAndSettle();
    final contains = t.widget<RichText>(find.byWidgetPredicate((w) => w is RichText && w.text.toPlainText().startsWith('Contains'))).text;
    final spans = <TextSpan>[];
    contains.visitChildren((s) {
      if (s is TextSpan && d.allergens.contains(s.text)) spans.add(s);
      return true;
    });
    expect(spans.first.style?.color, M2Color.vm);
    for (final s in spans.skip(1)) {
      expect(s.style, isNull);
    }
    await drain(t);
  });
}

void whereTiming() {
  /// The reserved where line's box (the content's nearest ConstrainedBox).
  Rect whereBox(WidgetTester t) => t.getRect(find.ancestor(of: find.byKey(const ValueKey('where-line')), matching: find.byType(ConstrainedBox)).first);

  /// Pumps 16 ms frames until [handle.settled] resolves (at most [frames]); how many it took, or -1.
  Future<int> restIn(WidgetTester t, SheetHandle handle, {int frames = 120}) async {
    var done = false;
    handle.settled.then((_) => done = true);
    for (var i = 0; i < frames; i++) {
      await t.pump(const Duration(milliseconds: 16));
      if (done) return i;
    }
    return -1;
  }

  testWidgets('a Spinner turning beside the sheet (Search\'s lookup) does not hold settled: the where line still loads', (t) async {
    await openHall(t, await bootRecorded(t), base);
    final entry = OverlayEntry(builder: (_) => const Positioned(top: 100, left: 100, child: Spinner()));
    Overlay.of(t.element(find.byType(HallMenu))).insert(entry);
    for (var i = 0; i < 40; i++) {
      await t.pump(const Duration(milliseconds: 16)); // (the spinner is in and turning before the sheet opens)
    }
    await t.tap(find.byType(DishRow).first, warnIfMissed: false);
    await t.pump(const Duration(milliseconds: 16));
    final handle = t.widget<DishSheet>(find.byType(DishSheet)).handle;
    expect(await restIn(t, handle), greaterThan(0), reason: 'settled resolved although a ticker elsewhere keeps scheduling frames');
    await until(t, () => t.widget<DishSheet>(find.byType(DishSheet)).book.complete, tries: 240); // (pumpAndSettle never settles beside a spinner)
    expect(find.byType(HallChip), findsWidgets, reason: 'the where line loaded');
    entry.remove();
    await t.pump();
    await drain(t);
  });

  testWidgets('a sheet put away before it rests releases settled', (t) async {
    await openHall(t, await bootRecorded(t), base);
    await t.tap(find.byType(DishRow).first, warnIfMissed: false);
    await t.pump(const Duration(milliseconds: 16));
    final handle = t.widget<DishSheet>(find.byType(DishSheet)).handle;
    var done = false;
    handle.settled.then((_) => done = true);
    for (var i = 0; i < 5; i++) {
      await t.pump(const Duration(milliseconds: 16));
    }
    expect(done, isFalse);
    handle.close();
    await until(t, () => find.byType(DishSheet).evaluate().isEmpty);
    expect(done, isTrue, reason: 'the sheet is gone: nothing is moving');
    await drain(t);
  });

  testWidgets('under reduced motion the sheet is at rest at once and settled resolves within a frame', (t) async {
    await openHall(t, await bootRecorded(t), base, reduced: true);
    await t.tap(find.byType(DishRow).first, warnIfMissed: false);
    await t.pump(const Duration(milliseconds: 16));
    final handle = t.widget<DishSheet>(find.byType(DishSheet)).handle;
    expect(await restIn(t, handle, frames: 3), inInclusiveRange(0, 1));
    await sheetUp(t);
    await drain(t);
  });

  testWidgets('one where line is reserved at open: the resting height does not change when the halls land, nor when the cafés do', (t) async {
    await openHall(t, await bootRecorded(t), dishRoute('Golden BBQ Chicken Thigh'));
    await until(t, () => find.byType(DishSheet).evaluate().isNotEmpty);
    final sheet = t.widget<DishSheet>(find.byType(DishSheet));
    expect(await restIn(t, sheet.handle), greaterThanOrEqualTo(0));
    final reserved = sheet.handle.px;
    expect(sheet.book.board, isNull, reason: 'at rest before any answer');
    await until(t, () => sheet.book.board != null);
    await t.pump(const Duration(milliseconds: 16));
    expect(find.byType(HallChip), findsWidgets);
    expect(sheet.handle.px, closeTo(reserved, 0.5), reason: 'the halls filled the reserved line in place');
    await until(t, () => sheet.book.complete);
    for (var i = 0; i < 40; i++) {
      await t.pump(const Duration(milliseconds: 16));
    }
    expect(sheet.handle.px, closeTo(reserved, 0.5), reason: 'the cafés did not move it either');
    expect(whereBox(t).height, closeTo(M2Layout.whereLine, 0.5), reason: 'one group is exactly the reserved line');
    await drain(t);
  });

  testWidgets('a sheet opened with the answer already known rests where the cold one did', (t) async {
    final boot = await bootRecorded(t);
    await openHall(t, boot, dishRoute('Golden BBQ Chicken Thigh'));
    await sheetUp(t);
    final cold = t.widget<DishSheet>(find.byType(DishSheet));
    final coldRest = cold.handle.px;
    cold.handle.close();
    await until(t, () => find.byType(DishSheet).evaluate().isEmpty);
    final d = (await lunchDishes(t, boot, 1, '2026-10-08')).firstWhere((d) => d.dishName == 'Golden BBQ Chicken Thigh');
    openDishSheet(t.element(find.byType(HallMenu)), dish: d, place: 'W', meal: 'lunch', day: 0, fx: (t.state(find.byType(HallMenu)) as HallMenuState).fx, onServe: (_, _) {});
    await t.pump();
    await sheetUp(t);
    final warm = t.widget<DishSheet>(find.byType(DishSheet));
    expect(warm.handle.px, closeTo(coldRest, 0.5));
    await drain(t);
  });

  testWidgets('a dish served nowhere again fills the reserved line with "Not on the menu again today or tomorrow"', (t) async {
    final boot = await bootRecorded(t);
    await openHall(t, boot, base);
    final d = (await lunchDishes(t, boot, 1, '2026-10-08')).first;
    final nowhere = MenuItem(dishName: 'Nothing Served Here', category: d.category, mealPeriod: d.mealPeriod, hallTid: d.hallTid, date: d.date, nutrition: d.nutrition, allergens: d.allergens, dietTags: d.dietTags, ingredients: d.ingredients, price: d.price);
    openDishSheet(t.element(find.byType(HallMenu)), dish: nowhere, place: 'W', meal: 'lunch', day: 0, fx: (t.state(find.byType(HallMenu)) as HallMenuState).fx, onServe: (_, _) {});
    await t.pump();
    final sheet = t.widget<DishSheet>(find.byType(DishSheet));
    expect(await restIn(t, sheet.handle), greaterThan(0));
    final reserved = sheet.handle.px;
    await sheetUp(t);
    expect(find.text('Not on the menu again today or tomorrow'), findsOneWidget);
    expect(whereBox(t).height, closeTo(M2Layout.whereLine, 0.5));
    expect(sheet.handle.px, closeTo(reserved, 0.5));
    await drain(t);
  });

  testWidgets('the sheet slides in before "where it is served" starts: WhereBook is not started in its first 400 ms', (t) async {
    await openHall(t, await bootRecorded(t), base);
    await t.tap(find.byType(DishRow).first, warnIfMissed: false);
    for (var i = 0; i < 25; i++) {
      await t.pump(const Duration(milliseconds: 16)); // 400 ms of the slide
    }
    final book = t.widget<DishSheet>(find.byType(DishSheet)).book;
    expect(book.started, isFalse, reason: 'every hall and café menu is prefetched on the UI isolate while the sheet is still sliding in');
    await sheetUp(t); // it does start once the sheet has settled
    expect(book.started, isTrue);
    await drain(t);
  });

  testWidgets('SheetHandle.settled resolves only once the sheet has stopped moving', (t) async {
    await openHall(t, await bootRecorded(t), base);
    await t.tap(find.byType(DishRow).first, warnIfMissed: false);
    await t.pump(const Duration(milliseconds: 16));
    final sheet = t.widget<DishSheet>(find.byType(DishSheet));
    var done = false;
    sheet.handle.settled.then((_) => done = true);
    var last = sheet.handle.px, moving = 0, restAt = -1;
    for (var i = 0; i < 120 && restAt < 0; i++) {
      await t.pump(const Duration(milliseconds: 16));
      final px = sheet.handle.px;
      if ((px - last).abs() > 0.5) {
        moving++;
        expect(done, isFalse, reason: 'frame $i: settled resolved while the sheet was still moving');
      } else if (done) {
        restAt = i;
      }
      last = px;
    }
    expect(moving, greaterThan(5), reason: 'the sheet slid in over several frames');
    expect(restAt, greaterThan(0), reason: 'settled resolved once the sheet rested');
    await sheetUp(t); // (the where timer and both loads run out before the tree goes)
    await drain(t);
  });
}
