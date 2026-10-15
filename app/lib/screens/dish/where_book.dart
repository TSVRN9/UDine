import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/m2/board.dart';
import '../../core/types.dart' show diningHalls;
import '../../data/repository.dart';
import '../hall/hall_controller.dart' show mealsOfItems;

/// What "where it's served" reads: the board of the place the sheet was opened from, plus every hall's menu for today and tomorrow
/// (the repository's cache, warmed at launch). [board] is null until those are in; a menu that is not saved or did not load simply
/// leaves that hall out, as the answer only ever names places that are known to serve the dish.
/// The halls come first (their cache is warm), then every café that posts a menu: [board] is replaced once for each, and [complete]
/// says the cafés are in.
class WhereBook extends ChangeNotifier {
  WhereBook(this.repo, this.base, [this.cafeIds = const {}]) {
    _load();
  }
  final Repository repo;
  final Board base;
  /// café place key -> foodpro location id
  final Map<String, int> cafeIds;
  Board? board;
  bool complete = false;
  bool _disposed = false;
  final _subs = <StreamSubscription<void>>[];

  Future<void> _load() async {
    final isos = base.days.keys.take(2).toList();
    if (base.hours.isEmpty) return; // no hours yet: no windows to answer with
    final days = {for (final iso in isos) iso: {...?base.days[iso]}};
    Future<void> one(String key, int tid, String iso) async {
      if (days[iso]!.containsKey(key)) return;
      final done = Completer<DataState<List<MenuItem>>>();
      final sub = repo.menu(tid, iso).listen((s) => s is Loading || s is StillLoading || done.isCompleted ? null : done.complete(s));
      _subs.add(sub);
      final s = await done.future;
      await sub.cancel();
      final items = switch (s) { Loaded(:final value) || LoadedOffline(:final value) => value, _ => null };
      if (items != null && items.isNotEmpty) days[iso]![key] = mealsOfItems(items);
    }

    void publish() {
      if (_disposed) return;
      board = Board(clock: base.clock, places: base.places, hours: base.hours, grab: base.grab, days: {...base.days, ...days}, events: base.events);
      notifyListeners();
    }

    await Future.wait([for (final iso in isos) for (var i = 0; i < diningHalls.length; i++) one(halls[i], diningHalls[i].tid, iso)]);
    publish();
    await Future.wait([for (final iso in isos) for (final e in cafeIds.entries) if (base.hours.containsKey(e.key)) one(e.key, e.value, iso)]);
    complete = true;
    publish();
  }

  @override
  void dispose() {
    _disposed = true;
    for (final s in _subs) {
      s.cancel(); // a load still running stops with the sheet
    }
    super.dispose();
  }
}
