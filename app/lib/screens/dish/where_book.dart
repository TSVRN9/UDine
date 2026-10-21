import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart' show SchedulerBinding;

import '../../core/m2/board.dart';
import '../../core/types.dart' show diningHalls;
import '../../data/repository.dart';
import '../hall/hall_controller.dart' show mealsOfItems;

/// What "where it's served" reads: the board of the place the sheet was opened from, plus every hall's menu for today and tomorrow
/// (the repository's cache, warmed at launch). [board] is null until those are in; a menu that is not saved or did not load simply
/// leaves that hall out, as the answer only ever names places that are known to serve the dish.
/// The halls come first (their cache is warm), then every café that posts a menu, all through the repository's one prefetch (a place-day
/// anyone has had is not asked for again; at most four requests at once; offline, only what is saved): [board] is replaced once for each, and [complete]
/// says the cafés are in.
class WhereBook extends ChangeNotifier {
  /// `start: false` waits for [start]: the dish sheet starts it once it has slid in, so the prefetch's parsing is not on the UI isolate
  /// while the sheet moves.
  WhereBook(this.repo, this.base, [this.cafeIds = const {}, bool start = true]) {
    // warmed at launch (WhereWarm): the whole answer is in before the first frame, nothing left to load
    board = WhereWarm.of(repo).boardOn(base);
    if (board != null) {
      complete = started = true;
    } else if (start) {
      this.start();
    }
  }
  final Repository repo;
  final Board base;
  /// café place key -> foodpro location id
  final Map<String, int> cafeIds;
  Board? board;
  bool complete = false;
  bool _disposed = false, started = false;

  /// [settled] resolves once the sheet showing the answer is at rest; each phase's loading (the fetches, decoding, saving, all on
  /// the UI isolate) waits for it, since a publish moves the sheet (the where line changes its resting height) and loading while it
  /// moves holds its frames back. Without it, everything runs at once (Search).
  void start({Future<void> Function()? settled}) {
    if (started || _disposed) return;
    started = true;
    _load(settled);
  }

  Future<void> _load(Future<void> Function()? settled) async {
    final isos = base.days.keys.take(2).toList();
    if (base.hours.isEmpty) return; // no hours yet: no windows to answer with
    final days = {for (final iso in isos) iso: {...?base.days[iso]}};

    Future<void> fetch(Map<String, int> ids) async {
      final want = [for (final iso in isos) for (final e in ids.entries) if (!days[iso]!.containsKey(e.key)) (e.value, iso)];
      final got = await repo.prefetchMenus(want, stopped: () => _disposed);
      for (final iso in isos) {
        for (final e in ids.entries) {
          final items = got[(e.value, iso)];
          if (items != null && items.isNotEmpty) days[iso]!.putIfAbsent(e.key, () => mealsOfItems(items, hall: halls.contains(e.key)));
        }
      }
    }

    void publish() {
      if (_disposed) return;
      board = Board(clock: base.clock, places: base.places, hours: base.hours, grab: base.grab, days: {...base.days, ...days}, events: base.events);
      notifyListeners();
    }

    await settled?.call();
    await fetch({for (var i = 0; i < diningHalls.length; i++) halls[i]: diningHalls[i].tid});
    publish();
    await settled?.call();
    await fetch({for (final e in cafeIds.entries) if (base.hours.containsKey(e.key)) e.key: e.value});
    complete = true;
    publish();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}

/// Every hall's and café's menus for today and tomorrow, grouped as the board keeps them, loaded once in the background after launch so a dish
/// sheet's "where" answer is computed in its first build. One per repository. Each wave of fetches waits for the app to be idle (no animation
/// running), so none of it lands in a transition; the parse itself is the repository's (off the UI isolate in profile and release builds).
class WhereWarm {
  WhereWarm._(this.repo);
  static final _of = Expando<WhereWarm>();
  static WhereWarm of(Repository repo) => _of[repo] ??= WhereWarm._(repo);

  final Repository repo;
  /// Halls home starts the warm-up only where this is set (main): a test that opens Halls would otherwise end with a fetch in flight.
  static bool auto = false;
  /// iso day -> place key -> meal -> stations; complete (halls and every café asked for) only once [done]
  final days = <String, Map<String, Map<String, List<Station>>>>{};
  bool done = false, _started = false;
  List<String> _isos = const [];

  /// No ticker is running: no route, sheet or fade is moving.
  // ponytail: a looping animation anywhere holds this off; a transition-only signal if one ever does.
  static Future<void> idle() async {
    while (SchedulerBinding.instance.transientCallbackCount > 0) {
      await SchedulerBinding.instance.endOfFrame;
    }
  }

  /// Once; [gate] runs before every wave of at most four place-days.
  Future<void> start(Map<String, int> cafeIds, {Future<void> Function() gate = idle}) async {
    if (_started) return;
    _started = true;
    final today = repo.today, isos = _isos = [today, addDays(today, 1)];
    final places = <(String, int)>[for (var i = 0; i < diningHalls.length; i++) (halls[i], diningHalls[i].tid), for (final e in cafeIds.entries) (e.key, e.value)];
    final want = [for (final p in places) for (final iso in isos) (p.$1, p.$2, iso)];
    for (var i = 0; i < want.length; i += Repository.maxInFlight) {
      final wave = want.skip(i).take(Repository.maxInFlight).toList();
      await gate();
      final got = await repo.prefetchMenus([for (final w in wave) (w.$2, w.$3)]);
      for (final (place, id, iso) in wave) {
        final items = got[(id, iso)];
        if (items != null && items.isNotEmpty) (days[iso] ??= {})[place] = mealsOfItems(items, hall: halls.contains(place));
      }
    }
    done = true;
  }

  /// [base] with every warmed place-day laid under its own, or null while this is not done or [base]'s days are not the ones warmed.
  Board? boardOn(Board base) {
    final isos = base.days.keys.take(2).toList();
    if (!done || base.hours.isEmpty || isos.any((iso) => !_isos.contains(iso))) return null;
    return Board(
      clock: base.clock, places: base.places, hours: base.hours, grab: base.grab, events: base.events,
      days: {
        ...base.days,
        for (final iso in isos)
          iso: {
            for (final e in (days[iso] ?? const {}).entries) if (halls.contains(e.key) || base.hours.containsKey(e.key)) e.key: e.value,
            ...?base.days[iso],
          },
      },
    );
  }
}
