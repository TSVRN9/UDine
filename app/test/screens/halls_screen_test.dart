import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/data/recorded/recorded.dart';
import 'package:udine/motion/container_transform.dart';
import 'package:udine/screens/cafes/cafe_page.dart';
import 'package:udine/screens/cafes/cafes_page.dart';
import 'package:udine/screens/halls/hall_page.dart';
import 'package:udine/shell/shell.dart';
import 'package:udine/theme/tokens.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'support.dart';

void main() {
  setUpAll(loadFonts);

  Finder band(String name) => find.text(name);
  List<int> lamps(WidgetTester t) => [for (final m in t.widgetList<Meter>(find.byType(Meter))) m.lit];
  Future<void> ready(WidgetTester t) => until(t, () => find.text('Open until midnight').evaluate().isNotEmpty && find.byType(Meter).evaluate().isNotEmpty);

  testWidgets('Halls at rest: the date, the meal, four bands with hours and a meter, the area rows with their counts', (t) async {
    await openApp(t, await bootRecorded(t));
    await ready(t);
    expect(find.text('Thursday, October 8'), findsNWidgets(2)); // the header's, and the collapsed bar's
    expect(find.text('Lunch'), findsOneWidget);
    for (final n in ['Worcester', 'Franklin', 'Hampshire', 'Berkshire']) {
      expect(band(n), findsOneWidget);
    }
    expect(find.text('Open until midnight'), findsNWidgets(2));
    expect(find.text('Open until 9 PM'), findsNWidgets(2));
    expect(lamps(t), [5, 3, 2, 5]);
    expect(find.text('Probably a little busy'), findsOneWidget);
    expect(find.text('Cafés & markets'), findsOneWidget);
    await t.drag(find.byType(SingleChildScrollView), const Offset(0, -3000));
    await t.pump();
    for (final c in ['12 of 12 open now', '7 of 7 open now', '4 of 4 open now', '5 of 5 open now']) {
      expect(find.text(c), findsOneWidget);
    }
    expect(find.text('Charles River Campus, Newton'), findsNothing);
  });

  testWidgets('pinned cafés sit under the halls, in the order pinned, with their status and no meter', (t) async {
    await openApp(t, await bootRecorded(t, pins: ['Harvest Market', 'Wasabi']));
    await ready(t);
    expect(t.getTopLeft(band('Harvest Market')).dy, lessThan(t.getTopLeft(band('Wasabi')).dy));
    expect(t.getTopLeft(band('Berkshire')).dy, lessThan(t.getTopLeft(band('Harvest Market')).dy));
    expect(find.text('Open until 9 PM'), findsNWidgets(4)); // Franklin, Hampshire, Harvest Market, Wasabi (11 AM to 9 PM on Oct 8)
    expect(find.text('Closed for today'), findsNothing);
    expect(lamps(t), hasLength(4));
  });

  group('the stack', () {
    testWidgets('a band opens its page by the container transform; Back closes it, and the band is hidden meanwhile', (t) async {
      await openApp(t, await bootRecorded(t));
      await ready(t);
      double bandOpacity() => t.widgetList<Opacity>(find.ancestor(of: find.text('Hampshire'), matching: find.byType(Opacity))).map((o) => o.opacity).reduce((a, b) => a < b ? a : b);
      expect(bandOpacity(), 1);
      await t.tap(band('Hampshire'));
      await t.pump();
      await t.pump(const Duration(milliseconds: 16));
      await t.pump(const Duration(milliseconds: 250));
      expect(find.byType(HallPage), findsOneWidget);
      expect(find.byType(ContainerWindow), findsOneWidget);
      expect(bandOpacity(), 0);
      await t.pumpAndSettle();
      await t.tap(find.bySemanticsLabel('Back'));
      await t.pumpAndSettle();
      expect(find.byType(HallPage), findsNothing);
      expect(bandOpacity(), 1);
    });

    testWidgets('a band tap during a close is taken, the same band and another', (t) async {
      await openApp(t, await bootRecorded(t));
      await ready(t);
      for (final again in ['Hampshire', 'Franklin']) {
        await t.tap(band('Hampshire'));
        await t.pumpAndSettle();
        await t.binding.handlePopRoute();
        await t.pump();
        await t.pump(const Duration(milliseconds: 16));
        await t.pump(const Duration(milliseconds: 150)); // the window is on its way back to the band
        expect(find.byType(HallPage), findsOneWidget);
        await t.tap(band(again).first, warnIfMissed: false);
        await t.pump();
        await t.pump(const Duration(milliseconds: 16));
        expect(find.byType(HallPage), findsNWidgets(2), reason: 'the tap on $again opened a second page over the closing one');
        await t.pumpAndSettle();
        expect(find.byType(HallPage), findsOneWidget);
        await t.binding.handlePopRoute();
        await t.pumpAndSettle();
        expect(find.byType(HallPage), findsNothing);
      }
    });

    testWidgets('a pin opens its page the same way, at 84 dp', (t) async {
      await openApp(t, await bootRecorded(t, pins: ['Harvest Market']));
      await ready(t);
      await t.tap(band('Harvest Market'));
      await t.pump(const Duration(milliseconds: 700)); // (a café's page shows its spinner until its menu is in: no pumpAndSettle)
      expect(find.byType(CafePage), findsOneWidget);
      expect(t.getSize(find.byType(Band, skipOffstage: false).last).height, M2Layout.bandCompact);
      await until(t, () => find.byType(Spinner).evaluate().isEmpty);
    });

    testWidgets('an area row pushes a page; the edge swipe and Android back close it', (t) async {
      await openApp(t, await bootRecorded(t));
      await ready(t);
      await t.drag(find.byType(SingleChildScrollView), const Offset(0, -3000));
      await t.pump();
      await t.tap(find.text('North, by Worcester'));
      await t.pumpAndSettle();
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300))); // the page's own hours read
      expect(find.byType(CafesPage), findsOneWidget);
      final g = await t.startGesture(const Offset(5, 400));
      await g.moveBy(const Offset(30, 0));
      await g.moveBy(const Offset(270, 0));
      await g.up();
      await t.pumpAndSettle();
      expect(find.byType(CafesPage), findsNothing);
      await t.tap(find.text('North, by Worcester'));
      await t.pumpAndSettle();
      await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 300)));
      await t.binding.handlePopRoute();
      await t.pumpAndSettle();
      expect(find.byType(CafesPage), findsNothing);
    });

    testWidgets('a tab press mid-stack goes back to the tab at once', (t) async {
      await openApp(t, await bootRecorded(t));
      await ready(t);
      await t.tap(band('Berkshire'));
      await t.pumpAndSettle();
      await t.tap(find.text('You'));
      await t.pumpAndSettle();
      expect(find.byType(HallPage), findsNothing);
    });

    testWidgets('the tab bar and the plate bar slot never move while a page opens', (t) async {
      await openApp(t, await bootRecorded(t));
      await ready(t);
      final bar = t.getRect(find.byType(M2TabBar));
      await t.tap(band('Worcester'));
      await t.pump();
      await t.pump(const Duration(milliseconds: 16));
      for (var i = 0; i < 6; i++) {
        await t.pump(const Duration(milliseconds: 80));
        expect(t.getRect(find.byType(M2TabBar)), bar);
      }
      await t.pumpAndSettle();
      expect(t.getRect(find.byType(M2TabBar)), bar);
    });

    testWidgets('reduced motion: the page crossfades in place', (t) async {
      await openApp(t, await bootRecorded(t), reduced: true);
      await ready(t);
      await t.tap(band('Hampshire'));
      await t.pump();
      await t.pump(const Duration(milliseconds: 16));
      await t.pump(const Duration(milliseconds: 40));
      expect(find.byType(ContainerWindow), findsNothing);
      expect(find.byType(HallPage), findsOneWidget);
      await t.pumpAndSettle();
    });
  });

  group('tabs', () {
    testWidgets('Halls to You is a fade through: the old tab stays drawn under the new, settling from .97', (t) async {
      await openApp(t, await bootRecorded(t));
      await ready(t);
      await t.tap(find.text('You'));
      await t.pump();
      await t.pump(const Duration(milliseconds: 100));
      expect(find.text('Worcester'), findsOneWidget); // Halls is still drawn
      final scales = t.widgetList<Transform>(find.byType(Transform)).map((x) => x.transform.storage[0]);
      expect(scales.any((s) => s > M2Motion.fadeThroughScale && s < 1), isTrue);
      await t.pump(const Duration(milliseconds: 200));
      expect(find.text('Worcester'), findsNothing); // gone from the screen once You is in
    });
  });

  group('network states', () {
    testWidgets('loading: the rack is whole with names and letters; hours and the meters arrive in place', (t) async {
      await openApp(t, await bootRecorded(t, net: NetMode.slow));
      await t.pump(const Duration(milliseconds: 300));
      expect(find.text('Worcester'), findsOneWidget);
      expect(find.text('Open until midnight'), findsNothing);
      expect(find.byType(Meter), findsNothing);
      expect(find.text("You're offline"), findsNothing);
      await t.pump(const Duration(milliseconds: 1700));
      await until(t, () => find.text('Open until midnight').evaluate().isNotEmpty);
      expect(find.byType(Meter), findsNothing); // the typical curve is a second slow call
      await until(t, () => find.byType(Meter).evaluate().isNotEmpty, frame: const Duration(milliseconds: 200));
      final fading = t.widgetList<FadeTransition>(find.byType(FadeTransition)).where((f) => f.opacity.value < 1);
      expect(fading, isNotEmpty);
      await t.pumpAndSettle();
      expect(lamps(t), [5, 3, 2, 5]);
    });

    testWidgets('offline: the saved hours stay, no meter, "You\'re offline" under the date, no button', (t) async {
      await openApp(t, await bootRecorded(t, net: NetMode.offline));
      await until(t, () => find.text("You're offline").evaluate().isNotEmpty);
      expect(find.text('Open until midnight'), findsNWidgets(2));
      expect(find.byType(Meter), findsNothing);
      expect(find.text('Try again'), findsNothing);
      expect(find.text('Thursday, October 8'), findsNWidgets(2)); // the header's, and the collapsed bar's
    });

    testWidgets('failed: names and letters only, "Couldn\'t connect" and Try again, which asks again', (t) async {
      await openApp(t, await bootRecorded(t, net: NetMode.fail));
      await until(t, () => find.text("Couldn't connect").evaluate().isNotEmpty);
      expect(find.text('Open until midnight'), findsNothing);
      expect(find.byType(Meter), findsNothing);
      expect(find.text('Worcester'), findsOneWidget);
      await t.tap(find.text('Try again'));
      await t.pump();
      expect(find.text("Couldn't connect"), findsNothing); // asking again
      await until(t, () => find.text("Couldn't connect").evaluate().isNotEmpty);
    });
  });

  testWidgets('the Charles River toggle: its pin and its area row appear when it is turned on', (t) async {
    final boot = await bootRecorded(t, pins: ['Charles River Campus', 'Terrace']);
    await openApp(t, boot);
    await ready(t);
    expect(band('Terrace'), findsOneWidget);
    expect(band('Charles River Campus'), findsNothing);
    await t.runAsync(() => boot.prefs.setCharlesRiver(true));
    await t.pump();
    expect(band('Charles River Campus'), findsOneWidget);
    await t.drag(find.byType(SingleChildScrollView), const Offset(0, -3000));
    await t.pump();
    expect(find.text('Charles River Campus, Newton'), findsOneWidget);
    await t.runAsync(() => boot.prefs.setCharlesRiver(false));
    await t.pump();
    expect(band('Charles River Campus'), findsNothing);
    expect(find.text('Charles River Campus, Newton'), findsNothing);
  });

  testWidgets('the shell holds the plate bar\'s slot above the tab bar', (t) async {
    final boot = await bootRecorded(t);
    phone(t);
    await t.pumpWidget(UdineAppWith(boot, const SizedBox(key: Key('plate'), height: 68)));
    await until(t, () => find.byType(Meter).evaluate().isNotEmpty);
    expect(t.getBottomLeft(find.byKey(const Key('plate'))).dy, t.getTopLeft(find.byType(M2TabBar)).dy);
  });
}

/// The app with a stand-in plate bar.
class UdineAppWith extends StatelessWidget {
  const UdineAppWith(this.boot, this.plate, {super.key});
  final dynamic boot;
  final Widget plate;
  @override
  Widget build(BuildContext context) => WidgetsApp(
        color: M2Color.dm,
        pageRouteBuilder: <T>(settings, builder) => PageRouteBuilder<T>(settings: settings, pageBuilder: (c, _, _) => builder(c)),
        home: boot.wrap(Shell(plateBar: plate)) as Widget,
      );
}
