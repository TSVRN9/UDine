import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/app.dart';
import '../fonts.dart';
import 'search_screen_test.dart' show finish, settle;
import 'support.dart';

// The event page at 360 and 390 dp, with both buttons (id 0, merged hours) and with the flyer alone (id 1). Photos are never drawn.
void main() {
  setUpAll(loadFonts);
  for (final w in [360.0, 390.0]) {
    for (final (id, name, text) in [(0, 'hours', 'Holiday hours'), (1, 'flyer', 'Open the flyer')]) {
      testWidgets('the event page with $name, ${w.toInt()} dp', (t) async {
        await openApp(t, await bootRecorded(t), route: '/event/$id', w: w);
        await until(t, () => find.text(text).evaluate().isNotEmpty);
        await settle(t);
        await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/event_${name}_${w.toInt()}.png'));
        await finish(t);
      });
    }
  }
}
