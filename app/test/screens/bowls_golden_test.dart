// Every bowl state of the brief at 360 and 390 dp, over M2's recordings and the fixed clock (Thursday Oct 8, 12:41): the sheet with a Noodle Bowl
// at nothing and at two parts, a café dish with its price summing, a synthetic base at 0, Update for a bowl on the plate, the plate with two
// bowls of one base and the plain dish, a past meal with a bowl. Photos are UMass's and never committed: the hall behind a sheet shows its maroon ground.
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/app.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/screens/plate/plate_row.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'dish_support.dart';
import 'plate_support.dart';
import 'support.dart';
import 'you_support.dart';

void main() {
  setUpAll(loadFonts);

  for (final w in [360.0, 390.0]) {
    final n = w.toInt();

    Future<void> plus(WidgetTester t, int i, [int times = 1]) async {
      for (var k = 0; k < times; k++) {
        final r = t.getRect(find.descendant(of: find.byKey(ValueKey('brow:$i')), matching: find.byType(RowControl)));
        await t.tapAt(Offset(r.right - 24, r.center.dy));
        await t.pumpAndSettle();
      }
    }

    Future<void> shot(WidgetTester t, String name, String route, {Future<void> Function(WidgetTester t)? act}) async {
      final b = await bootRecorded(t, health: true, carbon: true);
      await openHall(t, b, route, w: w);
      await sheetUp(t);
      await act?.call(t);
      await t.pumpAndSettle();
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/bowl_${name}_$n.png'));
      await drain(t);
    }

    testWidgets('a Noodle Bowl with nothing chosen, $n dp', (t) => shot(t, 'noodle', dishRoute('Beef Brisket Noodle Bowl')));
    testWidgets('a Noodle Bowl with two parts, $n dp', (t) => shot(t, 'noodle2', dishRoute('Beef Brisket Noodle Bowl'), act: (t) async {
          await plus(t, 0);
          await plus(t, 1, 2);
        }));
    testWidgets('a café dish with add-ons and its price summing, $n dp', (t) => shot(t, 'cafe', '/cafe/27?meal=dinner&dish=${Uri.encodeQueryComponent('Harissa Chicken')}', act: (t) => plus(t, 1)));

    testWidgets('a synthetic base at 0 with Add off, and its row in the list, $n dp', (t) async {
      final b = await bootRecorded(t, health: true, carbon: true);
      await openHall(t, b, '/hall/franklin?meal=lunch', w: w);
      final row = find.widgetWithText(ListRow, 'Deli Bar'), sc = t.state<ScrollableState>(find.descendant(of: find.byType(HallMenu), matching: find.byType(Scrollable)).first);
      for (var y = 0.0; row.evaluate().isEmpty && y < sc.position.maxScrollExtent; y += 300) {
        sc.position.jumpTo(y);
        await t.pump();
      }
      await Scrollable.ensureVisible(t.element(row), alignment: 0.5);
      await t.pumpAndSettle();
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/bowl_synrow_$n.png'));
      await t.tap(row);
      await sheetUp(t);
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/bowl_syn_$n.png'));
      await drain(t);
    });

    testWidgets('the plate with two bowls of one base and the plain dish, and a bowl reopened with Update, $n dp', (t) async {
      await openPlate(t, w: w, route: '/plate?seed=bowls');
      await t.tap(find.descendant(of: bar, matching: find.textContaining(RegExp(r'item'))));
      await t.pumpAndSettle();
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/bowl_plate_$n.png'));
      await t.tap(find.byType(PlateRow).first);
      await sheetUp(t);
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/bowl_update_$n.png'));
      await finish(t);
    });

    testWidgets('a past meal with a bowl, its parts shown, $n dp', (t) async {
      final b = await bootRecorded(t);
      await t.runAsync(() => b.seedLog('/you?data=recorded&history=bowl'));
      await openYou(t, b, w: w, route: '/you/day/2026-10-05');
      await t.tap(find.textContaining('Lunch').first);
      await t.pumpAndSettle();
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/bowl_history_$n.png'));
      await finish(t);
    });
  }
}
