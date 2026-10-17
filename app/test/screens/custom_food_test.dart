// One-off custom food (flutter-port-dish-and-plate Task 3): the form sheet, its entry from a menu-less café and from `/custom`, and what
// an invalid or a valid form does. The form's geometry against M2's DOM is `m2_custom_measure_test.dart`.
import 'package:flutter/widgets.dart';
import 'package:udine/ui/ui.dart' show Button;
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/boot.dart';
import 'package:udine/shell/prefs.dart';
import 'package:udine/core/hours.dart' show easternInstant;
import 'package:udine/core/m2/board.dart' show Macro;
import 'package:udine/core/m2/log.dart';
import 'package:udine/core/m2/plate.dart';
import 'package:udine/core/types.dart';
import 'package:udine/screens/plate/custom_food.dart';
import '../fonts.dart';
import 'plate_support.dart';
import 'support.dart';

void main() {
  setUpAll(loadFonts);

  const order = ['Name', 'Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)']; // the form's top-to-bottom order
  Finder field(String label) => find.byType(EditableText).at(order.indexOf(label));
  Future<void> typeIn(WidgetTester t, String label, String text) async {
    await t.enterText(field(label), text);
    await t.pump();
  }

  Future<Boot> openForm(WidgetTester t, {String route = '/custom'}) async {
    final b = await bootRecorded(t);
    await openApp(t, b, route: route);
    await until(t, () => find.byType(CustomFoodSheet).evaluate().isNotEmpty);
    await t.pumpAndSettle();
    return b;
  }

  group('what the form makes of its fields', () {
    test('a name and calories are required; the macros default to 0; a comma is a decimal point', () {
      final r = parseCustomFood(name: ' Chobani ', cal: '140', p: '12,5', c: '', f: '')!;
      expect((r.$1, r.$2.cal, r.$2.p, r.$2.c, r.$2.f), ('Chobani', 140, 12.5, 0, 0));
      expect(parseCustomFood(name: '', cal: '140', p: '', c: '', f: ''), isNull);
      expect(parseCustomFood(name: '  ', cal: '140', p: '', c: '', f: ''), isNull);
      expect(parseCustomFood(name: 'Chobani', cal: '', p: '12', c: '', f: ''), isNull);
      expect(parseCustomFood(name: 'Chobani', cal: '0', p: '', c: '', f: '')?.$2.cal, 0);
    });

    test('a negative calorie or macro is not valid', () {
      expect(parseCustomFood(name: 'Chobani', cal: '-140', p: '', c: '', f: ''), isNull);
      for (final i in [0, 1, 2]) {
        final m = ['', '', ''];
        m[i] = '-1';
        expect(parseCustomFood(name: 'Chobani', cal: '140', p: m[0], c: m[1], f: m[2]), isNull, reason: 'macro $i');
      }
    });
  });

  group('the plate key', () {
    PlateState add(PlateState s, String name, Macro m) => addDish(s, 'lunch', name, {}, m);
    const chobani = Macro(140, 12, 15, 0);

    test('the same name and the same macros are one item, however the numbers were typed', () {
      final s = add(add(emptyPlates, 'Chobani', chobani), 'chobani', const Macro(140.0, 12.0, 15, 0.0));
      expect(s.plates.single.items.single.qty, 2);
    });

    test('the same name with other macros is another item with its own macros and its own customFoodId', () {
      final s = add(add(emptyPlates, 'Chobani', chobani), 'Chobani', const Macro(200, 10, 20, 5));
      final items = s.plates.single.items;
      expect(items, hasLength(2));
      expect(totals(s.plates.single).cal, 340);
      final ids = [for (final e in logEntries(s.plates.single, place: null, loggedAt: 'x')) (e.source as CustomSource).customFoodId];
      expect(ids.toSet(), hasLength(2));
      expect(ids.every((i) => i.startsWith('chobani:')), isTrue);
      expect(logEntries(s.plates.single, place: null, loggedAt: 'x').map((e) => e.nutrition.calories), [140, 200]);
    });

    testWidgets('the four numeric fields ask for a decimal keyboard, Name does not', (t) async {
      await openForm(t);
      expect(t.widget<EditableText>(field('Name')).keyboardType, TextInputType.text);
      for (final l in order.skip(1)) {
        expect(t.widget<EditableText>(field(l)).keyboardType, const TextInputType.numberWithOptions(decimal: true), reason: l);
      }
      await drain(t);
    });
  });

  group('the sheet', () {
    testWidgets('empty: a title, four labelled fields and Add to plate', (t) async {
      await openForm(t);
      expect(find.text('Custom food'), findsOneWidget);
      for (final l in order) {
        expect(find.text(l), findsOneWidget, reason: l);
      }
      expect(find.text('Add to plate'), findsOneWidget);
      await drain(t);
    });

    testWidgets('a name from Search is filled in, and the cursor starts at Calories', (t) async {
      await openForm(t, route: '/custom?name=Chobani');
      expect(find.text('Chobani'), findsOneWidget);
      expect(t.widget<EditableText>(field('Calories')).focusNode.hasFocus, isTrue);
      await drain(t);
    });

    testWidgets('with no name the cursor starts at Name', (t) async {
      await openForm(t);
      expect(t.widget<EditableText>(field('Name')).focusNode.hasFocus, isTrue);
      await drain(t);
    });

    testWidgets('with the keyboard up the focused field and the whole button are above it (and still are when another field is focused)', (t) async {
      await openForm(t, route: '/custom?name=Chobani&cal=140&p=12&c=15&f=0');
      const kb = 480.0; // (a tall keyboard on a short phone: the button's bottom is at about 442)
      t.view.viewInsets = const FakeViewPadding(bottom: kb);
      addTearDown(t.view.resetViewInsets);
      await t.pumpAndSettle();
      final limit = t.view.physicalSize.height - kb;
      expect(t.getBottomLeft(find.byType(Button)).dy, lessThanOrEqualTo(limit));
      t.widget<EditableText>(field('Fat (g)')).focusNode.requestFocus();
      await t.pumpAndSettle();
      expect(t.getBottomLeft(find.byType(Button)).dy, lessThanOrEqualTo(limit));
      expect(t.getBottomLeft(field('Fat (g)')).dy, lessThanOrEqualTo(limit));
      expect(t.getTopLeft(field('Name')).dy, greaterThan(0));
      await drain(t);
    });

    testWidgets('invalid (no name, then no calories): nothing is added and the sheet stays', (t) async {
      final b = await openForm(t);
      await t.tap(find.text('Add to plate'));
      await t.pumpAndSettle();
      await typeIn(t, 'Calories', '140');
      await t.tap(find.text('Add to plate'));
      await t.pumpAndSettle();
      expect(b.plate.state.plates, isEmpty);
      expect(find.byType(CustomFoodSheet), findsOneWidget);
      await typeIn(t, 'Calories', '');
      await typeIn(t, 'Name', 'Chobani');
      await t.tap(find.text('Add to plate'));
      await t.pumpAndSettle();
      expect(b.plate.state.plates, isEmpty);
      expect(find.byType(CustomFoodSheet), findsOneWidget);
      await drain(t);
    });

    testWidgets('valid: the sheet goes down, the plate has the food, and Log writes a custom source with its macros', (t) async {
      final b = await openForm(t, route: '/custom?meal=dinner');
      await typeIn(t, 'Name', 'Chobani');
      await typeIn(t, 'Calories', '140');
      await typeIn(t, 'Protein (g)', '12');
      await typeIn(t, 'Carbs (g)', '15');
      await t.tap(find.text('Add to plate'));
      await t.pumpAndSettle();
      expect(find.byType(CustomFoodSheet), findsNothing);
      await until(t, () => b.plate.state.plates.isNotEmpty); // (kept first, then on the plate)
      final plate = b.plate.state.plates.single;
      expect((plate.meal, plate.items.single.name, plate.items.single.custom?.cal), ('dinner', 'Chobani', 140));
      await t.runAsync(() => b.plate.log());
      final rows = (await t.runAsync(() => b.store!.allEntries()))!;
      final kept = (await t.runAsync(() => b.store!.customFoods()))!.single;
      expect((kept.name, kept.servingSize, kept.nutrition.calories), ('Chobani', '1 serving', 140));
      expect(rows.single.source, isA<CustomSource>().having((s) => s.productName, 'productName', 'Chobani').having((s) => s.customFoodId, 'customFoodId', kept.id));
      expect((rows.single.nutrition.calories, rows.single.nutrition.proteinG, rows.single.nutrition.totalCarbG, rows.single.nutrition.totalFatG), (140, 12, 15, 0));
      await finish(t);
    });
  });

  group('entry points', () {
    testWidgets('a café that lists no menu: Add a custom food opens the form empty, for the meal the clock is in', (t) async {
      final b = await bootRecorded(t, at: easternInstant(DateTime.utc(2026, 10, 8, 19, 0))); // 7 PM: dinner, not the recorded 12:41's lunch
      await openApp(t, b, route: '/cafe/0');
      await until(t, () => find.text('Add a custom food').evaluate().isNotEmpty);
      await t.pump(const Duration(milliseconds: 600));
      await t.tap(find.text('Add a custom food'));
      await t.pumpAndSettle();
      expect(find.byType(CustomFoodSheet), findsOneWidget);
      expect(find.text('Custom food'), findsOneWidget);
      await typeIn(t, 'Name', 'Gelato');
      await typeIn(t, 'Calories', '200');
      await t.tap(find.text('Add to plate'));
      await t.pumpAndSettle();
      await until(t, () => b.plate.state.plates.isNotEmpty);
      expect(b.plate.state.plates.single.meal, 'dinner');
      await drain(t);
    });

    testWidgets('a café page has no Add a custom food when a newer build owns the database (nothing to put it on)', (t) async {
      final b = await bootRecorded(t);
      final none = Boot(b.repo, null, (await t.runAsync(() => AppPrefs.load(null)))!); // (as Boot.open pairs them: no store, no preferences)
      await openApp(t, none, route: '/cafe/0');
      await until(t, () => find.textContaining("doesn't list its menu").evaluate().isNotEmpty);
      expect(find.text('Add a custom food'), findsNothing);
      await drain(t);
    });
  });
}
