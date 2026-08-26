import { DINING_HALLS, fetchEvents, hallNameFor, type DiningEvent } from "@udine/shared";
import type { Session } from "@supabase/supabase-js";
import { Link, router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { OfflineLine } from "../components/OfflineLine";
import { Press } from "../components/Press";
import { Button, Card, EmptyState, SectionHeader } from "../components/ui";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";
import { signInWithGoogle } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { classifyEventTap, eventDateLine } from "../lib/eventTapTarget";
import { openEventTap } from "../lib/openEventTap";
import { flushQueuedPings, sendOrQueuePing } from "../lib/pingQueue";
import {
  buildPingPayload,
  hallAtPoint,
  IDLE_STATE,
  pickPingMessage,
  pingGestureReducer,
  pingRow,
  type PingGestureEvent,
  type PingGestureState,
  type PingPayload,
  type Rect,
} from "../lib/pingGesture";

type Profile = { user_id: string; display_name: string };
type Friendship = { user_a: string; user_b: string };

// Design canvas calls this a "hold" -- long enough to read as deliberate rather than a tap/scroll,
// short enough not to feel laggy. Not the RN default (Pressable's onLongPress is 500ms).
const LONG_PRESS_MS = 350;

// Cycled per avatar index -- the Social artboard varies each friend's fill so the row doesn't read
// as one flat block of maroon.
const AVATAR_FILLS = [colors.maroon600, colors.maroon900] as const;

// #94: a release that never entered "holding" (the HOLD_START timer didn't fire) and barely moved
// is a tap, not an abandoned drag/scroll attempt -- navigate to that friend's profile. Anything
// that moved further than this before releasing is left alone (does nothing, same as before #94),
// so a scroll gesture that happens to start on an avatar doesn't get misread as "tap -> navigate".
const TAP_MOVE_THRESHOLD = 10;

function otherUserId(f: Friendship, myId: string): string {
  return f.user_a === myId ? f.user_b : f.user_a;
}

// #238: same shape as YouPane.tsx's goToAllLogs -- a plain top-level router.push, not a Link, so
// the pings-inbox row (see the "Ping a Friend" section below) can stay a Press (scale-feedback,
// matches every other free-standing tap target on this pane) instead of nesting a Link/asChild pair.
function goToPingsInbox() {
  router.push("/friends");
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

/** One PING A FRIEND avatar. `gold` marks the first/highlighted slot per the artboard. */
function Avatar({ name, index, gold }: { name: string; index: number; gold: boolean }) {
  return (
    <View style={[styles.avatarCircle, { backgroundColor: AVATAR_FILLS[index % AVATAR_FILLS.length] }, gold && styles.avatarCircleGold]}>
      <Text style={styles.avatarInitial}>{initialsOf(name)}</Text>
    </View>
  );
}

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
 * Social pane's internals (#93 canvas): PING A FRIEND avatar row (+add) with the hold-and-release
 * bubble ping as the centerpiece, and EVENTS cards (shared content client). Concoctions are
 * shelved (#86) -- not built here, per the Social artboard's own note. Extracted out of
 * app/index.tsx into its own file, same pattern YouPane.tsx used for #92, so PaneShellScreen's
 * diff there stays a mechanical import swap.
 *
 * The gesture: RN core PanResponder only (no gesture-handler/reanimated in this app -- see
 * package.json). Each avatar owns a PanResponder that claims the touch on start; a timer started
 * in onPanResponderGrant fires HOLD_START (with a freshly-shuffled message) if the finger hasn't
 * lifted by LONG_PRESS_MS. Once holding, onPanResponderMove compares the finger's page-absolute
 * position (gestureState.moveX/moveY) against each hall row's page-absolute rect (measured via
 * measureInWindow once the overlay lays out) to decide the hovered hall; release sends a ping if
 * hovering one, drag-away cancels. The gesture/message/hit-test logic itself lives in
 * ../lib/pingGesture.ts as pure, red-green-tested functions -- this file is just RN wiring.
 */
export function SocialPane() {
  const [session, setSession] = useState<Session | null>(null);
  const [friends, setFriends] = useState<Profile[]>([]);
  const [profilesById, setProfilesById] = useState<Map<string, Profile>>(new Map());
  const [events, setEvents] = useState<DiningEvent[] | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  // #181: offline is NOT an error state (owner decision) -- driven by fetchEvents (an
  // auth-independent network call that always runs, unlike `refresh`, which no-ops signed-out)
  // succeeding or failing, same reachability-proxy choice HomePane/hall-menu make elsewhere in
  // this PR (a rejected fetch as the signal, not a true OS-level connectivity check).
  const [offline, setOffline] = useState(false);
  const [gesture, setGesture] = useState<PingGestureState>(IDLE_STATE);
  const insets = useSafeAreaInsets();

  // Persistent across re-renders (a HOLD_START dispatch re-renders this component, which would
  // otherwise recreate each avatar's PanResponder mid-gesture and lose any closed-over state) --
  // refs, not component state, are what the gesture handlers themselves read/write.
  const gestureRef = useRef<PingGestureState>(IDLE_STATE);
  const hallRectsRef = useRef<Map<number, Rect>>(new Map());
  const hallRowRefs = useRef<Map<number, View | null>>(new Map());
  const holdTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const offlineRef = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    const myId = session?.user.id;
    if (!myId) return;

    // Named to avoid shadowing the theme's `fs()` type-scale import within this scope.
    const { data: friendshipRows, error } = await supabase.from("friendships").select("user_a, user_b").eq("status", "accepted").or(`user_a.eq.${myId},user_b.eq.${myId}`);
    // #240 finding B: postgrest-js resolves `{data: null, error}` on a network failure, not a
    // throw -- the old code discarded `error` entirely, so any transient failure on focus wiped
    // the friends list (and with it the avatars the offline ping queue depends on) down to
    // "no friends yet". Bail out and keep the last-known list instead, same truthful-UI convention
    // as #158/#165/#167.
    if (error) return;
    const otherIds = (friendshipRows ?? []).map((f) => otherUserId(f, myId));
    if (otherIds.length > 0) {
      // Ordered, not left to whatever order .in() happens to return -- the first avatar gets the
      // gold "highlighted" ring (canvas), so which friend that is must be stable across refreshes.
      const { data: profs } = await supabase.from("profiles").select("user_id, display_name").in("user_id", otherIds).order("display_name", { ascending: true });
      setFriends(profs ?? []);
      setProfilesById(new Map((profs ?? []).map((p) => [p.user_id, p])));
    } else {
      setFriends([]);
      setProfilesById(new Map());
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const loadEvents = useCallback(() => {
    fetchEvents()
      .then((result) => {
        offlineRef.current = false;
        setEvents(result);
        setEventsError(null);
        setOffline(false);
        // #240 finding A: this used to gate on `wasOffline` (only flush if THIS session had
        // actually flipped offline before), so a queue persisted from a previous app run just sat
        // there -- offlineRef always starts false on a fresh launch, so the ordinary case (mount,
        // fetchEvents succeeds first try) never flushed at all, no matter how much was queued from
        // last time. Flush unconditionally on every successful load instead: flushQueuedPings is a
        // cheap local no-op when the queue's empty (see its own early return), so calling it here
        // on every success -- not just the first, not just a reconnect -- costs nothing extra and
        // guarantees a persisted queue is picked up on the very next successful load, restart or
        // not. Fire-and-forget -- a failed flush just leaves those pings queued for the next
        // successful load, same as everything else in this file that touches SQLite off the render
        // path.
        flushQueuedPings(supabase).catch(() => {});
      })
      .catch((e) => {
        offlineRef.current = true;
        setOffline(true);
        setEventsError(String(e));
      });
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  function retry() {
    loadEvents();
    refresh();
  }

  async function handleSignIn() {
    try {
      await signInWithGoogle();
    } catch (err) {
      Alert.alert("Sign-in failed", err instanceof Error ? err.message : String(err));
    }
  }

  function dispatch(event: PingGestureEvent) {
    const next = pingGestureReducer(gestureRef.current, event);
    gestureRef.current = next;
    setGesture(next);
  }

  /**
   * #181 review finding 1: this used to gate on the `offline` state var, which is set only by
   * `loadEvents` (mount + RETRY) -- the ordinary case (app open, network drops mid-session, user
   * sends a ping) never touches loadEvents at all, so `offline` was still false, the ping went to
   * `sendPingGuarded`, got a network-shaped failure, and was DISCARDED with the misleading "not
   * friends" alert. Fixed: always attempt the real send via pingQueue.ts's sendOrQueuePing (pure,
   * RN-free, unit-tested directly), then react to the *actual* outcome -- same "fetch-rejected is
   * the signal" philosophy as everywhere else in this PR, just driven by this call's own failure
   * instead of a one-shot mount fetch. This wrapper is intentionally thin RN wiring only, same
   * split pingGesture.ts's own doc comment argues for.
   */
  async function sendPing(payload: PingPayload) {
    const myId = session?.user.id;
    if (!myId) return;
    const outcome = await sendOrQueuePing(supabase, pingRow(myId, payload));
    if (outcome === "sent") {
      if (offlineRef.current) {
        offlineRef.current = false;
        setOffline(false);
        flushQueuedPings(supabase).catch(() => {});
      }
    } else if (outcome === "queued") {
      offlineRef.current = true;
      setOffline(true);
    } else {
      Alert.alert("Couldn't send ping", "You may not be friends with this person (yet).");
    }
  }

  function clearHoldTimer(friendId: string) {
    const timer = holdTimers.current.get(friendId);
    if (timer) {
      clearTimeout(timer);
      holdTimers.current.delete(friendId);
    }
  }

  function measureHallRow(hallTid: number) {
    hallRowRefs.current.get(hallTid)?.measureInWindow((x, y, width, height) => {
      hallRectsRef.current.set(hallTid, { x, y, width, height });
    });
  }

  // ponytail: claims the responder on touch-start unconditionally, so a scroll gesture starting
  // exactly on an avatar is swallowed rather than handed to the outer ScrollView. Acceptable here
  // -- the avatar row itself doesn't scroll and is a small tap-target area -- revisit with a
  // movement-distance threshold in onStartShouldSetPanResponder if that turns out to bite in
  // practice on-device.
  function panResponderFor(friendId: string) {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        clearHoldTimer(friendId);
        const timer = setTimeout(() => {
          holdTimers.current.delete(friendId);
          dispatch({ type: "HOLD_START", friendId, message: pickPingMessage() });
        }, LONG_PRESS_MS);
        holdTimers.current.set(friendId, timer);
      },
      onPanResponderMove: (_e: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        if (gestureRef.current.phase !== "holding") return;
        const rects = Array.from(hallRectsRef.current.entries()).map(([hallTid, rect]) => ({ hallTid, rect }));
        dispatch({ type: "HOVER", hallTid: hallAtPoint({ x: gestureState.moveX, y: gestureState.moveY }, rects) });
      },
      onPanResponderRelease: (_e: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        clearHoldTimer(friendId);
        const wasHolding = gestureRef.current.phase === "holding";
        const payload = buildPingPayload(gestureRef.current);
        dispatch({ type: "RELEASE" });
        if (payload) {
          // #181 review finding 9: sendPing now has a throwing path (a locked/full-disk SQLite
          // write inside enqueuePing) it didn't before -- a bare fire-and-forget call here would
          // be an unhandled rejection AND silently lose the ping. Surface it instead.
          sendPing(payload).catch((err) => {
            Alert.alert("Couldn't send ping", err instanceof Error ? err.message : String(err));
          });
        } else if (!wasHolding && Math.abs(gestureState.dx) < TAP_MOVE_THRESHOLD && Math.abs(gestureState.dy) < TAP_MOVE_THRESHOLD) {
          // #94: tap (not hold-and-release) an avatar -> that friend's shared-stats profile.
          router.push(`/friend/${friendId}`);
        }
      },
      onPanResponderTerminate: () => {
        clearHoldTimer(friendId);
        dispatch({ type: "CANCEL" });
      },
    });
  }

  const holdingFriendName = gesture.phase === "holding" ? (profilesById.get(gesture.friendId)?.display_name ?? "them") : "";
  const holdingHallText = gesture.phase === "holding" && gesture.hoverHallTid !== null ? hallNameFor(gesture.hoverHallTid) : null;
  // The bottom hint composes the shuffled message + hall name into a sentence ("Let's go to
  // Berkshire", per the artboard's own example) -- the messages themselves end in an ellipsis to
  // read naturally as a standalone bubble line, which would otherwise leave a stray "…" mid-sentence.
  const messageStem = gesture.phase === "holding" ? gesture.message.replace(/…$/, "").trim() : "";

  return (
    // A plain View, not the ScrollView itself, is the overlay's containing block -- the
    // ScrollView's contentContainerStyle grows with the events list, so absoluteFill/percentage
    // positioning inside *it* would resolve against total scrollable content height, not the
    // pane's actual on-screen box, and could push the hall rows below the visible area (and out
    // of reach of hallAtPoint's page-coordinate hit test) once there's enough content to scroll.
    <View style={styles.paneWrap}>
      <ScrollView style={styles.paneScroll} contentContainerStyle={[styles.paneContainer, { paddingTop: insets.top + fs(52) }]}>
        {offline ? (
          <View style={styles.offlineRow}>
            <OfflineLine text="offline · pings will send when you're back" onRetry={retry} />
          </View>
        ) : null}


        <View style={styles.section}>
          <SectionHeader title="Ping a Friend" />
          {!session ? (
            <EmptyState
              title="Sign in required"
              message="Sign in to add friends and hold-and-release a ping."
              action={
                <Button variant="primary" onPress={handleSignIn}>
                  Sign in with Google
                </Button>
              }
            />
          ) : (
            <>
              <Card style={[styles.pingCard, offline && styles.pingCardOffline]}>
                <View style={styles.avatarRow}>
                  {friends.map((f, i) => (
                    <View key={f.user_id} style={styles.avatarSlot} {...panResponderFor(f.user_id).panHandlers}>
                      <Avatar name={f.display_name} index={i} gold={i === 0} />
                      <Text style={styles.avatarName} numberOfLines={1}>
                        {f.display_name}
                      </Text>
                    </View>
                  ))}
                  <Link href="/add-friends" asChild>
                    <Pressable style={styles.avatarSlot}>
                      <View style={[styles.avatarCircle, styles.avatarAdd]}>
                        <Text style={styles.avatarAddPlus}>+</Text>
                      </View>
                      <Text style={styles.avatarName}>Add</Text>
                    </Pressable>
                  </Link>
                </View>
                <Text style={styles.pingHint}>Hold a friend, then release on a dining hall to ping them.</Text>
              </Card>
              {/* #238: the ONLY route to received pings/friend requests (friends.tsx's inbox + its
                  realtime subscription) used to live behind a link on add-friends.tsx -- a screen
                  about a different task, and one PR away from being dropped again in a rebase (see
                  that file's own comment on this history). Anchored here instead, on the Social
                  pane itself rather than a sub-screen, so a future pane rebuild has to actively
                  delete this row rather than just fail to carry a link forward. After the Card, not
                  the header's `right` slot -- SectionHeader's right slot renders before the avatar
                  row in the tree, and any Pressable there ends up as a View with the same
                  onResponderGrant/onResponderRelease props PanResponder puts on each avatar slot
                  (both ultimately go through RN's core responder system), which shifts what
                  `avatarViews[0]` resolves to in the gesture tests below. */}
              <Press style={styles.pingsInboxLink} onPress={goToPingsInbox} accessibilityRole="button" accessibilityLabel="Pings you've received">
                <Text style={styles.pingsInboxText}>Pings you&apos;ve received</Text>
                <Text style={styles.pingsInboxChevron}>›</Text>
              </Press>
            </>
          )}
        </View>

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
        <Text style={styles.footerReassurance}>Your log, plate, and rankings all keep working offline — they live on this phone.</Text>
      </ScrollView>

      {gesture.phase === "holding" && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={styles.overlayDim} />
          <View style={styles.heldAvatarWrap}>
            <View style={styles.heldAvatarGlow}>
              <View style={styles.heldAvatarCircle}>
                <Text style={styles.heldAvatarInitial}>{initialsOf(holdingFriendName)}</Text>
              </View>
            </View>
            <View style={styles.bubble}>
              <View style={styles.bubbleTail} />
              <Text style={styles.bubbleMessage}>{gesture.message}</Text>
            </View>
          </View>
          <View style={styles.hallRowsWrap}>
            {DINING_HALLS.map((hall) => {
              const active = gesture.hoverHallTid === hall.tid;
              return (
                <View
                  key={hall.tid}
                  ref={(node) => {
                    hallRowRefs.current.set(hall.tid, node);
                  }}
                  onLayout={() => measureHallRow(hall.tid)}
                  style={[styles.hallRow, active && styles.hallRowActive]}
                >
                  <View style={[styles.hallRowMonogram, active && styles.hallRowMonogramActive]}>
                    <Text style={[styles.hallRowMonogramText, active && styles.hallRowMonogramTextActive]}>{hall.name.charAt(0)}</Text>
                  </View>
                  <Text style={[styles.hallRowText, active && styles.hallRowTextActive]}>{hall.name}</Text>
                  {active && <Text style={styles.hallRowReleaseHint}>release here</Text>}
                </View>
              );
            })}
          </View>
          <Text style={styles.bottomHint}>
            {holdingHallText ? (
              <>
                Sends <Text style={styles.bottomHintStrong}>&quot;{messageStem} {holdingHallText}&quot;</Text> to {holdingFriendName} · drag away to cancel
              </>
            ) : (
              `Hold and drag onto a hall to ping ${holdingFriendName} · release to cancel`
            )}
          </Text>
        </View>
      )}
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

  pingCard: { padding: spacing(3.5), gap: spacing(2.5) },
  pingCardOffline: { opacity: 0.55 },
  avatarRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing(3.5) },
  avatarSlot: { width: fs(60), alignItems: "center", gap: spacing(1) },
  avatarCircle: { width: fs(52), height: fs(52), borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  avatarCircleGold: { borderWidth: 2, borderColor: colors.gold500 },
  avatarInitial: { fontFamily: fonts.display600, fontSize: fs(18), color: colors.paper50 },
  avatarAdd: { backgroundColor: "transparent", borderWidth: 1, borderStyle: "dashed", borderColor: withOpacity(colors.maroon600, 55) },
  avatarAddPlus: { fontFamily: fonts.display600, fontSize: fs(20), color: colors.maroon600 },
  avatarName: { fontFamily: fonts.body400, fontSize: fs(11), color: withOpacity(colors.ink900, 70) },
  pingHint: { fontFamily: fonts.body400, fontSize: fs(12), color: withOpacity(colors.ink900, 55) },
  // #238: pings-inbox entry row below the ping card -- same link-row treatment as YouPane's ALL LOGS.
  pingsInboxLink: { flexDirection: "row", alignItems: "center", gap: spacing(1), alignSelf: "center", marginTop: spacing(2.5) },
  pingsInboxText: { fontFamily: fonts.body600, fontSize: fs(12), color: colors.maroon600 },
  pingsInboxChevron: { fontFamily: fonts.body400, fontSize: fs(13), color: colors.maroon600 },

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

  overlayDim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: withOpacity(colors.ink900, 62) },

  // Held-friend avatar + speech bubble, stacked as one column (PingBubble artboard) -- absolutely
  // positioned as a unit near the top of the overlay, not the ScrollView's growing content.
  heldAvatarWrap: { position: "absolute", top: "10%", left: spacing(9), right: spacing(9), alignItems: "center", gap: spacing(3.5) },
  heldAvatarGlow: { borderRadius: radii.pill, padding: spacing(2.5), backgroundColor: withOpacity(colors.gold500, 18) },
  heldAvatarCircle: {
    width: fs(72),
    height: fs(72),
    borderRadius: radii.pill,
    backgroundColor: colors.maroon600,
    borderWidth: 3,
    borderColor: colors.gold500,
    alignItems: "center",
    justifyContent: "center",
  },
  heldAvatarInitial: { fontFamily: fonts.display600, fontSize: fs(24), color: colors.paper50 },
  bubble: {
    position: "relative",
    backgroundColor: colors.paper50,
    borderRadius: 14,
    paddingVertical: spacing(3.5),
    paddingHorizontal: spacing(5),
    alignItems: "center",
  },
  bubbleTail: {
    position: "absolute",
    top: -8,
    left: "50%",
    marginLeft: -8,
    width: 16,
    height: 16,
    backgroundColor: colors.paper50,
    transform: [{ rotate: "45deg" }],
  },
  bubbleMessage: { fontFamily: fonts.body600, fontSize: fs(18), color: colors.maroon900, textAlign: "center" },

  hallRowsWrap: { position: "absolute", top: "45%", left: spacing(5), right: spacing(5), gap: spacing(2.5) },
  hallRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    backgroundColor: withOpacity(colors.paper50, 92),
    borderRadius: radii.pill,
    paddingVertical: spacing(1.5),
    paddingHorizontal: spacing(1.5),
    minHeight: fs(56),
  },
  hallRowActive: { backgroundColor: colors.gold500, justifyContent: "space-between" },
  hallRowMonogram: { width: fs(44), height: fs(44), borderRadius: radii.pill, backgroundColor: withOpacity(colors.maroon600, 12), alignItems: "center", justifyContent: "center" },
  hallRowMonogramActive: { backgroundColor: colors.maroon900 },
  hallRowMonogramText: { fontFamily: fonts.display700, fontSize: fs(18), color: colors.maroon600 },
  hallRowMonogramTextActive: { color: colors.gold500 },
  hallRowText: { fontFamily: fonts.body600, fontSize: fs(15), color: colors.maroon900 },
  hallRowTextActive: { color: colors.maroon900 },
  hallRowReleaseHint: { fontFamily: fonts.body600, fontSize: fs(11), letterSpacing: 0.5, textTransform: "uppercase", color: colors.maroon900, marginRight: spacing(2) },

  bottomHint: { position: "absolute", bottom: spacing(20), left: spacing(5), right: spacing(5), textAlign: "center", fontFamily: fonts.body400, fontSize: fs(13), color: withOpacity(colors.paper50, 90) },
  bottomHintStrong: { fontFamily: fonts.body600, color: colors.gold500 },
});
