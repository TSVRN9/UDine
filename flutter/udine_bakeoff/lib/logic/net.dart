import '../theme/tokens.dart';
import 'fixture.dart';

/// What the network does (M2's `?net=`), set at launch by `--dart-define=BAKEOFF_NET=slow|offline|fail`.
enum NetMode { ok, slow, offline, fail }

/// What a place's menu on a day is showing.
enum MenuState { ok, loading, offline, fail }

NetMode parseNet(String? s) => switch (s) { 'slow' => NetMode.slow, 'offline' => NetMode.offline, 'fail' => NetMode.fail, _ => NetMode.ok };

/// M2 `menuState`: a place's menu on a day. Offline, today and tomorrow are saved (`day` 0 and 1); slow loads each place and day once
/// (`loaded` holds the "place|day" keys that have arrived); failed knows nothing.
MenuState menuState(NetMode mode, Set<String> loaded, String key, int day) {
  if (mode == NetMode.fail) return MenuState.fail;
  if (mode == NetMode.offline) return day <= 1 ? MenuState.ok : MenuState.offline;
  return mode == NetMode.slow && !loaded.contains(key) ? MenuState.loading : MenuState.ok;
}

/// The fetch failed (M2's failed state): what the retry path catches.
class NetFailure implements Exception {
  const NetFailure();
  @override
  String toString() => "Couldn't connect";
}

/// What a load answered: the fixture, and whether it is the saved copy (offline) and when it was saved.
class Loaded {
  final Fixture fx;
  final bool cached;
  final DateTime? asOf;
  const Loaded(this.fx, {this.cached = false, this.asOf});
}

/// The fixture as the network gives it in a mode (RN `loadFixtureAsync`): ok at once; slow after `slow` (M2's SLOW, 1500 ms by the token);
/// offline the saved copy, flagged and dated; fail an error.
Future<Loaded> loadFixture(Fixture bundled, NetMode mode, {Duration? slow}) async {
  switch (mode) {
    case NetMode.ok:
      return Loaded(bundled);
    case NetMode.slow:
      await Future<void>.delayed(slow ?? Duration(milliseconds: M2Motion.netSlow.round()));
      return Loaded(bundled);
    case NetMode.offline:
      return Loaded(bundled, cached: true, asOf: DateTime.parse(bundled.clock));
    case NetMode.fail:
      throw const NetFailure();
  }
}
