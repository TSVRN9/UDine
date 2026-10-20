// Port of shared/src/date.ts. Local-calendar logic on the device clock; hours.dart is the Eastern-pinned one.

/// Late Night runs past midnight, so "today" flips here instead of at 00:00.
const defaultRolloverHour = 2;

/// Minutes into the board's day: before the rollover the clock still counts as the evening before (00:40 is 24:40).
int boardMinuteOf(int hour, int minute) => (hour < defaultRolloverHour ? hour + 24 : hour) * 60 + minute;

final _isoDate = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$');

String _pad(int n, [int width = 2]) => n.toString().padLeft(width, '0');

/// Clamps a `?date=` value to a menu date: absent/garbage/impossible/past fall back to [todayIso].
String resolveMenuDate(String? dateParam, String todayIso) {
  if (dateParam == null || dateParam.isEmpty) return todayIso;
  final m = _isoDate.firstMatch(dateParam);
  if (m == null) return todayIso;
  final (y, mo, d) = (int.parse(m[1]!), int.parse(m[2]!), int.parse(m[3]!));
  final built = DateTime(y, mo, d);
  // An out-of-range component rolls the date forward, so it won't read back the same.
  if (built.year != y || built.month != mo || built.day != d) return todayIso;
  return dateParam.compareTo(todayIso) <= 0 ? todayIso : dateParam;
}

/// "2026-08-20T23:15:42.123": local components, no offset, so a bare-string reader files it under the local day.
String nowLocalIso([DateTime? d]) {
  final t = (d ?? DateTime.now()).toLocal();
  return '${_pad(t.year, 4)}-${_pad(t.month)}-${_pad(t.day)}T${_pad(t.hour)}:${_pad(t.minute)}:${_pad(t.second)}.${_pad(t.millisecond, 3)}';
}

/// The ISO date [now] counts as "today" once the day boundary is [rolloverHour] local.
String effectiveTodayIso(DateTime now, int rolloverHour) {
  final t = now.toLocal();
  // DateTime() normalizes day 0 across month/year and DST, unlike subtracting 24h.
  final e = t.hour < rolloverHour ? DateTime(t.year, t.month, t.day - 1) : t;
  return '${_pad(e.year, 4)}-${_pad(e.month)}-${_pad(e.day)}';
}

/// Which effective day a nowLocalIso()-stamped timestamp belongs to.
String effectiveDayOf(String isoTimestamp, int rolloverHour) => effectiveTodayIso(DateTime.parse(isoTimestamp), rolloverHour);
