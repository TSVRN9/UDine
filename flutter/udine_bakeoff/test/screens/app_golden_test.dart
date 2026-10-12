import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine_bakeoff/main.dart';
import 'package:udine_bakeoff/screens/hall_menu.dart';
import 'package:udine_bakeoff/ui/ui.dart';
import '../fonts.dart';
import '../logic/support.dart';
import 'harness.dart';

// The sheets, the plate and You as the whole app draws them, 390 x 844, against M2's render of the same state. Committed goldens draw
// no photos; BAKEOFF_PHOTO_SHOTS=<dir> writes the same screens with them.
Future<void> app(WidgetTester t, String name, {String seed = '', double w = 390, required Future<void> Function(WidgetTester) act}) async {
  sized(t, w: w);
  for (final withPhotos in [false, if (photoShots != null) true]) {
    Photos.enabled = withPhotos;
    final key = GlobalKey();
    final store = freshStore(seed);
    await t.pumpWidget(RepaintBoundary(key: key, child: BakeoffApp(fx: fx, store: store)));
    if (withPhotos) await t.runAsync(() => Future.delayed(const Duration(milliseconds: 600)));
    await t.pumpAndSettle();
    await act(t);
    await t.pumpAndSettle(const Duration(milliseconds: 50), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 6));
    if (!withPhotos) {
      await expectLater(find.byKey(key), matchesGoldenFile('app_${name}_${w.round()}.png'));
    } else {
      await savePng(t, key, '$photoShots/app_$name-${w.round()}-photos.png');
    }
  }
}

String weekSeed({bool receipt = false}) =>
    'plate=W:breakfast:hard boiled egg,make your own waffles,red potato home fries;W:lunch:beef brisket noodle bowl,golden bbq chicken thigh*2&logged=2${receipt ? '&receipt=1' : ''}';

Future<void> openHall(WidgetTester t, String name) async {
  await t.tap(find.text(name).first);
  await t.pumpAndSettle();
}

Future<void> tapRow(WidgetTester t, String name) async {
  await bringIn(t, find.text(name));
  await t.tap(find.text(name));
}

void main() {
  setUpAll(loadFonts);
  testWidgets('dish sheet at rest', (t) => app(t, 'dish', act: (t) async {
        await openHall(t, 'Worcester');
        await tapRow(t, 'Golden BBQ Chicken Thigh');
      }));
  testWidgets('dish sheet with both scores on', (t) => app(t, 'dish_scored', seed: 'scores=health,carbon', act: (t) async {
        await openHall(t, 'Worcester');
        await tapRow(t, 'Golden BBQ Chicken Thigh');
      }));
  testWidgets('station switcher open over the compact header, Soups current (M2 hall-index)', (t) => app(t, 'stations', act: (t) async {
        await openHall(t, 'Worcester');
        t.widget<CustomScrollView>(find.descendant(of: find.byType(HallMenu), matching: find.byType(CustomScrollView))).controller!.jumpTo(520);
        await t.pumpAndSettle();
        await t.tap(find.textContaining('Soups').last);
      }));
  testWidgets('hours and directions', (t) => app(t, 'hours', act: (t) async {
        await openHall(t, 'Worcester');
        await t.tap(find.text('Today'));
      }));
  testWidgets('hours on a later day', (t) => app(t, 'hours_day', act: (t) async {
        await openHall(t, 'Worcester');
        await t.tap(find.text('Today'));
        await t.pumpAndSettle();
        await t.tap(find.text('Saturday, October 17'));
        await t.pumpAndSettle();
        await t.tap(find.text('Sat 17'));
      }));
  testWidgets('plate bar with the benchmark plate', (t) => app(t, 'plate_bar', seed: 'plate=W:lunch:beef brisket noodle bowl,golden bbq chicken thigh*2', act: (t) async {
        await openHall(t, 'Worcester');
      }));
  testWidgets('plate sheet at mid', (t) => app(t, 'plate_mid', seed: 'plate=W:lunch:beef brisket noodle bowl,golden bbq chicken thigh*2', act: (t) async {
        await openHall(t, 'Worcester');
        await t.tap(find.textContaining('Worcester lunch,').first);
      }));
  // M2's week seed puts 802 cal in today's log: breakfast at Worcester 398, then the benchmark lunch 404 (src.html:2197)
  testWidgets('logged: the receipt with Undo, over Halls, 802 cal today', (t) => app(t, 'logged', seed: weekSeed(receipt: true), act: (t) async {}));
  testWidgets('You', (t) => app(t, 'you', seed: weekSeed(), act: (t) async {
        await t.tap(find.text('You').last);
      }));
  testWidgets('Dietary preferences', (t) => app(t, 'diet', seed: 'diet=veg&avoid=Peanuts,Milk', act: (t) async {
        await t.tap(find.text('You').last);
        await t.pumpAndSettle();
        await t.tap(find.text('Dietary preferences'));
      }));
  // 360 dp: nothing wraps or clips that M2 does not
  testWidgets('dish sheet at 360', (t) => app(t, 'dish', w: 360, act: (t) async {
        await openHall(t, 'Worcester');
        await tapRow(t, 'Golden BBQ Chicken Thigh');
      }));
  testWidgets('plate sheet at mid at 360', (t) => app(t, 'plate_mid', w: 360, seed: 'plate=W:lunch:beef brisket noodle bowl,golden bbq chicken thigh*2', act: (t) async {
        await openHall(t, 'Worcester');
        await t.tap(find.textContaining('Worcester lunch,').first);
      }));
  testWidgets('You at 360', (t) => app(t, 'you', w: 360, seed: weekSeed(), act: (t) async {
        await t.tap(find.text('You').last);
      }));
}
