import 'package:flutter/widgets.dart';
import '../logic/fixture.dart';
import '../logic/net.dart';
import '../logic/net.dart' as logic show menuState;

/// What the network has done (M2 `NET`, `hallsLoaded`, `LOADED`): the mode, whether Halls' hours and busy have arrived, and the
/// "place|day" menus that have. `hold` is a test seam: a slow load that never arrives, so the loading state can be held still.
class Net extends ChangeNotifier {
  Net(this.fx, {this.mode = NetMode.ok, this.slow, this.hold = false}) {
    _hallsReady = mode != NetMode.slow;
    if (mode == NetMode.slow && !hold) _loadHalls();
  }
  final Fixture fx;
  final Duration? slow;
  final bool hold;
  NetMode mode;
  late bool _hallsReady;
  final loaded = <String>{};
  final _pending = <String>{};
  int _run = 0;

  /// M2 `hoursKnown`: hours are cached for the day, so only a failure or the first slow load leaves them unknown.
  bool get hoursKnown => mode != NetMode.fail && (mode != NetMode.slow || _hallsReady);

  /// M2 `liveKnown`: busy is live and never shown stale, so offline and failed have none.
  bool get liveKnown => (mode == NetMode.ok || mode == NetMode.slow) && _hallsReady;

  MenuState menuState(String place, int day) => logic.menuState(mode, loaded, '$place|$day', day);

  void _loadHalls() {
    final mine = _run;
    loadFixture(fx, NetMode.slow, slow: slow).then((_) {
      if (mine == _run) {
        _hallsReady = true;
        notifyListeners();
      }
    });
  }

  /// A slow menu starts its load when it is first asked for.
  void request(String key) {
    if (hold || mode != NetMode.slow || loaded.contains(key) || !_pending.add(key)) return;
    final mine = _run;
    loadFixture(fx, NetMode.slow, slow: slow).then((_) {
      if (mine == _run) {
        loaded.add(key);
        notifyListeners();
      }
    });
  }

  /// Try again (M2 `retry`): fetch again; the fetch now succeeds, so every screen leaves its failure at once.
  Future<void> retry() async {
    await loadFixture(fx, NetMode.ok);
    _run++;
    mode = NetMode.ok;
    _hallsReady = true;
    _pending.clear();
    notifyListeners();
  }
}

/// The network for a subtree.
class NetScope extends InheritedNotifier<Net> {
  const NetScope({super.key, required Net net, required super.child}) : super(notifier: net);
  static Net? maybeOf(BuildContext context) => context.dependOnInheritedWidgetOfExactType<NetScope>()?.notifier;
  static Net of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<NetScope>()!.notifier!;
  static Net read(BuildContext context) => context.getInheritedWidgetOfExactType<NetScope>()!.notifier!;
}
