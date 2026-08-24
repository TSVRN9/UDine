import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, fs, spacing, withOpacity } from "../lib/theme";

interface Props {
  text: string;
  onRetry?: () => void;
}

/**
 * Offline indicator line (#181 canvas: Home's date-kicker row + Social's own header row) --
 * wifi-off glyph + copy, optional right-aligned RETRY. No react-native-svg in this codebase
 * (established convention, see HallInfoSheet's #180 doc) -- the wifi-off arcs+slash are
 * approximated as a small dot + diagonal strike (a "signal off" reading, not a pixel transcription
 * of the spec's SVG path) rather than adding an svg dependency for one 12px decorative glyph.
 */
export function OfflineLine({ text, onRetry }: Props) {
  return (
    <View style={styles.row}>
      <View style={styles.glyphWrap}>
        <View style={styles.glyphDot} />
        <View style={styles.glyphSlash} />
      </View>
      <Text style={styles.text}>{text}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} hitSlop={8} accessibilityRole="button" accessibilityLabel="Retry">
          <Text style={styles.retry}>RETRY</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing(1.5) },
  glyphWrap: { width: fs(12), height: fs(12), alignItems: "center", justifyContent: "center" },
  glyphDot: { width: fs(4), height: fs(4), borderRadius: fs(2), backgroundColor: withOpacity(colors.ink900, 40) },
  glyphSlash: { position: "absolute", width: fs(14), height: 1.6, backgroundColor: withOpacity(colors.ink900, 40), transform: [{ rotate: "45deg" }] },
  text: { fontFamily: fonts.body500, fontSize: fs(11), color: withOpacity(colors.ink900, 50) },
  retry: { fontFamily: fonts.body600, fontSize: fs(11), letterSpacing: 0.5, color: colors.maroon600, marginLeft: spacing(1) },
});
