import 'package:flutter_test/flutter_test.dart';
import 'package:udine/boot.dart';
import 'package:udine/dev/log_seed.dart';
export 'package:udine/dev/log_seed.dart' show seedToday, seedEarlier;
import 'package:udine/screens/you/day_page.dart';
import 'package:udine/screens/you/you_screen.dart';
import 'support.dart';

enum History { none, today, full }

/// The recorded app with `h` already in the log, as an upgraded RN database would hold it.
Future<Boot> bootYou(WidgetTester t, [History h = History.full]) async {
  final b = await bootRecorded(t);
  await t.runAsync(() async {
    await b.store!.addEntries([if (h != History.none) ...seedToday, if (h == History.full) ...seedEarlier]);
    await b.log!.reload();
  });
  return b;
}

Future<void> openYou(WidgetTester t, Boot b, {double w = 390, String route = '/you', bool reduced = false}) async {
  await openApp(t, b, route: route, w: w, reduced: reduced);
  await until(t, () => find.byType(route.startsWith('/you/day') ? DayPage : YouScreen).evaluate().isNotEmpty);
  await t.pumpAndSettle();
}

Future<List<Map<String, Object?>>> logRows(WidgetTester t, Boot b) async => (await t.runAsync(() => b.store!.db.rawQuery('SELECT rowid AS _rowid, * FROM log_entries ORDER BY rowid')))!;

/// Real time for a store write behind an edit, then the frames it causes.
Future<void> wrote(WidgetTester t) async {
  await t.pumpAndSettle(); // (a row's close-up runs first, then the write it waited for)
  // each write is real I/O whose next step (an Undo's re-read) starts on the frame after it lands
  for (var i = 0; i < 3; i++) {
    await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 80)));
    await t.pumpAndSettle();
  }
}
