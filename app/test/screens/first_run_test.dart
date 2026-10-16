// First run (flutter-port-you Task 3, M2 CONCEPT R10 §1): You's own choices, once, in a non-modal sheet resting under the four hall bands.
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/boot.dart';
import 'package:udine/shell/prefs.dart';
import 'package:udine/screens/halls/first_run.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'support.dart';
import 'you_support.dart';

Future<Boot> openFirstRun(WidgetTester t, {double w = 390, Boot? boot}) async {
  final b = boot ?? await bootRecorded(t, firstRun: true);
  await openApp(t, b, route: '/halls?data=recorded&firstRun=1', w: w);
  await until(t, () => find.byType(FirstRunSheet).evaluate().isNotEmpty);
  await t.pumpAndSettle();
  return b;
}

Future<bool> seen(WidgetTester t, Boot b) async => (await t.runAsync(() => b.store!.firstRunSeen()))!;
double sheetTop(WidgetTester t) => t.view.physicalSize.height - t.widget<M2Sheet>(find.descendant(of: find.byType(FirstRunSheet), matching: find.byType(M2Sheet))).handle.px;
Rect band(WidgetTester t, String name) => t.getRect(find.ancestor(of: find.text(name), matching: find.byType(Band)).first);


void main() {
  setUpAll(loadFonts);

  testWidgets('a recorded route marks first run shown unless it asks for it; a seen first run is never raised', (t) async {
    final b = await bootRecorded(t);
    await openApp(t, b);
    await t.pumpAndSettle();
    expect(find.byType(FirstRunSheet), findsNothing);
    await drain(t);
  });

  testWidgets('it rests with its top at the bottom of the fourth hall band, and holds You\'s own rows in You\'s order', (t) async {
    final b = await openFirstRun(t);
    expect(sheetTop(t), closeTo(band(t, 'Berkshire').bottom, 1.0));
    final y = [for (final s in ['You', 'Done', 'Track what I eat', 'Only show', 'Vegetarian', 'Plant based', 'Halal', 'Avoid', 'Milk']) t.getTopLeft(find.descendant(of: find.byType(FirstRunSheet), matching: find.text(s))).dy];
    expect(y, orderedEquals([...y]..sort()));
    expect(find.text('Calories, protein, carbs and fat'), findsOneWidget);
    expect(find.text('Charles River Campus'), findsNothing, reason: 'Charles River is not in first run');
    expect(await seen(t, b), isFalse, reason: 'nothing is written until it is put away');
    await drain(t);
  });

  testWidgets('it is shown once: Done puts it away, marks it seen, and a choice made in it is kept', (t) async {
    final b = await openFirstRun(t);
    await t.tap(find.text('Track what I eat'));
    await t.ensureVisible(find.text('Halal'));
    await t.pump();
    await t.tap(find.text('Halal'));
    await wrote(t);
    await t.ensureVisible(find.text('Done')); // (Done scrolls with the title)
    await t.pump();
    await t.tap(find.text('Done'));
    await t.pumpAndSettle();
    expect(find.byType(FirstRunSheet), findsNothing);
    expect(await seen(t, b), isTrue);
    expect(await t.runAsync(b.store!.onlyShow), ['Halal']);
    expect(await t.runAsync(b.store!.tracking), isFalse);
    await drain(t);
  });

  testWidgets('skipping writes nothing: tracking on, no filters, scores off, and an RN user\'s preferences untouched', (t) async {
    final b = await bootRecorded(t, firstRun: true, avoid: ['Milk'], onlyShow: ['Local']);
    await openFirstRun(t, boot: b);
    await t.tap(find.text('Done'));
    await t.pumpAndSettle();
    expect(await t.runAsync(b.store!.avoid), ['Milk']);
    expect(await t.runAsync(b.store!.onlyShow), ['Local']);
    expect(await t.runAsync(b.store!.tracking), isTrue);
    expect(await t.runAsync(b.store!.scores), (healthfulness: false, carbon: false));
    await drain(t);
  });

  testWidgets('a band tap passes through the sheet, puts it away (choices kept) and opens that hall', (t) async {
    final b = await openFirstRun(t);
    await t.ensureVisible(find.text('Vegetarian'));
    await t.pump();
    await t.tap(find.text('Vegetarian'));
    await wrote(t);
    await t.tapAt(band(t, 'Franklin').center);
    await t.pump(const Duration(milliseconds: 100));
    expect(await seen(t, b), isTrue);
    await t.pump(const Duration(milliseconds: 800));
    expect(find.byType(FirstRunSheet), findsNothing);
    await until(t, () => find.byType(HallMenu).evaluate().isNotEmpty);
    expect(await t.runAsync(b.store!.onlyShow), ['Vegetarian']);
    await drain(t);
  });

  testWidgets('dragging it away counts as done', (t) async {
    final b = await openFirstRun(t);
    await t.fling(find.text('Track what I eat'), const Offset(0, 600), 2000);
    await t.pumpAndSettle();
    expect(find.byType(FirstRunSheet), findsNothing);
    expect(await seen(t, b), isTrue);
    await drain(t);
  });

  testWidgets('Android back counts as done', (t) async {
    final b = await openFirstRun(t);
    await t.binding.handlePopRoute();
    await t.pumpAndSettle();
    expect(find.byType(FirstRunSheet), findsNothing);
    expect(await seen(t, b), isTrue);
    await drain(t);
  });

  testWidgets('an app kill before it is put away shows it again; after, never', (t) async {
    final b = await openFirstRun(t);
    final again = Boot(b.repo, b.store, (await t.runAsync(() => AppPrefs.load(b.store)))!);
    await t.pumpWidget(const SizedBox());
    await openFirstRun(t, boot: again);
    await t.tap(find.text('Done'));
    await t.pumpAndSettle();
    final after = Boot(b.repo, b.store, (await t.runAsync(() => AppPrefs.load(b.store)))!);
    expect(after.prefs.firstRunSeen, isTrue);
    await t.pumpWidget(const SizedBox());
    await openApp(t, after);
    await t.pumpAndSettle();
    expect(find.byType(FirstRunSheet), findsNothing);
    await drain(t);
  });

  testWidgets('a newer database never raises it', (t) async {
    final rec = await bootRecorded(t);
    final b = Boot(rec.repo, null, (await t.runAsync(() => AppPrefs.load(null)))!);
    await openApp(t, b);
    await t.pumpAndSettle();
    expect(find.byType(FirstRunSheet), findsNothing);
    await drain(t);
  });
}
