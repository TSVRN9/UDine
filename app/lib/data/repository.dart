import 'dart:async';
import 'dart:isolate' show Isolate;
import 'dart:convert';

import 'package:flutter/foundation.dart' show debugPrint, kProfileMode, kReleaseMode;
import 'package:sqflite/sqflite.dart';

import '../core/content.dart';
import '../core/date.dart';
import '../core/foodpro.dart';
import '../core/hours.dart';
import '../core/occupancy.dart';
import '../core/types.dart';
import '../core/m2/places.dart' show cafeTable, straight;
import 'pdf_cache.dart';
import 'source.dart';
import 'supabase_source.dart';
import 'states.dart';

export 'states.dart';

/// get_infov2 plus the live headcount triple per location title. [busy] is null unless the response was fetched
/// just now: it is never read from, or written to, the cache.
class HoursData {
  const HoursData(this.feed, this.busy, [this.locationIds = const {}]);
  final DiningHoursFeed feed;
  final Map<String, SensorLevels>? busy;

  /// get_infov2 `location_id` per title (the id `occupancy_typical` is keyed by); filled with [busy], live only.
  final Map<String, int> locationIds;
}

/// One row of public.dishes (shared/src/dishes.ts's DishCatalogEntry).
class DishCatalogEntry {
  const DishCatalogEntry({required this.dishName, required this.nutrition, required this.allergens, required this.dietTags, required this.updatedAt});
  final String dishName, updatedAt;
  final NutritionFacts nutrition;
  final List<String> allergens, dietTags;

  factory DishCatalogEntry.fromRow(Map<String, dynamic> r) => DishCatalogEntry(
    dishName: r['dish_name'] as String,
    nutrition: NutritionFacts.fromJson(r['nutrition'] as Map<String, dynamic>),
    allergens: [for (final a in r['allergens'] as List) a as String],
    dietTags: [for (final a in r['diet_tags'] as List) a as String],
    updatedAt: r['updated_at'] as String,
  );
}

/// A café's menu: foodpro items when it has any, else its standing menu from get_infov2 (cafeMenu.ts's waterfall).
sealed class CafeMenu {
  const CafeMenu();
}

class IntegratedCafeMenu extends CafeMenu {
  const IntegratedCafeMenu(this.items);
  final List<MenuItem> items;
}

class StandingCafeMenu extends CafeMenu {
  const StandingCafeMenu(this.menu);
  final ParsedRetailMenu menu;
}

CafeMenu resolveCafeMenu(List<MenuItem> items, RetailLocationHours loc) => items.isNotEmpty
    ? IntegratedCafeMenu(items)
    : StandingCafeMenu(parseRetailMenuHtml(loc.breakfastMenu ?? loc.lunchMenu ?? loc.dinnerMenu));

const _busyKeys = ['busy', 'business_level', 'notbusy_level', 'moderate_level'];

/// When [date] starts: the 2 AM rollover, local. A copy fetched at or after it is final (RN's isMenuCacheFinal).
DateTime _dayStart(String date) {
  final d = DateTime.parse(date);
  return DateTime(d.year, d.month, d.day, defaultRolloverHour);
}

String _menuKey(int id, String date) => 'menu:v2:$id|$date';
String _hoursKey(String date) => 'hours:v2:$date';

/// YYYY-MM-DD plus [days], via DateTime() so month ends and DST roll correctly.
String addDays(String iso, int days) {
  final d = DateTime.parse(iso);
  final n = DateTime(d.year, d.month, d.day + days);
  return '${n.year.toString().padLeft(4, '0')}-${n.month.toString().padLeft(2, '0')}-${n.day.toString().padLeft(2, '0')}';
}

/// Menus and hours, cache-first. The cache is RN's preferences_kv under new `menu:v2:` / `hours:v2:` keys; RN's own
/// menu_cache:* rows are never touched. Raw responses are stored and re-parsed on read, so parser fixes apply to old
/// entries and fields toJson omits (health, carbon) survive.
class Repository {
  Repository(this.source, this.db, {this.supabase, this.pdfs, DateTime Function()? now, Duration? stillLoadingAfter})
    : now = now ?? DateTime.now, stillLoadingAfter = stillLoadingAfter ?? stillLoadingDelay {
    pdfs?.pool = _pooled; // PDFs take the same slots and honour the same offline window as the menus
  }
  final UmassSource source;
  final SupabaseSource? supabase;

  /// Café menu PDFs on the phone; null where there is nowhere to keep them.
  final PdfCache? pdfs;
  final Database db;
  final DateTime Function() now;
  final Duration stillLoadingAfter;

  /// A saved copy older than this, when the refresh can't reach the network, is reported as LoadedOffline (menuPrefetch.ts's 6h).
  static const menuFresh = Duration(hours: 6);

  /// Every network fetch of `_load` goes through [_pooled]: at most this many in flight at once (a 15-day schedule open is 15 fetches).
  static const maxInFlight = 4;

  /// After a fetch fails Unreachable, later fetches skip the network for this long and resolve from the phone.
  // ponytail: one window for every feed and place, cleared by any success or [retryNetwork]; per-host backoff if a feed can be down while others are up.
  static const offlineWindow = Duration(seconds: 30);

  /// Background work (a prefetch of places nobody has opened) holds at most this many of the [maxInFlight] slots, so a fetch the user just
  /// asked for starts at once, or after one release when other foreground fetches fill the rest.
  static const backgroundSlots = 2;

  int _inFlight = 0, _backgroundInFlight = 0;
  final _waiting = <Completer<void>>[], _waitingBackground = <Completer<void>>[];
  DateTime? _offlineUntil;

  /// "Try again": the next fetch asks the network whatever the last one said.
  void retryNetwork() => _offlineUntil = null;

  /// Runs [fetch] when one of the [maxInFlight] slots is free: a waiting foreground job always goes before a background one, and
  /// a [background] job never holds more than [backgroundSlots]. Inside the offline window it does not run: it throws Unreachable
  /// as the network would, so the caller's offline path (saved copy, NotSaved) answers. Unreachable starts the window; any
  /// answer ends it.
  Future<T> _pooled<T>(Future<T> Function() fetch, {bool background = false}) async {
    if (_inFlight < maxInFlight && (!background || _backgroundInFlight < backgroundSlots)) {
      _inFlight++;
      if (background) _backgroundInFlight++;
    } else {
      final turn = Completer<void>();
      (background ? _waitingBackground : _waiting).add(turn);
      await turn.future; // a finishing fetch hands its slot over (and has counted it)
    }
    try {
      final until = _offlineUntil;
      if (until != null && now().isBefore(until)) throw const _SkippedOffline(); // (does not extend the window)
      final v = await fetch();
      _offlineUntil = null;
      return v;
    } on _SkippedOffline {
      throw const Unreachable('offline window');
    } on Unreachable {
      _offlineUntil = now().add(offlineWindow);
      rethrow;
    } finally {
      _inFlight--;
      if (background) _backgroundInFlight--;
      while (_inFlight < maxInFlight) {
        if (_waiting.isNotEmpty) {
          _inFlight++;
          _waiting.removeAt(0).complete();
        } else if (_waitingBackground.isNotEmpty && _backgroundInFlight < backgroundSlots) {
          _inFlight++;
          _backgroundInFlight++;
          _waitingBackground.removeAt(0).complete();
        } else {
          break;
        }
      }
    }
  }

  String get today => effectiveTodayIso(now(), defaultRolloverHour);

  /// Menu for a hall (tid 1-4) or a café's foodpro location id.
  Stream<DataState<List<MenuItem>>> menu(int locationId, String date, {bool background = false}) => _load(
    background: background,
    key: _menuKey(locationId, date),
    fetch: () => source.menu(locationId, date),
    // a menu parses off the UI isolate, a prefetch's (dozens of place-days at once) and a hall page's alike: a hall's ~28 ms parse (A53) landed
    // between the tap and the card's first frame and was the 50-85 ms hole in the open
    parse: (raw, _) {
      final r = raw is Map<String, dynamic> ? raw : const <String, dynamic>{};
      return parseOffUi ? _parseOffUi(locationId, date, r) : parseMenuResponse(locationId, date, r);
    },
    quietWithin: menuFresh,
    isEmpty: (items) => items.isEmpty,
    isFinal: (items, fetchedAt) => items.isNotEmpty && !fetchedAt.isBefore(_dayStart(date)),
    onFetched: (items) => _fetched[_menuKey(locationId, date)] = items,
  );

  /// Menus fetched in this session by place-day (an empty one included: it is never final on disk, but it is not asked for again).
  final _fetched = <String, List<MenuItem>>{};

  /// A prefetch's parse runs on its own isolate in the profile and release builds. (A debug build, which is what `flutter test` is,
  /// parses where it is: a real isolate's answer never arrives inside a widget test's fake clock.)
  static bool parseOffUi = kProfileMode || kReleaseMode;
  /// How many menus have been sent to that isolate (a test reads it: the isolate's answer is the same as the UI isolate's).
  static int offUiParses = 0;
  /// Every (location id, date) given, once, through the one door Search and the dish sheet share: a place-day this session has had is
  /// not asked for again, a saved final one asks for nothing (both as [menu] does), and every fetch goes through [_pooled] as background work, so at most
  /// [maxInFlight] are in flight (and a fetch the user asks for meanwhile goes first) and, once the network is known to be down, none are asked and what is saved answers. A place-day with
  /// no answer is left out. They start [maxInFlight] at a time, and [stopped] is checked before each wave.
  Future<Map<(int, String), List<MenuItem>>> prefetchMenus(Iterable<(int, String)> days, {bool Function()? stopped}) async {
    final out = <(int, String), List<MenuItem>>{}, todo = days.toList();
    Future<void> one((int, String) d) async {
      final had = _fetched[_menuKey(d.$1, d.$2)];
      if (had != null) {
        out[d] = had;
        return;
      }
      List<MenuItem>? got;
      await for (final s in menu(d.$1, d.$2, background: true)) {
        if (s case Loaded(:final value) || LoadedOffline(:final value)) got = value;
      }
      if (got != null) out[d] = got;
    }

    for (var i = 0; i < todo.length; i += maxInFlight) {
      if (stopped?.call() ?? false) break;
      await Future.wait([for (final d in todo.skip(i).take(maxInFlight)) one(d)]);
    }
    return out;
  }

  Stream<DataState<CafeMenu>> cafeMenu(RetailLocationHours loc, String date) {
    final id = loc.locationId;
    if (id == null) return Stream.value(Loaded(resolveCafeMenu(const [], loc)));
    return menu(id, date).map(
      (s) => switch (s) {
        Loading() => Loading<CafeMenu>(),
        StillLoading() => StillLoading<CafeMenu>(),
        Loaded(:final value) => Loaded(resolveCafeMenu(value, loc)),
        LoadedOffline(:final value) => LoadedOffline(resolveCafeMenu(value, loc)),
        NotSaved() => NotSaved<CafeMenu>(),
        Failed(:final error) => Failed<CafeMenu>(error),
      },
    );
  }

  /// Hours are saved per day, but always re-fetched behind the saved copy: the live response carries busy.
  Stream<DataState<HoursData>> hours(String date) => _load(
    key: _hoursKey(date),
    fetch: source.infoV2,
    strip: (raw) => [
      for (final l in raw as List) {...(l as Map<String, dynamic>)}..removeWhere((k, _) => _busyKeys.contains(k)),
    ],
    parse: (raw, live) {
      final list = [for (final l in raw as List) l as Map<String, dynamic>];
      return HoursData(mapInfoV2(list), live ? _busy(list) : null, live ? _locationIds(list) : const {});
    },
  );

  /// Events are saved for the day like hours (`events:v2:<date>`), so offline Search keeps its Events row; always re-fetched behind the saved copy.
  Stream<DataState<List<DiningEvent>>> events() => _load(key: 'events:v2:$today', fetch: source.events, parse: (raw, _) => parseEvents(raw as Map<String, dynamic>));

  /// Launch: drop entries older than yesterday, then warm today and tomorrow for the four halls, and today's hours and events, and the PDFs of the
  /// [pins]' menus (pinned cafés only: owner, round 11). Per-item failures are swallowed; this never throws.
  Future<void> launch({List<String> pins = const []}) async {
    final t = today;
    await prune(t);
    await Future.wait([
      for (final d in [t, addDays(t, 1)])
        for (final h in diningHalls) menu(h.tid, d).drain<void>(),
      _warmHours(t, pins),
      events().drain<void>(),
    ]);
  }

  Future<void> _warmHours(String date, List<String> pins) async {
    HoursData? last;
    await for (final s in hours(date)) {
      if (s case Loaded(:final value) || LoadedOffline(:final value)) last = value;
    }
    if (last != null) await prefetchPdfs(last.feed, pins);
  }

  /// Saves the PDFs whose menu name is in [names], from today's hours (recorded mode's `saved=pdf:Lunch`: a menu opened before).
  Future<void> savePdfs(Set<String> names) async {
    final cache = pdfs;
    if (cache == null || names.isEmpty) return;
    HoursData? last;
    await for (final s in hours(today)) {
      if (s case Loaded(:final value) || LoadedOffline(:final value)) last = value;
    }
    for (final r in last?.feed.retail ?? const <RetailLocationHours>[]) {
      if (resolveCafeMenu(const [], r) case StandingCafeMenu(menu: RetailMenuPdf(:final links))) {
        for (final l in links) {
          if (names.contains(menuName(l.label))) await cache.fetch(l.url).then<void>((_) {}, onError: (_) {});
        }
      }
    }
  }

  /// Saves today's menu of the cafés named [names], from today's hours (recorded mode's `saved=Green Fields`: a café opened today).
  Future<void> saveCafes(Set<String> names) async {
    if (names.isEmpty) return;
    HoursData? last;
    await for (final s in hours(today)) {
      if (s case Loaded(:final value) || LoadedOffline(:final value)) last = value;
    }
    final byTitle = {for (final r in last?.feed.retail ?? const <RetailLocationHours>[]) straight(r.name): r.locationId};
    for (final e in cafeTable) {
      final id = names.contains(e.name) ? byTitle[straight(e.title)] : null;
      if (id != null) await menu(id, today).drain<void>();
    }
  }

  /// Saves the PDFs of the [pins]' menus and drops saved ones no café lists any more. One failing PDF doesn't stop the rest.
  Future<void> prefetchPdfs(DiningHoursFeed feed, List<String> pins) async {
    final cache = pdfs;
    if (cache == null) return;
    final byTitle = {for (final r in feed.retail) straight(r.name): r};
    List<String> urls(Iterable<RetailLocationHours> cafes) => [
      for (final r in cafes)
        if (resolveCafeMenu(const [], r) case StandingCafeMenu(menu: RetailMenuPdf(:final links))) for (final l in links) l.url,
    ];
    // a pin is M2's name for a café; the feed's title is the table's, or the name itself for a café the table doesn't list yet
    final titles = {for (final e in cafeTable) if (pins.contains(e.name)) straight(e.title), ...pins.map(straight)};
    final pinned = [for (final t in titles) ?byTitle[t]];
    try {
      await cache.prune(urls(feed.retail).toSet());
    } catch (e) {
      if (!kReleaseMode) debugPrint('pdf prune: $e');
    }
    for (final u in urls(pinned)) {
      if (cache.file(u).existsSync()) continue;
      try {
        await cache.fetch(u);
      } catch (e) {
        if (!kReleaseMode) debugPrint('pdf prefetch $u: $e');
      }
    }
  }

  /// Deletes menu:v2:/hours:v2: entries dated before yesterday. Keys end in their YYYY-MM-DD.
  Future<void> prune(String today) => db.delete(
    'preferences_kv',
    where: "(key LIKE 'menu:v2:%' OR key LIKE 'hours:v2:%' OR key LIKE 'events:v2:%') AND substr(key, -10) < ?",
    whereArgs: [addDays(today, -1)],
  );

  Map<String, SensorLevels> _busy(List<Map<String, dynamic>> list) => {
    for (final l in list) l['location_title'] as String: ?parseSensorLevels(l),
  };

  Map<String, int> _locationIds(List<Map<String, dynamic>> list) => {
    for (final l in list)
      if (parseSensorLevels(l) != null && l['location_id'] is int) l['location_title'] as String: l['location_id'] as int,
  };

  static const _dishesKey = 'dishes:v2';

  Future<Map<String, dynamic>?> _kv(String key) async {
    final rows = await db.query('preferences_kv', columns: ['value_json'], where: 'key = ?', whereArgs: [key]);
    if (rows.isEmpty) return null;
    try {
      return jsonDecode(rows.first['value_json']! as String) as Map<String, dynamic>;
    } catch (_) {
      return null; // unreadable entry: treat as unsaved
    }
  }

  Future<void> _putKv(String key, Object value) => db.insert('preferences_kv', {
    'key': key,
    'value_json': jsonEncode({'fetchedAt': now().toUtc().toIso8601String(), 'raw': value}),
  }, conflictAlgorithm: ConflictAlgorithm.replace);

  /// Saved on the same (rollover-adjusted) day as now.
  bool _fetchedToday(Map<String, dynamic> e) => effectiveTodayIso(DateTime.parse(e['fetchedAt'] as String).toLocal(), defaultRolloverHour) == today;

  /// The dish catalog: the saved rows, then (at most once a day) a paged delta from the newest `updated_at` held, merged
  /// by dish_name. Raw rows are saved under `dishes:v2` (RN's dish_catalog:v1 is left alone).
  Stream<DataState<List<DishCatalogEntry>>> dishCatalog() async* {
    final src = supabase!;
    final e = await _kv(_dishesKey);
    final byName = <String, Map<String, dynamic>>{};
    try {
      for (final r in (e?['raw'] as List? ?? const [])) {
        byName[(r as Map<String, dynamic>)['dish_name'] as String] = r;
      }
    } catch (_) {
      byName.clear();
    }
    List<DishCatalogEntry> view() => [for (final r in byName.values) DishCatalogEntry.fromRow(r)];
    final saved = byName.isNotEmpty;
    if (saved) {
      yield Loaded(view());
      if (_fetchedToday(e!)) return;
    } else {
      yield Loading();
    }
    String? newest;
    for (final r in byName.values) {
      final u = r['updated_at'] as String;
      if (newest == null || DateTime.parse(u).isAfter(DateTime.parse(newest))) newest = u;
    }
    try {
      for (var off = 0;; off += dishPageSize) {
        final page = await src.dishPage(off, updatedSince: newest);
        for (final r in page) {
          byName[r['dish_name'] as String] = r;
        }
        if (page.length < dishPageSize) break;
      }
      await _putKv(_dishesKey, byName.values.toList());
      yield Loaded(view());
    } on Unreachable {
      yield saved ? LoadedOffline(view()) : NotSaved();
    } catch (err) {
      if (!saved) yield Failed(err);
    }
  }

  /// `occupancy_typical` for one location and weekday: saved per (location, dow) and good for the rest of the day, an
  /// older copy standing in when the refresh fails. No answer at all is an empty curve (level only), never an error.
  Future<List<OccupancyBucket>> typicalCurve(int locationId, int dow) async {
    final key = 'occupancy:v1:$locationId|$dow';
    final e = await _kv(key);
    List<OccupancyBucket>? parse(Object? raw) {
      try {
        return [for (final b in raw as List) OccupancyBucket.fromJson(b as Map<String, dynamic>)];
      } catch (_) {
        return null;
      }
    }

    final saved = e == null ? null : parse(e['raw']);
    if (saved != null && _fetchedToday(e!)) return saved;
    try {
      final raw = await supabase!.occupancyTypical(locationId, dow);
      final fresh = parse(raw);
      if (fresh != null) {
        await _putKv(key, raw);
        return fresh;
      }
    } catch (_) {}
    return saved ?? const [];
  }

  /// The last readings busyReads computed, per location title: what a page opened with no card guesses its busy block from.
  final lastBusy = <String, OccupancyRead>{};

  /// Live busy x typical curve per location title. Absent entirely without a live reading (offline, no sensor): the live
  /// reading is never read from the cache, only the curve is.
  Future<Map<String, OccupancyRead>> busyReads(HoursData h) async {
    final live = h.busy;
    if (live == null) return const {};
    final at = now();
    final dow = occupancyDow(at);
    final out = <String, OccupancyRead>{};
    await Future.wait([
      for (final MapEntry(:key, :value) in live.entries)
        () async {
          final id = h.locationIds[key];
          final curve = id == null || supabase == null ? const <OccupancyBucket>[] : await typicalCurve(id, dow);
          // a hall open past midnight also reads the next weekday's early buckets for its clearing time
          final tid = diningHalls.where((d) => key.startsWith(d.name) && key.contains('Commons')).firstOrNull?.tid;
          final hh = h.feed.halls.where((x) => x.hallTid == tid).firstOrNull;
          final next = curve.isNotEmpty && id != null && hh != null && opensPastMidnight(hh) ? await typicalCurve(id, (dow + 1) % 7) : const <OccupancyBucket>[];
          final r = occupancyRead(typical: curve, tomorrow: next, live: value, now: at);
          if (r != null) out[key] = r;
        }(),
    ]);
    lastBusy.addAll(out);
    return out;
  }

  final _loggedCorrupt = <String>{};

  Stream<DataState<T>> _load<T>({
    String? key,
    required Future<Object?> Function() fetch,
    Object? Function(Object? raw)? strip,
    required FutureOr<T> Function(Object? raw, bool live) parse,
    bool Function(T value)? isEmpty,
    bool Function(T value, DateTime fetchedAt)? isFinal,
    Duration quietWithin = Duration.zero,
    void Function(T value)? onFetched,
    bool background = false,
  }) {
    final c = StreamController<DataState<T>>();
    () async {
      Timer? slow;
      try {
        // A saved copy is usable only if non-empty (RN: an empty copy is never rendered, never final).
        T? saved;
        var savedAge = Duration.zero;
        if (key != null) {
          final rows = await db.query('preferences_kv', columns: ['value_json'], where: 'key = ?', whereArgs: [key]);
          if (rows.isNotEmpty) {
            try {
              final e = jsonDecode(rows.first['value_json']! as String) as Map<String, dynamic>;
              final value = await parse(e['raw'], false);
              final fetchedAt = DateTime.parse(e['fetchedAt'] as String);
              if (isEmpty == null || !isEmpty(value)) {
                saved = value;
                savedAge = now().difference(fetchedAt);
                c.add(Loaded(value));
                if (isFinal != null && isFinal(value, fetchedAt)) {
                  onFetched?.call(value); // a final copy is as good as a fetch: the next ask is answered from memory
                  return;
                }
              }
            } catch (e) {
              saved = null; // unreadable entry: treat as unsaved
              if (_loggedCorrupt.add(key) && !kReleaseMode) {
                debugPrint('corrupt cache row $key: $e');
              }
            }
          }
        }
        if (saved == null) {
          c.add(Loading());
          slow = Timer(stillLoadingAfter, () => c.add(StillLoading()));
        }
        try {
          final raw = await _pooled(fetch, background: background);
          final value = await parse(raw, true);
          onFetched?.call(value);
          slow?.cancel();
          if (saved != null && isEmpty != null && isEmpty(value)) {
            return; // a later empty answer is the glitch, never news: keep the render and the saved copy
          }
          c.add(Loaded(value));
          if (key != null) {
            await db.insert('preferences_kv', {
              'key': key,
              'value_json': jsonEncode({'fetchedAt': now().toUtc().toIso8601String(), 'raw': strip == null ? raw : strip(raw)}),
            }, conflictAlgorithm: ConflictAlgorithm.replace);
          }
        } on Unreachable {
          slow?.cancel();
          if (saved == null) {
            c.add(NotSaved());
          } else if (savedAge >= quietWithin) {
            c.add(LoadedOffline(saved));
          }
        } catch (e) {
          slow?.cancel();
          if (saved == null) {
            c.add(Failed(e)); // a saved copy is already on screen
          }
        }
      } finally {
        slow?.cancel();
        await c.close();
      }
    }();
    return c.stream;
  }
}

class _SkippedOffline implements Exception {
  const _SkippedOffline();
}

// (top level, so the closure sent to the isolate captures no repository)
Future<List<MenuItem>> _parseOffUi(int locationId, String date, Map<String, dynamic> raw) {
  Repository.offUiParses++;
  return Isolate.run(() => parseMenuResponse(locationId, date, raw));
}
