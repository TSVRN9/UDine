import type { Favorite, LogEntry, RankedDish, RankedFood } from "@udine/shared";
import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";
import { exportFavorites, exportLog, exportRankedDishes, exportRankedFoods, type ExportFormat } from "../lib/exportShare";
import {
  buildExportPlan,
  favoritesSubline,
  logSubline,
  rankedSubline,
  selectedStoreLabel,
  STORE_ORDER,
  STORE_SHORT_NAME,
  STORE_TITLE,
  type ExportJob,
  type FormatChoice,
  type StoreKey,
} from "../lib/exportScreen";
import { SqliteFavoritesStorage } from "../lib/favoritesStorage";
import { SqliteLogStorage } from "../lib/sqliteStorage";
import { SqliteRankingStorage } from "../lib/rankingStorage";

const logStorage = new SqliteLogStorage();
const rankingStorage = new SqliteRankingStorage();
const favoritesStorage = new SqliteFavoritesStorage();

const RUN_EXPORT: Record<StoreKey, (format: ExportFormat) => Promise<void>> = {
  log: exportLog,
  dishRankings: exportRankedDishes,
  foodRankings: exportRankedFoods,
  favorites: exportFavorites,
};

const FORMAT_SEGMENTS: { value: FormatChoice; label: string }[] = [
  { value: "csv", label: "CSV" },
  { value: "json", label: "JSON" },
  { value: "both", label: "BOTH" },
];

/**
 * "Export data" screen (#183, artboard "Export data (final - batch select)") -- reached from
 * Your Data's EXPORT row. Batch-select checkboxes over the same 4 device-local stores YouPane's
 * old inline export buttons covered (#182 moved that logic to lib/exportShare.ts; this screen is
 * the new UI on top of it, not a rebuild of the exporters themselves), a CSV/JSON/BOTH format
 * pill, and a dark bottom bar that runs the selected (store, format) jobs sequentially.
 *
 * BOTH x multi-store, sequential shares vs. a zip: `expo-sharing`'s `shareAsync(url)` takes
 * exactly one file per call, and no zip library is installed in this project. Sequential
 * `shareAsync` calls (one native share sheet per file, run one after another) is the smaller
 * honest implementation over adding a zip dependency purely to bundle files the OS can already
 * hand off one at a time -- see buildExportPlan's own doc comment. Worst case (BOTH x all 4
 * stores) is 8 share sheets in a row; the bottom bar's "N selected" line is the only place that
 * cost is disclosed today (no separate toast/warning for large batches -- YAGNI unless real users
 * report it as friction).
 */
export default function ExportScreen() {
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [rankedDishes, setRankedDishes] = useState<RankedDish[]>([]);
  const [rankedFoods, setRankedFoods] = useState<RankedFood[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [selected, setSelected] = useState<Set<StoreKey>>(new Set());
  const [format, setFormat] = useState<FormatChoice>("csv");
  const [exporting, setExporting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      logStorage.getAllEntries().then(setEntries);
      rankingStorage.getRankedDishes().then(setRankedDishes);
      rankingStorage.getRankedFoods().then(setRankedFoods);
      favoritesStorage.getFavorites().then(setFavorites);
    }, []),
  );

  const subline: Record<StoreKey, string> = {
    log: logSubline(entries),
    dishRankings: rankedSubline(rankedDishes),
    foodRankings: rankedSubline(rankedFoods),
    favorites: favoritesSubline(favorites),
  };

  function toggleStore(store: StoreKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(store)) next.delete(store);
      else next.add(store);
      return next;
    });
  }

  async function runExport() {
    const plan = buildExportPlan(Array.from(selected), format);
    if (plan.length === 0) return;
    setExporting(true);
    try {
      // Sequential, not Promise.all -- see the module doc comment on why (one share sheet at a
      // time; awaiting each keeps them from stacking on top of each other). A single job's
      // failure (e.g. the share sheet dismissed with an error, a write failure) doesn't abort the
      // rest of the plan -- every job still gets attempted, same "keep going, then report" shape
      // as deleteServerData.ts -- but it also isn't swallowed: every failure is collected and
      // surfaced truthfully afterward (#158/#165/#167 convention), instead of the button just
      // re-enabling silently with jobs after the failure never having run.
      const failed: ExportJob[] = [];
      for (const job of plan) {
        try {
          await RUN_EXPORT[job.store](job.format);
        } catch (err) {
          console.warn(`[export] ${job.store} (${job.format}) failed`, err);
          failed.push(job);
        }
      }
      if (failed.length > 0) {
        const names = failed.map((j) => `${STORE_SHORT_NAME[j.store]} (${j.format})`).join(", ");
        Alert.alert("Some exports failed", `Failed: ${names}. Please try again.`);
      }
    } finally {
      setExporting(false);
    }
  }

  const selectedList = Array.from(selected);
  const canExport = selectedList.length > 0 && !exporting;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + spacing(4.5) }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
            <Text style={styles.backChevron}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Export data</Text>
        </View>
        <Text style={styles.intro}>Pick what to export. Files go to your share sheet — nothing is uploaded.</Text>

        <View style={styles.rows}>
          {STORE_ORDER.map((store) => {
            const isSelected = selected.has(store);
            return (
              <Pressable key={store} style={[styles.row, isSelected && styles.rowSelected]} onPress={() => toggleStore(store)} accessibilityRole="checkbox" accessibilityState={{ checked: isSelected }}>
                <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>{isSelected && <Text style={styles.checkmark}>✓</Text>}</View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{STORE_TITLE[store]}</Text>
                  <Text style={styles.rowSubline}>{subline[store]}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.formatRow}>
          <Text style={styles.formatLabel}>FORMAT</Text>
          <View style={styles.formatPill}>
            {FORMAT_SEGMENTS.map((seg) => (
              <Pressable key={seg.value} style={[styles.formatSegment, format === seg.value && styles.formatSegmentActive]} onPress={() => setFormat(seg.value)} accessibilityRole="button">
                <Text style={[styles.formatSegmentText, format === seg.value && styles.formatSegmentTextActive]}>{seg.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing(5.5) }]}>
        <View style={styles.bottomBarLeft}>
          <Text style={styles.selectedCount}>{selectedList.length} selected</Text>
          {selectedList.length > 0 && <Text style={styles.selectedNames}>{selectedStoreLabel(selectedList)}</Text>}
        </View>
        <Pressable style={[styles.exportButton, !canExport && styles.exportButtonDisabled]} onPress={runExport} disabled={!canExport} accessibilityRole="button">
          <Text style={[styles.exportButtonText, !canExport && styles.exportButtonTextDisabled]}>↓ EXPORT</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream100 },
  scrollContent: { paddingHorizontal: spacing(5), paddingBottom: spacing(30), gap: spacing(3.5) },

  header: { flexDirection: "row", alignItems: "center", gap: spacing(3) },
  backChevron: { fontFamily: fonts.body600, fontSize: fs(28), color: colors.maroon900, lineHeight: fs(28) },
  headerTitle: { fontFamily: fonts.display700, fontSize: fs(22), letterSpacing: 1, textTransform: "uppercase", color: colors.maroon900 },

  intro: { fontFamily: fonts.body400, fontSize: fs(13), lineHeight: fs(18.85), color: withOpacity(colors.ink900, 65) },

  rows: { gap: spacing(2.5) },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    backgroundColor: colors.paper50,
    borderWidth: 1,
    borderColor: withOpacity(colors.ink900, 12),
    borderRadius: radii.md,
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(3.5),
    minHeight: fs(44),
  },
  rowSelected: { borderColor: colors.gold500 },
  checkbox: { width: fs(22), height: fs(22), borderRadius: 4, borderWidth: 1.5, borderColor: withOpacity(colors.ink900, 30), alignItems: "center", justifyContent: "center" },
  checkboxSelected: { backgroundColor: colors.maroon600, borderWidth: 0 },
  checkmark: { color: colors.paper50, fontSize: fs(12), fontWeight: "700" },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: fonts.body600, fontSize: fs(14), color: colors.ink900 },
  rowSubline: { fontFamily: fonts.mono, fontSize: fs(12), color: withOpacity(colors.ink900, 55) },

  formatRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing(3) },
  formatLabel: { fontFamily: fonts.body600, fontSize: fs(11), letterSpacing: 1, textTransform: "uppercase", color: withOpacity(colors.ink900, 55) },
  formatPill: { flexDirection: "row", backgroundColor: withOpacity(colors.ink900, 8), borderRadius: radii.pill, padding: fs(3) },
  formatSegment: { height: fs(32), paddingHorizontal: spacing(4.5), borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  formatSegmentActive: { backgroundColor: colors.maroon900 },
  formatSegmentText: { fontFamily: fonts.mono, fontSize: fs(12), fontWeight: "600", color: withOpacity(colors.ink900, 55) },
  formatSegmentTextActive: { color: colors.paper50 },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.maroon900,
    paddingTop: spacing(3),
    paddingHorizontal: spacing(5),
    gap: spacing(3),
  },
  bottomBarLeft: { flex: 1, gap: 2 },
  selectedCount: { fontFamily: fonts.body600, fontSize: fs(15), color: colors.paper50 },
  selectedNames: { fontFamily: fonts.mono, fontSize: fs(12), color: withOpacity(colors.paper50, 65) },
  exportButton: { flexDirection: "row", alignItems: "center", backgroundColor: colors.gold500, borderRadius: radii.md, height: fs(48), paddingHorizontal: spacing(6.5) },
  exportButtonDisabled: { backgroundColor: "rgba(201,154,46,0.35)" },
  exportButtonText: { fontFamily: fonts.display600, fontSize: fs(16), letterSpacing: 1, textTransform: "uppercase", color: colors.maroon900 },
  exportButtonTextDisabled: { color: "rgba(59,10,15,0.6)" },
});
