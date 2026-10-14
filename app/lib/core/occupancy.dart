import 'hours.dart';
import 'm2/busy.dart' show lamps;

/// One `occupancy_typical(p_location_id, p_dow)` row: a 15-minute Eastern wall-clock bucket, medians over the trailing six
/// weeks of that weekday. `bucket_start` arrives as a Postgres `time` ("12:15:00").
class OccupancyBucket {
  const OccupancyBucket({required this.minuteOfDay, required this.medianHeadcount, required this.medianLevel, required this.samples});
  final int minuteOfDay, medianHeadcount, medianLevel, samples;

  factory OccupancyBucket.fromJson(Map<String, dynamic> j) {
    final p = (j['bucket_start'] as String).split(':');
    return OccupancyBucket(
      minuteOfDay: int.parse(p[0]) * 60 + int.parse(p[1]),
      medianHeadcount: j['median_headcount'] as int,
      medianLevel: j['median_level'] as int,
      samples: j['samples'] as int,
    );
  }
}

enum VsUsual { busier, usual, quieter }

enum Confidence { good, low }

/// Postgres `extract(dow)` for the Eastern day of [now] (Sunday = 0): the `p_dow` to fetch.
int occupancyDow(DateTime now) => easternWall(now).weekday % 7;

/// Six trailing weeks give at most six samples per bucket per weekday. A median over fewer than four means two or more
/// weeks (a break, a closed day, a cron outage) are missing, so the "usual" is one or two odd days; below that, hedge.
const minSamples = 4;

/// "Busier/quieter than usual" needs both a relative band (a quarter off the usual) and an absolute one (ten people): a
/// quarter of a handful is sensor noise, and overnight medians sit near zero where any ratio explodes.
const _vsBand = 0.25;
const _vsMinPeople = 10;

class OccupancyRead {
  const OccupancyRead({required this.level, required this.vsUsual, required this.usuallyClearsAt, required this.confidence, required this.lamps});

  /// Lit lamps of the band meter and the header board, 1-5 (owner, 2026-10-14): the live headcount as a share of the day's typical
  /// peak, capped at the peak. No usable curve (no rows, every bucket under [minSamples], a peak of 0) falls back to the level:
  /// 1, 3 or 5. Confidence never changes it.
  final int lamps;

  /// 0 not busy, 1 moderate, 2 busy, for this hour (the thresholds are hourly).
  final int level;

  /// null when the curve has no bucket for now.
  final VsUsual? vsUsual;

  /// Start of the first later bucket today whose median level is below [level]; null if none.
  final DateTime? usuallyClearsAt;
  final Confidence confidence;

  /// `Busy.calmerAt` ("HH:MM", Eastern): the clearing time, left out rather than guessed when confidence is low.
  String? get calmerAt {
    final t = usuallyClearsAt;
    if (t == null || confidence == Confidence.low) return null;
    final w = easternWall(t);
    return '${w.hour.toString().padLeft(2, '0')}:${w.minute.toString().padLeft(2, '0')}';
  }
}

/// [typical] is the curve for [occupancyDow] of [now]; [live] null (no sensor, offline) gives no read. Buckets are matched
/// on Eastern wall time, so DST days line up with the RPC's own wall-clock grouping.
OccupancyRead? occupancyRead({required List<OccupancyBucket> typical, required SensorLevels? live, required DateTime now}) {
  if (live == null) return null;
  final level = live.count >= live.moderate ? 2 : live.count >= live.notBusy ? 1 : 0;
  final wall = easternWall(now);
  final nowMin = wall.hour * 60 + wall.minute ~/ 15 * 15;

  OccupancyBucket? cur;
  OccupancyBucket? clears;
  for (final b in typical) {
    if (b.minuteOfDay == nowMin) cur = b;
    if (b.minuteOfDay > nowMin && b.medianLevel < level && (clears == null || b.minuteOfDay < clears.minuteOfDay)) clears = b;
  }

  VsUsual? vs;
  if (cur != null) {
    final diff = live.count - cur.medianHeadcount;
    vs = diff.abs() < _vsMinPeople || diff.abs() < cur.medianHeadcount * _vsBand
        ? VsUsual.usual
        : diff > 0 ? VsUsual.busier : VsUsual.quieter;
  }
  final sure = cur != null && cur.samples >= minSamples && (clears == null || clears.samples >= minSamples);
  final peak = typical.fold(0, (m, b) => b.medianHeadcount > m ? b.medianHeadcount : m);
  final curveUsable = peak > 0 && typical.any((b) => b.samples >= minSamples);
  return OccupancyRead(
    level: level,
    lamps: curveUsable ? lamps(live.count * 100 / peak) : const [1, 3, 5][level],
    vsUsual: vs,
    usuallyClearsAt: clears == null ? null : easternInstant(DateTime.utc(wall.year, wall.month, wall.day, 0, clears.minuteOfDay)),
    confidence: sure ? Confidence.good : Confidence.low,
  );
}
