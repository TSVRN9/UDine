import 'package:flutter/foundation.dart' show kReleaseMode;

/// What the network does (M2's `?net=`).
enum NetMode { ok, slow, offline, fail }

/// The recorded-data switch exists only where this is true: debug and profile. A const, so a release build folds every
/// branch on it away (and its tests can assert it).
const recordedAvailable = !kReleaseMode;

class RecordedFlags {
  const RecordedFlags({this.at, this.net = NetMode.ok});
  final DateTime? at;
  final NetMode net;
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
  );
}
