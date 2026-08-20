import { DINING_HALLS, fetchEvents, type DiningEvent } from "@udine/shared";
import type { Session } from "@supabase/supabase-js";
import { Link, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Image,
  Linking,
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
import { PaneHeader } from "../components/PaneHeader";
import { Button, Card, EmptyState, SectionHeader } from "../components/ui";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";
import { signInWithGoogle } from "../lib/auth";
import { supabase } from "../lib/supabase";
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

function otherUserId(f: Friendship, myId: string): string {
  return f.user_a === myId ? f.user_b : f.user_a;
}

function hallName(hallTid: number): string {
  return DINING_HALLS.find((h) => h.tid === hallTid)?.name ?? `Hall ${hallTid}`;
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

function EventCard({ item }: { item: DiningEvent }) {
  const subtitle = item.expirationDate ? `Through ${new Date(item.expirationDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : null;
  return (
    <Pressable onPress={() => Linking.openURL(item.externalLink || item.pdfLink)}>
      <Card style={styles.eventCard}>
        {/* No title overlay on the image -- live fetchEvents banners are full poster graphics that
            already contain their own title art (the artboard's overlay only worked because its
            placeholder was a plain gradient). Title always renders in the row below instead. */}
        {item.featuredImage ? <Image source={{ uri: item.featuredImage }} style={styles.eventBanner} resizeMode="cover" /> : null}
        <View style={styles.eventRow}>
          <View style={styles.eventInfo}>
            <Text style={styles.eventTitle} numberOfLines={1}>
              {item.isFeatured ? "★ " : ""}
              {item.title}
            </Text>
            {subtitle ? <Text style={styles.eventSubtitle}>{subtitle}</Text> : null}
          </View>
          <Text style={styles.eventDetails}>DETAILS</Text>
        </View>
      </Card>
    </Pressable>
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
export function SocialPane({ activeIndex }: { activeIndex: number }) {
  const [session, setSession] = useState<Session | null>(null);
  const [friends, setFriends] = useState<Profile[]>([]);
  const [profilesById, setProfilesById] = useState<Map<string, Profile>>(new Map());
  const [events, setEvents] = useState<DiningEvent[] | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [gesture, setGesture] = useState<PingGestureState>(IDLE_STATE);
  const insets = useSafeAreaInsets();

  // Persistent across re-renders (a HOLD_START dispatch re-renders this component, which would
  // otherwise recreate each avatar's PanResponder mid-gesture and lose any closed-over state) --
  // refs, not component state, are what the gesture handlers themselves read/write.
  const gestureRef = useRef<PingGestureState>(IDLE_STATE);
  const hallRectsRef = useRef<Map<number, Rect>>(new Map());
  const hallRowRefs = useRef<Map<number, View | null>>(new Map());
  const holdTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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
    const { data: friendshipRows } = await supabase.from("friendships").select("user_a, user_b").eq("status", "accepted").or(`user_a.eq.${myId},user_b.eq.${myId}`);
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

  useEffect(() => {
    fetchEvents()
      .then(setEvents)
      .catch((e) => setEventsError(String(e)));
  }, []);

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

  async function sendPing(payload: PingPayload) {
    const myId = session?.user.id;
    if (!myId) return;
    await supabase.from("pings").insert(pingRow(myId, payload));
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
      onPanResponderRelease: () => {
        clearHoldTimer(friendId);
        const payload = buildPingPayload(gestureRef.current);
        dispatch({ type: "RELEASE" });
        if (payload) sendPing(payload);
      },
      onPanResponderTerminate: () => {
        clearHoldTimer(friendId);
        dispatch({ type: "CANCEL" });
      },
    });
  }

  const holdingFriendName = gesture.phase === "holding" ? (profilesById.get(gesture.friendId)?.display_name ?? "them") : "";
  const holdingHallText = gesture.phase === "holding" && gesture.hoverHallTid !== null ? hallName(gesture.hoverHallTid) : null;
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
      <ScrollView style={styles.paneScroll} contentContainerStyle={[styles.paneContainer, { paddingTop: insets.top + spacing(4.5) }]}>
        <PaneHeader title="Social" activeIndex={activeIndex} />

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
            <Card style={styles.pingCard}>
              <View style={styles.avatarRow}>
                {friends.map((f, i) => (
                  <View key={f.user_id} style={styles.avatarSlot} {...panResponderFor(f.user_id).panHandlers}>
                    <Avatar name={f.display_name} index={i} gold={i === 0} />
                    <Text style={styles.avatarName} numberOfLines={1}>
                      {f.display_name}
                    </Text>
                  </View>
                ))}
                <Link href="/friends" asChild>
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
          )}
        </View>

        <View style={styles.section}>
          <SectionHeader title="Events" />
          {eventsError && <Text style={styles.error}>Couldn&apos;t load events: {eventsError}</Text>}
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

  pingCard: { padding: spacing(3.5), gap: spacing(2.5) },
  avatarRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing(3.5) },
  avatarSlot: { width: fs(60), alignItems: "center", gap: spacing(1) },
  avatarCircle: { width: fs(52), height: fs(52), borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
  avatarCircleGold: { borderWidth: 2, borderColor: colors.gold500 },
  avatarInitial: { fontFamily: fonts.display600, fontSize: fs(18), color: colors.paper50 },
  avatarAdd: { backgroundColor: "transparent", borderWidth: 1, borderStyle: "dashed", borderColor: withOpacity(colors.maroon600, 55) },
  avatarAddPlus: { fontFamily: fonts.display600, fontSize: fs(20), color: colors.maroon600 },
  avatarName: { fontFamily: fonts.body400, fontSize: fs(11), color: withOpacity(colors.ink900, 70) },
  pingHint: { fontFamily: fonts.body400, fontSize: fs(12), color: withOpacity(colors.ink900, 55) },

  eventsList: { gap: spacing(2.5) },
  eventCard: { overflow: "hidden" },
  eventBanner: { width: "100%", height: fs(84), backgroundColor: withOpacity(colors.ink900, 8) },
  // Matches the artboard exactly (10px 14px, not the wider 14px 14px it read as before -- owner
  // feedback: "the space around the caption for events is huge").
  eventRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing(2), paddingVertical: spacing(2.5), paddingHorizontal: spacing(3.5) },
  eventInfo: { flex: 1, gap: 1 },
  eventTitle: { fontFamily: fonts.body600, fontSize: fs(14), color: colors.ink900 },
  eventSubtitle: { fontFamily: fonts.body400, fontSize: fs(12), color: withOpacity(colors.ink900, 65) },
  eventDetails: { fontFamily: fonts.body600, fontSize: fs(11), letterSpacing: 0.5, color: colors.maroon600 },

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
