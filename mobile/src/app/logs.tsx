import { hallNameFor, isoDateOf, type LogEntry } from "@udine/shared";
import { router, useFocusEffect } from "expo-router";
import { Fragment, useCallback, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, EmptyState, SectionHeader } from "../components/ui";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";
import { todayIso } from "../lib/date";
import { entryCalories, groupEntriesByMeal, logItemLine } from "../lib/youPaneFormat";
import { buildFunStats, buildWeekChart, buildWeekStrip, formatLogTime, type WeekDayChip } from "../lib/logsFormat";
import { SqliteLogStorage } from "../lib/sqliteStorage";

const logStorage = new SqliteLogStorage();

/** "YYYY-MM-DD" -> a local-midnight Date, avoiding the `new Date("YYYY-MM-DD")` UTC-parse trap
 * (see logsFormat.ts's addDaysIso comment on the same gotcha). */
function localDateFromIso(dateIso: string): Date {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dishNameOf(entry: LogEntry): string {
  return entry.source.type === "umass-menu" ? entry.source.dishName : entry.source.productName;
}

/** One week-strip chip: weekday letters + day-number circle + gold dot (or an empty same-size
 * spacer, so dot-less days don't shift the row's vertical alignment). Canvas colors: selected fills
 * maroon; past/today outlines in ink-at-20%-alpha with solid maroon900 digits; future mutes both the
 * border (ink-at-10%) and the digits (ink-at-35%). */
function WeekChip({ chip, onPress }: { chip: WeekDayChip; onPress: () => void }) {
  return (
    <Pressable style={styles.chipColumn} onPress={onPress} accessibilityRole="button" accessibilityLabel={chip.date}>
      <Text style={styles.chipLabel}>{chip.dayLabel}</Text>
      <View
        style={[
          styles.chipCircle,
          chip.isSelected ? styles.chipCircleSelected : chip.isFuture ? styles.chipCircleFuture : styles.chipCircleOutlined,
        ]}
      >
        <Text style={[styles.chipNumber, chip.isSelected ? styles.chipNumberSelected : chip.isFuture ? styles.chipNumberFuture : styles.chipNumberOutlined]}>
          {chip.dayNumber}
        </Text>
      </View>
      <View style={[styles.chipDot, chip.hasLogs && styles.chipDotFilled]} />
    </Pressable>
  );
}

/** Collapsed day-log row -- tap anywhere on it to open the edit state below. */
function LogItemRow({ entry, onPress }: { entry: LogEntry; onPress: () => void }) {
  return (
    <Pressable style={styles.mealItemRow} onPress={onPress} accessibilityRole="button" accessibilityLabel={`Edit ${logItemLine(entry)}`}>
      <Text style={styles.mealItemName}>{logItemLine(entry)}</Text>
      <Text style={styles.mealItemCalories}>{entryCalories(entry)}</Text>
    </Pressable>
  );
}

/** Gold-bordered edit sub-card: stepper (stepping to 0 deletes) + a standalone × remove button. */
function EditEntryCard({ entry, onStep, onRemove }: { entry: LogEntry; onStep: (delta: number) => void; onRemove: () => void }) {
  const dishName = dishNameOf(entry);
  const subtitle = [
    entry.source.type === "umass-menu" ? hallNameFor(entry.source.hallTid) : null,
    formatLogTime(entry.loggedAt),
    `${Math.round(entry.nutrition.calories)} cal each`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.editCard}>
      <View style={styles.editInfo}>
        <Text style={styles.editName}>{dishName}</Text>
        <Text style={styles.editSubtitle}>{subtitle}</Text>
      </View>
      <View style={styles.editControls}>
        <View style={styles.stepper}>
          <Pressable style={styles.stepperButton} onPress={() => onStep(-1)} accessibilityRole="button" accessibilityLabel={`Remove one ${dishName}`}>
            <Text style={styles.stepperButtonText}>−</Text>
          </Pressable>
          <Text style={styles.stepperCount}>{entry.servings}</Text>
          <Pressable style={styles.stepperButton} onPress={() => onStep(1)} accessibilityRole="button" accessibilityLabel={`Add one ${dishName}`}>
            <Text style={styles.stepperButtonText}>+</Text>
          </Pressable>
        </View>
        <Pressable style={styles.removeButton} onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Remove ${dishName}`}>
          <Text style={styles.removeIcon}>×</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * #119: Logs & stats screen, pushed from the You pane's ALL LOGS link (#118). Everything here is
 * computed from the device-local log -- no Supabase calls, no new tables (CLAUDE.md's data
 * residency table is law). Reuses #118's groupEntriesByMeal/logItemLine (youPaneFormat.ts),
 * @udine/shared's hallNameFor (#108) directly, and shared's isoDateOf for local-day bucketing,
 * rather than re-deriving any of them.
 */
export default function LogsScreen() {
  const [allEntries, setAllEntries] = useState<LogEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [editingId, setEditingId] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const load = useCallback(() => {
    logStorage.getAllEntries().then(setAllEntries);
  }, []);
  useFocusEffect(load);

  // Guards stepEntry/removeEntry against a rapid re-tap firing before the in-flight storage
  // round-trip resolves: both handlers read `entry.servings` from the render-closure snapshot, so
  // two overlapping calls would both compute from the same stale count and one increment would be
  // silently lost. A single ref is enough (only one row is ever in the edit state at a time) --
  // the second tap is dropped rather than mis-applied; the button responds normally again once
  // the in-flight write's refresh() lands.
  const stepping = useRef(false);

  async function withStepGuard(fn: () => Promise<void>) {
    if (stepping.current) return;
    stepping.current = true;
    try {
      await fn();
    } finally {
      stepping.current = false;
    }
  }

  async function refresh() {
    setAllEntries(await logStorage.getAllEntries());
  }

  async function stepEntry(entry: LogEntry, delta: number) {
    await withStepGuard(async () => {
      const nextServings = entry.servings + delta;
      if (nextServings <= 0) {
        await logStorage.removeEntry(entry.id);
        setEditingId(null);
      } else {
        await logStorage.addEntry({ ...entry, servings: nextServings });
      }
      await refresh();
    });
  }

  async function removeEntry(entry: LogEntry) {
    await withStepGuard(async () => {
      await logStorage.removeEntry(entry.id);
      setEditingId(null);
      await refresh();
    });
  }

  const today = todayIso();
  const selectedEntries = allEntries.filter((e) => isoDateOf(e.loggedAt) === selectedDate);
  const mealGroups = groupEntriesByMeal(selectedEntries);
  // Same round-per-entry-then-sum convention as every other displayed total in this app (#118) --
  // agrees exactly with the meal groups' own subtotals, not just approximately.
  const dayTotalCalories = mealGroups.reduce((sum, g) => sum + g.totalCalories, 0);
  const weekStrip = buildWeekStrip(allEntries, selectedDate, today);
  const weekChart = buildWeekChart(allEntries, today, selectedDate);
  const funStats = buildFunStats(allEntries, today);
  const maxChartCalories = Math.max(1, ...weekChart.days.map((d) => d.calories));

  const selectedDateObj = localDateFromIso(selectedDate);
  const weekdayLong = selectedDateObj.toLocaleDateString("en-US", { weekday: "long" });
  const subtitle = selectedDateObj.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing(4.5) }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Logs</Text>
          <Text style={styles.headerSubtitle}>{subtitle}</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + spacing(10) }]}>
        <View style={styles.weekStrip}>
          {weekStrip.map((chip) => (
            <WeekChip key={chip.date} chip={chip} onPress={() => setSelectedDate(chip.date)} />
          ))}
        </View>

        <View style={styles.section}>
          <SectionHeader title={`${weekdayLong}'s Log`} right={<Text style={styles.dayTotal}>{dayTotalCalories} cal</Text>} />
          {selectedEntries.length === 0 ? (
            <EmptyState title="Nothing logged" message="No entries for this day." />
          ) : (
            <Card style={styles.logCard}>
              {mealGroups.map((group, i) => (
                <Fragment key={group.period}>
                  {i > 0 && <View style={styles.mealDivider} />}
                  <View style={styles.mealGroup}>
                    <View style={styles.mealHeaderRow}>
                      <Text style={styles.mealHeaderLabel}>{group.label}</Text>
                      <Text style={styles.mealHeaderTotal}>{group.totalCalories} cal</Text>
                    </View>
                    {group.entries.map((entry) =>
                      editingId === entry.id ? (
                        <EditEntryCard key={entry.id} entry={entry} onStep={(delta) => stepEntry(entry, delta)} onRemove={() => removeEntry(entry)} />
                      ) : (
                        <LogItemRow key={entry.id} entry={entry} onPress={() => setEditingId(entry.id)} />
                      ),
                    )}
                  </View>
                </Fragment>
              ))}
            </Card>
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader title="Last 7 Days" />
          <Card style={styles.chartCard}>
            <View style={styles.chartBars}>
              {weekChart.days.map((d) => (
                <View key={d.date} style={styles.chartBarWrap}>
                  <View
                    style={[
                      styles.chartBar,
                      { height: (d.calories / maxChartCalories) * 72 },
                      d.isSelected || d.isToday ? styles.chartBarGold : styles.chartBarMaroon,
                    ]}
                  />
                </View>
              ))}
            </View>
            <View style={styles.chartLabels}>
              {weekChart.days.map((d) => (
                <Text key={d.date} style={[styles.chartLabelText, d.isToday && styles.chartLabelToday]}>
                  {localDateFromIso(d.date).toLocaleDateString("en-US", { weekday: "narrow" })}
                </Text>
              ))}
            </View>
            <Text style={styles.chartCaption}>
              Avg {weekChart.avgCalories.toLocaleString("en-US")} cal / day · {weekChart.avgProteinG}g protein / day
            </Text>
          </Card>
        </View>

        <View style={styles.section}>
          <SectionHeader title="For Fun" />
          {funStats.length === 0 ? (
            <EmptyState title="Keep logging" message="Fun stats show up once you've built a bit of history." />
          ) : (
            <View style={styles.funGrid}>
              {funStats.map((stat, i) => (
                <Card key={i} style={styles.funCard}>
                  <Text style={[styles.funFigure, stat.gold && styles.funFigureGold]}>{stat.figure}</Text>
                  <Text style={styles.funCaption}>{stat.caption}</Text>
                </Card>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cream100 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing(5) },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    paddingHorizontal: spacing(5),
    paddingBottom: spacing(3),
  },
  backChevron: { fontFamily: fonts.body400, fontSize: fs(32), lineHeight: fs(34), color: colors.maroon900, marginTop: -4 },
  headerText: { flex: 1 },
  headerTitle: { fontFamily: fonts.display700, fontSize: fs(22), letterSpacing: 1, textTransform: "uppercase", color: colors.maroon900 },
  headerSubtitle: { fontFamily: fonts.body400, fontSize: fs(12), color: withOpacity(colors.ink900, 60) },

  section: { marginTop: spacing(4), gap: spacing(2.5) },

  // Week strip -- 7 chips, selected filled maroon, past/today outlined, future muted.
  weekStrip: { flexDirection: "row", justifyContent: "space-between" },
  chipColumn: { alignItems: "center", gap: spacing(1) },
  chipLabel: { fontFamily: fonts.body600, fontSize: fs(10), letterSpacing: 1, color: colors.maroon900 },
  chipCircle: { width: fs(36), height: fs(36), borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  chipCircleSelected: { backgroundColor: colors.maroon600 },
  chipCircleOutlined: { borderWidth: 1, borderColor: withOpacity(colors.ink900, 20) },
  chipCircleFuture: { borderWidth: 1, borderColor: withOpacity(colors.ink900, 10) },
  chipNumber: { fontFamily: fonts.mono, fontSize: fs(13), fontWeight: "600" },
  chipNumberSelected: { color: colors.paper50 },
  chipNumberOutlined: { color: colors.maroon900 },
  chipNumberFuture: { color: withOpacity(colors.ink900, 35) },
  chipDot: { width: fs(4), height: fs(4), borderRadius: radii.pill, backgroundColor: "transparent" },
  chipDotFilled: { backgroundColor: colors.gold500 },

  dayTotal: { fontFamily: fonts.mono, fontSize: fs(12), fontWeight: "600", color: withOpacity(colors.ink900, 70) },

  // Day log card -- meal-grouped exactly like #118's You-pane card, tap a row to edit.
  logCard: { paddingVertical: spacing(3), paddingHorizontal: spacing(3.5), gap: spacing(2) },
  mealGroup: { gap: spacing(1.25) },
  mealHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  mealHeaderLabel: { fontFamily: fonts.display600, fontSize: fs(11), letterSpacing: 1.2, textTransform: "uppercase", color: colors.maroon900 },
  mealHeaderTotal: { fontFamily: fonts.mono, fontSize: fs(12), fontWeight: "600", color: withOpacity(colors.ink900, 70) },
  mealItemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  mealItemName: { flexShrink: 1, fontFamily: fonts.body400, fontSize: fs(13), color: colors.ink900 },
  mealItemCalories: { fontFamily: fonts.mono, fontSize: fs(12), color: withOpacity(colors.ink900, 55) },
  mealDivider: { height: 1, backgroundColor: withOpacity(colors.ink900, 8) },

  // Edit sub-card -- gold border, stepper + standalone remove.
  editCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing(2.5),
    borderWidth: 1,
    borderColor: colors.gold500,
    borderRadius: radii.md,
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(2.5),
  },
  editInfo: { flexShrink: 1, gap: 1 },
  editName: { fontFamily: fonts.body600, fontSize: fs(13), color: colors.ink900 },
  editSubtitle: { fontFamily: fonts.body400, fontSize: fs(11), color: withOpacity(colors.ink900, 55) },
  editControls: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  stepper: { flexDirection: "row", alignItems: "center", backgroundColor: colors.maroon600, borderRadius: radii.pill },
  stepperButton: { width: fs(34), height: fs(38), alignItems: "center", justifyContent: "center" },
  stepperButtonText: { fontSize: fs(16), color: colors.paper50 },
  stepperCount: { fontFamily: fonts.mono, fontSize: fs(13), fontWeight: "600", minWidth: 14, textAlign: "center", color: colors.paper50 },
  removeButton: {
    width: fs(38),
    height: fs(38),
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: withOpacity(colors.maroon600, 45),
    alignItems: "center",
    justifyContent: "center",
  },
  removeIcon: { fontSize: fs(14), color: colors.maroon600 },

  // Last 7 Days chart -- plain flex divs, no chart library.
  chartCard: { paddingVertical: spacing(3.5), paddingHorizontal: spacing(3.5), gap: spacing(2) },
  chartBars: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 72 },
  chartBarWrap: { width: fs(32), alignItems: "center" },
  chartBar: { width: fs(32), borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  chartBarMaroon: { backgroundColor: colors.maroon600 },
  chartBarGold: { backgroundColor: colors.gold500 },
  chartLabels: { flexDirection: "row", justifyContent: "space-between" },
  chartLabelText: { width: fs(32), textAlign: "center", fontFamily: fonts.body600, fontSize: fs(10), color: withOpacity(colors.ink900, 50) },
  chartLabelToday: { color: colors.maroon900 },
  chartCaption: { fontFamily: fonts.mono, fontSize: fs(12), color: withOpacity(colors.ink900, 70) },

  // For Fun 2x2 stat grid.
  funGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  funCard: { width: "48%", marginBottom: spacing(2), padding: spacing(3), gap: spacing(1) },
  funFigure: { fontFamily: fonts.display700, fontSize: fs(22), color: colors.maroon600 },
  funFigureGold: { color: colors.gold500 },
  funCaption: { fontFamily: fonts.body400, fontSize: fs(11), color: withOpacity(colors.ink900, 60) },
});
