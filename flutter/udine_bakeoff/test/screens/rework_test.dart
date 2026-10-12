// The reviewer's REWORK items that are behaviour: cached layers, M2's press rules per control, reduced motion for press and push, and
// the 44 dp walk over every screen state.
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine_bakeoff/motion/push.dart';
import 'package:udine_bakeoff/screens/hall_header.dart';
import 'package:udine_bakeoff/screens/hall_menu.dart';
import 'package:udine_bakeoff/shell.dart';
import 'package:udine_bakeoff/theme/tokens.dart';
import 'package:udine_bakeoff/ui/ui.dart';
import '../fonts.dart';
import 'flows_test.dart' show boot, openHall;
import 'harness.dart';

Finder pressOfText(String text) => find.ancestor(of: find.text(text), matching: find.byType(Press)).first;
Finder pressLabelled(String label) => find.byWidgetPredicate((w) => w is Press && w.label == label);
double scaleOf(WidgetTester t, Finder press) => t.widget<AnimatedScale>(find.descendant(of: press, matching: find.byType(AnimatedScale)).first).scale;

/// The visible controls smaller than 44 dp either way.
List<String> small(WidgetTester t) => [
      for (final e in find.byType(Press).evaluate())
        if ((e.widget as Press).onTap != null && !(e.renderObject!.paintBounds.size.width >= M2Size.tap - 0.5 && e.renderObject!.paintBounds.size.height >= M2Size.tap - 0.5))
          '${(e.widget as Press).label ?? 'row'} ${e.renderObject!.paintBounds.size}',
    ];

void main() {
  setUpAll(loadFonts);

  group('cached layers', () {
    testWidgets('the board and the letter are layers of their own: scrolling the header repaints neither', (t) async {
      await boot(t);
      await openHall(t, 'Worcester');
      // the layer itself, not any boundary somewhere above: the board and the letter each hold one of their own
      expect(find.descendant(of: find.byType(HallBoard), matching: find.byType(RepaintBoundary)), findsOneWidget);
      expect(find.descendant(of: find.byType(HallLetter), matching: find.byType(RepaintBoundary)), findsWidgets);
      final board = LampBoard.paints, letter = letterPaints;
      expect(board, greaterThan(0));
      for (var i = 0; i < 6; i++) {
        final g = await t.startGesture(const Offset(195, 700));
        await g.moveBy(const Offset(0, -20));
        await g.moveBy(const Offset(0, -30));
        await g.up();
        await t.pump();
      }
      await t.pumpAndSettle();
      expect(find.byType(HallMenu), findsOneWidget);
      expect(LampBoard.paints, board, reason: 'board repainted while the header moved');
      expect(letterPaints, letter, reason: 'letter repainted while the header moved');
    });
  });

  group('press (M2 .down rules)', () {
    testWidgets('a meal tab scales to .97 and has no tint; a hall chip in the dish sheet scales; plate tabs scale', (t) async {
      await boot(t, seed: 'plate=W:lunch:beef brisket noodle bowl;F:lunch:black bean burger');
      await openHall(t, 'Worcester');
      var g = await t.startGesture(t.getCenter(pressOfText('Dinner')));
      await t.pump();
      await t.pump(const Duration(milliseconds: 100));
      expect(scaleOf(t, pressOfText('Dinner')), closeTo(M2Motion.pressScale, 0.005));
      expect(find.descendant(of: pressOfText('Dinner'), matching: find.byType(AnimatedOpacity)), findsNothing);
      await g.up();
      await t.pumpAndSettle();
      await t.tap(find.textContaining('lunch,').first);
      await t.pumpAndSettle();
      g = await t.startGesture(t.getCenter(pressLabelled('Franklin lunch')));
      await t.pump();
      await t.pump(const Duration(milliseconds: 100));
      expect(scaleOf(t, pressLabelled('Franklin lunch')), closeTo(M2Motion.pressScale, 0.005));
      await g.up();
      await t.pumpAndSettle();
    });

    testWidgets('a hall chip scales to .97', (t) async {
      await boot(t);
      await openHall(t, 'Worcester');
      await bringIn(t, find.text('Golden BBQ Chicken Thigh'));
      await t.tap(find.text('Golden BBQ Chicken Thigh'));
      await t.pumpAndSettle();
      final chip = pressLabelled('Worcester');
      final g = await t.startGesture(t.getCenter(chip.last));
      await t.pump();
      await t.pump(const Duration(milliseconds: 100));
      expect(scaleOf(t, chip.last), closeTo(M2Motion.pressScale, 0.005));
      await g.up();
    });
  });

  group('reduced motion', () {
    testWidgets('press: nothing scales (the tint of a row still shows)', (t) async {
      await boot(t, reduced: true);
      await openHall(t, 'Worcester');
      final g = await t.startGesture(t.getCenter(find.byType(AddButton).first));
      await t.pump();
      await t.pump(const Duration(milliseconds: 100));
      expect(find.descendant(of: pressLabelled('Add').first, matching: find.byType(AnimatedScale)), findsNothing);
      await g.up();
      await t.pumpAndSettle();
      final tab = pressOfText('Dinner');
      expect(find.descendant(of: tab, matching: find.byType(AnimatedScale)), findsNothing);
    });

    testWidgets('push: no shift, no dim, no shadow; the page crossfades in on rmFade', (t) async {
      await boot(t, reduced: true);
      await t.tap(find.text('You').last);
      await t.pumpAndSettle();
      await t.tap(find.text('Dietary preferences'));
      await t.pump();
      await t.pump();
      await t.pump(const Duration(milliseconds: 40));
      final shell = t.state<ShellState>(find.byType(Shell));
      final p = shell.push.p.value;
      expect(p, inExclusiveRange(0, 1));
      final under = t.widget<Transform>(find.ancestor(of: find.byType(FadeThroughTabs), matching: find.byType(Transform)).first).transform.getTranslation().x;
      expect(under, 0);
      expect(t.widgetList<ColoredBox>(find.byType(ColoredBox)).where((b) => b.color.toARGB32() & 0xFFFFFF == 0x240A0E && b.color.a > 0 && b.color.a < 0.5), isEmpty);
      expect(find.byWidgetPredicate((w) => w is DecoratedBox && w.decoration is BoxDecoration && (w.decoration as BoxDecoration).boxShadow?.length == 2), findsNothing);
      await t.pumpAndSettle();
      expect(find.text('Only show'), findsOneWidget);
    });
  });

  group('touch targets', () {
    testWidgets('You: every row, toggle and the tab bar', (t) async {
      await boot(t);
      await t.tap(find.text('You').last);
      await t.pumpAndSettle();
      expect(small(t), isEmpty);
      await t.tap(find.text('Dietary preferences'));
      await t.pumpAndSettle();
      expect(small(t), isEmpty);
    });

    testWidgets('a second plate: the ghost +, the plate bar, the tabs and rows of the open plate sheet, the receipt', (t) async {
      final s = await boot(t, seed: 'plate=W:lunch:beef brisket noodle bowl');
      await openHall(t, 'Franklin');
      expect(find.byWidgetPredicate((w) => w is AddButton && w.ghost), findsWidgets);
      expect(small(t), isEmpty);
      await t.tap(find.byWidgetPredicate((w) => w is AddButton && w.ghost).first);
      await t.pumpAndSettle();
      expect(s.plates.plates, hasLength(2));
      expect(small(t), isEmpty, reason: 'the bar with two plates');
      await t.tap(find.textContaining('lunch,').first);
      await t.pumpAndSettle();
      expect(small(t), isEmpty, reason: 'the plate sheet with tabs');
      await t.tap(find.text('Log'));
      await t.pumpAndSettle(const Duration(milliseconds: 50), EnginePhase.sendSemanticsUpdate, const Duration(seconds: 1));
      expect(small(t), isEmpty, reason: 'the receipt');
    });
  });
}
