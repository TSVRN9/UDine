import { fetchEvents, type DiningEvent } from "@udine/shared";
import { useCallback, useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OfflineLine } from "../components/OfflineLine";
import { Press } from "../components/Press";
import { Card, EmptyState, SectionHeader } from "../components/ui";
import { colors, fonts, fs, spacing, withOpacity } from "../lib/theme";
import { classifyEventTap, eventDateLine } from "../lib/eventTapTarget";
import { openEventTap } from "../lib/openEventTap";

/**
 * #120 v2.1: DETAILS is gone -- a trailing chevron/external-link glyph (text stand-ins, same call
 * as login.tsx's Google "G": no react-native-svg dependency for one icon) signals where the tap
 * goes instead. Banner events also drop the title row entirely (owner decision: the banner image
 * usually already carries the title art, so a text duplicate underneath was redundant) -- the
 * footer is subtitle + icon only. Banner-less notices keep title+subtitle, just lose DETAILS.
 */
function EventCard({ item }: { item: DiningEvent }) {
  const subtitle = eventDateLine(item.expirationDate);
  const target = classifyEventTap(item);

  return (
    // accessibilityLabel is explicit, not left to the (now title-less on banner cards) children --
    // PR #129 review finding 3: dropping the banner card's title Text also silently dropped its
    // only accessible name, so a screen reader announced just "Through Aug 27, button". Matches
    // halls/[slug].tsx's convention of labeling every Pressable explicitly.
    <Press onPress={() => openEventTap(item)} accessibilityRole="button" accessibilityLabel={item.title}>
      <Card style={styles.eventCard}>
        {/* No title overlay on the image -- live fetchEvents banners are full poster graphics that
            already contain their own title art (the artboard's overlay only worked because its
            placeholder was a plain gradient). */}
        {item.featuredImage ? <Image source={{ uri: item.featuredImage }} style={styles.eventBanner} resizeMode="cover" /> : null}
        <View style={styles.eventRow}>
          {item.featuredImage ? (
            subtitle ? (
              <Text style={styles.eventSubtitle}>{subtitle}</Text>
            ) : null
          ) : (
            <View style={styles.eventInfo}>
              <Text style={styles.eventTitle} numberOfLines={1}>
                {item.isFeatured ? "★ " : ""}
                {item.title}
              </Text>
              {subtitle ? <Text style={styles.eventSubtitle}>{subtitle}</Text> : null}
            </View>
          )}
          {target.kind !== "none" && <Text style={styles.eventIcon}>{target.kind === "link" ? "↗" : "›"}</Text>}
        </View>
      </Card>
    </Press>
  );
}

/**
 * Events pane -- what's left of the old Social pane (#93) once the MVP cut (temporary, see
 * archive/full-features) shelves PING A FRIEND/friends along with ranking/account. EVENTS cards
 * (shared content client) are the pane's whole content now; the friend-avatar gesture overlay,
 * sign-in prompt, and friendships query are gone with it -- see archive/full-features for that
 * code if/when friends comes back.
 */
export function EventsPane() {
  const [events, setEvents] = useState<DiningEvent[] | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  // #181: offline is NOT an error state (owner decision) -- driven by fetchEvents (an
  // auth-independent network call) succeeding or failing, same reachability-proxy choice
  // HomePane/hall-menu make elsewhere in this app (a rejected fetch as the signal, not a true
  // OS-level connectivity check).
  const [offline, setOffline] = useState(false);
  const insets = useSafeAreaInsets();

  const loadEvents = useCallback(() => {
    fetchEvents()
      .then((result) => {
        setEvents(result);
        setEventsError(null);
        setOffline(false);
      })
      .catch((e) => {
        setOffline(true);
        setEventsError(String(e));
      });
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  return (
    <View style={styles.paneWrap}>
      <ScrollView style={styles.paneScroll} contentContainerStyle={[styles.paneContainer, { paddingTop: insets.top + fs(52) + spacing(2.5) }]}>
        {offline ? (
          <View style={styles.offlineRow}>
            <OfflineLine text="offline · showing what's cached" onRetry={loadEvents} />
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionHeader title="Events" />
          {/* #181: offline is not an error state -- a fetchEvents failure now shows via the
              OfflineLine above, not this text. Kept for a theoretical non-offline failure path,
              but every current failure of this fetch sets `offline` too, so this is effectively
              retired rather than deleted outright. */}
          {eventsError && !offline && <Text style={styles.error}>Couldn&apos;t load events: {eventsError}</Text>}
          {!events && !eventsError && <Text style={styles.empty}>Loading events…</Text>}
          {events && events.length === 0 && <EmptyState title="No events" message="No events right now." />}
          {events && events.length > 0 && (
            <View style={styles.eventsList}>
              {events.map((item, i) => (
                <EventCard key={`${item.title}-${i}`} item={item} />
              ))}
            </View>
          )}
        </View>

        {/* #181: evergreen reassurance copy, exact per the canvas spec -- not gated on `offline`,
            it's true regardless of connectivity and the artboard shows it as a standing footer. */}
        <Text style={styles.footerReassurance}>Your log and plate keep working offline — they live on this phone.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  paneWrap: { flex: 1 },
  paneScroll: { flex: 1, backgroundColor: colors.cream100 },
  paneContainer: { paddingHorizontal: spacing(5), paddingBottom: spacing(10) },

  section: { marginTop: spacing(4), gap: spacing(2.5) },
  empty: { color: withOpacity(colors.ink900, 55), fontFamily: fonts.body400, fontSize: fs(13), marginTop: spacing(1) },
  error: { color: "#b00020", fontFamily: fonts.body400, fontSize: fs(13), marginTop: spacing(1) },
  offlineRow: { marginTop: spacing(2) },
  footerReassurance: {
    marginTop: spacing(6),
    fontFamily: fonts.body400,
    fontSize: fs(12),
    color: withOpacity(colors.ink900, 45),
    textAlign: "center",
  },

  eventsList: { gap: spacing(2.5) },
  eventCard: { overflow: "hidden" },
  eventBanner: { width: "100%", height: fs(84), backgroundColor: withOpacity(colors.ink900, 8) },
  // Matches the artboard exactly (10px 14px, not the wider 14px 14px it read as before -- owner
  // feedback: "the space around the caption for events is huge").
  eventRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing(2), paddingVertical: spacing(2.5), paddingHorizontal: spacing(3.5) },
  eventInfo: { flex: 1, gap: 1 },
  eventTitle: { fontFamily: fonts.body600, fontSize: fs(14), color: colors.ink900 },
  eventSubtitle: { fontFamily: fonts.body400, fontSize: fs(12), color: withOpacity(colors.ink900, 65) },
  // Trailing chevron (in-app pamphlet) / external-link glyph (pop-up browser) -- replaces the old
  // DETAILS text label per #120.
  eventIcon: { fontFamily: fonts.body600, fontSize: fs(15), color: colors.maroon600, marginLeft: spacing(1.5) },
});
