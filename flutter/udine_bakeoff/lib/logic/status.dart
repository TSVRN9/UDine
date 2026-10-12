import 'hours.dart';
import 'types.dart';

String _fmt(DateTime d) {
  final m = d.hour * 60 + d.minute;
  if (m >= 1439) return 'midnight';
  if (m == 720) return 'noon';
  final mm = m % 60;
  return '${(d.hour + 11) % 12 + 1}${mm != 0 ? ':${mm.toString().padLeft(2, '0')}' : ''} ${m < 720 ? 'AM' : 'PM'}';
}

/// M2's status(): "Open until 9 PM", "Opens 7 AM", "Closed for today". `now` is Eastern wall time (see hours.dart).
String statusText(DiningHallHours hours, DateTime now) {
  final s = openStatus(hours, now);
  return s.open ? 'Open until ${_fmt(s.closesAt!)}' : s.opensAt != null ? 'Opens ${_fmt(s.opensAt!)}' : 'Closed for today';
}

bool isOpenNow(DiningHallHours hours, DateTime now) => openStatus(hours, now).open;
