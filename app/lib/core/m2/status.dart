import '../hours.dart';
import '../types.dart';

String _fmt(DateTime instant) {
  final d = easternWall(instant), m = d.hour * 60 + d.minute;
  if (m >= 1439) return 'midnight';
  if (m == 720) return 'noon';
  final mm = m % 60;
  return '${(d.hour + 11) % 12 + 1}${mm != 0 ? ':${mm.toString().padLeft(2, '0')}' : ''} ${m < 720 ? 'AM' : 'PM'}';
}

/// "Open until 9 PM", "Closed · opens 7 AM", "Closed · opens 7 AM tomorrow" (the hours repeat daily, so tomorrow's first open is the one
/// found from its midnight on), "Closed today" when nothing opens by then either. [short] is M2's "Opens 7 AM" / "Closed for today", for the
/// list rows that already colour open from closed.
String statusText(DiningHallHours hours, DateTime now, {bool short = false}) => switch (openStatus(hours, now)) {
      Open(:final closesAt) => 'Open until ${_fmt(closesAt)}',
      Closed(:final opensAt?) => short ? 'Opens ${_fmt(opensAt)}' : 'Closed · opens ${_fmt(opensAt)}',
      Closed() when short => 'Closed for today',
      Closed() => switch (openStatus(hours, _tomorrow(now))) {
          Closed(:final opensAt?) => 'Closed · opens ${_fmt(opensAt)} tomorrow',
          _ => 'Closed today',
        },
    };

DateTime _tomorrow(DateTime now) {
  final w = easternWall(now);
  return easternInstant(DateTime.utc(w.year, w.month, w.day + 1));
}

bool isOpenNow(DiningHallHours hours, DateTime now) => openStatus(hours, now) is Open;
