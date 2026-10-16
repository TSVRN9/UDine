import 'package:flutter/foundation.dart' show kReleaseMode;

/// What the network does (M2's `?net=`).
enum NetMode { ok, slow, offline, fail }

/// The recorded-data switch exists only where this is true: debug and profile. A const, so a release build folds every
/// branch on it away (and its tests can assert it).
const recordedAvailable = !kReleaseMode;

class RecordedFlags {
  const RecordedFlags({this.at, this.net = NetMode.ok, this.scores = (health: false, carbon: false), this.avoid = const [], this.onlyShow = const [], this.savedPdfs = const {}, this.savedCafes = const {}, this.noEvents = false});
  final DateTime? at;
  final NetMode net;

  /// `saved=pdf:Lunch,pdf:Dinner` (M2's own flag): menus opened before, so offline has them. Names are the menu's (`menuName`).
  final Set<String> savedPdfs;
  /// `saved=Green Fields` (M2's own flag): cafés opened today, so offline has their menu.
  final Set<String> savedCafes;
  /// `events=0` (M2's own flag): the feed has no events, so Search idles without its band.
  final bool noEvents;
  /// `scores=health,carbon`: the You switches a capture has no screen to set yet.
  final ({bool health, bool carbon}) scores;
  /// `avoid=Milk,Eggs` and `only=Halal`: You's Avoid list and "Only show" tags, likewise.
  final List<String> avoid, onlyShow;
}

/// Reads `?data=recorded&at=2026-10-08T12:41&net=slow|offline|fail` from a route. Null = the live path.
/// [available] is the gate; tests pass false to stand in for a release build.
RecordedFlags? recordedFlags(String route, {bool available = recordedAvailable}) {
  if (!available) return null;
  final q = Uri.parse(route).queryParameters;
  if (q['data'] != 'recorded') return null;
  return RecordedFlags(
    at: q['at'] == null ? null : DateTime.parse(q['at']!),
    net: NetMode.values.asNameMap()[q['net']] ?? NetMode.ok,
    noEvents: q['events'] == '0',
    savedPdfs: {for (final x in (q['saved'] ?? '').split(',')) if (x.startsWith('pdf:')) x.substring(4)},
    savedCafes: {for (final x in (q['saved'] ?? '').split(',')) if (x.isNotEmpty && !x.startsWith('pdf:')) x},
    scores: (health: (q['scores'] ?? '').split(',').contains('health'), carbon: (q['scores'] ?? '').split(',').contains('carbon')),
    avoid: [for (final a in (q['avoid'] ?? '').split(',')) if (a.isNotEmpty) a],
    onlyShow: [for (final a in (q['only'] ?? '').split(',')) if (a.isNotEmpty) a],
  );
}

/// `?photos=off` (screenshots): draw no UMass photos, so a capture can be committed. Same gate as recorded mode: a release build
/// folds it away and can never reach it.
bool photosOff(String route, {bool available = recordedAvailable}) => available && Uri.parse(route).queryParameters['photos'] == 'off';
