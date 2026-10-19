import 'package:flutter/foundation.dart';

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
    if (start) this.start();
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
          if (items != null && items.isNotEmpty) days[iso]!.putIfAbsent(e.key, () => mealsOfItems(items));
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
