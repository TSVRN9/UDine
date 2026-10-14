import '../theme/tokens.dart';

class VRect {
  final double top, height;
  const VRect(this.top, this.height);
  @override
  bool operator ==(Object other) => other is VRect && other.top == top && other.height == height;
  @override
  int get hashCode => Object.hash(top, height);
}

double _clamp(double x) => x < 0 ? 0 : x > 1 ? 1 : x;

/// The container window (M2 paint: WT = T*q, WB = H - q*(H - T - BH)); the full-width band grows to the screen.
VRect rectAt(VRect from, VRect to, double p) =>
    VRect(from.top + (to.top - from.top) * p, from.height + (to.height - from.height) * p);

double outgoingOpacity(double p) => 1 - _clamp(p / M2Motion.contFade);
double incomingOpacity(double p) => _clamp((p - M2Motion.contFade) / (1 - M2Motion.contFade));

enum Settle { open, closed }

/// v: px/ms, positive toward closing. M2: close below the commit point or on a flick past the threshold.
Settle settleTarget(double v, double p) => p < M2Motion.dragBackCommit || v > M2Motion.dragBackFlick ? Settle.closed : Settle.open;

enum Phase { closed, opening, open, closing, dragging }

class Machine {
  final Phase phase;
  final int run;
  const Machine(this.phase, this.run);
  /// The overlay is mounted (and the source band hidden) in every phase but `closed`, which only a finished close reaches.
  bool get mounted => phase != Phase.closed;
  @override
  bool operator ==(Object other) => other is Machine && other.phase == phase && other.run == run;
  @override
  int get hashCode => Object.hash(phase, run);
  @override
  String toString() => 'Machine($phase, $run)';
}

enum _E { open, close, grab, release, done }

class Event {
  final _E _t;
  final Settle? to;
  final int run;
  const Event._(this._t, [this.to, this.run = 0]);
  static const open = Event._(_E.open);
  static const close = Event._(_E.close);
  static const grab = Event._(_E.grab);
  const Event.release(Settle to) : this._(_E.release, to);
  const Event.done(int run) : this._(_E.done, null, run);
}

/// Every animated phase starts a new `run`; a `done` from a cancelled run is ignored, so an interrupted open or close never
/// completes the wrong way, and a second tap while opening is not a second open.
Machine transition(Machine m, Event e) {
  Machine go(Phase p) => Machine(p, m.run + 1);
  switch (e._t) {
    case _E.open:
      return m.phase == Phase.closed || m.phase == Phase.closing ? go(Phase.opening) : m;
    case _E.close:
      return m.phase == Phase.open || m.phase == Phase.opening ? go(Phase.closing) : m;
    case _E.grab:
      return m.phase == Phase.closed || m.phase == Phase.dragging ? m : go(Phase.dragging);
    case _E.release:
      return m.phase == Phase.dragging ? go(e.to == Settle.open ? Phase.opening : Phase.closing) : m;
    case _E.done:
      if (e.run != m.run) return m;
      return m.phase == Phase.opening ? Machine(Phase.open, m.run) : m.phase == Phase.closing ? Machine(Phase.closed, m.run) : m;
  }
}
