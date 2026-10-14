import 'dart:async';
import 'dart:convert';

import 'package:sqflite/sqflite.dart';

import '../core/content.dart';
import '../core/date.dart';
import '../core/foodpro.dart';
import '../core/hours.dart';
import '../core/types.dart';
import 'source.dart';
import 'states.dart';

export 'states.dart';

/// get_infov2 plus the live headcount triple per location title. [busy] is null unless the response was fetched
/// just now: it is never read from, or written to, the cache.
class HoursData {
  const HoursData(this.feed, this.busy);
  final DiningHoursFeed feed;
  final Map<String, SensorLevels>? busy;
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
  Repository(this.source, this.db, {DateTime Function()? now, this.stillLoadingAfter = const Duration(milliseconds: 400)})
    : now = now ?? DateTime.now;
  final UmassSource source;
  final Database db;
  final DateTime Function() now;
  final Duration stillLoadingAfter;

  /// A saved menu this young is served without asking the network (menuPrefetch.ts's 6h).
  static const menuFresh = Duration(hours: 6);

  String get today => effectiveTodayIso(now(), defaultRolloverHour);

  /// Menu for a hall (tid 1-4) or a café's foodpro location id.
  Stream<DataState<List<MenuItem>>> menu(int locationId, String date) => _load(
    key: _menuKey(locationId, date),
    fetch: () => source.menu(locationId, date),
    parse: (raw, _) => parseMenuResponse(locationId, date, raw is Map<String, dynamic> ? raw : const {}),
    fresh: (age) => age < menuFresh,
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
      return HoursData(mapInfoV2(list), live ? _busy(list) : null);
    },
    fresh: (_) => false,
  );

  /// Events aren't saved: nothing in the brief asks for them offline.
  Stream<DataState<List<DiningEvent>>> events() =>
      _load(fetch: source.events, parse: (raw, _) => parseEvents(raw as Map<String, dynamic>), fresh: (_) => false);

  /// Launch: drop entries older than yesterday, then warm today and tomorrow for the four halls, and today's hours.
  /// Per-item failures are swallowed; this never throws.
  Future<void> launch() async {
    final t = today;
    await prune(t);
    await Future.wait([
      for (final d in [t, addDays(t, 1)])
        for (final h in diningHalls) menu(h.tid, d).drain<void>(),
      hours(t).drain<void>(),
    ]);
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

  Stream<DataState<T>> _load<T>({
    String? key,
    required Future<Object?> Function() fetch,
    Object? Function(Object? raw)? strip,
    required T Function(Object? raw, bool live) parse,
    required bool Function(Duration age) fresh,
  }) {
    final c = StreamController<DataState<T>>();
    () async {
      Timer? slow;
      try {
        T? saved;
        if (key != null) {
          final rows = await db.query('preferences_kv', columns: ['value_json'], where: 'key = ?', whereArgs: [key]);
          if (rows.isNotEmpty) {
            try {
              final e = jsonDecode(rows.first['value_json']! as String) as Map<String, dynamic>;
              saved = parse(e['raw'], false);
              c.add(Loaded(saved as T));
              if (fresh(now().difference(DateTime.parse(e['fetchedAt'] as String)))) {
                return;
              }
            } catch (_) {
              saved = null; // unreadable entry: treat as unsaved
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
          c.add(Loaded(value));
          if (key != null) {
            await db.insert('preferences_kv', {
              'key': key,
              'value_json': jsonEncode({'fetchedAt': now().toUtc().toIso8601String(), 'raw': strip == null ? raw : strip(raw)}),
            }, conflictAlgorithm: ConflictAlgorithm.replace);
          }
        } on Unreachable {
          slow?.cancel();
          c.add(saved != null ? LoadedOffline(saved) : NotSaved());
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
