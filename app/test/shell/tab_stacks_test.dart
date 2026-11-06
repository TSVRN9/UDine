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
import '../fonts.dart';
import '../screens/search_screen_test.dart' show finish;
import '../screens/support.dart';

Future<void> tab(WidgetTester t, String name) async {
  await t.tap(find.descendant(of: find.byType(M2TabBar), matching: find.text(name)));
  await t.pumpAndSettle();
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
}
