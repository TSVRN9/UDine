// Search's rows hold still when nothing about them changed: the Events block is in place in the first frame that draws a row (it is
// built again with each return to idle, not waited for), and a row that survives a keystroke starts its glide where it was
// (M2 `renderSearch`: FLIP, then `setIdle`).
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/screens/search/events.dart';
import 'package:udine/screens/search/search_screen.dart';
import 'package:udine/shell/shell_scope.dart';
import '../fonts.dart';
import '../screens/search_screen_test.dart' show finish, openSearch, settle;
import '../screens/support.dart';

class _Shell implements ShellApi {
  @override
  final here = ValueNotifier<String?>(null);
  @override
  final searchMeal = ValueNotifier<String?>(null);
  @override
  dynamic noSuchMethod(Invocation i) => null;
}

/// Search on its own, under the recorded app's scope, with `idle` the test's.
Future<void> mountSearch(WidgetTester t, Widget Function(VoidCallback) idle, {String query = ''}) async {
  final boot = await bootRecorded(t);
  phone(t);
  await t.pumpWidget(boot.wrap(ShellScope(
    api: _Shell(),
    child: Directionality(
      textDirection: TextDirection.ltr,
      child: MediaQuery(
        data: const MediaQueryData(size: Size(390, 844)),
        child: Overlay(initialEntries: [OverlayEntry(builder: (_) => SearchScreen(top: 24, tab: ValueNotifier(1), query: query, idle: idle))]),
      ),
    ),
  )));
}

void main() {
  setUpAll(loadFonts);

  testWidgets('first show: no frame draws a Lunch-now row without the Events block, and the rows never move afterwards', (t) async {
    await openApp(t, await bootRecorded(t), route: '/search');
    double? top;
    for (var i = 0; i < 120 && (top == null || i < 60); i++) {
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 25)));
      await t.pump(const Duration(milliseconds: 16));
      if (find.byType(DishRow).evaluate().isEmpty) continue;
      expect(find.byType(EventCard), findsWidgets, reason: 'frame $i drew a row before Events');
      final y = t.getTopLeft(find.byType(DishRow).first).dy;
      expect(y, top ?? y, reason: 'frame $i moved the first row');
      top = y;
    }
    expect(top, isNotNull);
    await finish(t);
  });

  testWidgets('back to idle after a query: Events is there in the first frame, rows start where they were', (t) async {
    await openSearch(t);
    await t.enterText(find.byType(EditableText), 'chicken');
    await settle(t);
    expect(find.byType(EventCard), findsNothing);
    final before = t.getTopLeft(find.byType(DishRow).first).dy;
    await t.enterText(find.byType(EditableText), '');
    await t.pump();
    expect(find.byType(EventCard), findsWidgets, reason: 'Events not built again the frame idle returns');
    expect(t.getTopLeft(find.byType(DishRow).first).dy, greaterThan(before), reason: 'rows sit under Events from the first frame');
    await settle(t);
    await finish(t);
  });

  testWidgets('the rows wait for the idle block: none drawn until it has answered, then they sit under it', (t) async {
    late VoidCallback done;
    await mountSearch(t, (d) {
      done = d;
      return const SizedBox(key: ValueKey('idle'), height: 222);
    });
    for (var i = 0; i < 20; i++) {
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 25)));
      await t.pump(const Duration(milliseconds: 16));
    }
    expect(find.byKey(const ValueKey('idle')), findsOneWidget);
    expect(find.byType(DishRow), findsNothing, reason: 'rows drawn before the idle block answered');
    done();
    await t.pump();
    expect(find.byType(DishRow), findsWidgets);
    expect(t.getTopLeft(find.byType(DishRow).first).dy, greaterThan(t.getBottomLeft(find.byKey(const ValueKey('idle'))).dy));
    await settle(t);
    await finish(t);
  });

  testWidgets('a keystroke redraws Search once, from the new result: no frame draws the new query over the old rows', (t) async {
    await mountSearch(t, (_) => const SizedBox.shrink(), query: 'chicken');
    await until(t, () => find.byType(DishRow).evaluate().isNotEmpty);
    await settle(t);
    final names = <String>[];
    String rows() => [for (final r in find.byType(DishRow).evaluate()) (r.widget as DishRow).dish.dishName].join('|');
    await t.enterText(find.byType(EditableText), 'chicken salad');
    await t.pump();
    names.add(rows());
    for (var i = 0; i < 20; i++) {
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 25)));
      await t.pump(const Duration(milliseconds: 16));
      names.add(rows());
    }
    // every drawn list is either the old one or the final one
    final distinct = names.toSet();
    expect(distinct.length, lessThanOrEqualTo(1), reason: 'in-between lists: $distinct');
    await finish(t);
  });
}
