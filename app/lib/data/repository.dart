import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart' show debugPrint, kReleaseMode;
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
  Repository(this.source, this.db, {DateTime Function()? now, this.stillLoadingAfter = const Duration(milliseconds: 400)})
    : now = now ?? DateTime.now;
  final UmassSource source;
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
      return HoursData(mapInfoV2(list), live ? _busy(list) : null);
    },
  );

  /// Events aren't saved: nothing in the brief asks for them offline.
  Stream<DataState<List<DiningEvent>>> events() => _load(fetch: source.events, parse: (raw, _) => parseEvents(raw as Map<String, dynamic>));

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
