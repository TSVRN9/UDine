import 'package:flutter/foundation.dart';

import '../core/store/store.dart';

/// The device-only preferences the shell's screens read: pinned cafés and the Charles River Campus toggle. Loaded before the first
/// frame so nothing pops in (with no store, as when a newer build owns the database, they live in memory and nothing is written); a write lands in `preferences_kv` and in the notifier at once. `pins` given at load (the `?pins=N`
/// screenshot route) are held in memory and never saved.
class AppPrefs extends ChangeNotifier {
  AppPrefs._(this._store, this._charlesRiver, this._pins, this._memoryPins, this.scores);
  final UdineStore? _store;
  bool _charlesRiver;
  List<String> _pins;
  final bool _memoryPins;

  /// "Show on dishes" (You): which score tiles a row draws. Read once at launch; You writes them.
  ({bool health, bool carbon}) scores;

  bool get charlesRiver => _charlesRiver;
  List<String> get pins => _pins;

  static Future<AppPrefs> load(UdineStore? store, {List<String>? pins}) async {
    final sc = await store?.scores();
    return AppPrefs._(store, await store?.charlesRiver() ?? false, pins ?? await store?.pins() ?? const [], pins != null, (health: sc?.healthfulness ?? false, carbon: sc?.carbon ?? false));
  }

  Future<void> setCharlesRiver(bool v) {
    _charlesRiver = v;
    notifyListeners();
    return _store?.setCharlesRiver(v) ?? Future.value();
  }

  Future<void> setPins(List<String> v) {
    _pins = v;
    notifyListeners();
    return _memoryPins ? Future.value() : _store?.setPins(v) ?? Future.value();
  }
}
