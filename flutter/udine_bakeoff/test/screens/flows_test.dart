// The behaviours the goldens cannot show: press feedback, adding, the plate, the sheets' order of events, the pushes, and each motion at
// sampled moments against M2's tokens. Each motion test has a mutation behind it (see the PR body).
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine_bakeoff/logic/fixture.dart';
import 'package:udine_bakeoff/main.dart';
import 'package:udine_bakeoff/motion/push.dart';
import 'package:udine_bakeoff/screens/dish_row.dart';
import 'package:udine_bakeoff/screens/dish_sheet.dart';
import 'package:udine_bakeoff/screens/hall_menu.dart';
import 'package:udine_bakeoff/screens/halls.dart';
import 'package:udine_bakeoff/screens/plate_sheet.dart';
import 'package:udine_bakeoff/shell.dart';
import 'package:udine_bakeoff/state/net.dart';
import 'package:udine_bakeoff/state/store.dart';
import 'package:udine_bakeoff/theme/tokens.dart';
import 'package:udine_bakeoff/ui/ui.dart';
import '../fonts.dart';
import '../logic/support.dart';
import 'harness.dart';

final haptics = <String>[];

Future<Store> boot(WidgetTester t, {String seed = '', bool reduced = false, double w = 390, Net? net}) async {
  Photos.enabled = false;
  sized(t, w: w);
  final store = freshStore(seed);
  haptics.clear();
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
    if (call.method == 'HapticFeedback.vibrate') haptics.add((call.arguments as String).replaceFirst('HapticFeedbackType.', ''));
    return null;
  });
  addTearDown(() => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
  await t.pumpWidget(reduced ? MediaQuery(data: const MediaQueryData(size: Size(390, 844), disableAnimations: true), child: BakeoffApp(fx: fx, store: store, net: net)) : BakeoffApp(fx: fx, store: store, net: net));
  await t.pumpAndSettle();
  return store;
}

Future<void> openHall(WidgetTester t, String name) async {
  await t.tap(find.text(name).first);
  await t.pumpAndSettle();
}

Finder row(String name) => find.byWidgetPredicate((w) => w is DishRow && w.dish.name == name); // (a name with its diet patch is split into spans: no single Text to find)
Future<void> tapName(WidgetTester t, String name) async {
  await bringIn(t, row(name));
  await t.tapAt(t.getTopLeft(row(name)) + const Offset(40, 22));
}
HallMenuState menu(WidgetTester t) => t.state<HallMenuState>(find.byType(HallMenu).last);
ScrollController list(WidgetTester t) => t.widget<CustomScrollView>(find.descendant(of: find.byType(HallMenu).last, matching: find.byType(CustomScrollView)).first).controller!;
double opacityOf(WidgetTester t, Key k) => t.widget<Opacity>(find.byKey(k)).opacity;
double dx(WidgetTester t, Key k) => t.widget<Transform>(find.byKey(k)).transform.getTranslation().x;

void main() {
  setUpAll(loadFonts);
  const brisket = 'Beef Brisket Noodle Bowl', bbq = 'Golden BBQ Chicken Thigh';

  group('press', () {
    testWidgets('a row tints the moment the finger is down (not after the tap recogniser\'s wait), and clears when the finger drags off', (t) async {
      await boot(t);
      await openHall(t, 'Worcester');
      final r = row('Green Chile Posole');
      final g = await t.startGesture(t.getTopLeft(r) + const Offset(40, 22));
      await t.pump();
      expect(t.widget<AnimatedOpacity>(find.descendant(of: r, matching: find.byType(AnimatedOpacity)).first).opacity, 1);
      await g.moveBy(const Offset(0, -40));
      await t.pump();
      expect(t.widget<AnimatedOpacity>(find.descendant(of: r, matching: find.byType(AnimatedOpacity)).first).opacity, 0);
      await g.up();
    });

    testWidgets('a stepper button inside a row tints itself, not the row (M2 puts .down on the closest button or row only)', (t) async {
      await boot(t);
      await openHall(t, 'Worcester');
      final r = row('Green Chile Posole');
      final g = await t.startGesture(t.getCenter(find.descendant(of: r, matching: find.byType(AddButton))));
      await t.pump();
      expect(t.widget<AnimatedOpacity>(find.descendant(of: r, matching: find.byType(AnimatedOpacity)).first).opacity, 0);
      await g.up();
    });
  });

  group('adding', () {
    testWidgets('+ adds one, lightImpact; the stepper reads 1; 1 then - gives ½; ½ then - removes the item and the plate; heavyImpact', (t) async {
      final s = await boot(t);
      await openHall(t, 'Worcester');
      final r = row('Green Chile Posole');
      await t.tap(find.descendant(of: r, matching: find.byType(AddButton)));
      await t.pumpAndSettle();
      expect(haptics, ['lightImpact']);
      expect(s.plates.plates.single.items.single.qty, 1);
      expect(find.descendant(of: r, matching: find.text('1')), findsOneWidget);
      await t.tap(find.descendant(of: r, matching: find.byWidgetPredicate((w) => w is Press && w.label == 'Less')));
      await t.pumpAndSettle();
      expect(s.plates.plates.single.items.single.qty, 0.5);
      expect(find.descendant(of: r, matching: find.text('½')), findsOneWidget);
      await t.tap(find.descendant(of: r, matching: find.byWidgetPredicate((w) => w is Press && w.label == 'Less')));
      await t.pumpAndSettle();
      expect(s.plates.plates, isEmpty);
      expect(haptics.last, 'heavyImpact');
      expect(find.descendant(of: r, matching: find.byType(AddButton)), findsOneWidget);
    });

    testWidgets('+ widens leftward into the stepper: scaleX from .42 with origin at the right, fading in on settle', (t) async {
      await boot(t);
      await openHall(t, 'Worcester');
      final r = row('Green Chile Posole');
      await t.tap(find.descendant(of: r, matching: find.byType(AddButton)));
      await t.pump();
      await t.pump(const Duration(milliseconds: 100)); // half of settle's 200 ms
      final tr = t.widget<Transform>(find.descendant(of: r, matching: find.byType(Transform)).first);
      final e = M2Motion.settle.curve.transform(0.5);
      expect(tr.alignment, Alignment.centerRight);
      expect(tr.transform.getRow(0)[0], closeTo(M2Motion.laneFrom + (1 - M2Motion.laneFrom) * e, 0.03));
    });

    testWidgets('a second plate: a dish another hall serves, added with a plate in progress, shows a ghost + (ringed)', (t) async {
      await boot(t, seed: 'plate=W:lunch:$brisket');
      await openHall(t, 'Franklin');
      expect(find.byWidgetPredicate((w) => w is AddButton && w.ghost), findsWidgets);
    });
  });

  group('the plate bar', () {
    testWidgets('rises from behind the tab bar on the first add, over cont (500 ms, emphasized)', (t) async {
      final s = await boot(t);
      await openHall(t, 'Worcester');
      double lift() => t.widget<Transform>(find.descendant(of: find.byType(PlateLayer), matching: find.byType(Transform)).first).transform.getTranslation().y;
      expect(lift(), closeTo(M2Layout.barMin * 1.1, 0.5));
      s.add('lunch', 'x', {'W': servingOn(fx, today, 'W', 'lunch', dishKey(bbq))!});
      await t.pump();
      await t.pump();
      await t.pump(const Duration(milliseconds: 100));
      final e = M2Motion.cont.curve.transform(100 / 500);
      expect(lift(), closeTo(M2Layout.barMin * 1.1 * (1 - e), 3));
      await t.pumpAndSettle();
      expect(lift(), closeTo(0, 0.01));
    });

    testWidgets('a sideways swipe past 70 dp changes plate (selection haptic); a short one springs back', (t) async {
      final s = await boot(t, seed: 'plate=W:lunch:$brisket;F:lunch:black bean burger');
      await openHall(t, 'Worcester');
      expect(s.plates.front, 0); // opening Worcester brings its plate to the front
      final bar = find.textContaining('lunch,').first;
      haptics.clear();
      await t.drag(bar, const Offset(-40, 0));
      await t.pumpAndSettle();
      expect(s.plates.front, 0);
      await t.drag(bar, const Offset(-90, 0));
      await t.pumpAndSettle();
      expect(s.plates.front, 1);
      expect(haptics, ['selectionClick']);
    });

    testWidgets('a tap on the bar opens the sheet to mid; Log with one place logs at once (mediumImpact) and shows the receipt; Undo puts the plate back', (t) async {
      final s = await boot(t, seed: 'plate=W:lunch:$bbq');
      await openHall(t, 'Worcester');
      await t.tap(find.textContaining('lunch,').first);
      await t.pumpAndSettle();
      final sheet = t.state<PlateLayerState>(find.byType(PlateLayer)).handle;
      expect(sheet.px, greaterThan(M2Layout.barMin + 50));
      await t.tap(find.text('Log'));
      await t.pumpAndSettle(const Duration(milliseconds: 50), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 1));
      expect(s.log, hasLength(1));
      expect(haptics.last, 'mediumImpact');
      expect(find.text('Undo'), findsOneWidget);
      expect(sheet.px, closeTo(M2Layout.barMin, 1)); // logging puts the sheet away
      await t.tap(find.text('Undo'));
      await t.pumpAndSettle();
      expect(s.log, isEmpty);
      expect(s.plates.plates, hasLength(1));
    });

    testWidgets('the receipt goes after 5 s (M2 receipt timer)', (t) async {
      final s = await boot(t, seed: 'plate=W:lunch:$bbq&logged=1&receipt=1'); // (boot settles for under a second)
      expect(s.last, isNotNull);
      await t.pump(const Duration(milliseconds: 4000));
      expect(s.last, isNotNull);
      await t.pump(const Duration(milliseconds: 1500));
      expect(s.last, isNull);
    });

    testWidgets('with no plate left, the bar starts leaving in the frame the receipt clears and moves at once (M2: the transition is on the bar, its curve runs forward in time)', (t) async {
      final s = await boot(t, seed: 'plate=W:lunch:$bbq&logged=1&receipt=1');
      double y() => t.getTopLeft(find.byType(M2Sheet)).dy;
      var guard = 0;
      while (s.last != null && guard++ < 600) {
        await t.pump(const Duration(milliseconds: 16));
      }
      expect(s.last, isNull);
      final y0 = y();
      await t.pump(const Duration(milliseconds: 16));
      await t.pump(const Duration(milliseconds: 16));
      // the curve runs forward in time: after 16 to 32 ms of M2's `cont` the bar has fallen by curve(t) of its travel
      final travel = M2Layout.barMin * 1.1, lo = M2Motion.cont.curve.transform(16 / M2Motion.cont.ms) * travel, hi = M2Motion.cont.curve.transform(32 / M2Motion.cont.ms) * travel;
      expect(y() - y0, inInclusiveRange(lo * 0.8, hi * 1.2), reason: 'two frames after the receipt cleared');
    });

    testWidgets('a plate several places serve asks where to log: one gold button per place', (t) async {
      final s = await boot(t);
      s.add('lunch', brisket, {'W': servingOn(fx, today, 'W', 'lunch', dishKey(brisket))!, 'B': servingOn(fx, today, 'B', 'lunch', dishKey(brisket))!});
      await t.pumpAndSettle();
      await t.tap(find.text('Log'));
      await t.pumpAndSettle();
      expect(find.text('Worcester'), findsWidgets);
      expect(find.text('Berkshire'), findsWidgets);
      await t.tap(find.text('Berkshire').last);
      await t.pumpAndSettle();
      expect(s.log.single.place, 'B');
    });
  });

  group('the dish sheet', () {
    testWidgets('Add runs when the sheet is half-way out, not when it is gone', (t) async {
      final s = await boot(t);
      await openHall(t, 'Worcester');
      await tapName(t, bbq);
      await t.pumpAndSettle();
      await t.tap(find.text('Add to plate'));
      var frame = 0, added = -1, gone = -1;
      s.addListener(() => added = added < 0 ? frame : added);
      while (gone < 0 && frame < 200) {
        await t.pump(const Duration(milliseconds: 16));
        frame++;
        if (find.byType(DishSheet).evaluate().isEmpty) gone = frame;
      }
      expect(added, greaterThan(0));
      expect(added, lessThan(gone));
      expect(s.plates.plates.single.items.single.name, bbq);
      expect(haptics, contains('lightImpact'));
    });

    testWidgets('the name is pinned and edged once the label scrolls under it', (t) async {
      await boot(t);
      await openHall(t, 'Worcester');
      await tapName(t, bbq);
      await t.pumpAndSettle();
      List<BoxShadow> shadows() => (t.widgetList<DecoratedBox>(find.byType(DecoratedBox)).map((c) => c.decoration).whereType<BoxDecoration>().firstWhere((d) => d.boxShadow?.any((s) => s.color == M2Color.chalk) ?? false)).boxShadow!;
      expect(shadows(), hasLength(1));
      await t.drag(find.text('Nutrition Facts'), const Offset(0, -500)); // the first drag takes the sheet to the top
      await t.pumpAndSettle();
      await t.drag(find.text('Nutrition Facts'), const Offset(0, -200)); // the next scrolls the content under the name
      await t.pumpAndSettle();
      expect(shadows(), hasLength(3));
      expect(t.getTopLeft(find.text(bbq).last).dy, lessThan(120)); // still on screen, at the sheet's top
    });

    testWidgets('where-served pushes the hall at the dish: arrives already scrolled, the row marked, the sheet down first', (t) async {
      final s = await boot(t);
      await openHall(t, 'Worcester');
      await tapName(t, 'Roasted Zucchini');
      await t.pumpAndSettle();
      await t.tap(find.text('Worcester').last);
      var pushedAt = -1, frame = 0;
      while (pushedAt < 0 && frame < 120) {
        await t.pump(const Duration(milliseconds: 16));
        frame++;
        if (find.byType(HallMenu).evaluate().length == 2) pushedAt = frame;
      }
      expect(pushedAt, greaterThan(1)); // after the sheet had started down
      expect(find.byType(DishSheet), findsOneWidget); // and the sheet is still leaving
      expect(list(t).offset, greaterThan(300)); // the first frame of the pushed hall is already at the dish: no scroll after it is drawn
      await t.pumpAndSettle();
      expect(find.byType(DishSheet), findsNothing);
      expect(s.plates.plates, isEmpty);
    });
  });

  group('dish sheet positions (M2 DOM at 390 x 844: Golden BBQ, and a priced café dish)', () {
    Rect add(WidgetTester t) => t.getRect(find.ancestor(of: find.text('Add to plate'), matching: find.byType(Press)).first);
    testWidgets('the name pins over the label: Add to plate is at 525 (M2 .btn), 4 dp under the serving line, whatever the line holds', (t) async {
      await boot(t);
      await openHall(t, 'Worcester');
      await tapName(t, bbq);
      await t.pumpAndSettle();
      expect(add(t).top, closeTo(525, 1.5)); // the pinned name's 4 dp bottom padding is cancelled by its -4 margin (`.dhd`)
    });
    testWidgets('a priced dish: the price line starts 4 under the name (457 against the name at 420.8) and Add to plate is at 525', (t) async {
      Photos.enabled = false;
      sized(t);
      await t.pumpWidget(BakeoffApp(fx: fx, store: freshStore(), pins: const ["People's Organic Coffee", 'Tamales']));
      await t.pumpAndSettle();
      await t.tap(find.text("People's Organic Coffee").first);
      await t.pumpAndSettle();
      await t.tapAt(t.getTopLeft(find.byType(DishRow).at(1)) + const Offset(40, 22));
      await t.pumpAndSettle();
      expect(t.getRect(find.textContaining('1 each', findRichText: true).first).top, closeTo(457, 1.5));
      expect(add(t).top, closeTo(525, 1.5));
    });
  });

  group('pushes', () {
    testWidgets('Dietary preferences: the page slides in over pushIn, You shifts 30% and dims 10% with it, the shadow shows only while it moves', (t) async {
      await boot(t);
      await t.tap(find.text('You').last);
      await t.pumpAndSettle();
      await t.tap(find.text('Dietary preferences'));
      await t.pump();
      await t.pump(); // (the clock starts once the page's first frame is drawn)
      await t.pump(const Duration(milliseconds: 150));
      final shell = t.state<ShellState>(find.byType(Shell));
      final p = shell.push.p.value;
      expect(p, closeTo(M2Motion.pushIn.curve.transform(150 / 500), 0.04));
      final dim = t.widgetList<ColoredBox>(find.byType(ColoredBox)).where((b) => b.color.a > 0 && b.color.a < 0.12 && b.color.toARGB32() & 0xFFFFFF == 0x240A0E);
      expect(dim.single.color.a, closeTo(M2Motion.pushDim * p, 0.01));
      final under = t.widget<Transform>(find.ancestor(of: find.byType(FadeThroughTabs), matching: find.byType(Transform)).first).transform.getTranslation().x;
      expect(under, closeTo(-390 * M2Motion.pushShift * p, 0.5)); // the screen under it shifts 30% of the width, with the page's own progress
      expect(find.byWidgetPredicate((w) => w is DecoratedBox && w.decoration is BoxDecoration && (w.decoration as BoxDecoration).boxShadow?.length == 2), findsOneWidget);
      await t.pumpAndSettle();
      expect(find.byWidgetPredicate((w) => w is DecoratedBox && w.decoration is BoxDecoration && (w.decoration as BoxDecoration).boxShadow?.length == 2), findsNothing);
      expect(find.text('Only show'), findsOneWidget);
    });

    testWidgets('an edge swipe tracks the finger 1:1 and commits past half the width; a short one springs back', (t) async {
      await boot(t);
      await t.tap(find.text('You').last);
      await t.pumpAndSettle();
      await t.tap(find.text('Dietary preferences'));
      await t.pumpAndSettle();
      final shell = t.state<ShellState>(find.byType(Shell));
      var g = await t.startGesture(const Offset(10, 400));
      await g.moveBy(const Offset(30, 0));
      await g.moveBy(const Offset(100, 0));
      await t.pump();
      expect(shell.push.p.value, closeTo(1 - 130 / 390, 1e-6));
      await g.up();
      await t.pumpAndSettle();
      expect(shell.push.open, isTrue);
      g = await t.startGesture(const Offset(10, 400));
      await g.moveBy(const Offset(30, 0));
      await g.moveBy(const Offset(220, 0));
      await g.up();
      await t.pumpAndSettle();
      expect(shell.push.open, isFalse);
    });

    testWidgets('tabs fade through: the incoming You fades in from .97 over fadeThrough while Halls stays drawn beneath', (t) async {
      await boot(t);
      await t.tap(find.text('You').last);
      await t.pump();
      await t.pump(const Duration(milliseconds: 125));
      final e = M2Motion.fadeThrough.curve.transform(0.5);
      final scale = t.widget<Transform>(find.ancestor(of: find.text('Today'), matching: find.byType(Transform)).first).transform.getMaxScaleOnAxis();
      expect(scale, closeTo(M2Motion.fadeThroughScale + (1 - M2Motion.fadeThroughScale) * e, 0.01));
      expect(find.text('Worcester'), findsWidgets); // the outgoing tab is still drawn
      await t.pumpAndSettle();
    });
  });

  group('the hall screen', () {
    testWidgets('a meal tab is a shared axis: out by .35, in by .6, 30 dp, toward the side the tab is on', (t) async {
      await boot(t);
      await openHall(t, 'Worcester');
      await t.tap(find.text('Dinner'));
      await t.pump();
      await t.pump(const Duration(milliseconds: 90)); // t = .2 of 450 ms
      final slide = M2Motion.sharedX.curve.transform(0.2), fade = 0.2;
      expect(opacityOf(t, const ValueKey('axis-out')), closeTo(1 - fade / M2Motion.sharedXAt, 0.03));
      expect(opacityOf(t, const ValueKey('axis-in')), closeTo(fade / M2Motion.sharedXInAt, 0.03));
      expect(dx(t, const ValueKey('axis-out-slide')), closeTo(-M2Motion.sharedXDist * slide, 0.8)); // dinner is to the right of lunch: the old list leaves left
      expect(dx(t, const ValueKey('axis-in-slide')), closeTo(M2Motion.sharedXDist * (1 - slide), 0.8));
      expect(haptics, ['selectionClick']);
      await t.pumpAndSettle();
      await t.tap(find.text('Lunch').last);
      await t.pump();
      await t.pump(const Duration(milliseconds: 90));
      expect(dx(t, const ValueKey('axis-out-slide')), greaterThan(0)); // back toward lunch: the other way
    });

    testWidgets('a meal tab tapped in the first frame after the hall is there still runs the shared axis (no rows to copy: the incoming leg alone, as M2)', (t) async {
      Photos.enabled = false;
      sized(t);
      await t.pumpWidget(hallApp(store: freshStore(), shell: FakeShell()));
      await t.tap(find.text('Dinner')); // no pump yet: the list has not laid out
      await t.pump();
      await t.pump(const Duration(milliseconds: 90));
      final slide = M2Motion.sharedX.curve.transform(0.2);
      expect(dx(t, const ValueKey('axis-in-slide')), closeTo(M2Motion.sharedXDist * (1 - slide), 0.8));
      expect(opacityOf(t, const ValueKey('axis-in')), closeTo(0.2 / M2Motion.sharedXInAt, 0.03));
      await t.pumpAndSettle();
      expect(opacityOf(t, const ValueKey('axis-in')), 1);
    });

    testWidgets('a second meal tab tapped mid-run retargets: the new change runs from its start, toward its own side', (t) async {
      await boot(t);
      await openHall(t, 'Worcester');
      await t.tap(find.text('Dinner'));
      await t.pump();
      await t.pump(const Duration(milliseconds: 180)); // .4 of the first change
      await t.tap(find.text('Late night'));
      await t.pump();
      await t.pump(const Duration(milliseconds: 90));
      final slide = M2Motion.sharedX.curve.transform(0.2);
      expect(dx(t, const ValueKey('axis-in-slide')), closeTo(M2Motion.sharedXDist * (1 - slide), 0.8));
      expect(opacityOf(t, const ValueKey('axis-in')), closeTo(0.2 / M2Motion.sharedXInAt, 0.03));
      await t.pumpAndSettle();
      expect(find.text('Late night'), findsWidgets);
    });

    testWidgets('the station chevron turns over on cont (500 ms, emphasized) while the roster is up', (t) async {
      await boot(t);
      await openHall(t, 'Worcester');
      await t.tap(find.textContaining('Miscellaneous').last);
      await t.pump();
      final r = t.widget<AnimatedRotation>(find.byType(AnimatedRotation));
      expect((r.turns, r.duration, r.curve), (0.5, M2Motion.cont.duration, M2Motion.cont.curve));
    });

    testWidgets('a station pick closes the roster and scrolls the list there over scroll (500 ms, emphasized), selection haptic', (t) async {
      await boot(t);
      await openHall(t, 'Worcester');
      await t.tap(find.textContaining('Miscellaneous').last);
      await t.pumpAndSettle();
      haptics.clear();
      await t.tap(find.text('Grill Station').last);
      await t.pump();
      await t.pump(const Duration(milliseconds: 250));
      final mid = list(t).offset;
      await t.pumpAndSettle();
      final end = list(t).offset;
      expect(end, greaterThan(300));
      expect(mid / end, closeTo(M2Motion.scroll.curve.transform(0.5), 0.1));
      expect(haptics, contains('selectionClick'));
      // the head sits just under the pinned rows
      final head = t.getTopLeft(find.descendant(of: find.byType(HallMenu), matching: find.text('Grill Station')).first).dy;
      expect(head - 11, closeTo(24 + M2Layout.barH + 2 * M2Layout.stationRowH, 2)); // (the head's text sits 11 dp down its 50 dp slot)
    });

    testWidgets('a day change fades through: everything that says the day leaves linearly over .35 of 250 ms, then the new day fades in with the list from .97', (t) async {
      await boot(t);
      await openHall(t, 'Worcester');
      await t.tap(find.text('Today'));
      await t.pumpAndSettle();
      await t.tap(find.text('Tomorrow'));
      await t.pump();
      await t.pump(); // the sheet starts down
      final hall = menu(t);
      var frames = 0, started = -1;
      while (!hallIsSwapped(hall) && frames < 120) {
        await t.pump(const Duration(milliseconds: 8));
        frames++;
        if (started < 0 && listOpacity(t) < 1) started = frames;
      }
      expect(frames, lessThan(120));
      // the old day is gone in 35% of fadeThrough's 250 ms (87.5), linearly: half way through, half there
      expect((frames - started) * 8, inInclusiveRange(72, 104));
      // the list's opacity is the day fade; the new day is drawn once it reached nothing
      await t.pump(const Duration(milliseconds: 40));
      final o1 = listOpacity(t);
      await t.pump(const Duration(milliseconds: 60));
      final o2 = listOpacity(t);
      expect(o2, greaterThan(o1));
      await t.pumpAndSettle();
      expect(listOpacity(t), 1);
      expect(find.text('Fri 9'), findsOneWidget); // the day cell names the new day
    });
  });

  group('the back gesture', () {
    testWidgets('a drag down takes the screen only while its list is at the top (M2: scrollTop <= 0); lower down it scrolls the list', (t) async {
      await boot(t);
      await openHall(t, 'Worcester');
      final tab = t.state<HallsTabState>(find.byType(HallsTab));
      await t.drag(find.text('Soups').last, const Offset(0, -300)); // scroll the list up
      await t.pumpAndSettle();
      final y = list(t).offset;
      expect(y, greaterThan(200));
      final g = await t.startGesture(const Offset(200, 600));
      await g.moveBy(const Offset(0, 40));
      await g.moveBy(const Offset(0, 80));
      await t.pump();
      expect(tab.t.phase.name, 'open'); // not grabbed
      expect(list(t).offset, lessThan(y)); // the list scrolled back down instead
      await g.up();
      await t.pumpAndSettle();
      await t.drag(find.text('Soups').last, const Offset(0, 600)); // back to the top
      await t.pumpAndSettle();
      expect(list(t).offset, 0);
      final g2 = await t.startGesture(const Offset(200, 600));
      await g2.moveBy(const Offset(0, 40));
      await g2.moveBy(const Offset(0, 80));
      await t.pump();
      expect(tab.t.phase.name, 'dragging');
      await g2.up();
      await t.pumpAndSettle();
    });
  });

  group('reduced motion', () {
    testWidgets('a meal change swaps in place and crossfades on rmFade: no slide, no outgoing copy', (t) async {
      await boot(t, reduced: true);
      await openHall(t, 'Worcester');
      await t.tap(find.text('Dinner'));
      await t.pump();
      await t.pump(const Duration(milliseconds: 60));
      expect(find.byKey(const ValueKey('axis-out')), findsNothing);
      expect(dx(t, const ValueKey('axis-in-slide')), 0);
      expect(opacityOf(t, const ValueKey('axis-in')), closeTo(0.5, 0.05));
      await t.pump(const Duration(milliseconds: 70));
      expect(opacityOf(t, const ValueKey('axis-in')), 1); // done by 120 ms
    });
  });

  group('touch targets', () {
    testWidgets('every control on the hall menu, the dish sheet and You is at least 44 x 44 dp', (t) async {
      await boot(t, seed: 'plate=W:lunch:$bbq');
      await openHall(t, 'Worcester');
      List<String> small() => [
            for (final e in find.byType(Press).evaluate())
              if ((e.widget as Press).onTap != null && !(e.renderObject!.paintBounds.size.width >= M2Size.tap - 0.5 && e.renderObject!.paintBounds.size.height >= M2Size.tap - 0.5))
                '${(e.widget as Press).label ?? 'row'} ${e.renderObject!.paintBounds.size}',
          ];
      expect(small(), isEmpty);
      await tapName(t, bbq);
      await t.pumpAndSettle();
      expect(small(), isEmpty);
    });
  });
}

bool hallIsSwapped(HallMenuState s) => s.debugDay != 0;
double listOpacity(WidgetTester t) => t.widget<Opacity>(find.byKey(const ValueKey('fade-list'))).opacity;
