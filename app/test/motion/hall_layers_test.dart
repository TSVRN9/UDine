import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/ui/ui.dart' show Photos, Photo;
import '../fonts.dart';
import '../screens/support.dart';

/// Layers that cost an offscreen texture and a saveLayer each frame they are in the tree (flutter-motion-fixes Task 1).
int offscreenLayers(Layer root) {
  // an OpacityLayer at alpha 0 or 255 has a fast path (no saveLayer)
  var n = (root is OpacityLayer && root.alpha != null && root.alpha! > 0 && root.alpha! < 255) || root is ColorFilterLayer || root is ImageFilterLayer || root is ShaderMaskLayer || root is BackdropFilterLayer ? 1 : 0;
  if (root is ContainerLayer) {
    for (Layer? c = root.firstChild; c != null; c = c.nextSibling) {
      n += offscreenLayers(c);
    }
  }
  return n;
}

void main() {
  drift();
  photoLayer();
  setUpAll(loadFonts);

  testWidgets('a hall opening from its band keeps offscreen layers few at p of 0.15, 0.3, 0.5 and 0.85', (t) async {
    await openApp(t, await bootRecorded(t));
    await t.pump();
    await t.tap(find.text('Worcester'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 16));
    await t.pump(const Duration(milliseconds: 16));
    final counts = <double, int>{};
    double p() => t.widget<HallMenu>(find.byType(HallMenu)).progress.value;
    for (final want in [0.15, 0.3, 0.5, 0.85]) {
      var guard = 0;
      while (p() < want && guard++ < 100) {
        await t.pump(const Duration(milliseconds: 8));
      }
      counts[want] = offscreenLayers(t.binding.renderViews.first.debugLayer!);
    }
    // M2 R13 §4: at most 3 a frame while it runs. The photo's duotone is the third (see the Photo test below; the page draws none here, so
    // the budget left for everything else is 3: the back button's fade, the busy board's and the header letter's, which now comes in
    // with the page since the band carries none).
    for (final n in counts.values) {
      expect(n, lessThanOrEqualTo(3), reason: 'offscreen layers by p: $counts');
    }
    await t.pump(const Duration(seconds: 1));
    await drain(t);
  });
}

/// The photo is one offscreen layer however far it has developed: the colour image under it is drawn plainly (opaque, never faded), the
/// duotone over it is the one ColorFilter layer (M2 R13: the ground never thins), and nothing else is composited.
void photoLayer() {
  for (final duo in [0.0, 0.3, 0.5, 0.9, 1.0]) {
    testWidgets('a Photo at duotone $duo adds one offscreen layer', (t) async {
      Photos.enabled = true;
      addTearDown(() => Photos.enabled = false);
      await t.pumpWidget(Directionality(textDirection: TextDirection.ltr, child: SizedBox(width: 390, height: 200, child: Photo(path: 'assets/photos/none.jpg', duo: AlwaysStoppedAnimation(duo)))));
      expect(offscreenLayers(t.binding.renderViews.first.debugLayer!), 1);
    });
  }
}

void drift() {
  testWidgets('the title does not move after the container lands', (t) async {
    await openApp(t, await bootRecorded(t));
    await t.pump();
    await t.tap(find.text('Franklin'));
    Rect title() => t.getRect(find.byKey(const ValueKey('fade-title')));
    Rect? atLanding;
    for (var i = 0; i < 80; i++) {
      await t.pump(const Duration(milliseconds: 16));
      if (atLanding == null && t.widget<HallMenu>(find.byType(HallMenu)).progress.value >= 1) atLanding = title();
    }
    await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 200)));
    await t.pump(const Duration(milliseconds: 300));
    expect(title(), atLanding);
    await drain(t);
  });
}
