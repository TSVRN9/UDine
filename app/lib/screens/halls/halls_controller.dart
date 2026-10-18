import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/m2/board.dart';
import '../../core/occupancy.dart';
import '../../core/types.dart' show diningHalls;
import '../hall/hall_controller.dart' show grabsOf, mealsOfItems;
import '../../data/repository.dart';

/// Halls' one load: today's hours (cached for the day, always refreshed behind the saved copy) and, once the live response is in,
/// the busy reads for the four halls. Try again is the same call again.
class HallsController extends ChangeNotifier {
  /// [menus] false: the caller reads the halls' menus itself (Search's own book), so they are not asked for twice.
  HallsController(this.repo, {this.menus = true}) {
    load();
  }
  final Repository repo;
  final bool menus;
  DataState<HoursData> state = Loading<HoursData>();
  Map<String, OccupancyRead> reads = const {};
  /// The four halls' menus for the board's day with their hours, for the stars; null until they are in (no star meanwhile).
  Board? board;
  StreamSubscription<DataState<HoursData>>? _sub;
  /// The repository said Loading (nothing saved, so the screen waited): what arrives next arrives in place, with a fade.
  bool sawLoading = false;
  int _run = 0;
  bool _disposed = false;

  /// Try again: the network is asked at once, whatever the last answer said.
  void retry() {
    repo.retryNetwork();
    load();
  }

  void load() {
    _sub?.cancel();
    final run = ++_run;
    state = Loading<HoursData>();
    reads = const {};
    board = null;
    sawLoading = false;
    notifyListeners();
    _sub = repo.hours(repo.today).listen((s) async {
      if (_disposed || run != _run) return;
      state = s;
      if (s is Loading<HoursData> || s is StillLoading<HoursData>) sawLoading = true;
      if (s is! Loaded<HoursData> || s.value.busy == null) reads = const {};
      notifyListeners();
      if (menus) {
        if (s case Loaded<HoursData>(:final value) || LoadedOffline<HoursData>(:final value)) unawaited(_menus(value, run));
      }
      if (s is Loaded<HoursData> && s.value.busy != null) {
        final r = await repo.busyReads(s.value);
        if (_disposed || run != _run) return;
        reads = r;
        notifyListeners();
      }
    });
  }

  Future<void> _menus(HoursData h, int run) async {
    final day = repo.today, got = await repo.prefetchMenus([for (final d in diningHalls) (d.tid, day)], stopped: () => _disposed || run != _run);
    if (_disposed || run != _run) return;
    board = Board(
      clock: repo.now(), places: [for (var i = 0; i < halls.length; i++) Place(key: halls[i], name: diningHalls[i].name, area: -1)],
      hours: {for (final x in h.feed.halls) halls[x.hallTid - 1]: x}, grab: grabsOf(h.feed),
      days: {day: {for (var i = 0; i < halls.length; i++) if (got[(diningHalls[i].tid, day)] case final it? when it.isNotEmpty) halls[i]: mealsOfItems(it)}}, events: const [],
    );
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _sub?.cancel();
    super.dispose();
  }
}
