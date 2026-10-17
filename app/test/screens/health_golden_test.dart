// Every state of the You Health row at 360 and 390 dp over M2's fixed clock. Photos are UMass's and never committed: nothing here draws one.
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/app.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'health_support.dart';
import 'support.dart';
import 'you_support.dart';

void main() {
  setUpAll(loadFonts);
  for (final w in [360.0, 390.0]) {
    final n = w.toInt();
    for (final (name, os, health, tap) in [('off', 'android', 'allow', false), ('allowed', 'android', 'allow', true), ('denied', 'android', 'deny', true), ('revoked', 'android', 'revoked', false), ('ios_denied', 'ios', 'deny', true)]) {
      testWidgets('Health row, $name, $n dp', (t) async {
        final b = await bootYou(t, History.none);
        await bootHealth(t, b, os: os, health: health);
        await openYou(t, b, w: w);
        if (tap) {
          await t.tap(find.byType(CheckRow).at(1));
          await wrote(t);
        }
        await t.pumpAndSettle();
        await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/health_${name}_$n.png'));
        await drain(t);
      });
    }
  }
}
