import { DINING_HALLS, fetchEvents, type DiningEvent } from "@udine/shared";
import type { Session } from "@supabase/supabase-js";
import { Link, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useId, useRef, useState } from "react";
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
import { Button, Card, EmptyState } from "../components/ui";
import { PaneHeader } from "../components/PaneHeader";
import { colors, fonts, radii, spacing, withOpacity } from "../lib/theme";
import { signInWithGoogle } from "../lib/auth";
import { supabase } from "../lib/supabase";
import {
  buildPingPayload,
  hallAtPoint,
  IDLE_STATE,
  pickPingMessage,
  pingGestureReducer,
  type PingGestureEvent,
  type PingGestureState,
  type PingPayload,
  type Rect,
} from "../lib/pingGesture";

type Profile = { user_id: string; display_name: string };
type Friendship = { user_a: string; user_b: string };
type IncomingPing = { id: string; sender_id: string; hall_tid: number | null; message: string | null; created_at: string };

function hallName(hallTid: number | null): string {
  return DINING_HALLS.find((h) => h.tid === hallTid)?.name ?? "somewhere";
}

function otherUserId(f: Friendship, myId: string): string {
  return f.user_a === myId ? f.user_b : f.user_a;
}

// Design canvas calls this a "hold" -- long enough to read as deliberate rather than a tap/scroll,
// short enough not to feel laggy. Not the RN default (Pressable's onLongPress is 500ms).
const LONG_PRESS_MS = 350;

function Avatar({ name }: { name: string }) {
  return (
    <View style={styles.avatarCircle}>
      <Text style={styles.avatarInitial}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

/**
 * Social pane's internals (#93 canvas): PING A FRIEND avatar row (+add) with the hold-and-release
 * bubble ping as the centerpiece, incoming pings, and EVENTS cards (shared content client).
 * Concoctions are shelved (#86) -- not built here. Extracted out of app/index.tsx into its own
 * file, same pattern YouPane.tsx used for #92, so PaneShellScreen's diff there stays a mechanical
 * import swap.
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
  const [inbox, setInbox] = useState<IncomingPing[]>([]);
  const [profilesById, setProfilesById] = useState<Map<string, Profile>>(new Map());
  const [events, setEvents] = useState<DiningEvent[] | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [gesture, setGesture] = useState<PingGestureState>(IDLE_STATE);

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

    const { data: fs } = await supabase.from("friendships").select("user_a, user_b").eq("status", "accepted").or(`user_a.eq.${myId},user_b.eq.${myId}`);
    const otherIds = (fs ?? []).map((f) => otherUserId(f, myId));
    if (otherIds.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("user_id, display_name").in("user_id", otherIds);
      setFriends(profs ?? []);
      setProfilesById(new Map((profs ?? []).map((p) => [p.user_id, p])));
    } else {
      setFriends([]);
      setProfilesById(new Map());
    }

    const { data: pings } = await supabase
      .from("pings")
      .select("id, sender_id, hall_tid, message, created_at")
      .eq("receiver_id", myId)
      .order("created_at", { ascending: false });
    setInbox(pings ?? []);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // Same fix FriendsBody's own inbox subscription needed (#90 review round): keyed with useId so
  // this pane's realtime channel and the standalone /friends route's own subscription -- both can
  // be mounted at once -- don't tear down each other's channel on unmount.
  const instanceId = useId();
  useEffect(() => {
    const myId = session?.user.id;
    if (!myId) return;
    const channel = supabase
      .channel(`social-pane-pings-${instanceId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pings", filter: `receiver_id=eq.${myId}` }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, refresh, instanceId]);

  useEffect(() => {
    fetchEvents().then(setEvents).catch((e) => setEventsError(String(e)));
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
    await supabase.from("pings").insert({ sender_id: myId, receiver_id: payload.friendId, hall_tid: payload.hallTid, message: payload.message });
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

  return (
    <ScrollView style={styles.paneScroll} contentContainerStyle={styles.paneContainer}>
      <PaneHeader title="Social" activeIndex={activeIndex} />

      <Text style={styles.sectionTitle}>Ping a friend</Text>
      <View style={styles.thinRule} />
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
          <View style={styles.avatarRow}>
            {friends.map((f) => (
              <View key={f.user_id} style={styles.avatarSlot} {...panResponderFor(f.user_id).panHandlers}>
                <Avatar name={f.display_name} />
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

          <Text style={styles.sectionTitle}>Pings you&apos;ve received</Text>
          <View style={styles.thinRule} />
          {inbox.length === 0 ? (
            <Text style={styles.empty}>No pings yet.</Text>
          ) : (
            inbox.map((p) => (
              <Text key={p.id} style={styles.pingRow}>
                {profilesById.get(p.sender_id)?.display_name ?? "Someone"} wants to eat{p.hall_tid ? ` at ${hallName(p.hall_tid)}` : ""}
                {p.message ? ` — "${p.message}"` : ""}
              </Text>
            ))
          )}
        </>
      )}

      <Text style={styles.sectionTitle}>Events</Text>
      <View style={styles.thinRule} />
      {eventsError && <Text style={styles.error}>Couldn&apos;t load events: {eventsError}</Text>}
      {!events && !eventsError && <Text style={styles.empty}>Loading events…</Text>}
      {events && events.length === 0 && <EmptyState title="No events" message="No events right now." />}
      {events && events.length > 0 && (
        <View style={styles.eventsList}>
          {events.map((item, i) => (
            <Pressable key={`${item.title}-${i}`} onPress={() => Linking.openURL(item.externalLink || item.pdfLink)}>
              <Card style={styles.eventCard}>
                {!!item.featuredImage && <Image source={{ uri: item.featuredImage }} style={styles.eventImage} />}
                <Text style={styles.eventTitle}>
                  {item.isFeatured ? "★ " : ""}
                  {item.title}
                </Text>
              </Card>
            </Pressable>
          ))}
        </View>
      )}

      {gesture.phase === "holding" && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={styles.overlayDim} />
          <View style={styles.bubble}>
            <Text style={styles.bubbleMessage}>
              {gesture.message} {holdingFriendName}?
            </Text>
            {DINING_HALLS.map((hall) => (
              <View
                key={hall.tid}
                ref={(node) => {
                  hallRowRefs.current.set(hall.tid, node);
                }}
                onLayout={() => measureHallRow(hall.tid)}
                style={[styles.hallRow, gesture.hoverHallTid === hall.tid && styles.hallRowActive]}
              >
                <Text style={[styles.hallRowText, gesture.hoverHallTid === hall.tid && styles.hallRowTextActive]}>{hall.name}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  paneScroll: { flex: 1, backgroundColor: colors.cream100 },
  paneContainer: { padding: spacing(4), paddingBottom: spacing(10) },

  sectionTitle: {
    marginTop: spacing(6),
    fontFamily: fonts.display,
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.maroon900,
  },
  thinRule: { marginTop: spacing(1), marginBottom: spacing(3), height: 1, backgroundColor: withOpacity(colors.ink900, 25) },
  empty: { color: withOpacity(colors.ink900, 55), fontFamily: fonts.body, marginTop: spacing(1) },
  error: { color: "#b00020", fontFamily: fonts.body, marginTop: spacing(1) },

  avatarRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing(3) },
  avatarSlot: { width: 64, alignItems: "center", gap: spacing(1) },
  avatarCircle: { width: 56, height: 56, borderRadius: radii.pill, backgroundColor: colors.maroon600, alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontFamily: fonts.display, fontSize: 22, fontWeight: "700", color: colors.paper50 },
  avatarAdd: { backgroundColor: "transparent", borderWidth: 1, borderStyle: "dashed", borderColor: withOpacity(colors.maroon600, 55) },
  avatarAddPlus: { fontFamily: fonts.display, fontSize: 22, fontWeight: "700", color: colors.maroon600 },
  avatarName: { fontFamily: fonts.body, fontSize: 11, color: withOpacity(colors.ink900, 70) },

  pingRow: { fontFamily: fonts.body, fontSize: 14, color: colors.ink900, paddingVertical: spacing(1.5) },

  eventsList: { gap: spacing(2) },
  eventCard: { padding: spacing(3) },
  eventImage: { width: "100%", height: 120, borderRadius: radii.sm, marginBottom: spacing(2), backgroundColor: withOpacity(colors.ink900, 8) },
  eventTitle: { fontSize: 15, fontWeight: "700", fontFamily: fonts.display, color: colors.maroon900 },

  overlayDim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: withOpacity(colors.ink900, 65) },
  bubble: {
    position: "absolute",
    left: spacing(6),
    right: spacing(6),
    top: "30%",
    backgroundColor: colors.paper50,
    borderRadius: radii.md,
    padding: spacing(4),
    gap: spacing(2),
  },
  bubbleMessage: { fontFamily: fonts.display, fontSize: 17, fontWeight: "700", color: colors.maroon900, textAlign: "center", marginBottom: spacing(1) },
  hallRow: { padding: spacing(3), borderRadius: radii.sm, backgroundColor: withOpacity(colors.ink900, 6) },
  hallRowActive: { backgroundColor: colors.gold500 },
  hallRowText: { fontFamily: fonts.body, fontSize: 14, fontWeight: "600", color: colors.ink900, textAlign: "center" },
  hallRowTextActive: { color: colors.maroon900 },
});
