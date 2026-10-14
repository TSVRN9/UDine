import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../data/repository.dart';

/// Today's hours for a page that lists or shows a place (the same stream Halls reads: cached for the day, refreshed behind the saved
/// copy). `retry` is the same call again.
class HoursFeed extends ChangeNotifier {
  HoursFeed(this.repo) {
    load();
  }
  final Repository repo;
  DataState<HoursData> state = Loading<HoursData>();
  StreamSubscription<DataState<HoursData>>? _sub;
  bool _disposed = false;

  /// What the feed holds, once it holds anything (a saved copy counts, offline included).
  HoursData? get data => switch (state) {
        Loaded(:final value) || LoadedOffline(:final value) => value,
        _ => null,
      };

  void load() {
    _sub?.cancel();
    state = Loading<HoursData>();
    notifyListeners();
    _sub = repo.hours(repo.today).listen((s) {
      if (_disposed) return;
      state = s;
      notifyListeners();
    });
  }

  @override
  void dispose() {
    _disposed = true;
    _sub?.cancel();
    super.dispose();
  }
}
