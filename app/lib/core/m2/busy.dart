/// The occupancy read M2's header and rows draw. occupancy.dart derives level, vsUsual and calmerAt (OccupancyRead.calmerAt, null when
/// confidence is low); pct, label, trend and outlook stay screen-side, so this stays plain data.
class Busy {
  final int level, pct, usualPct;
  final String label, trend, vsUsual, confidence;
  final String? calmerAt;
  final List<({int inMinutes, int? pct})> outlook;
  const Busy({
    required this.level, required this.label, required this.pct, required this.usualPct, required this.trend,
    required this.vsUsual, required this.calmerAt, required this.confidence, required this.outlook,
  });
}

/// One quantization for the band meter and the header board (M2 `lamps`).
int lamps(num pct) => (pct / 20).ceil().clamp(1, 5);

String _fmtT(int m) => m >= 1439 ? 'midnight' : m == 720 ? 'noon' : '${(m ~/ 60 + 11) % 12 + 1}${m % 60 != 0 ? ':${(m % 60).toString().padLeft(2, '0')}' : ''} ${m < 720 ? 'AM' : 'PM'}';

/// The header's second line: the clearing time ("HH:MM") when there is one, else busier or quieter than usual.
String busyExtra(String? calmerAt, String? vsUsual) {
  if (calmerAt != null) {
    final p = calmerAt.split(':').map(int.parse).toList();
    return 'Calmer around ${_fmtT(p[0] * 60 + p[1])}';
  }
  return switch (vsUsual) { 'busier' => 'Busier than usual', 'quieter' => 'Quieter than usual', _ => '' };
}

/// M2 `busyRow`: lit lamps, the word (low confidence is carried by the word, never the meter) and the header's extra line.
({int lamps, String word, String extra}) busyView(Busy b) {
  final word = b.confidence != 'good' ? 'Probably ${b.label.toLowerCase()}' : b.label;
  return (lamps: lamps(b.pct), word: word, extra: busyExtra(b.calmerAt, b.vsUsual));
}

/// The band's word: the level for this hour (UMass's hourly thresholds), hedged when the curve is thin. The meter never is.
String busyWord(int level, {required bool low}) {
  final w = const ['Not busy', 'A little busy', 'Busy'][level];
  return low ? 'Probably ${w.toLowerCase()}' : w;
}
