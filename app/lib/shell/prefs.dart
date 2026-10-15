import 'package:flutter/foundation.dart';

import '../core/m2/menu_view.dart' show Prefs;
import '../core/store/store.dart';

/// The stored Avoid list and "Only show" tags (`food_preferences`) as the menu filters on them. A tag the menu has no filter for is ignored.
Prefs dietPrefs(List<String> avoid, List<String> onlyShow) {
  final tags = {for (final t in onlyShow) t.toLowerCase()};
  return Prefs(veg: tags.contains('vegetarian'), plant: tags.contains('vegan') || tags.contains('plant based'), halal: tags.contains('halal'), avoid: avoid);
}

/// The device-only preferences the shell's screens read: pinned cafés and the Charles River Campus toggle. Loaded before the first
/// frame so nothing pops in (with no store, as when a newer build owns the database, they live in memory and nothing is written); a write lands in `preferences_kv` and in the notifier at once. `pins` given at load (the `?pins=N`
/// screenshot route) are held in memory and never saved.
class AppPrefs extends ChangeNotifier {
  AppPrefs._(this._store, this._charlesRiver, this._pins, this._memoryPins, this.scores, this.diet);
  final UdineStore? _store;
  bool _charlesRiver;
  List<String> _pins;
  final bool _memoryPins;

  /// The hall opened last (`W F H B`), for the cafés page's nearest-first order. In memory only, as M2's `S.lastHall`.
  String? lastHall;

  /// "Show on dishes" (You): which score tiles a row draws. Read once at launch; You writes them.
  ({bool health, bool carbon}) scores;

  /// Diet and allergens (You writes them): what a menu hides. Read once at launch, as `scores`.
  Prefs diet;

  bool get charlesRiver => _charlesRiver;
  List<String> get pins => _pins;

  static Future<AppPrefs> load(UdineStore? store, {List<String>? pins}) async {
    final sc = await store?.scores();
    return AppPrefs._(store, await store?.charlesRiver() ?? false, pins ?? await store?.pins() ?? const [], pins != null, (health: sc?.healthfulness ?? false, carbon: sc?.carbon ?? false), dietPrefs(await store?.avoid() ?? const [], await store?.onlyShow() ?? const []));
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
