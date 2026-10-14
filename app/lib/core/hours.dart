// get_infov2 hours and open status. Port of shared/src/hours.ts, checked against shared/vectors/hours.json.
//
// Times are Eastern wall-clock. The TS reads them in the runtime's zone and assumes it is Eastern; here the zone is
// explicit, with the US rule (EDT from the second Sunday of March 02:00 to the first Sunday of November 02:00,
// in force since 2007), so core needs no tz package.
// ponytail: hard-coded US post-2007 DST rule. A rule change (e.g. DST abolished) or a pre-2007 instant needs tz data.
import 'date.dart';
import 'types.dart';

// ---- Eastern time ------------------------------------------------------------------------------------------------

int _nthSunday(int year, int month, int n) => 1 + (7 - DateTime.utc(year, month, 1).weekday % 7) % 7 + 7 * (n - 1);

bool _isEdt(DateTime utc) =>
    !utc.isBefore(DateTime.utc(utc.year, 3, _nthSunday(utc.year, 3, 2), 7)) && utc.isBefore(DateTime.utc(utc.year, 11, _nthSunday(utc.year, 11, 1), 6));

/// Eastern wall-clock fields of an instant, as a UTC-flagged DateTime ("wall time").
DateTime easternWall(DateTime instant) {
  final u = instant.toUtc();
  return _shiftHours(u, _isEdt(u) ? -4 : -5);
}

DateTime _shiftHours(DateTime utc, int hours) => utc.add(Duration(hours: hours));

/// The instant of an Eastern wall time, resolved as JS's local Date does: the first occurrence of a repeated hour, and
/// a skipped hour shifts forward.
DateTime easternInstant(DateTime wall) {
  final edt = _shiftHours(wall, 4);
  return _isEdt(edt) ? edt : _shiftHours(wall, 5);
}

// ---- get_infov2 mapping --------------------------------------------------------------------------------------------

final _timePattern = RegExp(r'^\d{1,2}:\d{2}\s*(AM|PM)$', caseSensitive: false);

/// null if either side is absent, "Closed" or not "H:MM AM/PM" ("Midnight" degrades to no window).
TimeWindow? _windowOrNull(String? open, String? close) {
  if (open == null || open.isEmpty || close == null || close.isEmpty) return null;
  if (!_timePattern.hasMatch(open.trim()) || !_timePattern.hasMatch(close.trim())) return null;
  return TimeWindow(openTime: open, closeTime: close);
}

String? _strOrNull(Object? s) => s is String && s.isNotEmpty ? s : null;

/// First line of the `address` HTML blob, "<p>121 Southwest Cir<br/>Amherst, MA 01003</p>" -> "121 Southwest Cir".
String? parseStreetAddress(String? html) {
  if (html == null || html.isEmpty) return null;
  final first = html.replaceAll(RegExp(r'<br\s*/?>', caseSensitive: false), '\n').replaceAll(RegExp(r'<[^>]+>'), '').split('\n').first.trim();
  return first.isEmpty ? null : first;
}

final _mapAddress = RegExp(r'^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$');

/// "lat,long" as published, or null if malformed.
String? parseMapAddress(String? raw) {
  if (raw == null || raw.isEmpty) return null;
  final t = raw.trim();
  return _mapAddress.hasMatch(t) ? t : null;
}

// Known TS heuristic, matched on purpose: a commons title starts with the hall name and contains "Commons".
bool _matchesHall(String title, String hallName) => title.startsWith(hallName) && title.contains('Commons');

DiningHoursFeed mapInfoV2(List<Map<String, dynamic>> data) {
  final halls = <DiningHallHours>[];
  final retail = <RetailLocationHours>[];
  for (final loc in data) {
    final title = loc['location_title'] as String;
    final general = _windowOrNull(loc['opening_hours'] as String?, loc['closing_hours'] as String?);
    TimeWindow? meal(String k) => _windowOrNull(loc['${k}_open_time'] as String?, loc['${k}_close_time'] as String?);
    final hall = diningHalls.where((h) => _matchesHall(title, h.name)).firstOrNull;
    if (hall != null) {
      halls.add(DiningHallHours(
        hallTid: hall.tid,
        breakfast: meal('breakfast'),
        lunch: meal('lunch'),
        dinner: meal('dinner'),
        general: general,
        address: parseStreetAddress(loc['address'] as String?),
        mapAddress: parseMapAddress(loc['map_address'] as String?),
      ));
    } else {
      retail.add(RetailLocationHours(
        name: title,
        hours: general,
        locationId: loc['location_id'] is int ? loc['location_id'] as int : null,
        breakfastMenu: _strOrNull(loc['breakfast_menu']),
        lunchMenu: _strOrNull(loc['lunch_menu']),
        dinnerMenu: _strOrNull(loc['dinner_menu']),
        description: _strOrNull(loc['short_description_v2']),
        address: _strOrNull(loc['address']),
        mapAddress: _strOrNull(loc['map_address']),
        acceptedPayment: _strOrNull(loc['accepted_payment']),
      ));
    }
  }
  return DiningHoursFeed(halls: halls, retail: retail);
}

/// get_infov2's headcount sensor: `business_level` is people now, the other two are that location's thresholds
/// (moderate_level and above = busy, notbusy_level and above = moderate). `999999` thresholds mean no sensor.
class SensorLevels {
  const SensorLevels({required this.count, required this.notBusy, required this.moderate});
  final int count, notBusy, moderate;
}

/// null when the location has no sensor (999999 thresholds) or the entry carries no thresholds (older captures).
SensorLevels? parseSensorLevels(Map<String, dynamic> loc) {
  final (count, notBusy, moderate) = (loc['business_level'], loc['notbusy_level'], loc['moderate_level']);
  if (count is! int || notBusy is! int || moderate is! int) return null;
  if (notBusy == _noSensor || moderate == _noSensor) return null;
  return SensorLevels(count: count, notBusy: notBusy, moderate: moderate);
}

const _noSensor = 999999;

// ---- open status ---------------------------------------------------------------------------------------------------

(int hour, int minute)? _timeOfDay(String time) {
  final m = RegExp(r'^(\d{1,2}):(\d{2})\s*(AM|PM)$', caseSensitive: false).firstMatch(time.trim());
  if (m == null) return null;
  return (int.parse(m[1]!) % 12 + (m[3]!.toUpperCase() == 'PM' ? 12 : 0), int.parse(m[2]!));
}

/// [time] on [nowWall]'s Eastern calendar day (+ [dayOffset]) as an instant.
DateTime _at(DateTime nowWall, (int, int) time, [int dayOffset = 0]) =>
    easternInstant(DateTime.utc(nowWall.year, nowWall.month, nowWall.day + dayOffset, time.$1, time.$2));

typedef _Resolved = ({bool contains, DateTime open, DateTime close, bool valid});

/// Half-open [open, close). close <= open crosses midnight, so yesterday's occurrence is checked too. Unparseable or
/// zero-length windows are invalid (closed).
_Resolved _resolve(DateTime now, TimeWindow w) {
  final o = _timeOfDay(w.openTime), c = _timeOfDay(w.closeTime);
  if (o == null || c == null || o == c) return (contains: false, open: now, close: now, valid: false);
  final wall = easternWall(now);
  final crosses = c.$1 * 60 + c.$2 <= o.$1 * 60 + o.$2;
  final open = _at(wall, o), close = _at(wall, c, crosses ? 1 : 0);
  if (!now.isBefore(open) && now.isBefore(close)) return (contains: true, open: open, close: close, valid: true);
  if (crosses) {
    final yOpen = _at(wall, o, -1), yClose = _at(wall, c);
    if (!now.isBefore(yOpen) && now.isBefore(yClose)) return (contains: true, open: yOpen, close: yClose, valid: true);
  }
  return (contains: false, open: open, close: close, valid: true);
}

// UMass's own app labels meals on this clock when a hall publishes no per-meal times.
final _standard = {
  HallMealPeriod.breakfast: const TimeWindow(openTime: '7:00 AM', closeTime: '11:00 AM'),
  HallMealPeriod.lunch: const TimeWindow(openTime: '11:00 AM', closeTime: '4:30 PM'),
  HallMealPeriod.dinner: const TimeWindow(openTime: '4:30 PM', closeTime: '9:00 PM'),
  HallMealPeriod.latenight: const TimeWindow(openTime: '9:00 PM', closeTime: '$defaultRolloverHour:00 AM'),
};

/// "H:MM AM/PM" of an instant's Eastern wall time.
String formatTimeOfDay(DateTime instant) {
  final w = easternWall(instant);
  final h = w.hour % 12 == 0 ? 12 : w.hour % 12;
  return '$h:${w.minute.toString().padLeft(2, '0')} ${w.hour >= 12 ? 'PM' : 'AM'}';
}

/// The window governing [key] now: the hall's own, else the standard one clamped to `general` (only while general
/// confirms the hall is open).
TimeWindow? effectiveMealWindow(DiningHallHours hours, HallMealPeriod key, DateTime now) {
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
  return TimeWindow(openTime: formatTimeOfDay(open), closeTime: formatTimeOfDay(close));
}

MealStatus currentMealPeriod(DiningHallHours hours, DateTime now) {
  for (final p in HallMealPeriod.values) {
    final w = effectiveMealWindow(hours, p, now);
    if (w != null && _resolve(now, w).contains) return MealStatus.values.byName(p.name);
  }
  return MealStatus.closed;
}

/// Whether the doors are open: any published window (including `general`) covering [now]. closesAt is the latest
/// close of the covering windows, chained through contiguous or overlapping ones.
OpenStatus openStatus(DiningHallHours hours, DateTime now) {
  final resolved = [
    for (final w in [hours.breakfast, hours.lunch, hours.dinner, hours.latenight, hours.general])
      if (w != null) _resolve(now, w),
  ].where((r) => r.valid).toList();

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
    return Open(closesAt!);
  }
  DateTime? opensAt;
  for (final r in resolved) {
    if (r.open.isAfter(now) && (opensAt == null || r.open.isBefore(opensAt))) opensAt = r.open;
  }
  return Closed(opensAt);
}

String _iso(DateTime d) => d.toUtc().toIso8601String();

/// The vectors' `status` output: {mealPeriod, openStatus, effective}.
Map<String, dynamic> statusJson(DiningHallHours hours, DateTime now) {
  final s = openStatus(hours, now);
  return {
    'mealPeriod': currentMealPeriod(hours, now).name,
    'openStatus': switch (s) {
      Open(:final closesAt) => {'open': true, 'closesAt': _iso(closesAt)},
      Closed(:final opensAt) => {'open': false, 'opensAt': opensAt == null ? null : _iso(opensAt)},
    },
    'effective': {for (final p in HallMealPeriod.values) p.name: effectiveMealWindow(hours, p, now)?.toJson()},
  };
}
