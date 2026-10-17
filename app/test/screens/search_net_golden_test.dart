import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/app.dart';
import 'package:udine/data/recorded/flags.dart' show NetMode;
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/screens/search/events.dart' show EventCard;
import 'package:udine/screens/search/net_line.dart';
import 'package:udine/ui/ui.dart' show Band;
import '../fonts.dart';
import 'search_screen_test.dart' show finish, settle;
import 'support.dart';

// Search offline and failed at 360 and 390 dp (M2 round 11 §4) over M2's recordings and the fixed clock (Thursday Oct 8, 12:41). The field is unfocused for the
// capture. Photos are never drawn.
void main() {
  setUpAll(loadFonts);

  for (final w in [360.0, 390.0]) {
    final n = w.toInt();

    Future<void> shot(WidgetTester t, String name, NetMode net, String route, {Set<String> cafes = const {}, bool events = false}) async {
      await openApp(t, await bootRecorded(t, net: net, savedCafes: cafes), route: route, w: w);
      await until(t, () => find.byType(NetNote).evaluate().isNotEmpty || find.byType(NetFail).evaluate().isNotEmpty);
      await until(t, () => find.byType(DishRow).evaluate().isNotEmpty || find.byType(Band).evaluate().isNotEmpty || find.textContaining('Nothing called').evaluate().isNotEmpty || net == NetMode.fail);
      if (events) await until(t, () => find.byType(EventCard).evaluate().isNotEmpty);
      await finish(t);
      FocusManager.instance.primaryFocus?.unfocus();
      await settle(t);
      // (the packaged answer: the query rests in fake time, then real I/O, then its frame; a capture must not catch it half-way)
      await finish(t);
      await settle(t);
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/search_net_${name}_$n.png'));
    }

    testWidgets('offline idle: the line, then Events, $n dp', (t) => shot(t, 'offline_idle', NetMode.offline, '/search', events: true));
    testWidgets('offline, a query with results, $n dp', (t) => shot(t, 'offline_bbq', NetMode.offline, '/search?q=bbq'));
    testWidgets('offline with a café opened today, $n dp', (t) => shot(t, 'offline_saved', NetMode.offline, '/search?q=bbq', cafes: {'Green Fields'}));
    testWidgets('offline, no match, $n dp', (t) => shot(t, 'offline_nomatch', NetMode.offline, '/search?q=clif'));
    testWidgets('failed, idle: the pair and nothing else, $n dp', (t) => shot(t, 'fail_idle', NetMode.fail, '/search'));
    testWidgets('failed, a place query: the hall card, $n dp', (t) => shot(t, 'fail_place', NetMode.fail, '/search?q=worcester'));
    testWidgets('failed, no match: only the custom-food call, $n dp', (t) => shot(t, 'fail_nomatch', NetMode.fail, '/search?q=clif'));
  }
}
