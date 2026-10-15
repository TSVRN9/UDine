// Every plate state of the brief at 360 and 390 dp, over M2's recordings and the fixed clock (Thursday Oct 8, 12:41), on the benchmark
// plate (`/plate?seed=benchmark`: Beef Brisket Noodle Bowl x1, Golden BBQ Chicken Thigh x2, 404 cal / 38.9 g). Photos are UMass's and
// never committed: the hall behind shows its maroon ground.
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/app.dart';
import 'package:udine/boot.dart';
import '../fonts.dart';
import 'plate_support.dart';
import 'support.dart';

void main() {
  setUpAll(loadFonts);

  for (final w in [360.0, 390.0]) {
    final n = w.toInt();

    Future<void> shot(WidgetTester t, String name, {String route = benchmarkRoute, Future<void> Function(WidgetTester t, Boot b)? act}) async {
      final b = await openPlate(t, w: w, route: route);
      await act?.call(t, b);
      await t.pumpAndSettle();
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/plate_${name}_$n.png'));
      await finish(t);
    }

    Future<void> open(WidgetTester t) async {
      await t.tap(find.descendant(of: bar, matching: find.textContaining(RegExp(r'item'))));
      await t.pumpAndSettle();
    }

    testWidgets('the bar with one item, $n dp', (t) => shot(t, 'bar1', route: '/halls', act: (t, b) async {
          b.plate.add('lunch', 'Golden BBQ Chicken Thigh', await servings(t, b, 'Golden BBQ Chicken Thigh', ['W']));
        }));
    testWidgets('the benchmark plate in the bar, $n dp', (t) => shot(t, 'bar3'));
    testWidgets('the sheet at its mid detent, $n dp', (t) => shot(t, 'mid', act: (t, b) => open(t)));
    testWidgets('the sheet at the top, $n dp', (t) => shot(t, 'large', act: (t, b) async {
          await open(t);
          await t.fling(bar, const Offset(0, -500), 2500);
        }));
    testWidgets('two plates: dots on the bar, $n dp', (t) => shot(t, 'two', act: (t, b) async {
          b.plate.add('dinner', 'Golden BBQ Chicken Thigh', await servings(t, b, 'Golden BBQ Chicken Thigh', ['W']));
        }));
    testWidgets('two plates: the sheet with its tabs, $n dp', (t) => shot(t, 'two_sheet', act: (t, b) async {
          b.plate.add('dinner', 'Golden BBQ Chicken Thigh', await servings(t, b, 'Golden BBQ Chicken Thigh', ['W']));
          await t.pumpAndSettle();
          await open(t);
        }));
    testWidgets('Log at, $n dp', (t) => shot(t, 'logat', route: '/halls', act: (t, b) async {
          b.plate.add('lunch', 'Beef Brisket Noodle Bowl', await servings(t, b, 'Beef Brisket Noodle Bowl', ['W', 'B']));
          await t.pumpAndSettle();
          await t.tap(inBar(find.text('Log')));
        }));
    testWidgets('the receipt with Undo, $n dp', (t) async {
      final b = await openPlate(t, w: w);
      await t.tap(inBar(find.text('Log')));
      await logged(t, b);
      await t.pump(const Duration(milliseconds: 600)); // (the toss has landed)
      await t.pumpAndSettle();
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/plate_receipt_$n.png'));
      await finish(t);
    });
    testWidgets('after Undo, $n dp', (t) async {
      final b = await openPlate(t, w: w);
      await t.tap(inBar(find.text('Log')));
      await logged(t, b);
      await t.tap(inBar(find.text('Undo')));
      await until(t, () => b.plate.receipt == null);
      await t.pumpAndSettle();
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/plate_undone_$n.png'));
      await finish(t);
    });
  }
}
