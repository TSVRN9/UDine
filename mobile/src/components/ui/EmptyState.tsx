import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../../lib/theme";

/** Dashed-outline panel for "nothing here yet" + what to do about it. Mirrors .empty-state. */
export function EmptyState({ title, message, action }: { title: string; message?: string; action?: ReactNode }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: withOpacity(colors.ink900, 25),
    borderRadius: radii.md,
    padding: spacing(6),
    alignItems: "center",
    gap: spacing(2),
  },
  title: {
    fontFamily: fonts.display,
    fontSize: fs(17),
    fontWeight: "700",
    textTransform: "uppercase",
    textAlign: "center",
    color: colors.maroon900,
  },
  message: {
    fontFamily: fonts.body,
    fontSize: fs(14),
    textAlign: "center",
    color: withOpacity(colors.ink900, 70),
  },
});
