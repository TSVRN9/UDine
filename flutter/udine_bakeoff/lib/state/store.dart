import 'dart:async';
import 'dart:convert';
import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../logic/fixture.dart';
import '../logic/menu_view.dart';
import '../logic/plate.dart';

/// You's "Show on dishes" toggles: a dish row draws a score only when its toggle is on (and the dish has that score).
class Toggles {
  final bool health, carbon;
  const Toggles({this.health = false, this.carbon = false});
  @override
  bool operator ==(Object other) => other is Toggles && other.health == health && other.carbon == carbon;
  @override
  int get hashCode => Object.hash(health, carbon);
}

/// A logged item is a snapshot of what was eaten, so the log stays true whatever the feed does later (M2 `snapItem`).
class LogItem {
  final String name;
  final double qty, cal, p, c, f;
  const LogItem(this.name, this.qty, this.cal, this.p, this.c, this.f);
  Map<String, dynamic> toJson() => {'name': name, 'qty': qty, 'cal': cal, 'p': p, 'c': c, 'f': f};
}

class LogEntry {
  final int id;
  final String meal;
  final String? place;
  final List<LogItem> items;
  const LogEntry(this.id, this.meal, this.place, this.items);
  Map<String, dynamic> toJson() => {'id': id, 'meal': meal, 'place': place, 'items': [for (final i in items) i.toJson()]};
}

/// The receipt: what Undo needs to put the plate back where it was.
class Receipt {
  final LogEntry entry;
  final Plate plate;
  final int idx;
  const Receipt(this.entry, this.plate, this.idx);
}

const _key = 'bakeoff.store.v1';

/// One store for the whole slice (RN `state/store.ts`). Device-only by design: the log is health data (CLAUDE.md, data
/// residency); nothing in this file touches the network. Persisted: prefs, show, newton and the log; never the plate in progress,
/// the receipt or the plates set aside while Charles River is off (M2 keeps only favorites and diet).
class Store extends ChangeNotifier {
  Store(this.fx);
  final Fixture fx;

  PlateState plates = emptyPlates;
  Prefs prefs = noPrefs;
  Toggles show = const Toggles();
  bool newton = false;
  List<LogEntry> log = const [];
  Receipt? last;
  /// plates of Charles River Campus set aside while its toggle is off
  List<Plate> off = const [];

  Future<void> _writing = Future.value();
  Future<void>? _hydrating;

  void _set({PlateState? plates, Prefs? prefs, Toggles? show, bool? newton, List<LogEntry>? log, Object? last = _keep, List<Plate>? off, bool persist = false}) {
    this.plates = plates ?? this.plates;
    this.prefs = prefs ?? this.prefs;
    this.show = show ?? this.show;
    this.newton = newton ?? this.newton;
    this.log = log ?? this.log;
    if (!identical(last, _keep)) this.last = last as Receipt?;
    this.off = off ?? this.off;
    notifyListeners();
    if (persist) _save();
  }

  static const _keep = Object();

  void _save() {
    final json = jsonEncode({'prefs': {'veg': prefs.veg, 'plant': prefs.plant, 'halal': prefs.halal, 'avoid': prefs.avoid}, 'show': {'health': show.health, 'carbon': show.carbon}, 'newton': newton, 'log': [for (final e in log) e.toJson()]});
    _writing = _writing.then((_) async => (await SharedPreferences.getInstance()).setString(_key, json)).catchError((_) => false);
  }

  /// Resolves once every write so far has landed (tests, and a screen that must not race its own reload).
  Future<void> flush() => _writing;

  /// Read what was kept, field by field: a value that is not the right shape is left at its default. What the device kept lands
  /// without touching the plate, so an add made before it finished is not lost.
  Future<void> hydrate() => _hydrating ??= _read();

  Future<void> _read() async {
    Object? raw;
    try {
      raw = jsonDecode((await SharedPreferences.getInstance()).getString(_key) ?? 'null');
    } catch (_) {
      return;
    }
    if (raw is! Map) return;
    final p = raw['prefs'], s = raw['show'], l = raw['log'];
    _set(
      prefs: p is Map && p['veg'] is bool && p['plant'] is bool && p['halal'] is bool && p['avoid'] is List && (p['avoid'] as List).every((a) => a is String)
          ? Prefs(veg: p['veg'], plant: p['plant'], halal: p['halal'], avoid: (p['avoid'] as List).cast<String>())
          : null,
      show: s is Map && s['health'] is bool && s['carbon'] is bool ? Toggles(health: s['health'], carbon: s['carbon']) : null,
      newton: raw['newton'] is bool ? raw['newton'] : null,
      log: l is List ? _entries(l) : null,
    );
  }

  static List<LogEntry>? _entries(List l) {
    bool num_(Object? v) => v is num && v.isFinite;
    final out = <LogEntry>[];
    for (final e in l) {
      if (e is! Map || !num_(e['id']) || e['meal'] is! String || !(e['place'] == null || e['place'] is String) || e['items'] is! List) return null;
      final items = <LogItem>[];
      for (final i in e['items'] as List) {
        if (i is! Map || i['name'] is! String || !['qty', 'cal', 'p', 'c', 'f'].every((k) => num_(i[k]))) return null;
        items.add(LogItem(i['name'], (i['qty'] as num).toDouble(), (i['cal'] as num).toDouble(), (i['p'] as num).toDouble(), (i['c'] as num).toDouble(), (i['f'] as num).toDouble()));
      }
      out.add(LogEntry((e['id'] as num).toInt(), e['meal'], e['place'], items));
    }
    return out;
  }

  // ---- actions
  static int _clamp(int front, int n) => n <= 0 ? 0 : front.clamp(0, n - 1);

  /// Add one of a dish to the plate it joins (or a new one): M2 `addDish`. A receipt still up goes away with it.
  void add(String meal, String name, Map<String, Dish> refs, [Macro? custom]) => _set(plates: addDish(plates, meal, name, refs, custom), last: null);

  void step(int plateId, String key, int dir) => _set(plates: stepItem(plates, plateId, key, dir));

  void setFront(int i) {
    if (plates.plates.isEmpty) return;
    final front = _clamp(i, plates.plates.length);
    if (front != plates.front) _set(plates: PlateState(plates.plates, front, plates.nextId));
  }

  void clearPlate() {
    if (plates.front >= plates.plates.length) return;
    final rest = [for (var i = 0; i < plates.plates.length; i++) if (i != plates.front) plates.plates[i]];
    _set(plates: PlateState(rest, _clamp(plates.front, rest.length), plates.nextId));
  }

  /// M2 `logPlate`: the front plate leaves the plate and becomes a meal in the log, logged at `hall` (a plate several halls serve
  /// takes the first).
  void logPlate([String? hall]) {
    if (plates.front >= plates.plates.length) return;
    final plate = plates.plates[plates.front], at = hall ?? plateHalls(plate)?.first;
    final entry = LogEntry(
      log.fold(0, (m, e) => e.id > m ? e.id : m) + 1, plate.meal, at,
      [for (final it in plate.items) () { final m = macroOf(it, at); return LogItem(it.name, it.qty, m.cal.toDouble(), m.p.toDouble(), m.c.toDouble(), m.f.toDouble()); }()],
    );
    final front = plates.front, rest = [for (var i = 0; i < plates.plates.length; i++) if (i != front) plates.plates[i]];
    _set(plates: PlateState(rest, _clamp(front, rest.length), plates.nextId), log: [...log, entry], last: Receipt(entry, plate, front), persist: true);
  }

  /// M2 `undoLog`: the meal leaves the log and its plate goes back to the index it had.
  void undo() {
    final l = last;
    if (l == null) return;
    final ps = [...plates.plates];
    ps.insert(l.idx.clamp(0, ps.length), l.plate);
    _set(plates: PlateState(ps, l.idx.clamp(0, ps.length - 1), plates.nextId), log: [for (final e in log) if (e.id != l.entry.id) e], last: null, persist: true);
  }

  void dropReceipt() {
    if (last != null) _set(last: null);
  }

  void setPrefs({bool? veg, bool? plant, bool? halal, List<String>? avoid}) =>
      _set(prefs: prefs.copyWith(veg: veg, plant: plant, halal: halal, avoid: avoid), persist: true);

  void setShow({bool? health, bool? carbon}) => _set(show: Toggles(health: health ?? show.health, carbon: carbon ?? show.carbon), persist: true);

  bool _inNewton(Plate p) => plateHalls(p)?.any((k) => fx.places.firstWhere((x) => x.key == k).area == 4) ?? false;

  /// The Charles River toggle. Off sets that campus's plates aside, on brings them back as they were (M2 `setNewton`). Nothing is
  /// deleted.
  void setNewton(bool on) {
    if (on == newton) return;
    if (on) {
      _set(newton: true, off: const [], plates: PlateState([...plates.plates, ...off], plates.front, plates.nextId), persist: true);
    } else {
      final rest = plates.plates.where((p) => !_inNewton(p)).toList();
      _set(newton: false, off: [...off, ...plates.plates.where(_inNewton)], plates: PlateState(rest, _clamp(plates.front, rest.length), plates.nextId), persist: true);
    }
  }

  /// Seeds (screenshots and goldens) set several fields at once and clear the receipt.
  void seed({PlateState? plates, Prefs? prefs, Toggles? show, bool? newton, List<LogEntry>? log}) => _set(plates: plates, prefs: prefs, show: show, newton: newton, log: log, last: null);

  /// The calories logged today (the clock is fixed on one day): what the receipt and You print.
  double get loggedCal => log.fold(0.0, (a, e) => a + e.items.fold(0.0, (b, i) => b + i.cal * i.qty));
}

/// The store for a subtree.
class StoreScope extends InheritedNotifier<Store> {
  const StoreScope({super.key, required Store store, required super.child}) : super(notifier: store);
  static Store of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<StoreScope>()!.notifier!;
  /// Reads without subscribing (event handlers).
  static Store read(BuildContext context) => context.getInheritedWidgetOfExactType<StoreScope>()!.notifier!;
}
