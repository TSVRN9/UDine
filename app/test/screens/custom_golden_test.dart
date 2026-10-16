// The custom food form at 360 and 390 dp over M2's recordings: empty, with a name (the cursor at Calories), filled, and invalid (a name
// and no calories: Add to plate does nothing, the cursor stays at Calories). The keyboard is not part of a golden.
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/app.dart';
import 'package:udine/screens/plate/custom_food.dart';
import '../fonts.dart';
import 'support.dart';

void main() {
  setUpAll(loadFonts);

  for (final w in [360.0, 390.0]) {
    final n = w.toInt();
    Future<void> shot(WidgetTester t, String name, String route, {Future<void> Function(WidgetTester t)? act}) async {
      final b = await bootRecorded(t);
      await openApp(t, b, route: route, w: w);
      await until(t, () => find.byType(CustomFoodSheet).evaluate().isNotEmpty);
      await t.pumpAndSettle();
      await act?.call(t);
      await t.pumpAndSettle();
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/custom_${name}_$n.png'));
      await drain(t);
    }

    testWidgets('empty, $n dp', (t) => shot(t, 'empty', '/custom'));
    testWidgets('with a name, $n dp', (t) => shot(t, 'named', '/custom?name=Chobani'));
    testWidgets('filled, $n dp', (t) => shot(t, 'filled', '/custom?name=Chobani&cal=140&p=12&c=15&f=0'));
    testWidgets('invalid, $n dp', (t) => shot(t, 'invalid', '/custom?name=Chobani', act: (t) async {
          await t.tap(find.text('Add to plate'));
        }));
  }
}
