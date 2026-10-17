// What M2 says about an event's date (`evWhen`). The feed publishes only an expiry.

DateTime _utcDay(String iso) => DateTime.parse('${iso}T00:00:00Z');

/// "Mon, Oct 12" within a week of [todayIso], "Through Oct 31" within two months, nothing for an ongoing promotion (M2 `evWhen`).
String eventWhen(String todayIso, int expires) {
  final d = DateTime.fromMillisecondsSinceEpoch(expires * 1000, isUtc: true), days = (expires * 1000 - _utcDay(todayIso).millisecondsSinceEpoch) / 864e5;
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (days <= 7) return '${wd[d.weekday - 1]}, ${mo[d.month - 1]} ${d.day}';
  return days <= 60 ? 'Through ${mo[d.month - 1]} ${d.day}' : '';
}
