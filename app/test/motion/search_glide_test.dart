// Search's rows hold still when nothing about them changed: the Events block is in place in the first frame that draws a row (it is
// built again with each return to idle, not waited for), and a row that survives a keystroke starts its glide where it was
// (M2 `renderSearch`: FLIP, then `setIdle`).
import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/boot.dart';
import 'package:udine/core/types.dart' show DiningEvent;
import 'package:udine/data/states.dart';
import 'package:udine/theme/tokens.dart';
import 'package:udine/ui/ui.dart';
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
Future<void> mountSearch(WidgetTester t, Widget idle, {String query = '', Boot? boot}) async {
  boot ??= await bootRecorded(t);
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

  testWidgets('first show: the rows are drawn with the Events space reserved, and never move afterwards', (t) async {
    await openApp(t, await bootRecorded(t), route: '/search');
    double? top;
    for (var i = 0; i < 120 && (top == null || i < 60); i++) {
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 25)));
      await t.pump(const Duration(milliseconds: 16));
      if (find.byType(DishRow).evaluate().isEmpty) continue;
      expect(find.byType(EventsIdle), findsOneWidget, reason: 'frame $i drew a row without the Events block');
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

  /// Search with the real Events block over a feed that answers when [hold] completes (or whenever, null), with [feed] as its body.
  Future<void> events(WidgetTester t, {Future<void>? hold, String? feed, bool seen = false}) async {
    final boot = await bootRecorded(t, eventsHold: hold, read: feed == null ? null : (n) async => n == 'events-raw.json' ? feed : readRecorded(n));
    if (seen) await t.runAsync(() => boot.repo.events().firstWhere((s) => s is Loaded<List<DiningEvent>>));
    await mountSearch(t, const EventsIdle(top: 24), boot: boot);
  }

  double rowY(WidgetTester t) => t.getTopLeft(find.byType(DishRow).first).dy;
  double blockH(WidgetTester t) => t.getSize(find.byType(EventsIdle)).height;
  Future<void> frame(WidgetTester t, [int ms = 16]) async {
    await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 25)));
    await t.pump(Duration(milliseconds: ms));
  }

  testWidgets('feed pending: rows are built in the first frames, under a placeholder block as tall as the loaded one', (t) async {
    final hold = Completer<void>();
    await events(t, hold: hold.future);
    await until(t, () => find.byType(DishRow).evaluate().isNotEmpty);
    expect(find.byType(EventCard), findsNothing);
    expect(find.text('Events'), findsOneWidget);
    final held = blockH(t), y = rowY(t);
    expect(y, greaterThanOrEqualTo(t.getBottomLeft(find.byType(EventsIdle)).dy), reason: 'rows sit below the block');
    hold.complete();
    await until(t, () => find.byType(EventCard).evaluate().isNotEmpty);
    await settle(t);
    expect(blockH(t), held, reason: 'placeholder and loaded block differ in height');
    expect(rowY(t), y);
    await finish(t);
  });

  testWidgets('feed answers with events after a delay: no row moves across the answer', (t) async {
    final hold = Completer<void>();
    await events(t, hold: hold.future);
    await until(t, () => find.byType(DishRow).evaluate().isNotEmpty);
    final y = rowY(t);
    hold.complete();
    for (var i = 0; i < 40; i++) {
      await frame(t);
      if (find.byType(DishRow).evaluate().isNotEmpty) expect(rowY(t), y, reason: 'frame $i moved the first row');
    }
    expect(find.byType(EventCard), findsWidgets);
    await finish(t);
  });

  for (final (name, feed) in [('empty', '{"events":[]}'), ('failed', '{"nope":1}')]) {
    testWidgets('feed $name: the block glides shut over settle, rows glide up, no frame moves them by the whole block', (t) async {
      final hold = Completer<void>();
      await events(t, hold: hold.future, feed: feed);
      await until(t, () => find.byType(DishRow).evaluate().isNotEmpty);
      final y = rowY(t), h = blockH(t);
      hold.complete();
      final ys = <double>[];
      for (var i = 0; i < 60 && (ys.isEmpty || ys.last != y - h); i++) {
        await frame(t);
        ys.add(rowY(t));
      }
      expect(ys.last, y - h, reason: 'rows never reached the top of the closed block');
      final moved = ys.where((v) => v != y).toList();
      expect(moved.length, greaterThan(3), reason: 'rows jumped: $ys');
      for (var i = 1; i < ys.length; i++) {
        expect(ys[i - 1] - ys[i], lessThan(h * 0.5), reason: 'frame $i moved the rows by $ys');
      }
      await t.pump(M2Motion.settle.duration);
      expect(find.text('Events'), findsNothing);
      await finish(t);
    });
  }

  testWidgets('events already read: the cards are in the first frame, no placeholder in any', (t) async {
    await events(t, seen: true);
    for (var i = 0; i < 40; i++) {
      expect(find.byType(EventCard), findsWidgets, reason: 'frame $i');
      expect(find.byKey(const ValueKey('ev-sweep')), findsNothing, reason: 'placeholder shimmer in frame $i');
      await frame(t);
    }
    await finish(t);
  });

  testWidgets('photos off: the placeholder felt is plain, no shimmer; photos on: it shimmers', (t) async {
    final hold = Completer<void>();
    await events(t, hold: hold.future);
    await t.pump();
    Photos.enabled = false;
    await t.pump(const Duration(milliseconds: 100));
    expect(find.byKey(const ValueKey('ev-sweep')), findsNothing);
    expect(find.byKey(const ValueKey('ev-still')), findsNothing);
    await t.pumpWidget(const SizedBox());
    Photos.enabled = true;
    await events(t, hold: hold.future);
    await t.pump(const Duration(milliseconds: 100));
    expect(find.byKey(const ValueKey('ev-sweep')), findsWidgets);
    await t.pumpWidget(const SizedBox());
    hold.complete();
    await finish(t);
  });

  testWidgets('a keystroke redraws Search once, from the new result: no frame draws the new query over the old rows', (t) async {
    await mountSearch(t, const SizedBox.shrink(), query: 'chicken');
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
