// Task 2 of flutter-port-hall-menu: the day control, the day change, the schedule sheet (Directions, holiday rows) and the dietary line.
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';
import 'package:url_launcher_platform_interface/link.dart';
import 'package:url_launcher_platform_interface/url_launcher_platform_interface.dart';
import 'package:udine/core/m2/board.dart';
import 'package:udine/core/m2/menu_view.dart' show Prefs;
import 'package:udine/motion/routes.dart';
import 'package:udine/screens/halls/halls_screen.dart';
import 'package:udine/screens/halls/hall_page.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/screens/hall/hall_controller.dart' show MenuState;
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/screens/hall/meal_tabs.dart';
import 'package:udine/screens/hall/schedule_sheet.dart';
import 'package:udine/theme/tokens.dart';
import 'package:udine/ui/ui.dart' hide Stepper;
import '../fonts.dart';
import 'support.dart';

class _Launcher extends UrlLauncherPlatform with MockPlatformInterfaceMixin {
  final calls = <(String, PreferredLaunchMode)>[];
  @override
  LinkDelegate? get linkDelegate => null;
  @override
  Future<bool> canLaunch(String url) async => true;
  @override
  Future<bool> launchUrl(String url, LaunchOptions options) async {
    calls.add((url, options.mode));
    return true;
  }
}

/// The day cell: the station row's first control.
Finder dayCell(String label) => find.descendant(of: find.byType(StationRow), matching: find.text(label));
Finder inSheet(Finder f) => find.descendant(of: find.byType(ScheduleSheet), matching: f);
Finder option(String label) => find.descendant(of: find.byType(SheetOption), matching: find.text(label));
HallMenuState menu(WidgetTester t) => t.state<HallMenuState>(find.byType(HallMenu));

/// Rich text too: the dietary line and its action are spans.
Finder words(String s) => find.text(s, findRichText: true);

/// Runs a day change to the end, the new day's menu having landed (real I/O under `runAsync`).
Future<void> changeDayTo(WidgetTester t, int i) async {
  final run = menu(t).changeDay(i);
  await until(t, () => menu(t).debugDay == i && menu(t).c.state(i) == MenuState.ok);
  await t.pumpAndSettle();
  await run;
}

Future<void> openSchedule(WidgetTester t, {String cell = 'Today'}) async {
  await t.tap(dayCell(cell));
  await drain(t);
  await t.pumpAndSettle();
}

void main() {
  setUpAll(loadFonts);

  group('the schedule sheet', () {
    testWidgets('the day cell opens it: name, address, Directions, the 15 days, and today open with each meal\'s window', (t) async {
      await openHall(t, await bootRecorded(t), '/hall/worcester?meal=lunch');
      await openSchedule(t);
      expect(find.byType(ScheduleSheet), findsOneWidget);
      expect(inSheet(find.text('Worcester')), findsOneWidget);
      expect(inSheet(find.textContaining('667 N Pleasant St')), findsOneWidget);
      expect(inSheet(find.text('Directions')), findsOneWidget);
      expect(find.byType(SheetOption), findsNWidgets(15));
      expect(option('Today'), findsOneWidget);
      expect(option('Tomorrow'), findsOneWidget);
      expect(option('Saturday, October 10'), findsOneWidget);
      expect(find.descendant(of: find.byType(SheetOption), matching: find.text('No menu posted')), findsOneWidget);
      expect(inSheet(find.text('7 AM to midnight')), findsOneWidget);
      for (final m in ['Breakfast', 'Lunch', 'Dinner', 'Late night', "Grab 'N Go"]) {
        expect(inSheet(find.text(m)), findsOneWidget, reason: m);
      }
      expect(inSheet(find.text('11 AM to 4:30 PM')), findsOneWidget);
      await drain(t);
    });

    testWidgets('the status line is its other door', (t) async {
      await openHall(t, await bootRecorded(t), '/hall/worcester?meal=lunch');
      await t.tap(find.text('Open until midnight'));
      await drain(t);
      await t.pumpAndSettle();
      expect(find.byType(ScheduleSheet), findsOneWidget);
      await drain(t);
    });

    testWidgets('a day row picks that day: the sheet leaves, the list and the day cell are that day\'s; no control on a later day', (t) async {
      await openHall(t, await bootRecorded(t), '/hall/worcester?meal=lunch');
      await openSchedule(t);
      await t.tap(option('Saturday, October 17'));
      await drain(t);
      await t.pumpAndSettle();
      await until(t, () => find.byType(DishRow).evaluate().isNotEmpty);
      await t.pumpAndSettle();
      expect(find.byType(ScheduleSheet), findsNothing);
      expect(menu(t).debugDay, 9);
      expect(dayCell('Sat 17'), findsOneWidget);
      expect(find.byType(AddButton), findsNothing);
      await drain(t);
    });

    testWidgets('a pick starts the day change only once the sheet has passed half-way out (M2 isheet.away)', (t) async {
      await openHall(t, await bootRecorded(t), '/hall/worcester?meal=lunch');
      await openSchedule(t);
      final y0 = t.getTopLeft(find.byType(SheetGrab)).dy, h = t.view.physicalSize.height / t.view.devicePixelRatio;
      double o() => t.widget<ChalkFade>(find.byKey(const ValueKey('fade-list'))).opacity;
      await t.tap(option('Saturday, October 17'));
      double? yAtFade;
      for (var i = 0; i < 80 && yAtFade == null; i++) {
        await t.pump(const Duration(milliseconds: 8));
        if (o() < 0.999) yAtFade = t.getTopLeft(find.byType(SheetGrab)).dy;
        if (find.byType(SheetGrab).evaluate().isEmpty) break;
      }
      expect(yAtFade, isNotNull, reason: 'the list never began to fade');
      expect(yAtFade!, greaterThanOrEqualTo(y0 + (h - y0) / 2 - 1), reason: 'the day began to change with the sheet still over it (y0 $y0)');
      await until(t, () => menu(t).debugDay == 9 && menu(t).c.state(9) == MenuState.ok);
      await t.pumpAndSettle();
      await drain(t);
    });

    testWidgets('the chosen day\'s row only closes the sheet', (t) async {
      await openHall(t, await bootRecorded(t), '/hall/worcester?meal=lunch');
      await openSchedule(t);
      await t.tap(option('Today'));
      await t.pumpAndSettle();
      expect(find.byType(ScheduleSheet), findsNothing);
      expect(menu(t).debugDay, 0);
      await drain(t);
    });

    testWidgets('a later day opens in place and today closes; offline, days past tomorrow say Not saved and open nothing', (t) async {
      await openHall(t, await bootRecorded(t), '/hall/worcester?meal=lunch&day=2026-10-17');
      await openSchedule(t, cell: 'Sat 17');
      expect(inSheet(find.text('Breakfast')), findsOneWidget);
      expect(inSheet(find.text('Late night')), findsOneWidget);
      expect(inSheet(find.text("Grab 'N Go")), findsNothing); // (Oct 17 posts no Grab 'N Go)
      await drain(t);
    });

    testWidgets('a holiday: the row says Holiday hours; chosen, it opens a row titled by the hours event, which pushes the event', (t) async {
      int? event;
      await openApp(t, await bootRecorded(t));
      await t.pump();
      Nav.push<void>(t.element(find.byType(HallsScreen)), (_) => LayoutBuilder(builder: (_, c) => HallMenu(place: 'W', top: 24, height: c.maxHeight, day: 4, onBack: () {}, onEvent: (i) => event = i)));
      await t.pump();
      await until(t, () => find.byType(DishRow).evaluate().isNotEmpty);
      await t.pumpAndSettle();
      await openSchedule(t, cell: 'Mon 12');
      expect(find.descendant(of: find.byType(SheetOption), matching: find.text('Holiday hours')), findsOneWidget);
      expect(inSheet(find.text('Indigenous Peoples Day Hours')), findsOneWidget);
      expect(inSheet(find.text('11 AM to 4:30 PM')), findsNothing);
      await t.tap(inSheet(find.text('Indigenous Peoples Day Hours')));
      await t.pumpAndSettle();
      expect(event, 0);
      expect(find.byType(ScheduleSheet), findsNothing);
      await drain(t);
    });

    testWidgets('Directions hands the phone Worcester\'s maps https link, to the platform app', (t) async {
      final launcher = _Launcher();
      UrlLauncherPlatform.instance = launcher;
      await openHall(t, await bootRecorded(t), '/hall/worcester?meal=lunch');
      await openSchedule(t);
      await t.tap(inSheet(find.text('Directions')));
      await t.pump();
      expect(launcher.calls, [('https://www.google.com/maps/search/?api=1&query=42.3924624%2C-72.5255959', PreferredLaunchMode.externalApplication)]);
      await drain(t);
    });

    testWidgets('a café with dishes has its own schedule: its building and payment, the 15 days', (t) async {
      await openPlace(t, await bootRecorded(t), 'c3'); // Green Fields
      await openSchedule(t);
      expect(inSheet(find.text('Green Fields')), findsOneWidget);
      expect(inSheet(find.text('1 Campus Center Way')), findsOneWidget); // the street line, not the feed's HTML blob
      expect(inSheet(find.text('Blue Wall, Campus Center')), findsOneWidget);
      expect(find.byType(SheetOption), findsNWidgets(15));
      await drain(t);
    });
  });

  group('the day change', () {
    for (final reduced in [false, true]) {
      testWidgets('fades through${reduced ? ' (reduced motion: opacity only, over rmFade)' : ': out in place, linear, over the first 35%; in from .97 on fadeThrough'}', (t) async {
        await openHall(t, await bootRecorded(t), '/hall/worcester?meal=lunch', reduced: reduced);
        double o() => t.widget<ChalkFade>(find.byKey(const ValueKey('fade-list'))).opacity;
        double scale() => t.widget<Transform>(find.byKey(const ValueKey('day-scale'))).transform.storage[0];
        final f = M2Motion.fadeThrough, out = f.duration * M2Motion.sharedXAt, inn = f.duration - out;
        final run = menu(t).changeDay(9);
        await t.pump();
        if (reduced) {
          // swapped at once, then rmFade in from nothing
          expect(menu(t).debugDay, 9);
          await t.pump(M2Motion.rmFade.duration * 0.5);
          expect(o(), closeTo(M2Motion.rmFade.curve.transform(0.5), 0.05));
          expect(scale(), 1);
          await until(t, () => menu(t).c.state(9) == MenuState.ok);
          await t.pumpAndSettle();
        } else {
          expect(o(), 1);
          await t.pump(out * 0.5);
          expect(o(), closeTo(0.5, 0.02)); // linear
          expect(menu(t).debugDay, 0); // still the old day, in place
          await t.pump(out * 0.5 + const Duration(milliseconds: 1));
          expect(menu(t).debugDay, 9);
          await t.pump(inn * 0.5);
          final v = f.curve.transform(0.5);
          expect(o(), closeTo(v, 0.03));
          expect(scale(), closeTo(M2Motion.fadeThroughScale + (1 - M2Motion.fadeThroughScale) * v, 0.003));
          await until(t, () => menu(t).c.state(9) == MenuState.ok);
          await t.pumpAndSettle();
        }
        await run;
        expect(o(), 1);
        expect(scale(), 1);
        await drain(t);
      });
    }

    testWidgets('the header never moves and the scroll position is kept (clamped to the collapse) across the swap', (t) async {
      await openHall(t, await bootRecorded(t), '/hall/worcester?meal=lunch');
      final before = t.getRect(find.byKey(const ValueKey('header')));
      await changeDayTo(t, 1);
      expect(t.getRect(find.byKey(const ValueKey('header'))), before);
      expect(dayCell('Fri 9'), findsOneWidget);
      await drain(t);
    });
  });

  group('the dietary line', () {
    Future<void> hiding(WidgetTester t, {String route = '/hall/worcester?meal=lunch'}) async =>
        openHall(t, await bootRecorded(t, avoid: const ['Milk', 'Eggs']), route);

    testWidgets('says what it hides and counts it', (t) async {
      await hiding(t);
      expect(words('Hiding 22 dishes that list milk or eggs'), findsOneWidget);
      expect(words('Show all'), findsOneWidget);
      await drain(t);
    });

    testWidgets('Show all reveals them (Showing all dishes, Hide them), Hide them hides them again; the preferences are never written', (t) async {
      final boot = await bootRecorded(t, avoid: const ['Milk', 'Eggs']);
      await openHall(t, boot, '/hall/worcester?meal=lunch');
      final hidden = find.byType(DishRow, skipOffstage: false).evaluate().length;
      await t.tap(words('Show all'));
      await t.pumpAndSettle();
      expect(words('Showing all dishes'), findsOneWidget);
      expect(words('Hide them'), findsOneWidget);
      expect(find.byType(DishRow, skipOffstage: false).evaluate().length, greaterThan(hidden));
      await t.tap(words('Hide them'));
      await t.pumpAndSettle();
      expect(words('Hiding 22 dishes that list milk or eggs'), findsOneWidget);
      expect(find.byType(DishRow, skipOffstage: false).evaluate().length, hidden);
      expect(boot.prefs.diet, const Prefs(avoid: ['Milk', 'Eggs']));
      await drain(t);
    });

    testWidgets('revealing flashes the list from .4 over settle, as M2 does', (t) async {
      await openHall(t, await bootRecorded(t, avoid: const ['Milk', 'Eggs']), '/hall/worcester?meal=lunch');
      double o() => t.widget<ChalkFade>(find.byKey(const ValueKey('fade-list'))).opacity;
      await t.tap(words('Show all'));
      await t.pump();
      expect(o(), closeTo(0.4, 0.02));
      await t.pump(M2Motion.settle.duration);
      expect(o(), closeTo(1, 0.01));
      await t.pumpAndSettle();
      await drain(t);
    });

    testWidgets('stays revealed across a day change, and is hidden again only on leaving the page (owner, round 9)', (t) async {
      final boot = await bootRecorded(t, avoid: const ['Milk', 'Eggs']);
      await openPlace(t, boot, 'W');
      await t.tap(words('Show all'));
      await t.pumpAndSettle();
      await changeDayTo(t, 1);
      expect(words('Showing all dishes'), findsOneWidget);
      await t.tap(find.byType(BackButton));
      await t.pumpAndSettle();
      Nav.push<void>(t.element(find.byType(HallsScreen)), (_) => const HallMenuPage(place: 'W', top: 24));
      await until(t, () => find.byType(DishRow).evaluate().isNotEmpty);
      await t.pumpAndSettle();
      expect(find.textContaining('Hiding', findRichText: true), findsOneWidget);
      await drain(t);
    });

    testWidgets('"Only show" filters the list: halal keeps the halal dishes', (t) async {
      await openHall(t, await bootRecorded(t, onlyShow: const ['Halal']), '/hall/worcester?meal=lunch');
      expect(find.textContaining('halal', findRichText: true), findsWidgets); // Showing halal dishes
      final rows = [for (final w in find.byType(DishRow, skipOffstage: false).evaluate().map((e) => e.widget as DishRow)) w.dish];
      expect(rows, isNotEmpty);
      expect(rows.every((d) => d.diet & 4 != 0), isTrue);
      await drain(t);
    });
  });
}
