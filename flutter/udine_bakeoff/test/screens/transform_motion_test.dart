import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine_bakeoff/main.dart';
import 'package:udine_bakeoff/motion/container_math.dart';
import 'package:udine_bakeoff/motion/container_transform.dart';
import 'package:udine_bakeoff/screens/halls.dart';
import 'package:udine_bakeoff/ui/ui.dart';
import '../fonts.dart';
import '../logic/support.dart';

Future<ContainerTransform> boot(WidgetTester tester) async {
  Photos.enabled = false;
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(BakeoffApp(fx: fx));
  return tester.state<HallsTabState>(find.byType(HallsTab)).t;
}

double fade(WidgetTester tester, String id) => tester.widget<Opacity>(find.byKey(ValueKey('fade-$id'))).opacity;

void main() {
  setUpAll(loadFonts);

  testWidgets('what is drawn at p .15 / .3 / .65 (M2 paint): copy and grade leave, the screen arrives', (tester) async {
    final t = await boot(tester);
    await tester.tap(find.text('Hampshire'));
    await tester.pump();
    t.progress.stop();
    // [p, ghost (fout), band grade (q), header grade (p), title and back (fin), letter (fin)]
    for (final (p, ghost, grade, header, incoming) in [(0.15, 0.5, 0.85, 0.15, 0.0), (0.3, 0.0, 0.7, 0.3, 0.0), (0.65, 0.0, 0.35, 0.65, 0.5)]) {
      t.progress.value = p;
      await tester.pump();
      expect(fade(tester, 'ghost'), closeTo(ghost, 1e-9), reason: 'ghost @ $p');
      expect(fade(tester, 'bandGrade'), closeTo(grade, 1e-9), reason: 'band grade @ $p');
      expect(fade(tester, 'headerGrade'), closeTo(header, 1e-9), reason: 'header grade @ $p');
      for (final id in ['title', 'back', 'headerLetter']) {
        expect(fade(tester, id), closeTo(incoming, 1e-9), reason: '$id @ $p');
      }
    }
  });

  group('duration is the full time scaled by the distance left', () {
    Future<void> lands(WidgetTester tester, ContainerTransform t, Phase during, int ms) async {
      await tester.pump(Duration(milliseconds: (ms * 0.9).round()));
      expect(t.phase, during, reason: 'not there at 90% of $ms ms');
      await tester.pump(Duration(milliseconds: (ms * 0.2).round()));
      expect(t.phase, isNot(during), reason: 'there by 110% of $ms ms');
    }

    testWidgets('a whole open is 500 ms, a whole close 400 ms', (tester) async {
      final t = await boot(tester);
      await tester.tap(find.text('Hampshire'));
      await tester.pump();
      await tester.pump(); // first tick
      await lands(tester, t, Phase.opening, 500);
      t.close();
      await tester.pump();
      await lands(tester, t, Phase.closing, 400);
    });

    testWidgets('a release at p .5 closes in 400 x .5 = 200 ms', (tester) async {
      final t = await boot(tester);
      await tester.tap(find.text('Hampshire'));
      await tester.pumpAndSettle();
      t.grab();
      t.move(240);
      t.release(240, 0);
      expect(t.phase, Phase.closing);
      await tester.pump();
      await lands(tester, t, Phase.closing, 200);
    });

    testWidgets('a release at p .9 on a flick opens in 500 x .1 = 50 ms, not 500', (tester) async {
      final t = await boot(tester);
      await tester.tap(find.text('Hampshire'));
      await tester.pumpAndSettle();
      t.grab();
      t.move(48);
      t.release(48, 0);
      expect(t.phase, Phase.opening);
      await tester.pump();
      await lands(tester, t, Phase.opening, 50);
    });

    testWidgets('a close interrupting an open takes 400 x where it had got to', (tester) async {
      final t = await boot(tester);
      await tester.tap(find.text('Hampshire'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      final p = t.progress.value;
      expect(p, inExclusiveRange(0.1, 0.9));
      t.close();
      await tester.pump();
      await lands(tester, t, Phase.closing, (400 * p).round());
    });

    testWidgets('an open interrupting a close takes 500 x what was left', (tester) async {
      final t = await boot(tester);
      await tester.tap(find.text('Hampshire'));
      await tester.pumpAndSettle();
      t.close();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 150));
      final p = t.progress.value;
      expect(p, inExclusiveRange(0.1, 0.9));
      t.open(t.rect!);
      await tester.pump();
      await lands(tester, t, Phase.opening, (500 * (1 - p)).round());
    });
  });
}
