// Port of the four helpers the bake-off reads from shared/src (hours.ts, stations.ts).
// Time: the fixture clock is America/New_York. Every function here takes a "wall" DateTime, a UTC-flagged
// DateTime whose fields are the Eastern wall clock, so window maths is plain minutes since local midnight.
import 'types.dart';

/// An instant as Eastern wall time. ponytail: fixed EDT (-04:00), right for the fixture's 15 days (Oct 8-22);
/// DST ends Nov 1 2026, so a live clock needs the tz database then.
DateTime toEastern(DateTime instant) => instant.toUtc().subtract(const Duration(hours: 4));

({int hour, int minute}) _parse(String time) {
  final m = RegExp(r'^(\d{1,2}):(\d{2})\s*(AM|PM)$', caseSensitive: false).firstMatch(time.trim());
  if (m == null) throw FormatException('unparseable get_infov2 time: "$time"');
  return (hour: int.parse(m[1]!) % 12 + (m[3]!.toUpperCase() == 'PM' ? 12 : 0), minute: int.parse(m[2]!));
}

DateTime _atLocal(DateTime now, String time, [int dayOffset = 0]) {
  final t = _parse(time);
  return DateTime.utc(now.year, now.month, now.day + dayOffset, t.hour, t.minute);
}

typedef _Resolved = ({bool contains, DateTime open, DateTime close, bool valid});

/// Half-open [open, close); a window whose close <= open crosses midnight and yesterday's tail is checked too.
_Resolved _resolve(DateTime now, TimeWindow w) {
  late ({int hour, int minute}) o, c;
  try {
    o = _parse(w.openTime);
    c = _parse(w.closeTime);
  } on FormatException {
    return (contains: false, open: now, close: now, valid: false);
  }
  final om = o.hour * 60 + o.minute, cm = c.hour * 60 + c.minute;
  if (om == cm) return (contains: false, open: now, close: now, valid: false);
  final crosses = cm <= om;
  final open = _atLocal(now, w.openTime), close = _atLocal(now, w.closeTime, crosses ? 1 : 0);
  if (!now.isBefore(open) && now.isBefore(close)) return (contains: true, open: open, close: close, valid: true);
  if (crosses) {
    final yo = _atLocal(now, w.openTime, -1), yc = _atLocal(now, w.closeTime);
    if (!now.isBefore(yo) && now.isBefore(yc)) return (contains: true, open: yo, close: yc, valid: true);
  }
  return (contains: false, open: open, close: close, valid: true);
}

const _standard = {
  'breakfast': TimeWindow('7:00 AM', '11:00 AM'),
  'lunch': TimeWindow('11:00 AM', '4:30 PM'),
  'dinner': TimeWindow('4:30 PM', '9:00 PM'),
  'latenight': TimeWindow('9:00 PM', '2:00 AM'), // DEFAULT_ROLLOVER_HOUR = 2
};

String formatTimeOfDay(DateTime d) {
  final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
  return '$h:${d.minute.toString().padLeft(2, '0')} ${d.hour >= 12 ? 'PM' : 'AM'}';
}

/// The hall's own per-meal window, else the standard one clamped to `general`, which must be open at `now`.
TimeWindow? effectiveMealWindow(DiningHallHours hours, String key, DateTime now) {
  final own = hours.window(key);
  if (own != null) return own;
  if (hours.general == null) return null;
  final general = _resolve(now, hours.general!);
  if (!general.contains) return null;
  final standard = _resolve(now, _standard[key]!);
  if (!standard.valid) return null;
  final open = standard.open.isAfter(general.open) ? standard.open : general.open;
  final close = standard.close.isBefore(general.close) ? standard.close : general.close;
  if (!open.isBefore(close)) return null;
  return TimeWindow(formatTimeOfDay(open), formatTimeOfDay(close));
}

typedef OpenStatus = ({bool open, DateTime? closesAt, DateTime? opensAt});

OpenStatus openStatus(DiningHallHours hours, DateTime now) {
  final resolved = [hours.breakfast, hours.lunch, hours.dinner, hours.latenight, hours.general]
      .whereType<TimeWindow>().map((w) => _resolve(now, w)).where((r) => r.valid).toList();
  DateTime? closesAt;
  for (final r in resolved) {
    if (r.contains && (closesAt == null || r.close.isAfter(closesAt))) closesAt = r.close;
  }
  if (closesAt != null) {
    for (var extended = true; extended;) {
      extended = false;
      for (final r in resolved) {
        if (!r.open.isAfter(closesAt!) && r.close.isAfter(closesAt)) {
          closesAt = r.close;
          extended = true;
        }
      }
    }
    return (open: true, closesAt: closesAt, opensAt: null);
  }
  DateTime? opensAt;
  for (final r in resolved) {
    if (r.open.isAfter(now) && (opensAt == null || r.open.isBefore(opensAt))) opensAt = r.open;
  }
  return (open: false, closesAt: null, opensAt: opensAt);
}

const _stationKeywords = [
  'grill', 'display station', 'tandoor', 'stir fry', 'street food', 'noodle', 'pasta', 'pizza', 'sushi', 'latino',
  'mediterranean', 'international', 'vegetarian', 'seasons', 'express', 'gluten free', 'entree', 'omelet', 'vegetable',
  'starch', 'topping', 'salad', 'soup', 'deli', 'bread', 'pastr', 'dessert', 'grab',
];

int _stationRank(String name) {
  final l = name.toLowerCase();
  if (l.startsWith('gf ')) return _stationKeywords.indexOf('gluten free');
  final i = _stationKeywords.indexWhere(l.contains);
  return i == -1 ? _stationKeywords.length : i;
}

/// Known station kinds in food-journey order, the rest alphabetically after them.
/// ponytail: the tie-break is code-unit order, JS's is ICU localeCompare; they differ only for case and punctuation.
List<String> sortStationNames(List<String> names) => [...names]..sort((a, b) {
    final d = _stationRank(a) - _stationRank(b);
    return d != 0 ? d : a.compareTo(b);
  });
