import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/occupancy.dart';
import '../../data/repository.dart';

/// Halls' one load: today's hours (cached for the day, always refreshed behind the saved copy) and, once the live response is in,
/// the busy reads for the four halls. Try again is the same call again.
class HallsController extends ChangeNotifier {
  HallsController(this.repo) {
    load();
  }
  final Repository repo;
  DataState<HoursData> state = Loading<HoursData>();
  Map<String, OccupancyRead> reads = const {};
  StreamSubscription<DataState<HoursData>>? _sub;
  /// The repository said Loading (nothing saved, so the screen waited): what arrives next arrives in place, with a fade.
  bool sawLoading = false;
  int _run = 0;
  bool _disposed = false;

  void load() {
    _sub?.cancel();
    final run = ++_run;
    state = Loading<HoursData>();
    reads = const {};
    sawLoading = false;
    notifyListeners();
    _sub = repo.hours(repo.today).listen((s) async {
      if (_disposed || run != _run) return;
      state = s;
      if (s is Loading<HoursData> || s is StillLoading<HoursData>) sawLoading = true;
      if (s is! Loaded<HoursData> || s.value.busy == null) reads = const {};
      notifyListeners();
      if (s is Loaded<HoursData> && s.value.busy != null) {
        final r = await repo.busyReads(s.value);
        if (_disposed || run != _run) return;
        reads = r;
        notifyListeners();
      }
    });
  }

  @override
  void dispose() {
    _disposed = true;
    _sub?.cancel();
    super.dispose();
  }
}
