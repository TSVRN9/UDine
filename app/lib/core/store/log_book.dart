import 'package:flutter/foundation.dart';

import '../date.dart';
import '../m2/history.dart';
import '../types.dart';
import 'store.dart';

/// The consumption log as You reads it: every meal (RN's `log_entries`, grouped as `loggedMeals` does), held in memory and kept in step
/// with the device store. An edit shows at once and is written behind it, in order; what fails to write is read back from the file, so
/// the screen never shows a state the store does not hold. The only holder of the store for the log screens, as `AppPrefs` is for the
/// preferences (the screens stay clear of `UdineStore`, `menus_only_test`).
class LogBook extends ChangeNotifier {
  LogBook(this._store, {DateTime Function()? now}) : _now = now; // ignore: prefer_initializing_formals
  final UdineStore _store;
  final DateTime Function()? _now;
  List<LoggedMeal> _meals = const [];
  // (made on first use: a completed future keeps the zone it was made in, and a test's fake one cannot run what real I/O awaits)
  Future<void>? _chain;
  Future<void> get _tail => _chain ??= Future.value();
  set _tail(Future<void> f) => _chain = f;

  List<LoggedMeal> get meals => _meals;

  /// Café key to get_infov2 location id, from the saved hours (the shell sets it once they are in): how a café's meal is named.
  Map<String, int> get cafeIds => _cafeIds;
  Map<String, int> _cafeIds = const {};
  set cafeIds(Map<String, int> v) {
    _cafeIds = v;
    notifyListeners();
  }

  /// The effective day of the app's clock.
  String get today => effectiveTodayIso((_now ?? DateTime.now)(), defaultRolloverHour);

  /// Edits shown and not yet written (queued or running).
  int _pending = 0;

  /// Reads the file, in turn behind every write already queued. If another edit has been shown since, what was read is stale and is
  /// dropped: that edit's own write (or its own failure's reload) brings the screen to what the file holds.
  Future<void> reload() async {
    final read = _tail.then((_) => _store.allEntries());
    _tail = read.then<void>((_) {}, onError: (_) {});
    final entries = await read;
    if (_pending > 0) return;
    _meals = loggedMeals(entries);
    notifyListeners();
  }

  Future<T> _queue<T>(Future<T> Function() write) {
    _pending++;
    final r = _tail.then((_) => write());
    _tail = r.then<void>((_) => _pending--, onError: (_) => _pending--);
    return r;
  }

  /// Runs `write` behind the edit already shown; a failure reads the file back and rethrows.
  Future<T> _persist<T>(Future<T> Function() write) => _queue(write).catchError((Object e, StackTrace st) async {
        debugPrint('udine: a log edit did not save, showing what the file holds: $e\n$st');
        await reload();
        throw e;
      });

  /// Shows `id`'s row as `to`, or gone when null (a meal left with no rows is gone too).
  void _replace(String id, LogEntry? to) {
    _meals = [
      for (final m in _meals)
        if (!m.items.any((i) => i.id == id))
          m
        else if (to != null || m.items.length > 1)
          LoggedMeal(m.loggedAt, m.day, [for (final i in m.items) if (i.id != id) i else if (to != null) LoggedItem(to)]),
    ];
    notifyListeners();
  }

  /// A stepper: `servings` for one row. Its own undo (the stepper goes back).
  Future<void> setServings(LoggedItem it, double servings) {
    final e = it.entry;
    _replace(it.id, LogEntry(id: e.id, loggedAt: e.loggedAt, source: e.source, servings: servings, nutrition: e.nutrition));
    return _persist(() => _store.changeServings(it.id, servings));
  }

  /// One row out of a meal; the way back puts exactly the stored row back.
  Future<Undo> remove(LoggedItem it) {
    _replace(it.id, null);
    return _persist(() => _store.deleteEntry(it.id)).then((u) => () async {
          await _queue(u);
          await reload();
        });
  }

  /// A whole meal out; the way back puts exactly its rows back.
  Future<Undo> deleteMeal(LoggedMeal m) {
    _meals = [for (final x in _meals) if (x.loggedAt != m.loggedAt) x];
    notifyListeners();
    return _persist(() => _store.deleteEntries([for (final i in m.items) i.id])).then((u) => () async {
          await _queue(u);
          await reload();
        });
  }
}
