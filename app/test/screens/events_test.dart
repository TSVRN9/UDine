// Search's idle events and the event page, on the recorded Oct 8 12:41 feed (Indigenous Peoples Day merged with its Hours twin).
import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/boot.dart';
import 'package:udine/data/states.dart';
import 'package:url_launcher_platform_interface/link.dart';
import 'package:url_launcher_platform_interface/url_launcher_platform_interface.dart';
import 'package:udine/screens/event/event_banner.dart';
import 'package:udine/screens/event/event_page.dart' show launchWeb;
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/screens/search/events.dart';
import 'package:udine/theme/tokens.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'search_screen_test.dart' show finish, focused, openSearch, settle, type;
import 'support.dart';

Future<void> openEventsApp(WidgetTester t, String route) async {
  await openApp(t, await bootRecorded(t), route: route);
  await settle(t);
}

class _Launcher extends UrlLauncherPlatform with MockPlatformInterfaceMixin {
  final calls = <String>[];
  @override
  LinkDelegate? get linkDelegate => null;
  @override
  Future<bool> canLaunch(String url) async => true;
  @override
  Future<bool> launchUrl(String url, LaunchOptions options) async {
    calls.add(url);
    return true;
  }
}

String feed(List<Map<String, Object>> events) => jsonEncode({'events': events});

void main() {
  setUpAll(loadFonts);

  test('a feed link opens only as an http(s) address with a host; an intent:, a tel: or a malformed href does nothing and throws nothing', () async {
    final l = _Launcher();
    UrlLauncherPlatform.instance = l;
    for (final bad in ['intent://scan/#Intent;scheme=zxing;end', 'tel:+14135450000', 'javascript:alert(1)', 'https://', 'http://[::1', '', 'not a url']) {
      await launchWeb(bad);
    }
    expect(l.calls, isEmpty);
    await launchWeb('https://www.umassdining.com/hours');
    expect(l.calls, ['https://www.umassdining.com/hours']);
  });

  testWidgets('events=0 on a recorded route reaches the repository: no events; without it the recorded feed', (t) async {
    final boots = await t.runAsync(() async {
      sqfliteFfiInit();
      databaseFactory = databaseFactoryFfi;
      Future<int> n(String route) async => switch (await (await Boot.open(route, read: readRecorded)).repo.events().firstWhere((s) => s is Loaded)) { Loaded(:final value) => value.length, _ => -1 };
      return (await n('/search?data=recorded&events=0'), await n('/search?data=recorded'));
    });
    expect(boots!.$1, 0);
    expect(boots.$2, 5);
  });

  testWidgets('an event that has already expired is not offered', (t) async {
    // the recording's clock is Oct 8 12:41 Eastern (1791477660)
    final gone = {'title': 'Gone Day', 'featured_image': '', 'pdf_link': 'https://umassdining.com/a.png', 'external_link': '', 'expiration_date': 1791400000, 'is_featured': '0'};
    final live = {'title': 'Live Day', 'featured_image': '', 'pdf_link': 'https://umassdining.com/b.png', 'external_link': '', 'expiration_date': 1791777600, 'is_featured': '0'};
    await openApp(t, await bootRecorded(t, read: (n) async => n == 'events-raw.json' ? feed([gone, live]) : readRecorded(n)), route: '/search');
    await until(t, () => find.byType(EventCard).evaluate().isNotEmpty);
    expect(find.text('Live Day'), findsOneWidget);
    expect(find.text('Gone Day'), findsNothing);
    await finish(t);
  });

  testWidgets('idle Search: Events, one card each, soonest first, the date as M2 words it', (t) async {
    await openSearch(t);
    await until(t, () => find.byType(EventCard).evaluate().isNotEmpty);
    expect(find.text('Events'), findsOneWidget);
    expect(find.text('Indigenous Peoples Day'), findsOneWidget);
    expect(find.text('Mon, Oct 12'), findsOneWidget);
    expect(find.text('Through Oct 31'), findsOneWidget);
    expect(find.text('Pete and Gerry'), findsOneWidget);
    expect(find.byType(EventCard), findsNWidgets(4));
    expect(t.getTopLeft(find.byType(EventCard).first).dx, M2Layout.evcStart);
    expect(t.getSize(find.byType(EventBanner).first).width, M2Layout.evCardW);
    await finish(t);
  });

  testWidgets('a query or a lens takes the events away', (t) async {
    await openSearch(t);
    await until(t, () => find.byType(EventCard).evaluate().isNotEmpty);
    await type(t, 'pizza');
    expect(find.byType(EventCard), findsNothing);
    await finish(t);
  });

  testWidgets('no events this week: idle Search has no band and no heading', (t) async {
    await openApp(t, await bootRecorded(t, read: (n) async => n == 'events-raw.json' ? '{"events":[]}' : readRecorded(n)), route: '/search');
    await settle(t);
    expect(find.text('Events'), findsNothing);
    expect(find.byType(EventCard), findsNothing);
    await finish(t);
  });

  testWidgets('an event card opens its page: the date, See the menu gold and Holiday hours outlined; back returns to Search', (t) async {
    await openSearch(t);
    await until(t, () => find.byType(EventCard).evaluate().isNotEmpty);
    await t.tap(find.byType(EventCard).first);
    await t.pumpAndSettle();
    expect(find.text('See the menu'), findsOneWidget);
    expect(find.text('Holiday hours'), findsOneWidget);
    final kinds = [for (final b in t.widgetList<Button>(find.byType(Button))) b.kind];
    expect(kinds, [ButtonKind.gold, ButtonKind.outline, ButtonKind.outline]);
    expect(find.text('Open the flyer'), findsOneWidget);
    expect(find.text('Mon, Oct 12'), findsOneWidget);
    await t.tap(find.byType(BackButton));
    await t.pumpAndSettle();
    expect(find.text('See the menu'), findsNothing);
    expect(find.text('Events'), findsOneWidget);
    await finish(t);
  });

  testWidgets('See the menu lands on the hall menu of the event\'s own day (Monday Oct 12 is 4 days on)', (t) async {
    await openEventsApp(t, '/event/0');
    await until(t, () => find.text('See the menu').evaluate().isNotEmpty);
    await t.tap(find.text('See the menu'));
    await t.pump();
    await until(t, () => find.byType(HallMenu).evaluate().isNotEmpty);
    expect(t.widget<HallMenu>(find.byType(HallMenu)).day, 4);
    expect(t.widget<HallMenu>(find.byType(HallMenu)).place, 'W');
    await finish(t);
  });

  testWidgets('/event/<id>: an event with no merged hours has its flyer link only', (t) async {
    await openEventsApp(t, '/event/1');
    await until(t, () => find.text('Open the flyer').evaluate().isNotEmpty);
    expect(find.text('Holiday hours'), findsNothing);
    expect(find.text('Through Oct 31'), findsOneWidget);
    await finish(t);
  });

  testWidgets('Photos off: no event picture is requested', (t) async {
    await openSearch(t);
    await until(t, () => find.byType(EventCard).evaluate().isNotEmpty);
    expect(find.byType(Image), findsNothing);
    await finish(t);
  });

  testWidgets('coming back from the event page, or from a hall opened from its card, leaves the field unfocused (no keyboard)', (t) async {
    await openSearch(t);
    await until(t, () => find.byType(EventCard).evaluate().isNotEmpty);
    expect(focused(t), isTrue); // Search opens in its field
    await t.tap(find.byType(EventCard).first);
    await t.pumpAndSettle();
    await t.tap(find.byType(BackButton));
    await t.pumpAndSettle();
    expect(focused(t), isFalse);
    expect(t.view.viewInsets.bottom, 0);
    await type(t, 'worcester');
    expect(focused(t), isTrue); // the user is still in the field when they tap the hall card
    await t.tap(find.byType(Band).first);
    await t.pump();
    await until(t, () => find.byType(HallMenu).evaluate().isNotEmpty);
    await settle(t);
    await t.tap(find.byType(BackButton).first);
    await settle(t);
    expect(find.byType(HallMenu), findsNothing);
    expect(focused(t), isFalse);
    await finish(t);
  });
}
