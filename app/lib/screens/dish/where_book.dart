import 'package:flutter/foundation.dart';

import '../../core/m2/board.dart';
import '../../core/types.dart' show diningHalls;
import '../../data/repository.dart';
import '../hall/hall_controller.dart' show mealsOfItems;

/// What "where it's served" reads: the board of the place the sheet was opened from, plus every hall's menu for today and tomorrow
/// (the repository's cache, warmed at launch). [board] is null until those are in; a menu that is not saved or did not load simply
/// leaves that hall out, as the answer only ever names places that are known to serve the dish.
// ponytail: halls and the opening place only; the other cafés join when Search loads every place's menu (flutter-port-search).
class WhereBook extends ChangeNotifier {
  WhereBook(this.repo, this.base) {
    _load();
  }
  final Repository repo;
  final Board base;
  Board? board;
  bool _disposed = false;

  Future<void> _load() async {
    final isos = base.days.keys.take(2).toList();
    if (base.hours.isEmpty) return; // no hours yet: no windows to answer with
    final days = {for (final iso in isos) iso: {...?base.days[iso]}};
    await Future.wait([
      for (final iso in isos)
        for (var i = 0; i < diningHalls.length; i++)
          () async {
            final key = halls[i];
            if (days[iso]!.containsKey(key)) return;
            final s = await repo.menu(diningHalls[i].tid, iso).firstWhere((s) => s is! Loading && s is! StillLoading);
            final items = switch (s) { Loaded(:final value) || LoadedOffline(:final value) => value, _ => null };
            if (items != null && items.isNotEmpty) days[iso]![key] = mealsOfItems(items);
          }(),
    ]);
    if (_disposed) return;
    board = Board(clock: base.clock, places: base.places, hours: base.hours, grab: base.grab, days: {...base.days, ...days}, events: base.events);
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
