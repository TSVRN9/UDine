// Favorites' Notify me at 360 and 390 dp in each state of the brief (M2 R11 §2), over M2's fixed clock and two starred dishes.
import 'package:flutter/foundation.dart' show TargetPlatform, debugDefaultTargetPlatformOverride;
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/app.dart';
import '../alerts/fake_os.dart';
import '../fonts.dart';
import 'plate_support.dart';
import 'support.dart';
import 'you_support.dart';

void main() {
  setUpAll(loadFonts);
  for (final w in [360.0, 390.0]) {
    final n = w.toInt();

    Future<void> shot(WidgetTester t, String name, FakeAlertsOs os, {bool on = false, bool tap = false, bool track = true, bool ios = false}) async {
      if (ios) debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      final b = await bootYou(t, History.full, os, on, track);
      await t.runAsync(() async {
        await b.prefs.toggleFavorite('Beef Brisket Noodle Bowl');
        await b.prefs.toggleFavorite('Golden BBQ Chicken Thigh');
      });
      await openYou(t, b, w: w, route: '/you/favs');
      await until(t, () => find.text('At lunch now at Worcester').evaluate().isNotEmpty);
      if (tap) {
        await t.tap(find.text('Notify me'));
        await wrote(t);
      }
      await t.pumpAndSettle();
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/alerts_${name}_$n.png'));
      debugDefaultTargetPlatformOverride = null;
      await finish(t);
    }

    testWidgets('off, $n dp', (t) => shot(t, 'off', FakeAlertsOs()));
    testWidgets('allowed, $n dp', (t) => shot(t, 'allowed', FakeAlertsOs(), tap: true));
    testWidgets('tracking off with alerts on, $n dp', (t) => shot(t, 'trackoff', FakeAlertsOs(permitted: true), on: true, track: false));
    testWidgets('denied, $n dp', (t) => shot(t, 'denied', FakeAlertsOs(willAllow: false), tap: true));
    testWidgets('revoked, found on resume, $n dp', (t) => shot(t, 'revoked', FakeAlertsOs(), on: true));
    testWidgets('background off on Android, $n dp', (t) => shot(t, 'bg_android', FakeAlertsOs(permitted: true, restricted: true), on: true));
    testWidgets('background off on iOS, $n dp', (t) => shot(t, 'bg_ios', FakeAlertsOs(permitted: true, restricted: true), on: true, ios: true));
  }
}
