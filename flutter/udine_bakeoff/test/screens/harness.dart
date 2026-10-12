import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:udine_bakeoff/screens/hall_menu.dart';
import 'package:udine_bakeoff/shell_api.dart';
import 'package:udine_bakeoff/state/seed.dart';
import 'package:udine_bakeoff/state/store.dart';
import 'package:udine_bakeoff/ui/sheet.dart';
import '../logic/support.dart';

/// What a screen under test asks of the shell: sheets are kept (not drawn), dishes and pushes are recorded.
class FakeShell implements ShellApi {
  final sheets = <Widget Function(SheetHandle, VoidCallback)>[];
  final dishes = <DishCtx>[];
  final halls = <HallTarget>[];
  @override
  double get top => 24;
  @override
  SheetHandle pushSheet(Widget Function(SheetHandle handle, VoidCallback done) build) {
    sheets.add(build);
    return SheetHandle();
  }

  @override
  void openDish(DishCtx ctx) => dishes.add(ctx);
  @override
  void pushHall(HallTarget target) => halls.add(target);
  @override
  void pushPage(Widget Function(BuildContext context, VoidCallback pop) build) {}
}

Store freshStore([String seed = '']) {
  SharedPreferences.setMockInitialValues({});
  final s = Store(fx);
  if (seed.isNotEmpty) applySeed(s, fx, seed);
  return s;
}

/// A hall screen at rest at a phone's width, the status inset M2 floors at 24, under a store and a fake shell.
Widget hallApp({required Store store, required FakeShell shell, String place = 'W', int day = 0, String? meal, double w = 390, double h = 844, HallTarget? land, Key? key}) => Directionality(
      textDirection: TextDirection.ltr,
      child: MediaQuery(
        data: MediaQueryData(size: Size(w, h), padding: const EdgeInsets.only(top: 24, bottom: 0)),
        child: StoreScope(
          store: store,
          child: ShellScope(api: shell, child: SizedBox(width: w, height: h, child: HallMenu(key: key, fx: fx, place: place, top: 24, height: h, day: day, meal: meal, land: land, onBack: () {}))),
        ),
      ),
    );

void sized(WidgetTester t, {double w = 390, double h = 844}) {
  t.view.physicalSize = Size(w, h);
  t.view.devicePixelRatio = 1;
  addTearDown(t.view.reset);
}

final photoShots = Platform.environment['BAKEOFF_PHOTO_SHOTS'];

/// The committed goldens draw no photos (UMass's are never committed). With BAKEOFF_PHOTO_SHOTS set, the same screen is also written with
/// them, for looking at.
Future<void> shot(WidgetTester t, Widget app, String name, {required Future<void> Function() settle}) async {
  final key = GlobalKey();
  await t.pumpWidget(RepaintBoundary(key: key, child: app));
  await settle();
  await expectLater(find.byKey(key), matchesGoldenFile('$name.png'));
}

Future<void> savePng(WidgetTester t, GlobalKey key, String path) => t.runAsync(() async {
      final b = key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      final png = await (await b.toImage()).toByteData(format: ui.ImageByteFormat.png);
      Directory(File(path).parent.path).createSync(recursive: true);
      File(path).writeAsBytesSync(png!.buffer.asUint8List());
    });
