import '../../core/hours.dart';
import '../../core/m2/board.dart';
import '../../core/m2/busy.dart';
import '../../core/m2/places.dart';
import '../../core/m2/status.dart';
import '../../core/occupancy.dart';
import '../../core/types.dart' show diningHalls;
import '../../data/repository.dart';

const _weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const _months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/// What the date line adds to the date (CONCEPT R9 §4): nothing, "You're offline", or "Couldn't connect"; `retry` puts Try again under it.
enum NetLine { none, offline, failed }

/// One band or pin: `status` and `lamps` are null while their data has not arrived (or, for lamps, is not live), and the band simply
/// draws less. A café has no meter.
class BandVM {
  const BandVM({required this.key, required this.name, this.status, this.lamps, this.word});
  final String key, name;
  final String? status, word;
  final int? lamps;
  bool get isCafe => key.startsWith('c');
}

/// "N of M open now", or null until the hours are known.
class AreaVM {
  const AreaVM({required this.area, required this.name, this.count});
  final int area;
  final String name;
  final String? count;
}

class HallsVM {
  const HallsVM({required this.date, required this.title, required this.line, required this.retry, required this.hoursKnown, required this.liveKnown, required this.halls, required this.pins, required this.areas});
  final String date, title;
  final NetLine line;
  final bool retry, hoursKnown, liveKnown;
  final List<BandVM> halls, pins;
  final List<AreaVM> areas;
}

/// M2's Halls from what the repository knows (CONCEPT R9 §4): hours are cached for the day, busy is live and never shown stale.
/// Loading and failed hold the rack whole with names and letters only. Pins and area rows read the Charles River filter (`placeOn`,
/// `areasOn`), the one place it lives.
HallsVM buildHalls({
  required DateTime now,
  required DataState<HoursData> state,
  required Map<String, OccupancyRead> reads,
  required List<String> pins,
  required bool charlesRiver,
}) {
  final feed = switch (state) {
    Loaded(:final value) || LoadedOffline(:final value) => value.feed,
    _ => null,
  };
  final live = state is Loaded<HoursData> && state.value.busy != null;
  final roster = feed == null ? Roster.table : Roster.fromFeed(feed);
  final w = easternWall(now);
  final hallBy = {for (final h in feed?.halls ?? const <DiningHallHours>[]) halls[h.hallTid - 1]: h};
  final busyBy = <String, OccupancyRead>{
    if (live)
      for (final MapEntry(:key, :value) in reads.entries) ?hallKeyOfTitle(key): value,
  };

  BandVM hall(String k) {
    final r = busyBy[k], h = hallBy[k];
    return BandVM(
      key: k, name: diningHalls[halls.indexOf(k)].name, status: h == null ? null : statusText(h, now),
      lamps: r?.lamps, word: r == null ? null : busyWord(r.level, low: r.confidence == Confidence.low),
    );
  }

  BandVM pin(Place p) {
    final h = roster.hours[p.key];
    return BandVM(key: p.key, name: p.name, status: feed == null || h == null ? null : statusText(h, now));
  }

  final shown = placesOn(roster.cafes, charlesRiver: charlesRiver);
  return HallsVM(
    date: '${_weekdays[w.weekday - 1]}, ${_months[w.month - 1]} ${w.day}',
    title: mealLabel[clockMeal(now)]!,
    line: switch (state) { LoadedOffline() || NotSaved() => NetLine.offline, Failed() => NetLine.failed, _ => NetLine.none },
    retry: state is Failed || state is NotSaved,
    hoursKnown: feed != null,
    liveKnown: live,
    halls: [for (final k in halls) hall(k)],
    pins: [for (final n in pins) if (roster.pinned(n, charlesRiver: charlesRiver) case final p?) pin(p)],
    areas: [
      for (final a in areasOn(charlesRiver: charlesRiver))
        AreaVM(
          area: a, name: areaNames[a],
          count: feed == null
              ? null
              : () {
                  final ps = shown.where((p) => p.area == a);
                  return '${ps.where((p) => roster.hours[p.key] != null && isOpenNow(roster.hours[p.key]!, now)).length} of ${ps.length} open now';
                }(),
        ),
    ],
  );
}
