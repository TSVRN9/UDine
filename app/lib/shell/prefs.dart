import 'package:flutter/foundation.dart';

import '../core/m2/menu_view.dart' show Prefs;
import '../core/store/store.dart';
import '../core/types.dart' show DishFavorite;
import '../motion/track_lift.dart';

/// The stored Avoid list and "Only show" tags (`food_preferences`) as the menu filters on them. A tag the menu has no filter for is ignored.
Prefs dietPrefs(List<String> avoid, List<String> onlyShow) {
  final tags = {for (final t in onlyShow) t.toLowerCase()};
  return Prefs(veg: tags.contains('vegetarian'), plant: tags.contains('vegan') || tags.contains('plant based'), halal: tags.contains('halal'), avoid: avoid);
}

/// The device-only preferences the shell's screens read: pinned cafés and the Charles River Campus toggle. Loaded before the first
/// frame so nothing pops in (with no store, as when a newer build owns the database, they live in memory and nothing is written); a write lands in `preferences_kv` and in the notifier at once. `pins` given at load (the `?pins=N`
/// screenshot route) are held in memory and never saved.
class AppPrefs extends ChangeNotifier {
  AppPrefs._(this._store, this._charlesRiver, this._pins, this._memoryPins, this.scores, this.diet, this._onlyShow, this._favorites, this._track, this._firstRunSeen);
  final UdineStore? _store;
  bool _charlesRiver;
  List<String> _pins;
  final bool _memoryPins;
  /// The stored "Only show" tags as RN wrote them, so a tag M2 has no row for is written back untouched.
  List<String> _onlyShow;

  /// The hall opened last (`W F H B`), for the cafés page's nearest-first order. In memory only, as M2's `S.lastHall`.
  String? lastHall;

  /// "Show on dishes" (You): which score tiles a row draws. Read once at launch; You writes them.
  ({bool health, bool carbon}) scores;

  /// Diet and allergens (You writes them): what a menu hides. Read once at launch, as `scores`.
  Prefs diet;

  bool _track, _firstRunSeen;

  /// The tracking layer's clock: what lifts away when [track] goes off (the bar, You's blocks, rows' figures and controls) reads it.
  late final TrackLift lift = TrackLift(track);

  /// "Track what I eat": off, UDine is a menu and nothing offers to record. Never on without a store (a newer build owns the database).
  bool get track => _track && _store != null;

  /// First run has been shown and put away; written only when the user dismisses it, so an app kill before that shows it again.
  bool get firstRunSeen => _firstRunSeen;

  bool get charlesRiver => _charlesRiver;
  List<String> get pins => _pins;

  /// Favourite dishes, by the name the feed spells them (RN's `dish` favourites, which matching reads exactly). Device-only.
  final Set<String> _favorites;
  Set<String> get favorites => _favorites;
  bool isFavorite(String dishName) => _favorites.contains(dishName);

  static Future<AppPrefs> load(UdineStore? store, {List<String>? pins}) async {
    final sc = await store?.scores();
    return AppPrefs._(store, await store?.charlesRiver() ?? false, pins ?? await store?.pins() ?? const [], pins != null, (health: sc?.healthfulness ?? false, carbon: sc?.carbon ?? false), dietPrefs(await store?.avoid() ?? const [], await store?.onlyShow() ?? const []), await store?.onlyShow() ?? const [],
        {for (final f in await store?.favorites() ?? const []) if (f is DishFavorite) f.dishName}, await store?.tracking() ?? false, await store?.firstRunSeen() ?? true);
  }

  /// Tracking lifts away or lays back over the screens that show it; [onYou]: the switch is on You (the bar rises after the blocks open).
  Future<void> setTrack(bool v, {bool onYou = true, bool reduced = false}) {
    if (_store == null || lift.running) return Future.value(); // (a flip while the layer moves is ignored, as M2's `TRK.busy`)
    _track = v;
    lift.to(v, onYou: onYou, reduced: reduced);
    notifyListeners();
    return _store.setTracking(v);
  }

  Future<void> markFirstRunSeen() {
    if (_firstRunSeen) return Future.value();
    _firstRunSeen = true;
    notifyListeners();
    return _store?.setFirstRunSeen(true) ?? Future.value();
  }

  Future<void> setCharlesRiver(bool v) {
    _charlesRiver = v;
    notifyListeners();
    return _store?.setCharlesRiver(v) ?? Future.value();
  }

  /// A score toggle ("Show on dishes"): the one named changes, the other keeps its value.
  Future<void> setScore({bool? health, bool? carbon}) {
    scores = (health: health ?? scores.health, carbon: carbon ?? scores.carbon);
    notifyListeners();
    return _store?.setScores(healthfulness: scores.health, carbon: scores.carbon) ?? Future.value();
  }

  /// "Only show": `tag` is the feed's own string (Vegetarian, Plant Based, Halal). Turning one off also drops its older spelling (RN's "Vegan").
  Future<void> setOnlyShow(String tag, bool on) {
    final same = {tag.toLowerCase(), if (tag == 'Plant Based') 'vegan'};
    _onlyShow = [for (final t in _onlyShow) if (!same.contains(t.toLowerCase())) t, if (on) tag];
    diet = dietPrefs(diet.avoid, _onlyShow);
    notifyListeners();
    return _store?.setOnlyShow(_onlyShow) ?? Future.value();
  }

  /// "Avoid": one allergen, as the feed spells it, in or out of the list.
  Future<void> toggleAvoid(String allergen) {
    final avoid = diet.avoid.contains(allergen) ? [for (final a in diet.avoid) if (a != allergen) a] : [...diet.avoid, allergen];
    diet = diet.copyWith(avoid: avoid);
    notifyListeners();
    return _store?.setAvoid(avoid) ?? Future.value();
  }

  Future<void> setPins(List<String> v) {
    _pins = v;
    notifyListeners();
    return _memoryPins ? Future.value() : _store?.setPins(v) ?? Future.value();
  }

  Future<void> toggleFavorite(String dishName) {
    final on = _favorites.add(dishName);
    if (!on) _favorites.remove(dishName);
    notifyListeners();
    final f = DishFavorite(dishName);
    return (on ? _store?.addFavorite(f) : _store?.removeFavorite(f)) ?? Future.value();
  }
}
