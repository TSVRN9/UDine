// M2 R13 §3: tracking off is a layer lifting away. `vectors.json` `tracking` is M2's own windows; the probes are test.js's own times
// ("turning tracking off lifts a layer away", "tracking off hides the calorie and protein figures everywhere").
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/motion/track_lift.dart';
import 'package:udine/theme/tokens.dart';
import '../core/m2/support.dart';

void main() {
  final t = vectors['tracking'] as Map<String, dynamic>;
  List<int> win(String k, String w) => ((t[k] as Map)[w] as List).cast<int>();

  group('the windows are M2 vectors.json tracking', () {
    test('off: fade 0 to exit, close exit to exit + fold', () {
      expect(win('off', 'fade'), [0, M2Motion.exit.ms]);
      expect(win('off', 'close'), [M2Motion.exit.ms, M2Motion.exit.ms + M2Motion.fold.ms]);
      expect(liftEnd(on: false), win('off', 'close')[1]);
    });
    test('on: open 0 to fold, fade fold to fold + settle, the bar fold to 2 fold', () {
      expect(win('on', 'open'), [0, M2Motion.fold.ms]);
      expect(win('on', 'fade'), [M2Motion.fold.ms, M2Motion.fold.ms + M2Motion.settle.ms]);
      expect(win('on', 'bar'), [M2Motion.fold.ms, 2 * M2Motion.fold.ms]);
      expect(liftEnd(on: true), win('on', 'bar')[1]);
    });
    test('fold is M3 medium1: 250 ms, cubic-bezier(.2,0,0,1)', () {
      expect(M2Motion.fold.ms, 250);
      expect(M2Motion.fold.curve, const Cubic(0.2, 0, 0, 1));
    });
    test('a row is 64, name-only 48', () {
      expect((t['rowMinHeight'] as Map)['on'], M2Size.row);
      expect((t['rowMinHeight'] as Map)['off'], M2Size.rowOff);
    });
  });

  group('off: everything leaving reaches nothing before its block closes', () {
    test('at 70 ms the content is fading and nothing has closed', () {
      final f = liftAt(on: false, ms: 70);
      expect(f.alpha, allOf(greaterThan(0), lessThan(1)));
      expect(f.size, 1);
      expect(f.bar, lessThan(1));
    });
    test('at 150 ms it is gone but still open; at 290 ms it is closing; at 400 ms closed', () {
      expect(liftAt(on: false, ms: 150), (alpha: 0.0, size: 1.0, bar: 0.0));
      final mid = liftAt(on: false, ms: 290);
      expect(mid.alpha, 0);
      expect(mid.size, allOf(greaterThan(0), lessThan(1)));
      expect(liftAt(on: false, ms: 400).size, 0);
    });
    test('no frame has any opacity while its height is closing', () {
      for (var ms = 0.0; ms <= 400; ms += 5) {
        final f = liftAt(on: false, ms: ms);
        if (f.size < 1) expect(f.alpha, 0, reason: 'at $ms ms');
      }
    });
  });

  group('on: the space opens first, then the content fades in', () {
    test('at 40 ms it has begun to open and is empty', () {
      final f = liftAt(on: true, ms: 40);
      expect(f.size, allOf(greaterThan(0), lessThan(1)));
      expect(f.alpha, 0);
    });
    test('no frame has opacity while its height is opening', () {
      for (var ms = 0.0; ms <= 500; ms += 5) {
        final f = liftAt(on: true, ms: ms);
        if (f.alpha > 0) expect(f.size, 1, reason: 'at $ms ms');
      }
    });
    test('the bar rises after the blocks open on You, from the start elsewhere', () {
      expect(liftAt(on: true, ms: 200).bar, 0);
      expect(liftAt(on: true, ms: 300).bar, greaterThan(0));
      expect(liftAt(on: true, ms: 100, onYou: false).bar, greaterThan(0));
      expect(liftAt(on: true, ms: 500), (alpha: 1.0, size: 1.0, bar: 1.0));
    });
  });

  group('reduced motion: opacity crossfades only', () {
    test('off: the height stays whole until the content is gone', () {
      for (var ms = 0.0; ms < 150; ms += 10) {
        expect(liftAt(on: false, ms: ms, reduced: true).size, 1);
      }
      expect(liftAt(on: false, ms: 150, reduced: true).size, 0);
    });
    test('on: the height is whole from the first frame', () {
      expect(liftAt(on: true, ms: 0, reduced: true).size, 1);
      expect(liftAt(on: true, ms: 0, reduced: true).alpha, 0);
    });
  });

  group('TrackLift', () {
    testWidgets('runs off in 400 ms through the ticker, ignores a flip while it runs, and rests gone', (tt) async {
      final lift = TrackLift(true);
      lift.attach(tt);
      lift.to(false);
      expect(lift.running, isTrue);
      await tt.pump();
      await tt.pump(const Duration(milliseconds: 70));
      expect(lift.frame.alpha, allOf(greaterThan(0), lessThan(1)));
      lift.to(true);
      expect(lift.on, isFalse, reason: 'a flip while the layer moves is ignored');
      await tt.pump(const Duration(milliseconds: 400));
      expect(lift.frame, liftGone);
      expect(lift.running, isFalse);
      lift.detach();
    });
    test('with no ticker a flip lands at once', () {
      final lift = TrackLift(true)..to(false);
      expect(lift.frame, liftGone);
      lift.to(true);
      expect(lift.frame, liftWhole);
    });
  });
}
