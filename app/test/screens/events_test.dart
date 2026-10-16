// Search's idle events and the event page, on the recorded Oct 8 12:41 feed (Indigenous Peoples Day merged with its Hours twin).
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:share_plus/share_plus.dart' show XFile;
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/boot.dart';
import 'package:udine/core/types.dart' show DiningEvent;
import 'package:udine/data/flyer.dart';
import 'package:udine/data/source.dart' show Unreachable;
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
      Future<int> n(String route) async => switch ((await (await Boot.open(route, read: readRecorded)).repo.events().toList()).whereType<Loaded<List<DiningEvent>>>().last) { Loaded(:final value) => value.length, _ => -1 };
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

  testWidgets('an event card opens its page: the date, Holiday hours gold and Share the flyer outlined; back returns to Search', (t) async {
    await openSearch(t);
    await until(t, () => find.byType(EventCard).evaluate().isNotEmpty);
    await t.tap(find.byType(EventCard).first);
    await until(t, () => find.text('Holiday hours').evaluate().isNotEmpty); // (the saved events are read from the store)
    await t.pumpAndSettle();
    expect(find.text('Holiday hours'), findsOneWidget);
    expect(find.text('Share the flyer'), findsOneWidget);
    final kinds = [for (final b in t.widgetList<Button>(find.byType(Button))) b.kind];
    expect(kinds, [ButtonKind.gold, ButtonKind.outline]);
    for (final gone in ['See the menu', 'Open the flyer']) {
      expect(find.text(gone), findsNothing);
    }
    expect(find.text('Mon, Oct 12'), findsOneWidget);
    await t.tap(find.byType(BackButton));
    await t.pumpAndSettle();
    expect(find.text('Events'), findsOneWidget);
    await finish(t);
  });

  testWidgets('/event/<id>: an event with no merged hours has one gold Share the flyer and no link', (t) async {
    await openEventsApp(t, '/event/1');
    await until(t, () => find.text('Share the flyer').evaluate().isNotEmpty);
    expect([for (final b in t.widgetList<Button>(find.byType(Button))) b.kind], [ButtonKind.gold]);
    expect(find.text('Holiday hours'), findsNothing);
    expect(find.text('Through Oct 31'), findsOneWidget);
    await finish(t);
  });

  testWidgets('the flyer: Photos off requests no picture and holds a letter-shaped felt ground', (t) async {
    await openEventsApp(t, '/event/1');
    await until(t, () => find.byKey(const ValueKey('flyer-ground')).evaluate().isNotEmpty); // (the saved events are read from the store)
    expect(find.byType(Image), findsNothing);
    expect(find.byKey(const ValueKey('flyer-ground')), findsOneWidget);
    expect(t.getSize(find.byKey(const ValueKey('flyer-ground'))).aspectRatio, closeTo(8.5 / 11, 0.01));
    await finish(t);
  });

  testWidgets('Share the flyer hands the flyer\'s address to the share hook, once while it is out', (t) async {
    final calls = <String>[];
    final gate = Completer<void>();
    await openApp(t, await bootRecorded(t, shareFlyer: (u) {
      calls.add(u);
      return gate.future;
    }), route: '/event/1');
    await until(t, () => find.text('Share the flyer').evaluate().isNotEmpty);
    await t.drag(find.byType(SingleChildScrollView), const Offset(0, -400));
    await t.pump();
    await t.tap(find.text('Share the flyer'));
    await t.pump();
    await t.tap(find.text('Share the flyer'));
    await t.pump();
    expect(calls, ['https://umassdining.com/sites/default/files/events/IMG_2765.png']);
    gate.complete();
    await settle(t);
    await finish(t);
  });

  testWidgets('a failed share says so and the button works again', (t) async {
    var n = 0;
    await openApp(t, await bootRecorded(t, shareFlyer: (_) async {
      n++;
      throw const Unreachable('offline');
    }), route: '/event/1');
    await until(t, () => find.text('Share the flyer').evaluate().isNotEmpty);
    await t.drag(find.byType(SingleChildScrollView), const Offset(0, -400));
    await t.pump();
    await t.tap(find.text('Share the flyer'));
    await settle(t);
    expect(find.text('Couldn\'t share the flyer'), findsOneWidget);
    await t.tap(find.text('Share the flyer'));
    await settle(t);
    expect(n, 2);
    await finish(t);
  });

  test('shareFlyerFile writes the bytes to <temp>/flyer/<name with its extension> and shares that FILE, never text', () async {
    final tmp = Directory.systemTemp.createTempSync('udine-flyer');
    addTearDown(() => tmp.deleteSync(recursive: true));
    Directory('${tmp.path}/flyer').createSync();
    File('${tmp.path}/flyer/stale.png').writeAsStringSync('old');
    final shared = <XFile>[];
    await shareFlyerFile('https://umassdining.com/sites/default/files/events/Pete%20and%20Gerrys.jpg',
        client: MockClient((_) async => http.Response.bytes([1, 2, 3], 200)), tempDir: () async => tmp, share: (f) async => shared.add(f));
    expect(shared, hasLength(1));
    expect(shared[0].path, '${tmp.path}/flyer/Pete and Gerrys.jpg');
    expect(shared[0].mimeType, 'image/jpeg');
    expect(File(shared[0].path).readAsBytesSync(), [1, 2, 3]);
    expect(File('${tmp.path}/flyer/stale.png').existsSync(), isFalse);
    for (final bad in ['intent://x/', 'https://', 'not a url']) {
      await expectLater(shareFlyerFile(bad, client: MockClient((_) async => http.Response('', 200)), tempDir: () async => tmp, share: (f) async => shared.add(f)), throwsArgumentError);
    }
    expect(shared, hasLength(1));
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
