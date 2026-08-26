import { htmlToText, openStatus, parseRetailMenuHtml, type RetailLocationHours } from "@udine/shared";
import { Animated, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cafeStatusPillText, directionsUrl, pickCafeMenuHtml } from "../lib/cafeMenu";
import { useSheetAnim } from "../lib/sheetAnimation";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";

interface Props {
  visible: boolean;
  loc: RetailLocationHours;
  now: Date;
  onClose: () => void;
  /** Tapping a PDF standing-menu link -- opens the in-app viewer (CafePdfSheet), never an
   * external browser (owner decision, #177). */
  onOpenPdf: (url: string, label: string) => void;
}

/**
 * Café fallback sheet (#177's "Cafe fallback (menu not posted)" artboard, née "Cafe detail sheet"
 * -- see the owner's binding comment on the issue: this never presents *_menu content as today's
 * menu, only as the STANDING menu). House bottom-sheet pattern -- same structural shape as
 * PlateSheet.tsx (transparent Modal, scrim, radius-12-top sheet, drag handle), styled per the
 * issue's verbatim styling spec instead of PlateSheet's own tokens.
 *
 * Trust boundary: description/address/*_menu are raw third-party HTML off get_infov2 (#176).
 * htmlToText/parseRetailMenuHtml (shared/src/content.ts) are #178's (web café-tap parity)
 * additive exports for exactly this -- structured parsing, not a sanitize-then-render pass, and
 * the one implementation of this boundary both clients use. Do not add a second one here.
 */
export function CafeSheet({ visible, loc, now, onClose, onOpenPdf }: Props) {
  const insets = useSafeAreaInsets();
  const { backdropStyle, panelStyle } = useSheetAnim(visible);
  const status = openStatus({ hallTid: -1, breakfast: null, lunch: null, dinner: null, latenight: null, general: loc.hours }, now);
  const description = htmlToText(loc.description);
  const menuHtml = pickCafeMenuHtml(loc);
  const menuContent = parseRetailMenuHtml(menuHtml);
  const addressLines = htmlToText(loc.address).split("\n").filter(Boolean);
  const mapsUrl = directionsUrl(loc.mapAddress);
  const payments = loc.acceptedPayment
    ? loc.acceptedPayment
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
    : [];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View style={[styles.sheet, panelStyle, { paddingBottom: spacing(6) + insets.bottom }]}>
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          <ScrollView>
            <Text style={styles.title}>{loc.name}</Text>
            <View style={styles.statusRow}>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>{cafeStatusPillText(status)}</Text>
              </View>
            </View>

            {description ? <Text style={styles.description}>{description}</Text> : null}

            {menuContent.kind !== "empty" ? (
              <View style={styles.menuCard}>
                <View style={styles.menuHeaderStrip}>
                  <Text style={styles.menuHeaderLabel}>MENU</Text>
                  <Text style={styles.menuCaveat}>today&apos;s menu isn&apos;t posted yet — standing menu from umassdining.com</Text>
                </View>
                {menuContent.kind === "items"
                  ? menuContent.items.map((item, i) => (
                      <View key={`${item.name}-${i}`} style={[styles.menuRow, i > 0 && styles.menuRowDivider]}>
                        <Text style={styles.menuItemName}>{item.name}</Text>
                        {item.price ? <Text style={styles.menuItemPrice}>{item.price}</Text> : null}
                      </View>
                    ))
                  : (
                      <Pressable
                        style={styles.menuRow}
                        onPress={() => onOpenPdf(menuContent.url, menuContent.label)}
                        accessibilityRole="button"
                        accessibilityLabel={`View ${menuContent.label}`}
                      >
                        <Text style={styles.menuItemName}>{menuContent.label}</Text>
                        <Text style={styles.menuItemPrice}>›</Text>
                      </Pressable>
                    )}
              </View>
            ) : null}

            {addressLines.length > 0 ? (
              <View style={styles.locationRow}>
                <View style={styles.locationInfo}>
                  <Text style={styles.locationVenue}>{addressLines[0]}</Text>
                  <Text style={styles.locationCity}>UMass Amherst</Text>
                </View>
                {mapsUrl ? (
                  <Pressable onPress={() => Linking.openURL(mapsUrl)} accessibilityRole="button" accessibilityLabel="Get directions">
                    <Text style={styles.directions}>DIRECTIONS ↗</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {payments.length > 0 ? (
              <View style={styles.paymentRow}>
                <Text style={styles.paymentGlyph}>▭</Text>
                <Text style={styles.paymentText}>{payments.join(" · ")}</Text>
              </View>
            ) : null}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: withOpacity(colors.ink900, 50) },
  sheet: {
    backgroundColor: colors.paper50,
    borderTopLeftRadius: fs(12),
    borderTopRightRadius: fs(12),
    paddingHorizontal: spacing(5),
    paddingTop: spacing(2.5),
    gap: spacing(3),
    maxHeight: fs(640),
  },
  handleRow: { alignItems: "center", marginBottom: spacing(1) },
  handle: { width: fs(40), height: fs(4), borderRadius: radii.pill, backgroundColor: withOpacity(colors.ink900, 20) },

  title: { fontFamily: fonts.display700, fontSize: fs(20), letterSpacing: 1, textTransform: "uppercase", color: colors.maroon900 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing(2), marginTop: spacing(1.5) },
  statusPill: { backgroundColor: colors.gold500, borderRadius: radii.pill, paddingVertical: spacing(0.75), paddingHorizontal: spacing(2.25) },
  statusPillText: { fontFamily: fonts.body600, fontSize: fs(10), letterSpacing: 0.5, color: colors.maroon900 },

  description: { marginTop: spacing(3), fontFamily: fonts.body400, fontSize: fs(12), lineHeight: fs(18), color: withOpacity(colors.ink900, 70) },

  menuCard: { marginTop: spacing(3), borderWidth: 1, borderColor: withOpacity(colors.ink900, 12), borderRadius: radii.md, overflow: "hidden" },
  menuHeaderStrip: { backgroundColor: withOpacity(colors.gold500, 12), paddingVertical: spacing(2.25), paddingHorizontal: spacing(3.5), gap: 2 },
  menuHeaderLabel: { fontFamily: fonts.display600, fontSize: fs(11), letterSpacing: 1.2, textTransform: "uppercase", color: colors.maroon900 },
  menuCaveat: { fontFamily: fonts.body400, fontSize: fs(10), color: withOpacity(colors.ink900, 50) },
  menuRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing(2), paddingHorizontal: spacing(3.5) },
  menuRowDivider: { borderTopWidth: 1, borderTopColor: withOpacity(colors.ink900, 8), marginLeft: spacing(3.5) },
  menuItemName: { flex: 1, fontFamily: fonts.body400, fontSize: fs(13), color: colors.ink900 },
  menuItemPrice: { fontFamily: fonts.mono, fontSize: fs(12), fontWeight: "600", color: colors.maroon600 },

  locationRow: {
    marginTop: spacing(3),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: fs(44), // matches index.tsx's retailRow -- same 44px touch-target convention
    borderWidth: 1,
    borderColor: withOpacity(colors.ink900, 12),
    borderRadius: radii.md,
    paddingHorizontal: spacing(3.5),
  },
  locationInfo: { gap: 1 },
  locationVenue: { fontFamily: fonts.body600, fontSize: fs(13), color: colors.ink900 },
  locationCity: { fontFamily: fonts.body400, fontSize: fs(11), color: withOpacity(colors.ink900, 55) },
  directions: { fontFamily: fonts.body600, fontSize: fs(11), letterSpacing: 0.5, color: colors.maroon600 },

  paymentRow: { marginTop: spacing(2.5), flexDirection: "row", alignItems: "flex-start", gap: spacing(2) },
  paymentGlyph: { fontSize: fs(13), color: withOpacity(colors.ink900, 45) },
  paymentText: { flex: 1, fontFamily: fonts.body400, fontSize: fs(11), lineHeight: fs(16), color: withOpacity(colors.ink900, 55) },
});
