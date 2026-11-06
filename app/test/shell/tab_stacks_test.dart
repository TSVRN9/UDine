// Each tab keeps its own stack (search-first-class Task 1): leaving a tab leaves its pages open, a re-tap of the shown tab pops it to
// its root, back acts on the shown tab, and `here` is the place page open on Halls.
import 'package:flutter/foundation.dart' show ValueListenable;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/motion/routes.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/screens/search/search_screen.dart';
import 'package:udine/screens/you/settings_pages.dart';
import 'package:udine/shell/shell_scope.dart';
import 'package:udine/ui/ui.dart';
import 'package:udine/alerts/alerts.dart' show alertTaps;
import 'package:udine/screens/halls/halls_screen.dart';
import '../fonts.dart';
import '../screens/search_screen_test.dart' show finish;
import '../screens/support.dart';

Future<void> tab(WidgetTester t, String name) async {
  await t.tap(find.descendant(of: find.byType(M2TabBar), matching: find.text(name)));
  for (var i = 0; i < 12; i++) {
    await t.pump(const Duration(milliseconds: 100)); // (Search's caret never settles)
  }
}

ValueListenable<String?> hereOf(WidgetTester t) => ShellScope.of(t.element(find.byType(M2TabBar))).here;

Future<void> openWorcester(WidgetTester t) async {
  await openApp(t, await bootRecorded(t));
  await until(t, () => find.text('Worcester').evaluate().isNotEmpty);
  await t.tap(find.text('Worcester'));
  await until(t, () => find.byType(Spinner).evaluate().isEmpty && find.byType(DishRow).evaluate().isNotEmpty);
  await t.pumpAndSettle();
}

void main() {
  setUpAll(loadFonts);

  testWidgets('Worcester stays open under Search, here is W, and a re-tap of Halls closes it', (t) async {
    await openWorcester(t);
    final menu = t.state<HallMenuState>(find.byType(HallMenu));
    expect(hereOf(t).value, 'W');
    await tab(t, 'Search');
    expect(hereOf(t).value, 'W');
    expect(find.byType(HallMenu), findsNothing);
    await tab(t, 'Halls');
    expect(identical(t.state<HallMenuState>(find.byType(HallMenu)), menu), isTrue, reason: 'the same open hall, not a new one');
    await tab(t, 'Halls');
    expect(find.byType(HallMenu), findsNothing);
    expect(hereOf(t).value, isNull);
    await finish(t);
  });

  testWidgets('back closes the page of the tab that is shown, not the hall under Search', (t) async {
    await openWorcester(t);
    await tab(t, 'Search');
    Nav.push<void>(t.element(find.byType(SearchScreen)), (_) => const DietPage(top: 24));
    await t.pumpAndSettle();
    await tab(t, 'Halls');
    await tab(t, 'Search');
    expect(find.byType(DietPage), findsOneWidget, reason: 'a page Search pushed survives a trip to Halls');
    await t.binding.handlePopRoute();
    await t.pumpAndSettle();
    expect(find.byType(DietPage), findsNothing);
    expect(hereOf(t).value, 'W');
    await tab(t, 'Halls');
    await t.binding.handlePopRoute();
    await t.pumpAndSettle();
    expect(find.byType(HallMenu), findsNothing);
    expect(hereOf(t).value, isNull);
    await finish(t);
  });

  testWidgets('a place page Search opens is not here', (t) async {
    await openApp(t, await bootRecorded(t), route: '/search');
    await t.pumpAndSettle();
    Nav.push<void>(t.element(find.byType(SearchScreen)), (_) => const DietPage(top: 24), place: 'W');
    await t.pumpAndSettle();
    expect(hereOf(t).value, isNull);
    await finish(t);
  });

  double bandOpacity(WidgetTester t, Type pane, String name) {
    final o = find.ancestor(of: find.descendant(of: find.descendant(of: find.byType(pane), matching: find.byType(Band)), matching: find.text(name)), matching: find.byType(Opacity)).first;
    return t.widget<Opacity>(o).opacity;
  }

  testWidgets('Worcester open on Halls does not blank its card in Search results', (t) async {
    await openWorcester(t);
    await tab(t, 'Search');
    await t.enterText(find.byType(EditableText), 'worcester');
    await until(t, () => find.descendant(of: find.byType(SearchScreen), matching: find.byType(Band)).evaluate().isNotEmpty);
    expect(bandOpacity(t, SearchScreen, 'Worcester'), 1);
    await finish(t);
  });

  testWidgets('a card opened from Search does not blank the band on Halls home', (t) async {
    await openApp(t, await bootRecorded(t), route: '/search?q=worcester');
    await until(t, () => find.descendant(of: find.byType(SearchScreen), matching: find.byType(Band)).evaluate().isNotEmpty);
    await t.tap(find.descendant(of: find.descendant(of: find.byType(SearchScreen), matching: find.byType(Band)), matching: find.text('Worcester')).first);
    for (var i = 0; i < 12; i++) {
      await t.pump(const Duration(milliseconds: 100));
    }
    await tab(t, 'Halls');
    expect(bandOpacity(t, HallsScreen, 'Worcester'), 1);
    await finish(t);
  });

  testWidgets('an alert tap pops every tab to its root: Worcester on Halls, a page on Search', (t) async {
    await openWorcester(t);
    await tab(t, 'Search');
    Nav.push<void>(t.element(find.byType(SearchScreen)), (_) => const DietPage(top: 24));
    await t.pumpAndSettle();
    alertTaps.add('');
    await t.pumpAndSettle();
    expect(find.byType(HallMenu, skipOffstage: false), findsNothing);
    expect(find.byType(DietPage, skipOffstage: false), findsNothing);
    expect(hereOf(t).value, isNull);
    await finish(t);
  });
}
