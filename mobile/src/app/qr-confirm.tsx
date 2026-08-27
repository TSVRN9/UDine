import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";
import { addButtonLabel, confirmErrorMessage, firstNameOf, initialsOf } from "../lib/addFriends";
import { cancelQrFriendRequest } from "../lib/cancelQrFriendRequest";
import { supabase } from "../lib/supabase";

type Profile = { user_id: string; display_name: string; email: string | null };

/**
 * #184: dark scan-confirm screen. Both the scanner and the code-owner land here (independently --
 * see add-friend-qr.tsx's redeem/poll) once a qr-origin friendship row exists between them; ADD
 * calls confirm_friendship, which only flips the row to accepted once BOTH sides have confirmed --
 * this screen never knows or cares which side of that it currently is.
 */
export default function QrConfirmScreen() {
  const insets = useSafeAreaInsets();
  const { userId, alreadyFriends } = useLocalSearchParams<{ userId: string; alreadyFriends?: string }>();
  // #250: redeem_qr_token's on-conflict hand-back of an already-accepted friendship (any origin)
  // gets flagged by add-friend-qr.tsx via this route param -- ADD/CANCEL are both dead ends against
  // that row (confirm_friendship only accepts an unconfirmed origin='qr' row; cancelQrFriendRequest
  // is deliberately scoped to status='pending'/origin='qr' only), so this renders an honest state
  // instead of offering either.
  const isAlreadyFriends = alreadyFriends === "1";
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    // related_profiles (#227), not a raw .select("...email") -- profiles.email is no longer
    // table-wide SELECT-granted (see 20260825120000_lockdown_profile_search.sql). Scoped to self +
    // an existing friendships row (any status), which this screen's target always has by the time
    // it loads (redeem_qr_token already created the pending row before either side lands here).
    const { data } = await supabase.rpc("related_profiles", { target_ids: [userId] });
    setProfile(data?.[0] ?? null);
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function confirm() {
    if (!userId) return;
    setBusy(true);
    const { error } = await supabase.rpc("confirm_friendship", { other_user_id: userId });
    setBusy(false);
    if (error) {
      Alert.alert("Couldn't add friend", confirmErrorMessage(error));
      return;
    }
    router.replace("/add-friends");
  }

  async function cancel() {
    if (!userId) {
      router.back();
      return;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const myId = session?.user.id;
    if (myId) {
      // #250: this used to discard {error} -- a failed delete looked identical to a successful
      // one (router.back() ran either way). Same "surface {error}, don't proceed on failure"
      // convention as friends.tsx's acceptFriend/requestFriend -- re-tapping CANCEL is a real retry.
      const { error } = await cancelQrFriendRequest(supabase, myId, userId);
      if (error) {
        Alert.alert("Couldn't cancel", "Please try again.");
        return;
      }
    }
    router.back();
  }

  const name = profile?.display_name ?? "them";

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing(4.5), paddingBottom: insets.bottom + spacing(4) }]}>
      <Text style={styles.headerTitle}>{isAlreadyFriends ? "Already friends" : "Add friend?"}</Text>

      <View style={styles.identityBlock}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initialsOf(name)}</Text>
          </View>
          <View style={styles.cornerBadge}>
            <Text style={styles.cornerBadgeGlyph}>▦</Text>
          </View>
        </View>
        <Text style={styles.name}>{name}</Text>
        {profile?.email ? <Text style={styles.email}>{profile.email}</Text> : null}
        {!isAlreadyFriends && (
          <View style={styles.scannedBadgeRow}>
            <Text style={styles.scannedBadgeGlyph}>✓</Text>
            <Text style={styles.scannedBadgeText}>SCANNED IN PERSON · JUST NOW</Text>
          </View>
        )}
      </View>

      {isAlreadyFriends ? (
        <View style={styles.explainerCard}>
          <View style={styles.explainerRow}>
            <Text style={styles.explainerGlyph}>✓</Text>
            <Text style={styles.explainerText}>You&apos;re already friends with {name}.</Text>
          </View>
        </View>
      ) : (
        <View style={styles.explainerCard}>
          <View style={styles.explainerRow}>
            <Text style={styles.explainerGlyph}>◐</Text>
            <Text style={styles.explainerText}>{name} will only see the stats you&apos;ve switched on in Your Data — nothing is shared just by becoming friends.</Text>
          </View>
          <View style={styles.explainerDivider} />
          <View style={styles.explainerRow}>
            <Text style={styles.explainerGlyph}>📍</Text>
            <Text style={styles.explainerText}>Friends can ping you — &quot;come eat with me&quot; — and see your favorite halls if you share them.</Text>
          </View>
        </View>
      )}

      <View style={styles.bottom}>
        {isAlreadyFriends ? (
          <Pressable style={styles.addButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="OK">
            <Text style={styles.addButtonText}>OK</Text>
          </Pressable>
        ) : (
          <>
            <Pressable style={styles.addButton} onPress={confirm} disabled={busy} accessibilityRole="button" accessibilityLabel={addButtonLabel(name)}>
              <Text style={styles.addButtonText}>{addButtonLabel(name)}</Text>
            </Pressable>
            <Pressable onPress={cancel} accessibilityRole="button" accessibilityLabel="Cancel">
              <Text style={styles.cancelText}>CANCEL</Text>
            </Pressable>
            <Text style={styles.footer}>{firstNameOf(name)} gets this same screen on their phone. You&apos;re friends once you both confirm — no request sits in an inbox.</Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.maroon900, paddingHorizontal: spacing(5) },
  headerTitle: { fontFamily: fonts.display700, fontSize: fs(22), letterSpacing: 1, textTransform: "uppercase", color: colors.paper50, textAlign: "center" },

  identityBlock: { alignItems: "center", gap: spacing(2), marginTop: spacing(9) },
  avatarWrap: { position: "relative" },
  avatar: { width: fs(108), height: fs(108), borderRadius: radii.pill, backgroundColor: colors.maroon600, borderWidth: 3, borderColor: colors.gold500, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.display600, fontSize: fs(38), color: colors.paper50 },
  cornerBadge: { position: "absolute", right: -4, bottom: -4, width: fs(36), height: fs(36), borderRadius: radii.pill, backgroundColor: colors.gold500, borderWidth: 3, borderColor: colors.maroon900, alignItems: "center", justifyContent: "center" },
  cornerBadgeGlyph: { fontSize: fs(14), color: colors.maroon900 },
  name: { fontFamily: fonts.display700, fontSize: fs(28), letterSpacing: 0.5, color: colors.paper50 },
  email: { fontFamily: fonts.body400, fontSize: fs(13), color: withOpacity(colors.paper50, 60) },
  scannedBadgeRow: { flexDirection: "row", alignItems: "center", gap: spacing(1.5) },
  scannedBadgeGlyph: { fontSize: fs(12), color: colors.gold500 },
  scannedBadgeText: { fontFamily: fonts.body600, fontSize: fs(12), letterSpacing: 0.5, color: colors.gold500 },

  explainerCard: { marginTop: spacing(6), backgroundColor: withOpacity(colors.paper50, 8), borderWidth: 1, borderColor: withOpacity(colors.paper50, 15), borderRadius: radii.md, padding: spacing(3.5) },
  explainerRow: { flexDirection: "row", gap: spacing(2.5), alignItems: "flex-start" },
  explainerGlyph: { fontSize: fs(12), color: colors.gold500, marginTop: 2 },
  explainerText: { flex: 1, fontFamily: fonts.body400, fontSize: fs(12), lineHeight: fs(18), color: withOpacity(colors.paper50, 75) },
  explainerDivider: { height: 1, backgroundColor: withOpacity(colors.paper50, 12), marginVertical: spacing(3) },

  bottom: { marginTop: "auto", alignItems: "center", gap: spacing(2.5) },
  addButton: { width: "100%", height: fs(52), borderRadius: radii.md, backgroundColor: colors.gold500, alignItems: "center", justifyContent: "center" },
  addButtonText: { fontFamily: fonts.display600, fontSize: fs(16), letterSpacing: 1, textTransform: "uppercase", color: colors.maroon900 },
  cancelText: { fontFamily: fonts.body600, fontSize: fs(12), letterSpacing: 0.5, color: withOpacity(colors.paper50, 50) },
  footer: { fontFamily: fonts.body400, fontSize: fs(11), lineHeight: fs(16.5), color: withOpacity(colors.paper50, 50), textAlign: "center" },
});
