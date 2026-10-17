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
  HealthBook({required this.client, required UdineStore store, required LogBook log, required this.titleOf, required this.tracking, required this.enabled, DateTime Function()? now})
      : _store = store,
        _log = log,
        _writer = HealthWriter(store, client),
        _now = now ?? DateTime.now {
    _seen = _signatures();
    log.addListener(_onLog);
  }

  final HealthClient client;
  final UdineStore _store;
  final LogBook _log;
  final HealthWriter _writer;
  final String Function(LoggedMeal) titleOf;
  final bool Function() tracking;
  final DateTime Function() _now;

  /// Opens the book on the saved switch and asks the OS where it stands.
  static Future<HealthBook> open({required HealthClient client, required UdineStore store, required LogBook log, required String Function(LoggedMeal) titleOf, required bool Function() tracking, DateTime Function()? now}) async {
    final b = HealthBook(client: client, store: store, log: log, titleOf: titleOf, tracking: tracking, enabled: await store.healthOn(), now: now);
    await b.refresh();
    return b;
  }

  /// The switch the user set (saved). Whether it is in force also depends on the OS ([state]).
  bool enabled;
  bool _denied = false;
  HealthAccess? _access;
  late Map<String, String> _seen;
  Future<void> _tail = Future.value();

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
  }

  /// The row was tapped: allowed turns it off; anything else raises the OS permission sheet at once.
  Future<void> tap() async {
    if (state == HealthRowState.allowed) {
      enabled = false;
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
  }

  Future<void> openSettings() async {
    try {
      await client.openSettings();
    } catch (e) {
      debugPrint('udine: could not open health settings: $e');
    }
  }

  // ---- the writes ----

  Map<String, String> _signatures() => {for (final m in _log.meals) m.loggedAt: [for (final i in m.items) '${i.id}:${i.qty}'].join(',')};

  bool get _live => enabled && tracking() && _access == HealthAccess.granted;

  void _onLog() {
    final prev = _seen, cur = _signatures(), meals = {for (final m in _log.meals) m.loggedAt: m};
    _seen = cur;
    if (!_live) return;
    for (final e in cur.entries) {
      if (prev[e.key] != e.value) _run(() => _write(meals[e.key]!));
    }
    for (final id in prev.keys) {
      if (!cur.containsKey(id)) _run(() => _writer.delete(id));
    }
  }

  void _run(Future<Object?> Function() job) {
    _tail = _tail.then((_) => job()).then<void>((_) {}, onError: (Object e, StackTrace st) => debugPrint('udine: a Health write failed: $e\n$st'));
  }

  /// Settles once the writes queued so far have finished.
  Future<void> get idle => _tail;

  Future<bool> _write(LoggedMeal m) async {
    final h = healthMealOf(m, titleOf(m));
    // Health Connect refuses a record that starts ahead of the clock (a wrong device time, a meal logged for later): skip it and say why
    if (h.start.isAfter(_now())) {
      debugPrint('udine: not writing the ${h.mealId} meal to $name: it starts ahead of the device clock');
      return false;
    }
    final ok = await _writer.write(h);
    if (!ok) debugPrint('udine: $name did not take the ${h.mealId} meal');
    return ok;
  }

  @override
  void dispose() {
    _log.removeListener(_onLog);
    super.dispose();
  }
}
