// Search on the recorded Oct 8 12:41 data: the field, the lenses, the groups, add from a row, the dish sheet and the hall card.
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/dish/dish_sheet.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/screens/search/search_screen.dart';
import 'package:udine/shell/app_scope.dart';
import 'package:udine/shell/plate_model.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'support.dart';

/// The cursor blinks for as long as the field has focus, so the frames never stop: let the animations run out instead.
Future<void> settle(WidgetTester t) async {
  for (var i = 0; i < 12; i++) {
    await t.pump(const Duration(milliseconds: 100));
  }
}

/// Lets the repository's real I/O land (the cafés' menus are still coming in behind the halls') before the test ends.
Future<void> finish(WidgetTester t) async {
  for (var i = 0; i < 12; i++) {
    await drain(t);
  }
}

Future<void> openSearch(WidgetTester t, {String route = '/search', double w = 390}) async {
  await openApp(t, await bootRecorded(t), route: route, w: w);
  await until(t, () => find.byType(DishRow).evaluate().isNotEmpty || find.textContaining('Nothing called').evaluate().isNotEmpty || find.textContaining('No dishes').evaluate().isNotEmpty);
  await settle(t);
}

Future<void> type(WidgetTester t, String q) async {
  await t.enterText(find.byType(EditableText), q);
  await settle(t);
}

bool focused(WidgetTester t) => t.widget<EditableText>(find.byType(EditableText)).focusNode.hasFocus;
PlateModel plateOf(WidgetTester t) => AppScope.of(t.element(find.byType(SearchScreen))).plate;

void main() {
  setUpAll(loadFonts);

  testWidgets('launching on Halls asks nothing of Search: no rows, no title', (t) async {
    await openApp(t, await bootRecorded(t));
    await t.pump();
    expect(find.text('Lunch now'), findsNothing);
    expect(find.byType(DishRow), findsNothing);
    await finish(t);
  });

  testWidgets('/search: the field focused, the seven lenses, and the halls\' lunch under its title', (t) async {
    await openSearch(t);
    expect(find.text('Search lunch at every hall'), findsOneWidget);
    for (final l in ['High protein', 'Light', 'Vegetarian', 'Plant based', 'Halal', 'Low carbon', 'Favorites']) {
      expect(find.text(l), findsOneWidget);
    }
    expect(find.text('Lunch now'), findsOneWidget);
    expect(focused(t), isTrue);
    await finish(t);
  });

  testWidgets('typing: results follow the text, and the keyboard stays up through a lens, a +, and the clear button', (t) async {
    await openSearch(t);
    await type(t, 'brisket');
    expect(find.byType(DishRow), findsWidgets);
    await t.tap(find.text('Light'));
    await settle(t);
    expect(focused(t), isTrue);
    expect(t.widget<FilterChipButton>(find.widgetWithText(FilterChipButton, 'Light')).selected, isTrue);
    await t.tap(find.text('Light'));
    await settle(t);
    await t.tap(find.byType(AddButton).first);
    await settle(t);
    expect(focused(t), isTrue);
    expect(find.byType(Stepper), findsOneWidget);
    await t.tap(find.bySemanticsLabel('Clear'));
    await settle(t);
    expect(focused(t), isTrue);
    expect(t.widget<EditableText>(find.byType(EditableText)).controller.text, '');
    await finish(t);
  });

  testWidgets('a + adds the dish for every place serving it, and no row moves', (t) async {
    await openSearch(t);
    await type(t, 'brisket');
    List<String> names() => [for (final r in t.widgetList<DishRow>(find.byType(DishRow))) r.dish.dishName];
    final before = names();
    await t.tap(find.byType(AddButton).first);
    await settle(t);
    expect(names(), before);
    final plate = plateOf(t).state.plates.single;
    expect(plate.items.single.refs.length, greaterThanOrEqualTo(1));
    expect(plate.items.single.qty, 1);
    await finish(t);
  });

  testWidgets('Search on the keyboard adds the first row, again steps it, and the keyboard stays up', (t) async {
    await openSearch(t);
    await type(t, 'brisket');
    await t.testTextInput.receiveAction(TextInputAction.search);
    await settle(t);
    expect(plateOf(t).state.plates.single.items.single.qty, 1);
    await t.testTextInput.receiveAction(TextInputAction.search);
    await settle(t);
    expect(plateOf(t).state.plates.single.items.single.qty, 2);
    expect(focused(t), isTrue);
    await finish(t);
  });

  testWidgets('typing: a row that survives glides to its new place over settle, a new one fades in', (t) async {
    await openSearch(t);
    await type(t, 'green');
    final row = find.byWidgetPredicate((w) => w is DishRow && w.dish.dishName == 'Green Chile Posole');
    expect(row, findsOneWidget);
    final before = t.getTopLeft(row).dy;
    await t.enterText(find.byType(EditableText), 'green chile');
    await t.pump(); // the new text is laid out: the row is already where it will rest
    await t.pump(const Duration(milliseconds: 10));
    final early = t.getTopLeft(row).dy;
    await settle(t);
    final rest = t.getTopLeft(row).dy;
    expect(rest, lessThan(before), reason: 'the places above it are gone');
    expect(early, greaterThan(rest + 1), reason: 'it has not yet arrived');
    expect(early, lessThanOrEqualTo(before + 1), reason: 'and it began where it was');
    await finish(t);
  });

  testWidgets('typing: a row that was not there fades up, and a plate change moves nothing', (t) async {
    await openSearch(t);
    await type(t, 'green');
    await t.enterText(find.byType(EditableText), 'brisket');
    await t.pump();
    await t.pump(const Duration(milliseconds: 10));
    final row = find.byType(DishRow).first;
    final fade = find.ancestor(of: row, matching: find.byType(Opacity));
    expect(t.widget<Opacity>(fade.first).opacity, lessThan(1));
    await settle(t);
    expect(fade, findsNothing, reason: 'arrived: no fade layer left');
    final at = t.getTopLeft(row);
    await t.tap(find.byType(AddButton).first);
    await t.pump(const Duration(milliseconds: 10));
    expect(t.getTopLeft(row), at);
    await finish(t);
  });

  testWidgets('no match: the line and the solid custom-food button', (t) async {
    await openSearch(t);
    await type(t, 'zzzq');
    expect(find.text('Nothing called “zzzq” is on any menu today or tomorrow.'), findsOneWidget);
    expect(find.text('Add “zzzq” as a custom food'), findsOneWidget);
    await finish(t);
  });

  testWidgets('a row opens the dish sheet over Search, and the field lets go of the keyboard', (t) async {
    await openSearch(t);
    await type(t, 'brisket');
    await t.tap(find.byType(DishRow).first);
    await settle(t);
    expect(find.byType(DishSheet), findsOneWidget);
    expect(find.byType(SearchScreen), findsOneWidget);
    expect(focused(t), isFalse);
    await finish(t);
  });

  testWidgets('a hall card opens that hall', (t) async {
    await openSearch(t);
    await type(t, 'worcester');
    expect(find.byType(Band), findsOneWidget);
    await t.tap(find.byType(Band));
    await until(t, () => find.byType(HallMenu).evaluate().isNotEmpty);
    await settle(t);
    expect(find.byType(HallMenu), findsOneWidget);
    await finish(t);
  });
}
