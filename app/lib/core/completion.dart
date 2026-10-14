// Port of shared/src/completion.ts hallCompletion (the storage interface lives with the store).
import 'ranking.dart';
import 'types.dart';

class HallCompletion {
  const HallCompletion({required this.hallTid, required this.loggedDistinct, required this.seenDistinct, required this.pct});
  final int hallTid, loggedDistinct, seenDistinct, pct;
}

/// All 4 halls, in [diningHalls] order. A logged dish only counts if this device also saw it offered.
List<HallCompletion> hallCompletion(Map<int, List<String>> seenByHall, List<LogEntry> logged) {
  final loggedByHall = <int, Set<String>>{};
  for (final d in distinctLoggedDishes(logged)) {
    loggedByHall.putIfAbsent(d.hallTid, () => {}).add(d.dishName);
  }
  return [
    for (final hall in diningHalls)
      () {
        final seen = (seenByHall[hall.tid] ?? const <String>[]).toSet();
        final logs = loggedByHall[hall.tid] ?? const <String>{};
        final l = logs.where(seen.contains).length;
        return HallCompletion(hallTid: hall.tid, loggedDistinct: l, seenDistinct: seen.length, pct: seen.isEmpty ? 0 : (100 * l / seen.length).round());
      }(),
  ];
}
