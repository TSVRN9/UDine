import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/m2/board.dart';
import '../../core/m2/places.dart';
import '../../core/stations.dart' show normalizeStationName;
import '../../core/types.dart';
import '../../data/repository.dart';

/// What a place's list says for one day (CONCEPT R9 §4): nothing yet, the menu, "isn't saved on this phone", or "didn't load".
enum MenuState { loading, ok, offline, fail }

const _mealKey = {
  MealPeriod.breakfast: 'breakfast', MealPeriod.lunch: 'lunch', MealPeriod.dinner: 'dinner',
  MealPeriod.latenight: 'late', MealPeriod.allday: 'all', MealPeriod.grabngo: 'grab',
};

/// A day's dishes as M2 keeps them: meal -> stations, a station being a category (its hall-code suffix dropped, `Latino 1 WOR`), in the feed's own order (the recording's order is
/// the feed's; keyword order would put Grill before Soups).
Map<String, List<Station>> mealsOfItems(List<MenuItem> items) {
  final by = <String, Map<String, List<MenuItem>>>{};
  for (final it in items) {
    ((by[_mealKey[it.mealPeriod]!] ??= {})[normalizeStationName(it.category)] ??= []).add(it);
  }
  return {for (final m in by.entries) m.key: [for (final s in m.value.entries) Station(s.key, s.value)]};
}

/// The events feed as M2 reads it (`build.py`): "X Hours" merged into "X" (one holiday, one card), soonest first. A merged holiday's
/// hours are the dining commons', so it is scoped to all four; the feed carries no scope of its own.
// ponytail: scope is inferred from the "<X> Hours" twin (M2's only scoped event, Indigenous Peoples Day, is one); the feed has no field for it.
List<HoursEvent> hoursEvents(List<DiningEvent> feed) {
  final byTitle = {for (final e in feed) e.title.trim(): e};
  int expires(DiningEvent e) => DateTime.parse(e.expirationDate).millisecondsSinceEpoch ~/ 1000;
  final out = <HoursEvent>[];
  for (final MapEntry(key: t, value: e) in byTitle.entries) {
    if (t.endsWith(' Hours') && byTitle.containsKey(t.substring(0, t.length - 6))) continue;
    final h = byTitle['$t Hours'];
    out.add(HoursEvent(
      title: t, scope: h != null ? halls.join() : '', expires: expires(e), hoursTitle: h?.title.trim(),
      links: [
        if (e.pdfLink.isNotEmpty) [h != null ? 'See the menu' : 'Open the flyer', e.pdfLink],
        if (e.externalLink.isNotEmpty) ['Open the link', e.externalLink],
        if (h != null) ['Holiday hours', h.externalLink.isNotEmpty ? h.externalLink : h.pdfLink],
      ],
    ));
  }
  return out..sort((a, b) => a.expires - b.expires);
}

/// One place's menu on live data: today's hours (cached for the day; a café's menu is keyed by the location id they carry), then the
/// menu of each day asked for, cache first. The body reads [board], the shape `core/m2` works on, and [state] per day.
/// A hall is keyed `W F H B`, a café `c` and its index.
class HallController extends ChangeNotifier {
  HallController(this.repo, this.place) {
    _loadHours();
    _eventsSub = repo.events().listen((s) {
      if (_disposed || s is! Loaded<List<DiningEvent>>) return;
      events = hoursEvents(s.value);
      notifyListeners();
    });
  }
  final Repository repo;
  final String place;

  DataState<HoursData> hours = Loading<HoursData>();
  final menus = <int, DataState<List<MenuItem>>>{};
  final _subs = <int, StreamSubscription<DataState<List<MenuItem>>>>{};
  StreamSubscription<DataState<HoursData>>? _hoursSub;
  StreamSubscription<DataState<List<DiningEvent>>>? _eventsSub;
  List<HoursEvent> events = const [];
  Board? _board;
  bool _disposed = false;
  int _run = 0;
  final _asked = <int>{};

  bool get cafe => isCafe(place);

  late final List<String> isos = [for (var i = 0; i < 15; i++) addDays(repo.today, i)];

  HoursData? get _hoursValue => switch (hours) { Loaded(:final value) || LoadedOffline(:final value) => value, _ => null };

  Roster? get roster => _hoursValue == null ? null : Roster.fromFeed(_hoursValue!.feed);

  /// get_infov2's location id for a café (the foodpro id its menu is fetched by); null for a café that posts no dishes.
  int? get cafeLocationId {
    final feed = _hoursValue?.feed;
    if (feed == null || !cafe) return null;
    final title = straight(cafeTable[int.parse(place.substring(1))].title);
    return feed.retail.where((r) => straight(r.name) == title).firstOrNull?.locationId;
  }

  String get name => cafe ? cafeTable[int.parse(place.substring(1))].name : diningHalls[halls.indexOf(place)].name;

  /// The place's hours, once known.
  DiningHallHours? get placeHours => roster?.hours[place];

  /// The hall's Grab 'N Go window (its own get_infov2 entry, the hall's name and Grab ‘N Go).
  TimeWindow? get grab {
    final feed = _hoursValue?.feed;
    if (feed == null || cafe) return null;
    final title = '$name Grab \'N Go';
    return feed.retail.where((r) => straight(r.name) == title).firstOrNull?.hours;
  }

  int? get _tid => cafe ? cafeLocationId : diningHalls[halls.indexOf(place)].tid;

  void _loadHours() {
    _hoursSub?.cancel();
    final run = ++_run;
    hours = Loading<HoursData>();
    _hoursSub = repo.hours(repo.today).listen((s) {
      if (_disposed || run != _run) return;
      hours = s;
      for (final d in _asked) {
        _ensure(d);
      }
      notifyListeners();
    });
  }

  /// Starts the day's menu if it is not running (a café's waits for its location id).
  void load(int day) {
    _asked.add(day);
    _ensure(day);
  }

  void _ensure(int day) {
    if (_subs.containsKey(day)) return;
    final id = _tid;
    if (id == null) return;
    _subs[day] = repo.menu(id, isos[day]).listen((s) {
      if (_disposed) return;
      menus[day] = s;
      notifyListeners();
    });
  }

  /// Try again: the same calls again.
  void retry(int day) {
    _subs.remove(day)?.cancel();
    menus.remove(day);
    if (hours is Failed || hours is NotSaved) _loadHours();
    load(day);
    notifyListeners();
  }

  /// The network said no at some point: the hours or a menu came from the phone, or could not be had.
  bool get offline => hours is LoadedOffline || hours is NotSaved || menus.values.any((s) => s is LoadedOffline || s is NotSaved);

  MenuState state(int day) {
    final m = menus[day];
    if (m == null) {
      return switch (hours) { Failed() => MenuState.fail, NotSaved() => MenuState.offline, _ => MenuState.loading };
    }
    return switch (m) {
      Loading() || StillLoading() => MenuState.loading,
      Loaded() || LoadedOffline() => MenuState.ok,
      NotSaved() => MenuState.offline,
      Failed() => MenuState.fail,
    };
  }

  List<MenuItem>? items(int day) => switch (menus[day]) { Loaded(:final value) || LoadedOffline(:final value) => value, _ => null };

  /// Whether the place has a dish menu at all: a hall always; a café once its location id is known.
  bool get hasMenu => !cafe || _hoursValue == null || cafeLocationId != null;

  /// What `core/m2` reads: the 15 days from today, with every loaded day's menu in place, the place and its hours.
  Board get board => _board ??= _makeBoard();

  @override
  void notifyListeners() {
    _board = null;
    super.notifyListeners();
  }

  Board _makeBoard() {
    final r = roster;
    return Board(
      clock: repo.now(),
      places: [for (var i = 0; i < halls.length; i++) Place(key: halls[i], name: diningHalls[i].name, area: -1), ...?r?.cafes],
      hours: r?.hours ?? const {},
      grab: {place: ?grab},
      days: {for (var i = 0; i < isos.length; i++) isos[i]: {if (items(i) case final it? when it.isNotEmpty) place: mealsOfItems(it)}},
      events: events,
    );
  }

  @override
  void dispose() {
    _disposed = true;
    _hoursSub?.cancel();
    _eventsSub?.cancel();
    for (final s in _subs.values) {
      s.cancel();
    }
    super.dispose();
  }
}
