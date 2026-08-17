import { DINING_HALLS } from "@udine/shared";
import { Link } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

export default function HallListScreen() {
  return (
    <View style={styles.container}>
      <FlatList
        data={DINING_HALLS}
        keyExtractor={(hall) => hall.slug}
        renderItem={({ item }) => (
          <Link href={`/halls/${item.slug}`} asChild>
            <Pressable style={styles.row}>
              <Text style={styles.rowText}>{item.name}</Text>
            </Pressable>
          </Link>
        )}
      />
      <Link href="/today" asChild>
        <Pressable style={styles.todayButton}>
          <Text style={styles.todayButtonText}>Today's macros</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  row: { paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#ccc" },
  rowText: { fontSize: 18 },
  todayButton: { marginTop: 16, padding: 14, backgroundColor: "#208AEF", borderRadius: 8, alignItems: "center" },
  todayButtonText: { color: "white", fontWeight: "600", fontSize: 16 },
});
