import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine_bakeoff/main.dart';
import 'package:udine_bakeoff/ui/ui.dart';
import '../fonts.dart';
import '../logic/support.dart';

// The committed goldens draw no photos (UMass's are never committed): the bands show their maroon ground, grade and chenille letter.
// BAKEOFF_PHOTO_SHOTS=<dir> also writes the same screens, with the photos, to <dir> for looking at (never committed).
final shots = Platform.environment['BAKEOFF_PHOTO_SHOTS'];
const five = ['Wasabi', 'Tamales', "Peet's Coffee & Tea", 'Harvest Market', 'Procrastination Station'];

Future<void> screen(WidgetTester tester, String name, List<String> pins, {bool end = false}) async {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  for (final photos in [false, if (shots != null) true]) {
    Photos.enabled = photos;
    final key = GlobalKey();
    await tester.pumpWidget(RepaintBoundary(key: key, child: BakeoffApp(fx: fx, pins: pins)));
    if (photos) await tester.runAsync(() => Future.delayed(const Duration(milliseconds: 600)));
    if (end) await tester.drag(find.byType(SingleChildScrollView), const Offset(0, -3000));
    await tester.pumpAndSettle();
    if (!photos) {
      await expectLater(find.byType(BakeoffApp), matchesGoldenFile('$name.png'));
    } else {
      await tester.runAsync(() async {
        final b = key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
        final png = await (await b.toImage()).toByteData(format: ui.ImageByteFormat.png);
        Directory(shots!).createSync(recursive: true);
        File('$shots/$name-photos.png').writeAsBytesSync(png!.buffer.asUint8List());
      });
    }
  }
}

void main() {
  setUpAll(loadFonts);
  testWidgets('Halls at rest (two pins, top of the list)', (t) => screen(t, 'halls_rest', const ['Wasabi', 'Tamales']));
  testWidgets('Halls with 0 pins, scrolled to the end', (t) => screen(t, 'halls_pins0', const [], end: true));
  testWidgets('Halls with 2 pins, scrolled to the end', (t) => screen(t, 'halls_pins2', const ['Wasabi', 'Tamales'], end: true));
  testWidgets('Halls with 5 pins, scrolled to the end', (t) => screen(t, 'halls_pins5', five, end: true));
}
