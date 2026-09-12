import { fetchEvents, fetchNewsletter, fetchPressReleases, type DiningEvent, type NewsletterIssue, type PressRelease } from "@udine/shared";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, Linking, StyleSheet, Text, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OfflineLine } from "../components/OfflineLine";
import { Press } from "../components/Press";
import { Card, EmptyState, SectionHeader } from "../components/ui";
import { colors, fonts, fs, spacing, withOpacity } from "../lib/theme";
import { classifyEventTap, eventDateLine } from "../lib/eventTapTarget";
import { openEventTap } from "../lib/openEventTap";

// "A handful" -- SEE ALL (-> /press, /newsletter) is the full list.
const PRESS_LIMIT = 3;
const NEWSLETTER_LIMIT = 3;

function goToPress() {
  router.push("/press");
}
function goToNewsletter() {
  router.push("/newsletter");
}

/**
 * A trailing chevron/external-link glyph (text stand-in, no react-native-svg dependency for one
 * icon) signals where the tap goes. Banner events drop the title row entirely -- the banner image
 * already carries the title art -- so the footer is subtitle + icon only. Banner-less notices keep
 * title+subtitle.
 */
function EventCard({ item }: { item: DiningEvent }) {
  const subtitle = eventDateLine(item.expirationDate);
  const target = classifyEventTap(item);

  return (
    // accessibilityLabel is explicit, not left to the (now title-less on banner cards) children --
    // dropping the banner card's title Text also drops its only accessible name.
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

/** The SectionHeader `right` slot link -- same "TITLE ›" pattern YouPane.tsx's ALL LOGS uses,
 * reused here for both sections instead of duplicating the JSX inline twice. */
function SeeAllLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Press style={styles.seeAllLink} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={styles.seeAllText}>SEE ALL</Text>
      <Text style={styles.seeAllChevron}>›</Text>
    </Press>
  );
}

// Same Linking.openURL pattern press.tsx/newsletter.tsx already use for their own full-list rows
// -- these are external content links, not in-app screens, so there's nothing to router.push to.
function PressReleaseRow({ item }: { item: PressRelease }) {
  return (
    <Press onPress={() => Linking.openURL(item.url)} accessibilityRole="link" accessibilityLabel={item.title}>
      <Card style={styles.contentRow}>
        <Text style={styles.contentTitle}>{item.title}</Text>
        <Text style={styles.contentDate}>{item.date}</Text>
      </Card>
    </Press>
  );
}

function NewsletterRow({ item }: { item: NewsletterIssue }) {
  return (
    <Press onPress={() => Linking.openURL(item.link)} accessibilityRole="link" accessibilityLabel={item.period}>
      <Card style={styles.contentRow}>
        <Text style={styles.contentTitle}>{item.period}</Text>
      </Card>
    </Press>
  );
}

/**
 * Events pane -- what's left of the old Social pane once the MVP cut shelves PING A FRIEND/friends
 * along with ranking/account. EVENTS cards (shared content client) are the pane's whole content
 * now; the friend-avatar gesture overlay, sign-in prompt, and friendships query are gone with it.
 */
export function EventsPane() {
  const [events, setEvents] = useState<DiningEvent[] | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  // offline is not an error state -- driven by whether fetchEvents succeeds or fails, a rejected
  // fetch as the reachability signal rather than a true OS-level connectivity check.
  const [offline, setOffline] = useState(false);
  const [pressItems, setPressItems] = useState<PressRelease[] | null>(null);
  const [newsletterIssues, setNewsletterIssues] = useState<NewsletterIssue[] | null>(null);
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

  // A failure here degrades to the empty-list render (no second error line -- `offline` already
  // owns this pane's offline banner), but the empty state copy below must tell "genuinely nothing
  // published" apart from "couldn't reach the network", since the same outage that flips `offline`
  // also fails these two fetches.
  useEffect(() => {
    fetchPressReleases()
      .then(setPressItems)
      .catch(() => setPressItems([]));
    fetchNewsletter()
      .then(setNewsletterIssues)
      .catch(() => setNewsletterIssues([]));
  }, []);

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
          {/* offline is not an error state -- a fetchEvents failure shows via OfflineLine above,
              not this text. Kept for a theoretical non-offline failure path. */}
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

        <View style={styles.section}>
          <SectionHeader title="Press" right={<SeeAllLink label="See all press releases" onPress={goToPress} />} />
          {pressItems === null ? (
            <Text style={styles.empty}>Loading…</Text>
          ) : pressItems.length === 0 ? (
            offline ? (
              <EmptyState title="Can't load right now" message="You're offline — press releases will show once you're back online." />
            ) : (
              <EmptyState title="No press releases" message="No press releases right now." />
            )
          ) : (
            <View style={styles.contentList}>
              {pressItems.slice(0, PRESS_LIMIT).map((item, i) => (
                <PressReleaseRow key={`${item.url}-${i}`} item={item} />
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader title="Newsletter" right={<SeeAllLink label="See all newsletter issues" onPress={goToNewsletter} />} />
          {newsletterIssues === null ? (
            <Text style={styles.empty}>Loading…</Text>
          ) : newsletterIssues.length === 0 ? (
            offline ? (
              <EmptyState title="Can't load right now" message="You're offline — newsletter issues will show once you're back online." />
            ) : (
              <EmptyState title="No newsletter issues" message="No newsletter issues right now." />
            )
          ) : (
            <View style={styles.contentList}>
              {newsletterIssues.slice(0, NEWSLETTER_LIMIT).map((item, i) => (
                <NewsletterRow key={`${item.link}-${i}`} item={item} />
              ))}
            </View>
          )}
        </View>

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
  eventsList: { gap: spacing(2.5) },
  eventCard: { overflow: "hidden" },
  eventBanner: { width: "100%", aspectRatio: 1024 / 432, backgroundColor: withOpacity(colors.ink900, 8) },
  // Matches the artboard exactly: 10px 14px.
  eventRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing(2), paddingVertical: spacing(2.5), paddingHorizontal: spacing(3.5) },
  eventInfo: { flex: 1, gap: 1 },
  eventTitle: { fontFamily: fonts.body600, fontSize: fs(14), color: colors.ink900 },
  eventSubtitle: { fontFamily: fonts.body400, fontSize: fs(12), color: withOpacity(colors.ink900, 65) },
  // Trailing chevron (in-app pamphlet) / external-link glyph (pop-up browser).
  eventIcon: { fontFamily: fonts.body600, fontSize: fs(15), color: colors.maroon600, marginLeft: spacing(1.5) },

  // SEE ALL link -- same pattern as YouPane.tsx's ALL LOGS, in the SectionHeader `right` slot.
  seeAllLink: { flexDirection: "row", alignItems: "center", gap: spacing(1) },
  seeAllText: { fontFamily: fonts.body600, fontSize: fs(11), letterSpacing: 0.5, color: colors.maroon600 },
  seeAllChevron: { fontFamily: fonts.body400, fontSize: fs(12), color: colors.maroon600 },

  contentList: { gap: spacing(2) },
  contentRow: { paddingVertical: spacing(2.5), paddingHorizontal: spacing(3.5), gap: 1 },
  contentTitle: { fontFamily: fonts.body600, fontSize: fs(13), color: colors.ink900 },
  contentDate: { fontFamily: fonts.mono, fontSize: fs(11), color: withOpacity(colors.ink900, 55) },
});
