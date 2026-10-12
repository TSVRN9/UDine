import 'package:flutter_test/flutter_test.dart';
import 'package:udine_bakeoff/motion/container_math.dart';
import 'package:udine_bakeoff/theme/tokens.dart';

const from = VRect(300, 112);
const to = VRect(0, 800);
Machine at(Machine m, List<Event> ev) => ev.fold(m, transition);
const closed = Machine(Phase.closed, 0);

void main() {
  group('rectAt', () {
    test('is the band at 0 and the screen at 1, monotonic between', () {
      expect(rectAt(from, to, 0), from);
      expect(rectAt(from, to, 1), to);
      var prev = rectAt(from, to, 0);
      for (var p = 0.1; p <= 1.001; p += 0.1) {
        final r = rectAt(from, to, p);
        expect(r.top, lessThanOrEqualTo(prev.top));
        expect(r.height, greaterThanOrEqualTo(prev.height));
        prev = r;
      }
    });
  });

  group('content fades', () {
    test('outgoing is gone by the early-fade fraction, incoming starts there', () {
      expect(outgoingOpacity(0), 1);
      expect(outgoingOpacity(M2Motion.contFade), 0);
      expect(outgoingOpacity(1), 0);
      expect(incomingOpacity(0), 0);
      expect(incomingOpacity(M2Motion.contFade), 0);
      expect(incomingOpacity(1), 1);
      expect(incomingOpacity(0.65), closeTo(0.5, 1e-9));
    });
    test('the fade split is 30 / 70, as M2 paint() has it', () => expect(M2Motion.contFade, 0.3));
  });

  group('settleTarget (M2: close below commit or on a flick)', () {
    test('closes below the commit point', () => expect(settleTarget(0, 0.5), Settle.closed));
    test('opens at or past the commit point at rest', () => expect(settleTarget(0, 0.9), Settle.open));
    test('a flick toward closing wins past the commit point', () => expect(settleTarget(0.6, 0.95), Settle.closed));
    test('a flick at exactly the threshold does not', () => expect(settleTarget(M2Motion.dragBackFlick, 0.95), Settle.open));
    test('a flick back toward open does not close', () => expect(settleTarget(-0.6, 0.9), Settle.open));
  });

  group('interruption reducer (Review Focus 4)', () {
    test('open then finish lands open, close then finish lands closed', () {
      final o = at(closed, [Event.open]);
      expect(o.phase, Phase.opening);
      expect(transition(o, Event.done(o.run)).phase, Phase.open);
      final c = at(o, [Event.done(o.run), Event.close]);
      expect(c.phase, Phase.closing);
      expect(transition(c, Event.done(c.run)).phase, Phase.closed);
    });
    test("open during a running close resolves to open; the close's late finish is ignored", () {
      final c = at(closed, [Event.open, Event.done(1), Event.close]);
      final o = transition(c, Event.open);
      expect(o.phase, Phase.opening);
      final stale = transition(o, Event.done(c.run));
      expect(stale, o);
      expect(transition(stale, Event.done(o.run)).phase, Phase.open);
    });
    test('close during a running open reverses it', () {
      final o = at(closed, [Event.open]);
      final c = transition(o, Event.close);
      expect(c.phase, Phase.closing);
      expect(transition(c, Event.done(o.run)), c);
    });
    test('a grab cancels the running animation; releasing settles per the release target', () {
      final o = at(closed, [Event.open]);
      final g = transition(o, Event.grab);
      expect(g.phase, Phase.dragging);
      expect(transition(g, Event.done(o.run)), g);
      expect(transition(g, Event.release(Settle.closed)).phase, Phase.closing);
      expect(transition(g, Event.release(Settle.open)).phase, Phase.opening);
    });
    test('a grab whose gesture is cancelled settles by position and always leaves dragging', () {
      final g = at(closed, [Event.open, Event.done(1), Event.grab]);
      for (final (p, end) in [(0.9, Phase.open), (0.4, Phase.closed)]) {
        final r = transition(g, Event.release(settleTarget(0, p)));
        expect(r.phase, end == Phase.open ? Phase.opening : Phase.closing);
        expect(transition(r, Event.done(r.run)).phase, end);
      }
    });
    test('a second release (finalize after end) changes nothing', () {
      final r = at(closed, [Event.open, Event.grab, Event.release(Settle.closed)]);
      expect(transition(r, Event.release(Settle.open)), r);
    });
    test('a grab during a running open cancels it; its finish cannot reopen after the release closes', () {
      final o = at(closed, [Event.open]);
      final r = at(o, [Event.grab, Event.release(Settle.closed)]);
      expect(transition(r, Event.done(o.run)), r);
      expect(transition(r, Event.done(r.run)).phase, Phase.closed);
    });
    test('a second tap during the close is one open, not two (open while opening changes nothing)', () {
      final o = at(closed, [Event.open]);
      expect(transition(o, Event.open), o);
    });
    test('only a finished close frees the band: the overlay is mounted in every other phase', () {
      final phases = [closed, at(closed, [Event.open]), at(closed, [Event.open, Event.grab]), at(closed, [Event.open, Event.close])];
      expect(phases.map((m) => m.mounted).toList(), [false, true, true, true]);
    });
    test('events that make no sense in a phase leave it unchanged', () {
      expect(transition(closed, Event.close), closed);
      expect(transition(closed, Event.grab), closed);
      expect(transition(closed, Event.release(Settle.open)), closed);
    });
  });
}
