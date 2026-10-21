import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'support.dart';

/// M2 NOTES "Haptics" table: what each action buzzes (`light` = lightImpact, `tick` = selectionClick).
void main() {
  setUpAll(loadFonts);
  const light = 'HapticFeedbackType.lightImpact', tick = 'HapticFeedbackType.selectionClick';

  late List<String> buzzed;
  void listen(WidgetTester t) {
    buzzed = [];
    t.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (c) async {
      if (c.method == 'HapticFeedback.vibrate') buzzed.add(c.arguments as String);
      return null;
    });
    addTearDown(() => t.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
  }

  Future<void> ready(WidgetTester t) => until(t, () => find.byType(Meter).evaluate().isNotEmpty);
  Future<void> menuIn(WidgetTester t) async {
    await until(t, () => find.byType(Spinner).evaluate().isEmpty && find.byType(DishRow).evaluate().isNotEmpty);
    await t.pumpAndSettle();
  }
  Future<void> edgeBack(WidgetTester t) async {
    final g = await t.startGesture(const Offset(5, 400));
    await g.moveBy(const Offset(30, 0));
    await g.moveBy(const Offset(270, 0));
    buzzed.clear();
    await g.up();
    await t.pumpAndSettle();
  }

  testWidgets('a band into its hall: light; a dish row: tick', (t) async {
    listen(t);
    await openApp(t, await bootRecorded(t));
    await ready(t);
    buzzed.clear();
    await t.tap(find.text('Worcester'));
    await menuIn(t);
    expect(buzzed, [light]);
    buzzed.clear();
    await t.tap(find.byType(DishRow).first);
    await t.pump();
    expect(buzzed, [tick]);
    await drain(t);
  });

  testWidgets('an area row into its page: light; the edge swipe that commits: light', (t) async {
    listen(t);
    await openApp(t, await bootRecorded(t));
    await ready(t);
    await t.drag(find.byType(SingleChildScrollView), const Offset(0, -3000));
    await t.pump();
    buzzed.clear();
    await t.tap(find.text('North, by Worcester'));
    await t.pumpAndSettle();
    await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
    expect(buzzed, [light]);
    await edgeBack(t);
    expect(buzzed, [light]);
    await drain(t);
  });

  testWidgets('pin and unpin: light each', (t) async {
    listen(t);
    await openApp(t, await bootRecorded(t, pins: ['Harvest Market']));
    await ready(t);
    await t.tap(find.text('Harvest Market'));
    await menuIn(t);
    buzzed.clear();
    await t.tap(find.byType(PinButton));
    await t.pump();
    expect(buzzed, [light]); // unpin
    await t.tap(find.byType(PinButton));
    await t.pump();
    expect(buzzed, [light, light]); // pin
    await drain(t);
  });
}
