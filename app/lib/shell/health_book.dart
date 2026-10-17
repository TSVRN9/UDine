import 'package:flutter/foundation.dart';

import '../core/health/health_client.dart';
import '../core/health/health_meal.dart';
import '../core/health/health_writer.dart';
import '../core/m2/history.dart';
import '../core/store/log_book.dart';
import '../core/store/store.dart';

/// What the You row shows. [hidden]: Health Connect isn't there to ask (not installed, or the device can't have it).
enum HealthRowState { hidden, off, allowed, denied, revoked }

/// Write to Health Connect / Apple Health: the switch, what the OS holds now, and the writes that follow the log.
/// The writes are the log's own changes (Log, an edit, a delete, Undo all end in [LogBook] notifying), diffed against the meals it held
/// before: a meal that is new or changed is written, one that is gone is deleted. The first state it sees is the baseline, so nothing
/// that was logged earlier is ever written (no backfill), and a meal changed while the switch is off or tracking is off is left alone.
class HealthBook extends ChangeNotifier {
  HealthBook({required this.client, required UdineStore store, required LogBook log, required this.titleOf, required this.tracking, required this.enabled, Listenable? prefs, DateTime Function()? now})
      : _store = store,
        _prefs = prefs,
        _log = log,
        _writer = HealthWriter(store, client),
        _now = now ?? DateTime.now {
    _seen = _signatures();
    log.addListener(_onLog);
    prefs?.addListener(_onPrefs);
  }

  final HealthClient client;
  final UdineStore _store;
  final LogBook _log;
  final HealthWriter _writer;
  final String Function(LoggedMeal) titleOf;
  final bool Function() tracking;
  final DateTime Function() _now;

  /// Opens the book on the saved switch and asks the OS where it stands.
  static Future<HealthBook> open({required HealthClient client, required UdineStore store, required LogBook log, required String Function(LoggedMeal) titleOf, required bool Function() tracking, Listenable? prefs, DateTime Function()? now}) async {
    final b = HealthBook(client: client, store: store, log: log, titleOf: titleOf, tracking: tracking, enabled: await store.healthOn(), prefs: prefs, now: now);
    await b.refresh();
    return b;
  }

  /// The switch the user set (saved). Whether it is in force also depends on the OS ([state]).
  bool enabled;
  bool _denied = false;
  HealthAccess? _access;
  late Map<String, String> _seen;
  Future<void> _tail = Future.value();
  final Listenable? _prefs;

  String get name => client.platform == 'ios' ? 'Apple Health' : 'Health Connect';
  String get settingsLabel => client.platform == 'ios' ? 'Open Settings' : 'Open Health Connect';

  HealthRowState get state {
    final a = _access;
    if (a == null || a == HealthAccess.notInstalled || a == HealthAccess.unsupported) return HealthRowState.hidden;
    if (enabled) return a == HealthAccess.granted ? HealthRowState.allowed : HealthRowState.revoked;
    return _denied ? HealthRowState.denied : HealthRowState.off;
  }

  /// Asks the OS where it stands: when You is shown and when the app resumes (a revoke, or a grant, happens in system settings).
  Future<void> refresh() async {
    HealthAccess a;
    try {
      a = await client.access();
    } catch (e) {
      debugPrint('udine: health access unavailable: $e');
      a = HealthAccess.unsupported;
    }
    final changed = a != _access || (a == HealthAccess.granted && _denied);
    if (a == HealthAccess.granted) _denied = false; // allowed in system settings after a refusal: the row is ready to be switched on
    _access = a;
    if (changed) notifyListeners();
    _wasLive = _live;
    reconcile(); // (does nothing unless live) a failed write or delete is tried again here
  }

  /// The row was tapped: allowed turns it off; anything else raises the OS permission sheet at once.
  Future<void> tap() async {
    if (state == HealthRowState.allowed) {
      enabled = false;
      _wasLive = false;
      notifyListeners();
      await _store.setHealthOn(false);
      return;
    }
    bool ok;
    try {
      ok = await client.requestWrite();
    } catch (e) {
      debugPrint('udine: health permission request failed: $e');
      ok = false;
    }
    enabled = ok;
    _denied = !ok;
    if (ok) _access = HealthAccess.granted;
    notifyListeners();
    await _store.setHealthOn(ok);
    _wasLive = _live;
    reconcile();
  }

  Future<void> openSettings() async {
    try {
      await client.openSettings();
    } catch (e) {
      debugPrint('udine: could not open health settings: $e');
    }
  }

  // ---- the writes ----

  /// The log as the last notification left it, meal id to its rows (id and servings): what tells a change from a notification that changed
  /// nothing (the café names arriving, say).
  Map<String, String> _signatures() => {for (final m in _log.meals) m.loggedAt: [for (final i in m.items) '${i.id}:${i.qty}'].join(',')};

  bool get _live => enabled && tracking() && _access == HealthAccess.granted;
  bool _wasLive = false;

  /// Meals changed (or logged) while live whose write has not landed: tried again at every sync until it does.
  final _want = <String>{};

  void _onLog() {
    final prev = _seen, cur = _signatures();
    _seen = cur;
    if (!_live) return; // off means hands off: a change made now is reconciled when the book is live again
    for (final e in cur.entries) {
      if (prev[e.key] != e.value) _want.add(e.key);
    }
    reconcile();
  }

  void _onPrefs() {
    final live = _live, rose = live && !_wasLive;
    _wasLive = live;
    if (rose) reconcile();
  }

  /// Brings Health in line with the log, for what UDine wrote and nothing else (never a backfill): a written meal that is no longer in the log
  /// has its record deleted, one whose content differs from what was written is written again, and meals changed while live whose write did
  /// not land are tried again. Does nothing unless live (row on, tracking on, access granted). Failures change nothing and are tried at the next
  /// sync (a change, a refresh, the app resuming).
  Future<void> reconcile() {
    _tail = _tail.then((_) => _sync()).then<void>((_) {}, onError: (Object e, StackTrace st) => debugPrint('udine: a Health sync failed: $e\n$st'));
    return _tail;
  }

  Future<void> _sync() async {
    if (!_live) return;
    final written = await _store.healthSigs(client.platform), meals = {for (final m in _log.meals) m.loggedAt: m};
    for (final e in written.entries) {
      final m = meals[e.key];
      if (m == null) {
        await _try(() => _writer.delete(e.key));
      } else if (e.value != healthMealOf(m, titleOf(m)).signature(client.platform)) {
        await _try(() => _write(m));
      }
    }
    for (final id in [..._want]) {
      final m = meals[id];
      if (m == null || written.containsKey(id) || await _try(() => _write(m))) _want.remove(id);
    }
  }

  Future<bool> _try(Future<bool> Function() job) async {
    try {
      return await job();
    } catch (e, st) {
      debugPrint('udine: a Health write failed: $e\n$st');
      return false;
    }
  }

  /// Settles once the syncs queued so far have finished.
  Future<void> get idle => _tail;

  /// True when there is nothing more to do for [m]: written, or skipped for good.
  Future<bool> _write(LoggedMeal m) async {
    final h = healthMealOf(m, titleOf(m));
    // Health Connect refuses a record that starts ahead of the clock (a wrong device time, a meal logged for later): skip it and say why
    if (h.start.isAfter(_now())) {
      debugPrint('udine: not writing the ${h.mealId} meal to $name: it starts ahead of the device clock');
      return true;
    }
    final ok = await _writer.write(h);
    if (!ok) debugPrint('udine: $name did not take the ${h.mealId} meal');
    return ok;
  }

  @override
  void dispose() {
    _log.removeListener(_onLog);
    _prefs?.removeListener(_onPrefs);
    super.dispose();
  }
}
