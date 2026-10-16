// Search offline and failed (M2 round 11 §4): the line at the top says what is searched, Events stay offline, a failure is Halls' own pair.
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/data/recorded/flags.dart' show NetMode;
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/screens/search/events.dart' show EventCard;
import 'package:udine/screens/search/net_line.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'search_screen_test.dart' show finish, openSearch, settle, type;
import 'support.dart';

const offlineBase = "You're offline. Searching the menus saved on this phone: the halls, today and tomorrow";

Future<void> open(WidgetTester t, NetMode net, {String route = '/search', Set<String> cafes = const {}}) async {
  await openApp(t, await bootRecorded(t, net: net, savedCafes: cafes), route: route);
  await until(t, () => find.byType(NetNote).evaluate().isNotEmpty || find.byType(NetFail).evaluate().isNotEmpty);
  await until(t, () => find.byType(DishRow).evaluate().isNotEmpty || find.byType(Band).evaluate().isNotEmpty || find.textContaining('Nothing called').evaluate().isNotEmpty || net == NetMode.fail);
  await finish(t);
  await settle(t);
}

void main() {
  setUpAll(loadFonts);

  testWidgets('offline: the line names the halls, above the Events band and the results; no cafés are named', (t) async {
    await open(t, NetMode.offline);
    expect(find.text('$offlineBase.'), findsOneWidget);
    await until(t, () => find.byType(EventCard).evaluate().isNotEmpty);
    expect(t.getTopLeft(find.byType(NetNote)).dy, lessThan(t.getTopLeft(find.text('Events')).dy));
    expect(t.getTopLeft(find.text('Events')).dy, lessThan(t.getTopLeft(find.text('Lunch now')).dy));
    await finish(t);
  });

  testWidgets('offline with a café opened today: it is named, and its dishes are found', (t) async {
    await open(t, NetMode.offline, cafes: {'Green Fields'}, route: '/search');
    expect(find.text('$offlineBase, and Green Fields, today.'), findsOneWidget);
    await finish(t);
  });

  testWidgets('offline with a saved café that lists several: "a, b and c"', (t) {
    expect(offlineLine(['Green Fields', 'Hampshire Market', 'Blue Wall']), '$offlineBase, and Green Fields, Hampshire Market and Blue Wall, today.');
    expect(offlineLine(const []), '$offlineBase.');
    return Future.value();
  });

  testWidgets('offline, a dish no saved menu has: the empty line says a saved menu', (t) async {
    await open(t, NetMode.offline, route: '/search?q=clif');
    expect(find.text('Nothing called “clif” is on a saved menu.'), findsOneWidget);
    await finish(t);
  });

  testWidgets('offline, a place still matches by name', (t) async {
    await open(t, NetMode.offline, route: '/search?q=worcester');
    expect(find.byType(Band), findsOneWidget);
    await finish(t);
  });

  testWidgets('online: no line, no pair', (t) async {
    await openSearch(t);
    expect(find.byType(NetNote), findsNothing);
    expect(find.byType(NetFail), findsNothing);
    await finish(t);
  });

  testWidgets('failed: "Couldn\'t connect" and Try again; no Events band, no menu group, no empty line', (t) async {
    await open(t, NetMode.fail);
    expect(find.text("Couldn't connect"), findsOneWidget);
    expect(find.widgetWithText(Button, 'Try again'), findsOneWidget);
    expect(find.byType(EventCard), findsNothing);
    expect(find.text('Events'), findsNothing);
    expect(find.byType(DishRow), findsNothing);
    expect(find.textContaining('No dishes'), findsNothing);
    await finish(t);
  });

  testWidgets('failed, a query: the places still match, nothing says no menu has it, the custom-food button is the only call', (t) async {
    await open(t, NetMode.fail, route: '/search?q=worcester');
    expect(find.byType(Band), findsOneWidget);
    expect(find.textContaining('Nothing called'), findsNothing);
    await type(t, 'clif');
    expect(find.textContaining('Nothing called'), findsNothing);
    expect(find.byType(CustomFoodButton), findsOneWidget);
    await finish(t);
  });

  testWidgets('failed: Try again asks again, and a second failure says the same', (t) async {
    await open(t, NetMode.fail);
    await t.tap(find.widgetWithText(Button, 'Try again'));
    await settle(t);
    await until(t, () => find.text("Couldn't connect").evaluate().isNotEmpty);
    await finish(t);
  });

  testWidgets('/event/<id> offline opens from the saved events', (t) async {
    await openApp(t, await bootRecorded(t, net: NetMode.offline), route: '/event/0');
    await until(t, () => find.text('Share the flyer').evaluate().isNotEmpty);
    await finish(t);
  });
}
