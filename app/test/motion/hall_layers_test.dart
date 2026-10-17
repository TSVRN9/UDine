import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/hall/hall_menu.dart';
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
  setUpAll(loadFonts);

  testWidgets('a hall opening from its band keeps offscreen layers few at p of 0.15, 0.5 and 0.85', (t) async {
    await openApp(t, await bootRecorded(t));
    await t.pump();
    await t.tap(find.text('Worcester'));
    await t.pump();
    await t.pump(const Duration(milliseconds: 16));
    await t.pump(const Duration(milliseconds: 16));
    final counts = <double, int>{};
    double p() => t.widget<HallMenu>(find.byType(HallMenu)).progress.value;
    for (final want in [0.15, 0.5, 0.85]) {
      var guard = 0;
      while (p() < want && guard++ < 100) {
        await t.pump(const Duration(milliseconds: 8));
      }
      counts[want] = offscreenLayers(t.binding.renderView.debugLayer!);
    }
    for (final n in counts.values) {
      expect(n, lessThanOrEqualTo(4), reason: 'offscreen layers by p: $counts');
    }
    await t.pump(const Duration(seconds: 1));
    await drain(t);
  });
}
