import { htmlToText, openStatus, type RetailLocationHours } from "@udine/shared";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { cafeStatusPillText, directionsUrl } from "../lib/cafeMenu";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";

interface Props {
  loc: RetailLocationHours;
  now: Date;
  /** Set only when the waterfall's standing-menu parse (resolveCafeMenuState, cafeMenu.ts) found a
   * PDF link rather than an item list -- babyBerk/Commonwealth's shape. Undefined for a café with
   * no standing menu at all (Paciugo/The Hub). */
  pdf: { url: string; label: string } | null;
  /** Tapping the PDF row -- opens the in-app viewer (CafePdfViewer), never an external browser
   * (owner decision, #177). */
  onOpenPdf: (url: string, label: string) => void;
}

/**
 * Café info-only content (#177's "Cafe fallback (menu not posted)" artboard, née "Cafe detail
 * sheet") -- hours/status/description/address/payment, PLUS the PDF-menu affordance when the
 * waterfall found one. Café-screen unification (issue in this PR's own body): this used to be a
 * standalone bottom-sheet Modal, reached via its OWN code path (a tap-and-navigate-away dance
 * through cafeSheetHandoff.ts, or index.tsx opening it inline for a locationId-less café) --
 * SEPARATE from the hall-shaped menu screen a café with real ajax/standing-menu data got instead.
 * That was the exact "confusing dual system" this PR fixes: now this is plain content, mounted
 * directly inside halls/[slug].tsx's HallMenuScreenBody as ONE of that single screen's three
 * internal states (see resolveCafeMenuState, cafeMenu.ts) -- never a Modal, never a separate route.
 *
 * Trust boundary unchanged from the original sheet: description/address are raw third-party HTML
 * off get_infov2 (#176), rendered via htmlToText (shared/src/content.ts), never {@html}-style raw
 * markup. The standing-menu item-list rendering this component used to own moved to
 * HallMenuScreenBody's own dish rows (matched items) plus a small unmatched-row block (see that
 * file) -- an item LIST means the waterfall resolved "standing", not "info", so this component
 * never sees one.
 */
export function CafeSheet({ loc, now, pdf, onOpenPdf }: Props) {
  const status = openStatus({ hallTid: -1, breakfast: null, lunch: null, dinner: null, latenight: null, general: loc.hours }, now);
  const description = htmlToText(loc.description);
  const addressLines = htmlToText(loc.address).split("\n").filter(Boolean);
  const mapsUrl = directionsUrl(loc.mapAddress);
  const payments = loc.acceptedPayment
    ? loc.acceptedPayment
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
    : [];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{loc.name}</Text>
      <View style={styles.statusRow}>
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>{cafeStatusPillText(status)}</Text>
        </View>
      </View>

      {description ? <Text style={styles.description}>{description}</Text> : null}

      {pdf ? (
        <View style={styles.menuCard}>
          <View style={styles.menuHeaderStrip}>
            <Text style={styles.menuHeaderLabel}>MENU</Text>
            <Text style={styles.menuCaveat}>today&apos;s menu isn&apos;t posted yet — standing menu from umassdining.com</Text>
          </View>
          <Pressable style={styles.menuRow} onPress={() => onOpenPdf(pdf.url, pdf.label)} accessibilityRole="button" accessibilityLabel={`View ${pdf.label}`}>
            <Text style={styles.menuItemName}>{pdf.label}</Text>
            <Text style={styles.menuItemPrice}>›</Text>
          </Pressable>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing(5), paddingTop: spacing(3), gap: spacing(3) },

  title: { fontFamily: fonts.display700, fontSize: fs(20), letterSpacing: 1, textTransform: "uppercase", color: colors.maroon900 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  statusPill: { backgroundColor: colors.gold500, borderRadius: radii.pill, paddingVertical: spacing(0.75), paddingHorizontal: spacing(2.25) },
  statusPillText: { fontFamily: fonts.body600, fontSize: fs(10), letterSpacing: 0.5, color: colors.maroon900 },

  description: { fontFamily: fonts.body400, fontSize: fs(12), lineHeight: fs(18), color: withOpacity(colors.ink900, 70) },

  menuCard: { borderWidth: 1, borderColor: withOpacity(colors.ink900, 12), borderRadius: radii.md, overflow: "hidden" },
  menuHeaderStrip: { backgroundColor: withOpacity(colors.gold500, 12), paddingVertical: spacing(2.25), paddingHorizontal: spacing(3.5), gap: 2 },
  menuHeaderLabel: { fontFamily: fonts.display600, fontSize: fs(11), letterSpacing: 1.2, textTransform: "uppercase", color: colors.maroon900 },
  menuCaveat: { fontFamily: fonts.body400, fontSize: fs(10), color: withOpacity(colors.ink900, 50) },
  menuRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: spacing(2), paddingHorizontal: spacing(3.5) },
  menuItemName: { flex: 1, fontFamily: fonts.body400, fontSize: fs(13), color: colors.ink900 },
  menuItemPrice: { fontFamily: fonts.mono, fontSize: fs(12), fontWeight: "600", color: colors.maroon600 },

  locationRow: {
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

  paymentRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing(2) },
  paymentGlyph: { fontSize: fs(13), color: withOpacity(colors.ink900, 45) },
  paymentText: { flex: 1, fontFamily: fonts.body400, fontSize: fs(11), lineHeight: fs(16), color: withOpacity(colors.ink900, 55) },
});
