import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/hall/meal_pager.dart';

void main() {
  Widget host(GlobalKey<SharedAxisLayerState> k, {bool reduced = false}) => Directionality(
        textDirection: TextDirection.ltr,
        child: MediaQuery(
          data: MediaQueryData(size: const Size(390, 844), disableAnimations: reduced),
          child: SharedAxisLayer(key: k, child: const Text('live')),
        ),
      );
  Duration ms(int n) => Duration(milliseconds: n);
  final outs = find.byKey(const ValueKey('axis-out'));
  double opacity(WidgetTester t, int i) => t.widget<Opacity>(outs.at(i)).opacity;

  testWidgets('a tap mid-run lets each outgoing copy finish on its own clock', (t) async {
    final k = GlobalKey<SharedAxisLayerState>();
    await t.pumpWidget(host(k));
    k.currentState!.run(1, const Text('A'));
    await t.pump();
    await t.pump(ms(100));
    k.currentState!.run(1, const Text('B'));
    await t.pump();
    await t.pump(ms(50));
    expect(outs, findsNWidgets(2)); // A (150 ms in) and B (50 ms in) both leaving
    expect(opacity(t, 0), lessThan(opacity(t, 1))); // A is further along than B: it kept its own clock
    await t.pump(ms(310)); // A is 460 ms in: done; B 360 ms in: still leaving
    expect(outs, findsOneWidget);
    expect(find.text('B'), findsOneWidget);
    await t.pump(ms(100));
    expect(outs, findsNothing);
    expect(find.text('live'), findsOneWidget);
  });

  testWidgets('reduced motion draws no outgoing copy', (t) async {
    final k = GlobalKey<SharedAxisLayerState>();
    await t.pumpWidget(host(k, reduced: true));
    k.currentState!.run(1, const Text('A'));
    await t.pump(ms(50));
    expect(outs, findsNothing);
    await t.pumpAndSettle();
  });
}
