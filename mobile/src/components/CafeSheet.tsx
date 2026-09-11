import { htmlToText, openStatus, type RetailLocationHours } from "@udine/shared";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { cafeStatusPillText, directionsUrl } from "../lib/cafeMenu";
import { isRealAddressLine } from "../lib/address";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";

interface Props {
  loc: RetailLocationHours;
  now: Date;
  /** Set when the standing-menu parse found a PDF link rather than an item list (babyBerk,
   * Commonwealth). Null for a café with no standing menu at all. */
  pdf: { url: string; label: string } | null;
  /** Opens the in-app PDF viewer (CafePdfViewer), never an external browser. */
  onOpenPdf: (url: string, label: string) => void;
  /** Routes into the same add-item/custom-food flow PlateSheet's search footer uses. */
  onOpenCustomFoodForm: (prefillName?: string) => void;
}

/**
 * Café info-only content -- hours/status/description/address/payment, plus the PDF-menu
 * affordance when the waterfall found one. Mounted inline inside halls/[slug].tsx's
 * HallMenuScreenBody as one of that screen's internal states, never a separate Modal/route.
 *
 * description/address are raw third-party HTML off get_infov2, rendered via htmlToText, never
 * {@html}-style raw markup.
 */
export function CafeSheet({ loc, now, pdf, onOpenPdf, onOpenCustomFoodForm }: Props) {
  const status = openStatus({ hallTid: -1, breakfast: null, lunch: null, dinner: null, latenight: null, general: loc.hours }, now);
  const description = htmlToText(loc.description);
  // isRealAddressLine (not filter(Boolean)) rejects lines that are just punctuation -- a
  // degenerate address blob can htmlToText down to a lone ",".
  const addressLines = htmlToText(loc.address).split("\n").filter(isRealAddressLine);
  const mapsUrl = directionsUrl(loc.mapAddress);
  const payments = loc.acceptedPayment
    ? loc.acceptedPayment
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
    : [];

  return (
    <View style={styles.container}>
      {/* No internal title -- HallMenuScreenBody's own header already renders the café name. */}
      <View style={styles.statusRow}>
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>{cafeStatusPillText(status)}</Text>
        </View>
      </View>

      {/* Matches CafeMenuInfoOnly.dc.html:27-43. Only shown when there's nothing else to browse --
      a PDF already gives a way into the menu via the menuCard below. */}
      {!pdf ? (
        <>
          <Pressable
            style={styles.logCta}
            onPress={() => onOpenCustomFoodForm(undefined)}
            accessibilityRole="button"
            accessibilityLabel="Log what you got here"
          >
            <View style={styles.logCtaText}>
              <Text style={styles.logCtaHeadline}>Log What You Got Here</Text>
              <Text style={styles.logCtaSubtext}>No menu posted for {loc.name} today</Text>
            </View>
            <Text style={styles.logCtaChevron}>›</Text>
          </Pressable>

          <View style={styles.hoursBox}>
            <View style={styles.hoursBoxLeft}>
              <Text style={styles.hoursBoxLabel}>Today</Text>
              <View style={styles.hoursStatusPill}>
                <Text style={styles.hoursStatusPillText}>{cafeStatusPillText(status)}</Text>
              </View>
            </View>
            <Text style={styles.hoursBoxRange}>{loc.hours ? `${loc.hours.openTime} – ${loc.hours.closeTime}` : "Closed"}</Text>
          </View>
        </>
      ) : null}

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
  // CafeSheet.dc.html panel spec: box-shadow: 0 -8px 24px rgba(36,26,20,0.25).
  container: {
    paddingHorizontal: spacing(5),
    paddingTop: spacing(3),
    gap: spacing(3),
    shadowColor: colors.ink900,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
  },

  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  statusPill: { backgroundColor: colors.gold500, borderRadius: radii.pill, paddingVertical: spacing(0.75), paddingHorizontal: spacing(2.25) },
  statusPillText: { fontFamily: fonts.body600, fontSize: fs(10), letterSpacing: 0.5, color: colors.maroon900 },

  // CafeMenuInfoOnly.dc.html:19-24 CTA card.
  logCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing(2.5),
    backgroundColor: colors.maroon900,
    borderRadius: 8,
    paddingVertical: spacing(3.5),
    paddingHorizontal: spacing(4),
  },
  logCtaText: { gap: 2 },
  logCtaHeadline: { fontFamily: fonts.display600, fontSize: fs(13), letterSpacing: 0.6, textTransform: "uppercase", color: colors.paper50 },
  logCtaSubtext: { fontFamily: fonts.body400, fontSize: fs(11), color: withOpacity(colors.paper50, 60) },
  logCtaChevron: { fontFamily: fonts.body600, fontSize: fs(16), fontWeight: "600", color: colors.gold500 },

  // CafeMenuInfoOnly.dc.html:26-33 boxed hours row, distinct from the plain status pill above.
  hoursBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: withOpacity(colors.gold500, 12),
    borderWidth: 1,
    borderColor: withOpacity(colors.ink900, 12),
    borderRadius: radii.md,
    paddingVertical: spacing(2.25),
    paddingHorizontal: spacing(3.5),
  },
  hoursBoxLeft: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  hoursBoxLabel: { fontFamily: fonts.body600, fontSize: fs(13), color: colors.maroon900 },
  hoursBoxRange: { fontFamily: fonts.mono, fontSize: fs(12), fontWeight: "600", color: colors.maroon900 },
  // CafeMenuInfoOnly.dc.html:39's pill is smaller/bolder than the top statusPill.
  hoursStatusPill: { backgroundColor: colors.gold500, borderRadius: radii.pill, paddingVertical: spacing(0.5), paddingHorizontal: spacing(1.75) },
  hoursStatusPillText: { fontFamily: fonts.body600, fontWeight: "700", fontSize: fs(9), letterSpacing: 0.8, color: colors.maroon900 },

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
    minHeight: fs(44), // 44px touch-target convention, matches index.tsx's retailRow
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
