import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/date.dart';
import '../core/m2/board.dart';
import '../core/m2/log.dart';
import '../core/macros.dart';
import '../core/m2/plate.dart';
import '../core/store/store.dart' show Undo;
import '../core/types.dart' show LogEntry;
import '../theme/tokens.dart';
import '../ui/motion.dart' show msOf;

/// What Log wrote and where the plate was: the receipt, and the way back.
/// What went wrong the last time the user asked for a write: Log (the plate is kept) or Undo (the rows and the receipt are kept).
enum PlateFailure { log, undo }

class Receipt {
  const Receipt._(
    this.plate,
    this.index,
    this.place,
    this.ids,
    this.dayCal,
    this._undo,
  );
  final Plate plate;

  /// where the plate sat in the list, and so where Undo puts it back
  final int index;
  final String? place;
  final List<String> ids;

  /// what the day holds once these rows are in (the receipt's "Today")
  final num dayCal;
  final Undo _undo;
}

/// The plates being built, held in memory until Log (as RN's): nothing here is saved, so a restart is an empty plate. Log writes the
/// plate to the device store in one transaction and Undo takes exactly those rows back out; both are single-flight, and a write that
/// fails leaves the plate as it was.
class PlateModel extends ChangeNotifier {
  /// `write` and `readDay` are the device store's `addEntries` and `entriesForDay` (null when a newer build owns the database: nothing
  /// is written and the bar never shows); `now` is the app's clock.
  PlateModel({this.write, this.readDay, DateTime Function()? now}) : _now = now; // ignore: prefer_initializing_formals
  final Future<Undo> Function(List<LogEntry> rows)? write;
  final Future<List<LogEntry>> Function(String day)? readDay;
  final DateTime Function()? _now;
  PlateState _s = emptyPlates;
  PlateState get state => _s;

  Receipt? _receipt;
  Timer? _timer;
  bool _busy = false, _failed = false;
  PlateFailure? _failure;
  String? _failedPlace;

  /// The receipt the bar shows after Log, until it times out, Undo runs or a dish is added.
  Receipt? get receipt => _receipt;

  /// The last Log or Undo could not write; cleared by the next add, Log or Undo.
  bool get failed => _failed;

  /// What failed, shown in the bar until it times out, is retried, or a dish is added.
  PlateFailure? get failure => _failure;

  /// Try again: the same Log (at the place it was asked at) or the same Undo.
  Future<bool> retry() => switch (_failure) {
        PlateFailure.log => log(place: _failedPlace),
        PlateFailure.undo => undo(),
        null => Future.value(false),
      };

  /// Whether Log can run: a store to write to and something on the front plate.
  bool get canLog => write != null && _s.front < _s.plates.length;

  DateTime get _clock => (_now ?? DateTime.now)();

  void _drop() {
    _timer?.cancel();
    _timer = null;
    _receipt = null;
  }

  void _arm() {
    _timer?.cancel();
    _timer = Timer(msOf(M2Motion.receiptD), () {
      _receipt = null;
      _failure = null;
      notifyListeners();
    });
  }

  /// Writes the front plate at `place` (null: the plate's only place, or none for an all-custom plate). Returns whether it did.
  Future<bool> log({String? place}) async {
    final w = write, rd = readDay;
    if (w == null || rd == null || _busy || !canLog) return false;
    _busy = true; // (before the first await: a second tap sees it)
    _failed = false;
    _failure = null;
    _timer?.cancel();
    final plate = _s.plates[_s.front],
        at = place ?? plateHalls(plate)?.firstOrNull;
    try {
      final now = _clock, loggedAt = nowLocalIso(now), day = effectiveTodayIso(now, defaultRolloverHour);
      final rows = logEntries(plate, place: at, loggedAt: loggedAt);
      // (M2 logPlate: the day's total is read before the rows go in, so nothing that can fail runs after they commit; a Log whose rows
      // are in always ends in a receipt and an Undo)
      final before = computeDailyTotals(day, await rd(day)).calories;
      final undo = await w(rows);
      final dayCal = before + rows.fold<num>(0, (a, e) => a + e.nutrition.calories * e.servings);
      // ponytail: the plate is taken out by id, as it was when Log was tapped; an item added to it during the write is neither logged
      // nor brought back by Undo (a few ms wide; snapshot-compare the plate and keep the difference if it ever shows)
      final index = _s.plates.indexWhere((p) => p.id == plate.id);
      if (index >= 0) {
        final plates = [..._s.plates]..removeAt(index);
        _s = PlateState(plates, _s.front.clamp(0, plates.isEmpty ? 0 : plates.length - 1), _s.nextId);
      }
      _receipt = Receipt._(
        plate,
        index < 0 ? _s.plates.length : index,
        at,
        [for (final r in rows) r.id],
        dayCal,
        undo,
      );
      _arm();
      return true;
    } catch (e, st) {
      debugPrint('udine: Log failed, the plate is kept: $e\n$st');
      _failed = true;
      _failure = PlateFailure.log;
      _failedPlace = place;
      _arm();
      return false;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  /// Takes the receipt's rows out and puts its plate back where it was. Nothing happens once the receipt has gone.
  Future<bool> undo() async {
    final r = _receipt;
    if (r == null || _busy) return false;
    _busy = true;
    _timer?.cancel();
    _failed = false;
    _failure = null;
    try {
      await r._undo();
      // (a dish added while this ran ended the receipt, but the rows are out: the plate goes back either way)
      final at = r.index.clamp(0, _s.plates.length);
      _s = PlateState([..._s.plates]..insert(at, r.plate), at, _s.nextId);
      _drop();
      return true;
    } catch (e, st) {
      debugPrint('udine: Undo failed, the rows stay: $e\n$st');
      _failed = true;
      _failure = PlateFailure.undo;
      if (identical(_receipt, r)) _arm();
      return false;
    } finally {
      _busy = false;
      notifyListeners();
    }
  }

  /// M2 `clear`: the front plate goes, with no Undo.
  void clear() {
    if (_s.front >= _s.plates.length) return;
    final plates = [..._s.plates]..removeAt(_s.front);
    _s = PlateState(plates, 0, _s.nextId);
    notifyListeners();
  }

  void add(String meal, String name, Map<String, MenuItem> refs) {
    _failure = null;
    _drop(); // (M2 addDish: S.lastLog = null. Undo could otherwise put back a plate beside one it could now have joined)
    _failed = false;
    _s = addDish(_s, meal, name, refs);
    notifyListeners();
  }

  void step(int plateId, String key, int dir) {
    _s = stepItem(_s, plateId, key, dir);
    notifyListeners();
  }

  void setFront(int i) {
    if (i == _s.front || i < 0 || i >= _s.plates.length) return;
    _s = PlateState(_s.plates, i, _s.nextId);
    notifyListeners();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}
