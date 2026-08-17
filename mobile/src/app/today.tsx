import { computeDailyTotals, exportEntriesAsCsv, exportEntriesAsJson, type LogEntry } from "@udine/shared";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
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
    <View style={styles.container}>
      <View style={styles.totals}>
        <Text style={styles.totalsTitle}>{date}</Text>
        <Text>{Math.round(totals.calories)} cal</Text>
        <Text>
          {totals.proteinG.toFixed(1)}g protein · {totals.totalCarbG.toFixed(1)}g carbs · {totals.totalFatG.toFixed(1)}g fat
        </Text>
      </View>
      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowText}>
              {item.source.type === "umass-menu" ? item.source.dishName : item.source.productName} × {item.servings}
            </Text>
            <Pressable onPress={() => remove(item.id)}>
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Nothing logged today.</Text>}
      />
      <View style={styles.exportRow}>
        <Pressable style={styles.exportButton} onPress={() => exportData("json")}>
          <Text style={styles.exportButtonText}>Export JSON</Text>
        </Pressable>
        <Pressable style={styles.exportButton} onPress={() => exportData("csv")}>
          <Text style={styles.exportButtonText}>Export CSV</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  totals: { padding: 16, backgroundColor: "#eef6ff" },
  totalsTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#ccc" },
  rowText: { flex: 1 },
  remove: { color: "#c00" },
  empty: { padding: 16, color: "#666" },
  exportRow: { flexDirection: "row", gap: 8, padding: 12 },
  exportButton: { flex: 1, backgroundColor: "#208AEF", padding: 12, borderRadius: 8, alignItems: "center" },
  exportButtonText: { color: "white", fontWeight: "600" },
});
