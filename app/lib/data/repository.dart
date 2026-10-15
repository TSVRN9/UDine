import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart' show debugPrint, kReleaseMode;
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
  Repository(this.source, this.db, {this.supabase, this.pdfs, DateTime Function()? now, this.stillLoadingAfter = const Duration(milliseconds: 400)})
    : now = now ?? DateTime.now;
  final UmassSource source;
  final SupabaseSource? supabase;

  /// Café menu PDFs on the phone; null where there is nowhere to keep them.
  final PdfCache? pdfs;
  final Database db;
  final DateTime Function() now;
  final Duration stillLoadingAfter;

  /// A saved copy older than this, when the refresh can't reach the network, is reported as LoadedOffline (menuPrefetch.ts's 6h).
  static const menuFresh = Duration(hours: 6);

  String get today => effectiveTodayIso(now(), defaultRolloverHour);

  /// Menu for a hall (tid 1-4) or a café's foodpro location id.
  Stream<DataState<List<MenuItem>>> menu(int locationId, String date) => _load(
    key: _menuKey(locationId, date),
    fetch: () => source.menu(locationId, date),
    parse: (raw, _) => parseMenuResponse(locationId, date, raw is Map<String, dynamic> ? raw : const {}),
    quietWithin: menuFresh,
    isEmpty: (items) => items.isEmpty,
    isFinal: (items, fetchedAt) => items.isNotEmpty && !fetchedAt.isBefore(_dayStart(date)),
  );

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

  /// Events aren't saved: nothing in the brief asks for them offline.
  Stream<DataState<List<DiningEvent>>> events() => _load(fetch: source.events, parse: (raw, _) => parseEvents(raw as Map<String, dynamic>));

  /// Launch: drop entries older than yesterday, then warm today and tomorrow for the four halls, and today's hours, and the PDFs of the
  /// [pins]' menus (pinned cafés only: owner, round 11). Per-item failures are swallowed; this never throws.
  Future<void> launch({List<String> pins = const []}) async {
    final t = today;
    await prune(t);
    await Future.wait([
      for (final d in [t, addDays(t, 1)])
        for (final h in diningHalls) menu(h.tid, d).drain<void>(),
      _warmHours(t, pins),
    ]);
  }

  Future<void> _warmHours(String date, List<String> pins) async {
    HoursData? last;
    await for (final s in hours(date)) {
      if (s case Loaded(:final value) || LoadedOffline(:final value)) last = value;
    }
    if (last != null) await prefetchPdfs(last.feed, pins);
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
    where: "(key LIKE 'menu:v2:%' OR key LIKE 'hours:v2:%') AND substr(key, -10) < ?",
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
    return out;
  }

  final _loggedCorrupt = <String>{};

  Stream<DataState<T>> _load<T>({
    String? key,
    required Future<Object?> Function() fetch,
    Object? Function(Object? raw)? strip,
    required T Function(Object? raw, bool live) parse,
    bool Function(T value)? isEmpty,
    bool Function(T value, DateTime fetchedAt)? isFinal,
    Duration quietWithin = Duration.zero,
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
              final value = parse(e['raw'], false);
              final fetchedAt = DateTime.parse(e['fetchedAt'] as String);
              if (isEmpty == null || !isEmpty(value)) {
                saved = value;
                savedAge = now().difference(fetchedAt);
                c.add(Loaded(value));
                if (isFinal != null && isFinal(value, fetchedAt)) {
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
          final raw = await fetch();
          final value = parse(raw, true);
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
