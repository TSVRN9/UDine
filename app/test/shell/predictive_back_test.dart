import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/dish/dish_sheet.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/screens/halls/hall_page.dart';
import 'package:udine/screens/you/settings_pages.dart';
import 'package:udine/theme/tokens.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import '../screens/plate_support.dart';
import '../screens/support.dart';

/// Android's predictive back arrives on `flutter/backgesture`: the touch in physical px, Android's own progress, and then commit or
/// cancel, which Android decides. The app draws the gesture with the same frames as its edge swipe.
Future<void> _send(WidgetTester t, String method, [Object? args]) =>
    t.binding.defaultBinaryMessenger.handlePlatformMessage(SystemChannels.backGesture.name, const StandardMethodCodec().encodeMethodCall(MethodCall(method, args)), (_) {});

Map<String, Object?> _at(WidgetTester t, double dx, {double p = 0}) => {'touchOffset': [dx * t.view.devicePixelRatio, 400.0], 'progress': p, 'swipeEdge': 0};

Future<void> start(WidgetTester t, {double x = 2}) => _send(t, 'startBackGesture', _at(t, x));
Future<void> move(WidgetTester t, double x) async {
  await _send(t, 'updateBackGestureProgress', _at(t, x, p: 0.3));
  await t.pump();
}

Future<void> commit(WidgetTester t) => _send(t, 'commitBackGesture');
Future<void> cancel(WidgetTester t) => _send(t, 'cancelBackGesture');

/// Dietary preferences, pushed from You as a tap does (a launch route is a still base page).
Future<void> openDiet(WidgetTester t) async {
  await openApp(t, await bootRecorded(t), route: '/you');
  await t.pumpAndSettle();
  await t.tap(find.text('Dietary preferences'));
  await t.pumpAndSettle();
}

/// Worcester's menu, opened from its band (the card).
Future<void> openWorcester(WidgetTester t) async {
  await openApp(t, await bootRecorded(t));
  await until(t, () => find.text('Worcester').evaluate().isNotEmpty);
  await t.tap(find.text('Worcester'));
  await until(t, () => find.byType(Spinner).evaluate().isEmpty && find.byType(DishRow).evaluate().isNotEmpty);
  await t.pumpAndSettle();
}

double progressOf(WidgetTester t, Finder page) => ModalRoute.of(t.element(page))!.animation!.value;

void main() {
  setUpAll(loadFonts);

  group('predictive back', () {
    testWidgets('a pushed page follows the finger 1:1, and a cancel puts it back', (t) async {
      await openDiet(t);
      final page = find.byType(DietPage);
      await start(t);
      await move(t, 102);
      expect(progressOf(t, page), closeTo(1 - 100 / 390, 0.001));
      expect(t.getTopLeft(page).dx, closeTo(100, 0.5));
      await cancel(t);
      await t.pumpAndSettle();
      expect(progressOf(t, page), 1);
      expect(page, findsOneWidget);
      await drain(t);
    });

    testWidgets("on a 3x screen the finger's physical px are taken as dp: the page still follows 1:1", (t) async {
      await openDiet(t);
      t.view.physicalSize = const Size(390 * 3, 844 * 3);
      t.view.devicePixelRatio = 3;
      await t.pumpAndSettle();
      final page = find.byType(DietPage);
      await start(t);
      await move(t, 102);
      expect(progressOf(t, page), closeTo(1 - 100 / 390, 0.001));
      await cancel(t);
      await t.pumpAndSettle();
      await drain(t);
    });

    testWidgets('a commit settles the page out from where the finger left it, never back up first', (t) async {
      await openDiet(t);
      final page = find.byType(DietPage);
      await start(t);
      await move(t, 152);
      var last = progressOf(t, page);
      await commit(t);
      for (var i = 0; i < 40 && page.evaluate().isNotEmpty; i++) {
        await t.pump(const Duration(milliseconds: 16));
        if (page.evaluate().isEmpty) break;
        final now = progressOf(t, page);
        expect(now, lessThanOrEqualTo(last + 1e-9));
        last = now;
      }
      await t.pumpAndSettle();
      expect(page, findsNothing);
      await drain(t);
    });

    testWidgets('a hall page (the card) follows over the edge swipe distance', (t) async {
      await openWorcester(t);
      final page = find.byType(HallPage);
      await start(t);
      await move(t, 42);
      expect(progressOf(t, page), closeTo(1 - 40 / M2Motion.dragBackDist, 0.001));
      await commit(t);
      await t.pumpAndSettle();
      expect(page, findsNothing);
      await drain(t);
    });

    testWidgets('an open sheet takes the gesture: it lowers by the distance, and the page under it stays', (t) async {
      await openWorcester(t);
      final page = find.byType(HallPage);
      await t.tap(find.byType(DishRow).first);
      await until(t, () => find.byType(DishSheet).evaluate().isNotEmpty);
      await t.pumpAndSettle();
      final handle = t.widget<DishSheet>(find.byType(DishSheet)).handle, rest = handle.px;
      await start(t);
      await move(t, 82);
      expect(handle.px, closeTo(rest - 80, 0.5));
      expect(progressOf(t, page), 1);
      await cancel(t);
      await t.pumpAndSettle();
      expect(handle.px, closeTo(rest, 0.5));
      await start(t);
      await move(t, rest + 200); // past shut: the sheet stays just open, since Android may still cancel
      expect(handle.px, greaterThanOrEqualTo(1));
      await cancel(t);
      await t.pumpAndSettle();
      expect(handle.px, closeTo(rest, 0.5));
      expect(find.byType(DishSheet), findsOneWidget);
      await start(t);
      await move(t, 82);
      await commit(t);
      await t.pumpAndSettle();
      expect(find.byType(DishSheet), findsNothing);
      expect(page, findsOneWidget);
      await drain(t);
    });

    testWidgets('a back while the sheet is still leaving goes to the page under it, not into the closing sheet', (t) async {
      await openWorcester(t);
      final page = find.byType(HallPage);
      await t.tap(find.byType(DishRow).first);
      await until(t, () => find.byType(DishSheet).evaluate().isNotEmpty);
      await t.pumpAndSettle();
      await start(t);
      await move(t, 82);
      await commit(t);
      await t.pump(const Duration(milliseconds: 60)); // the sheet is on its way out, and still in the tree
      expect(find.byType(DishSheet), findsOneWidget);
      await start(t);
      await move(t, 42);
      await commit(t);
      await t.pumpAndSettle();
      expect(find.byType(DishSheet), findsNothing);
      expect(page, findsNothing);
      await drain(t);
    });

    testWidgets('an open plate lowers with the gesture and a commit puts it into the bar; Halls stays', (t) async {
      await openPlate(t);
      await t.tap(inBar(find.textContaining(RegExp(r'items?$'))));
      await t.pumpAndSettle();
      final h = plateHandle(t), rest = h.px;
      await start(t);
      await move(t, 62);
      expect(h.px, closeTo(rest - 60, 0.5));
      await commit(t);
      await t.pumpAndSettle();
      expect(h.px, M2Layout.barMin);
      await drain(t);
    });

    testWidgets('the 3-button back is no gesture: it pops at once, as before', (t) async {
      await openDiet(t);
      await _send(t, 'startBackGesture', {'touchOffset': null, 'progress': 0.0, 'swipeEdge': 0});
      await commit(t);
      await t.pumpAndSettle();
      expect(find.byType(DietPage), findsNothing);
      await drain(t);
    });
  });
}
