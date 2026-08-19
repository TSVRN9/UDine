import { StyleSheet, View, type ViewProps } from "react-native";
import { colors, radii, withOpacity } from "../../lib/theme";

/** Paper surface on the cream ground — the default container for a list/panel. Mirrors .card. */
export function Card({ style, ...props }: ViewProps) {
  return <View style={[styles.card, style]} {...props} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.paper50,
    borderWidth: 1,
    borderColor: withOpacity(colors.ink900, 12),
    borderRadius: radii.md,
  },
});
