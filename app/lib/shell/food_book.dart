import 'package:flutter/foundation.dart';
import 'dart:math' show Random;

import '../core/m2/board.dart' show Macro, dishKey;
import '../core/saved_food.dart';
import '../core/store/store.dart';

/// Your foods as the screens read them (M2 `S.foods`): the custom foods (RN's `custom_foods`) and the packaged and UMass Dining ones
/// (`saved_foods`) in one list, newest first, held in memory and read back after each write, so the screens never show a state the
/// file does not hold. Device only. The only holder of the store for these screens, as `AppPrefs` and `LogBook` are for theirs.
class FoodBook extends ChangeNotifier {
  FoodBook(this._store, {DateTime Function()? now, String Function()? salt})
      : _now = now ?? DateTime.now,
        _salt = salt ?? _random;
  final UdineStore _store;
  final DateTime Function() _now;
  final String Function() _salt;

  static String _random() => Random().nextDouble().toString().substring(2, 12);

  List<SavedFood> _foods = const [];
  List<SavedFood> get foods => _foods;

  /// The food a plate item or a row names (`food:<id>` or the bare id), as it is now; null once it has been deleted.
  SavedFood? byKey(String key) {
    final id = key.startsWith('food:') ? key.substring(5) : key;
    return _foods.where((f) => f.id == id).firstOrNull;
  }

  /// Newest first by when each was saved; the store's own order (newest rowid first) breaks a tie.
  Future<void> reload() async {
    final all = [for (final c in (await _store.customFoods()).reversed) SavedFood.custom(c), for (final p in await _store.savedFoods()) SavedFood.packed(p)];
    final order = {for (final (i, f) in all.indexed) f: i};
    _foods = (all..sort((a, b) => b.at != a.at ? b.at.compareTo(a.at) : order[a]!.compareTo(order[b]!)));
    notifyListeners();
  }

  /// A packaged or UMass Dining food added to the plate: kept in Your foods the first time. A food already saved is returned as it is
  /// kept (never overwritten by the hit it came from, which would lose an edit).
  Future<SavedFood> save(SavedFood f) async {
    final have = byKey(f.id);
    if (have != null) return have;
    await _store.saveFood(f.packed!.savedNow(_now().millisecondsSinceEpoch));
    await reload();
    return byKey(f.id)!;
  }

  /// [save] that never throws: a food that could not be kept is still added to the plate as it is (and logged as its own source), so a failing
  /// write costs the user their list entry, not their meal.
  Future<SavedFood> keep(SavedFood f) async {
    try {
      return await save(f);
    } catch (e) {
      debugPrint('udine: the food was not kept: $e');
      return f;
    }
  }

  /// A custom food from the form: a new row, unless the name is one already in Your foods, which is the same food (its first figures stay: whether
  /// new figures replace them is the owner's to say).
  Future<SavedFood> addCustom(String name, Macro m) async {
    final n = name.trim();
    for (final f in _foods) {
      if (f.kind == FoodKind.custom && dishKey(f.name) == dishKey(n)) return f;
    }
    final c = customFromForm(id: SavedFood.newCustomId(_now(), _salt), name: n, m: m);
    await _store.addCustomFood(c);
    await reload();
    return byKey(c.id)!;
  }

  /// Save on the form's Edit: the same row, the new name and figures.
  Future<void> edit(SavedFood old, SavedFood next) async {
    if (next.custom != null) {
      await _store.addCustomFood(next.custom!);
    } else {
      await _store.saveFood(next.packed!);
    }
    await reload();
  }

  /// Takes it out of Your foods; the Undo puts the row back exactly where it was and reads the list again.
  Future<Undo> delete(SavedFood f) async {
    final undo = await (f.custom != null ? _store.removeCustomFood(f.id) : _store.removeSavedFood(f.id));
    await reload();
    return () async {
      await undo();
      await reload();
    };
  }
}
