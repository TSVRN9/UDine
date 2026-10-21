// The where block is whole in the sheet's first frame when the menus were warmed at launch; a cold open holds blank chips in the reserved
// line; warming never runs while something animates.
import 'package:flutter/scheduler.dart' show SchedulerBinding;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/boot.dart';
import 'package:udine/core/m2/history.dart' show cafeIdsOf;
import 'package:udine/data/repository.dart';
import 'package:udine/screens/dish/where_book.dart';
import 'package:udine/theme/tokens.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'dish_support.dart';
import 'support.dart';

Future<void> warm(WidgetTester t, Boot b) => t.runAsync(() async {
      final s = await b.repo.hours(b.repo.today).firstWhere((s) => s is Loaded<HoursData>) as Loaded<HoursData>;
      await WhereWarm.of(b.repo).start(cafeIdsOf(s.value.feed), gate: () async {});
    });

final _posole = dishRoute('Green Chile Posole', place: 'franklin');
double _gap(WidgetTester t) => t.getTopLeft(find.byType(NutritionLabel)).dy - t.getTopLeft(find.byKey(const ValueKey('where-line'))).dy;

void main() {
  setUpAll(loadFonts);

  testWidgets('warm: the first frame has every group and chip, and Nutrition Facts never moves from the where block after it', (t) async {
    final b = await bootRecorded(t);
    await warm(t, b);
    expect(WhereWarm.of(b.repo).done, isTrue);
    await openApp(t, b, route: _posole);
    for (var i = 0; i < 400 && find.byKey(const ValueKey('where-line')).evaluate().isEmpty; i++) {
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 5)));
      await t.pump(const Duration(milliseconds: 16));
    }
    expect(find.byKey(const ValueKey('where-holders')), findsNothing);
    final chips = find.byType(HallChip).evaluate().length, gap = _gap(t);
    expect(chips, greaterThan(1));
    expect(gap, greaterThan(M2Layout.whereLine + M2Layout.labelTop + M2Layout.wlGap), reason: 'a second group is in the block already');
    for (var i = 0; i < 90; i++) {
      await t.pump(const Duration(milliseconds: 16));
      expect(_gap(t), gap, reason: 'frame $i');
      expect(find.byType(HallChip).evaluate().length, chips);
    }
    await drain(t);
  });

  testWidgets('cold: blank chips hold the reserved line, and the real ones replace them', (t) async {
    final b = await bootRecorded(t);
    await openApp(t, b, route: _posole);
    for (var i = 0; i < 400 && find.byKey(const ValueKey('where-line')).evaluate().isEmpty; i++) {
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 5)));
      await t.pump(const Duration(milliseconds: 16));
    }
    final holders = find.descendant(of: find.byKey(const ValueKey('where-holders')), matching: find.byType(SizedBox));
    expect(holders, findsWidgets);
    expect(t.getSize(holders.first), const Size(M2Layout.hchipHolderW, M2Layout.hchipH));
    expect(t.getSize(find.byKey(const ValueKey('where-line'))).height, M2Layout.whereLine);
    expect(find.byType(HallChip), findsNothing);
    await sheetUp(t);
    expect(holders, findsNothing);
    expect(find.byType(HallChip), findsWidgets);
    await drain(t);
  });

  testWidgets('no menu is asked for while an animation runs', (t) async {
    final b = await bootRecorded(t);
    final c = AnimationController(vsync: t, duration: const Duration(seconds: 1))..forward();
    addTearDown(c.dispose);
    expect(SchedulerBinding.instance.transientCallbackCount, greaterThan(0));
    var done = false, idle = false;
    WhereWarm.idle().then((_) => idle = true);
    final s = await t.runAsync(() => b.repo.hours(b.repo.today).firstWhere((s) => s is Loaded<HoursData>)) as Loaded<HoursData>;
    WhereWarm.of(b.repo).start(cafeIdsOf(s.value.feed)).then((_) => done = true);
    for (var i = 0; i < 20; i++) {
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 5)));
      await t.pump(const Duration(milliseconds: 16)); // 320 ms of the second-long animation
    }
    expect(WhereWarm.of(b.repo).days, isEmpty);
    expect(idle, isFalse);
    c.stop();
    await until(t, () => idle);
    await until(t, () => done, tries: 400);
    expect(WhereWarm.of(b.repo).done, isTrue);
    await drain(t);
  });
}
