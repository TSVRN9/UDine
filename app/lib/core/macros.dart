// Port of shared/src/macros.ts.
import 'types.dart';

/// Sums one day's entries (already filtered to that date) into daily totals.
DailyMacroTotals computeDailyTotals(String date, List<LogEntry> entries) {
  num cal = 0, p = 0, c = 0, f = 0;
  for (final e in entries) {
    cal += e.nutrition.calories * e.servings;
    p += e.nutrition.proteinG * e.servings;
    c += e.nutrition.totalCarbG * e.servings;
    f += e.nutrition.totalFatG * e.servings;
  }
  return DailyMacroTotals(date: date, calories: cal, proteinG: p, totalCarbG: c, totalFatG: f);
}

/// Averages over the list's own length; zeroes (not NaN) and date '' when empty.
DailyMacroTotals averageDailyTotals(List<DailyMacroTotals> totals) {
  if (totals.isEmpty) return const DailyMacroTotals(date: '', calories: 0, proteinG: 0, totalCarbG: 0, totalFatG: 0);
  num cal = 0, p = 0, c = 0, f = 0;
  for (final t in totals) {
    cal += t.calories;
    p += t.proteinG;
    c += t.totalCarbG;
    f += t.totalFatG;
  }
  final n = totals.length;
  return DailyMacroTotals(date: '', calories: cal / n, proteinG: p / n, totalCarbG: c / n, totalFatG: f / n);
}

String isoDateOf(String isoTimestamp) => isoTimestamp.length < 10 ? isoTimestamp : isoTimestamp.substring(0, 10);
