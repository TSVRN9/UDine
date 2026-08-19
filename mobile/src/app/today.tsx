import { computeDailyTotals, exportEntriesAsCsv, exportEntriesAsJson, type LogEntry } from "@udine/shared";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { Button, Card, EmptyState, Stat } from "../components/ui";
import { colors, fonts, spacing, withOpacity } from "../lib/theme";
import { todayIso } from "../lib/date";
import { SqliteLogStorage } from "../lib/sqliteStorage";

const storage = new SqliteLogStorage();

export default function TodayScreen() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const date = todayIso();

  const load = useCallback(() => {
    storage.getEntriesForDate(date).then(setEntries);
  }, [date]);

  useFocusEffect(load);

  const totals = computeDailyTotals(date, entries);

  async function remove(id: string) {
    await storage.removeEntry(id);
    load();
  }

  async function exportData(format: "json" | "csv") {
    const all = await storage.getAllEntries();
    const content = format === "json" ? exportEntriesAsJson(all) : exportEntriesAsCsv(all);
    const path = `${FileSystem.cacheDirectory}udine-export.${format}`;
    await FileSystem.writeAsStringAsync(path, content);
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path);
    }
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.container}
      data={entries}
      keyExtractor={(e) => e.id}
      ListHeaderComponent={
        <View>
          <Text style={styles.pageTitle}>{date}</Text>
          <View style={styles.rule} />

          <Card style={styles.statsCard}>
            <View style={styles.statsGrid}>
              <View style={styles.statCell}>
                <Stat label="Calories" value={String(Math.round(totals.calories))} />
              </View>
              <View style={styles.statCell}>
                <Stat label="Protein" value={`${totals.proteinG.toFixed(1)}g`} />
              </View>
              <View style={styles.statCell}>
                <Stat label="Carbs" value={`${totals.totalCarbG.toFixed(1)}g`} />
              </View>
              <View style={styles.statCell}>
                <Stat label="Fat" value={`${totals.totalFatG.toFixed(1)}g`} />
              </View>
            </View>
          </Card>

          <Text style={styles.sectionTitle}>Logged today</Text>
          <View style={styles.thinRule} />
        </View>
      }
      renderItem={({ item }) => (
        <Card style={styles.row}>
          <Text style={styles.rowText}>
            {item.source.type === "umass-menu" ? item.source.dishName : item.source.productName} × {item.servings}
          </Text>
          <Button variant="ghost" size="sm" onPress={() => remove(item.id)}>
            Remove
          </Button>
        </Card>
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListEmptyComponent={
        <EmptyState title="Nothing logged yet" message="Browse a dining hall menu and log anything you eat." />
      }
      ListFooterComponent={
        <View style={styles.exportSection}>
          <Text style={styles.sectionTitle}>Export your data</Text>
          <View style={styles.thinRule} />
          <View style={styles.exportRow}>
            <Button variant="secondary" style={styles.exportButton} onPress={() => exportData("json")}>
              Export JSON
            </Button>
            <Button variant="secondary" style={styles.exportButton} onPress={() => exportData("csv")}>
              Export CSV
            </Button>
          </View>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream100 },
  container: { padding: spacing(4), paddingBottom: spacing(10) },
  pageTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: "700",
    textTransform: "uppercase",
    color: colors.maroon900,
  },
  rule: { marginTop: spacing(2), marginBottom: spacing(4), height: 0, borderTopWidth: 4, borderBottomWidth: 1, borderColor: colors.gold500 },
  statsCard: { padding: spacing(4) },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing(4) },
  statCell: { minWidth: "40%", flexGrow: 1 },
  sectionTitle: {
    marginTop: spacing(6),
    fontFamily: fonts.display,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.maroon900,
  },
  thinRule: { marginTop: spacing(1), marginBottom: spacing(3), height: 1, backgroundColor: withOpacity(colors.ink900, 25) },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing(3) },
  rowText: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.ink900 },
  separator: { height: spacing(2) },
  exportSection: { marginTop: spacing(4) },
  exportRow: { flexDirection: "row", gap: spacing(2) },
  exportButton: { flex: 1 },
});
