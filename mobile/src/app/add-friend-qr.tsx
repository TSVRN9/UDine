import type { Session } from "@supabase/supabase-js";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useFocusEffect } from "expo-router";
import * as Linking from "expo-linking";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";
import { buildQrMatrix, findIncomingQrConfirm, initialsOf, otherUserId, parseQrPayload, redeemErrorMessage, type FriendshipRow } from "../lib/addFriends";
import { supabase } from "../lib/supabase";

const REMINT_INTERVAL_MS = 5 * 60 * 1000;
// The code-owner side has no realtime channel to lean on (friendships isn't in the
// supabase_realtime publication) -- polling while this screen is focused is the cheap, honest
// alternative (see PR body). Frequent enough to feel immediate in person, cheap enough to not
// matter for one screen.
const POLL_INTERVAL_MS = 3000;

const QR_CARD_SIZE = 216;

/** Draws buildQrMatrix's boolean grid as plain Views -- this codebase has declined
 * react-native-svg elsewhere (SocialPane's text-glyph precedent), and a QR code is just a grid. */
function QrCodeView({ data }: { data: string }) {
  const matrix = buildQrMatrix(data);
  const cell = fs(QR_CARD_SIZE) / matrix.length;
  return (
    <View style={{ width: fs(QR_CARD_SIZE), height: fs(QR_CARD_SIZE) }}>
      {matrix.map((row, r) => (
        <View key={r} style={{ flexDirection: "row" }}>
          {row.map((dark, c) => (
            <View key={c} style={{ width: cell, height: cell, backgroundColor: dark ? colors.maroon900 : colors.paper50 }} />
          ))}
        </View>
      ))}
    </View>
  );
}

function SegmentedPill({ tab, onChange }: { tab: "my-code" | "scan"; onChange: (t: "my-code" | "scan") => void }) {
  return (
    <View style={styles.segmentedPill}>
      {(["my-code", "scan"] as const).map((t) => (
        <Pressable key={t} onPress={() => onChange(t)} style={[styles.segment, tab === t && styles.segmentActive]} accessibilityRole="button" accessibilityLabel={t === "my-code" ? "My code" : "Scan"}>
          <Text style={[styles.segmentText, tab === t && styles.segmentTextActive]}>{t === "my-code" ? "MY CODE" : "SCAN"}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function MyCodeTab({ session }: { session: Session }) {
  const [token, setToken] = useState<string | null>(null);
  // #239 (C): mint_qr_token's error used to be silently discarded, leaving a blank white card up
  // for up to 5 minutes with no indication anything went wrong. Surfaced with a retry instead.
  const [mintError, setMintError] = useState(false);
  // #260: this used to fall back to session.user.email?.split("@")[0] -- the same email-local-part
  // guess handle_new_user itself no longer makes server-side. profiles.display_name (readable for
  // self unconditionally, see the "profiles readable by self..." SELECT policy) is the actual
  // source of truth. "you" covers two cases, neither a real fallback: render-before-fetch, and a
  // genuinely absent profiles row (handle_new_user only fires at signup, never sign-in -- a user
  // who ran "Delete server data" has no row to fetch until they sign up again, see
  // deleteServerData.ts's own comment on this exact gap).
  const [displayName, setDisplayName] = useState("you");

  useEffect(() => {
    supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.display_name) setDisplayName(data.display_name);
      });
  }, [session.user.id]);

  const mint = useCallback(async () => {
    const { data, error } = await supabase.rpc("mint_qr_token");
    if (!error && data) {
      setToken(data.token);
      setMintError(false);
    } else {
      setMintError(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      mint();
      const remint = setInterval(mint, REMINT_INTERVAL_MS);

      // #239 ("also worth fixing"): guards against an overlapping tick -- without it, a slow poll
      // response overlapping the next 3s tick could push the qr-confirm screen twice.
      let pollInFlight = false;
      const poll = setInterval(async () => {
        if (pollInFlight) return;
        pollInFlight = true;
        try {
          const myId = session.user.id;
          const { data } = await supabase.from("friendships").select("*").or(`user_a.eq.${myId},user_b.eq.${myId}`);
          const incoming = findIncomingQrConfirm((data ?? []) as FriendshipRow[], myId);
          // #250: findIncomingQrConfirm already filters to status='pending'/origin='qr' rows this
          // side hasn't confirmed yet, so the already-friends case never reaches this branch --
          // alreadyFriends=0 is always correct here, just kept explicit so both of qr-confirm's
          // entry points agree on the same route-param contract.
          if (incoming) router.push(`/qr-confirm?userId=${otherUserId(incoming, myId)}&alreadyFriends=0`);
        } finally {
          pollInFlight = false;
        }
      }, POLL_INTERVAL_MS);

      return () => {
        clearInterval(remint);
        clearInterval(poll);
      };
    }, [mint, session.user.id]),
  );

  return (
    <View style={styles.tabContent}>
      <View style={styles.qrCard}>
        {token ? (
          <QrCodeView data={token} />
        ) : mintError ? (
          <View style={[styles.qrErrorFallback, { width: fs(QR_CARD_SIZE), height: fs(QR_CARD_SIZE) }]}>
            <Text style={styles.qrErrorText}>Couldn&apos;t generate your code.</Text>
            <Pressable style={styles.permissionButton} onPress={mint} accessibilityRole="button" accessibilityLabel="Try again">
              <Text style={styles.permissionButtonText}>TRY AGAIN</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ width: fs(QR_CARD_SIZE), height: fs(QR_CARD_SIZE) }} />
        )}
      </View>
      <View style={styles.identityRow}>
        <View style={styles.identityAvatar}>
          <Text style={styles.identityAvatarText}>{initialsOf(displayName)}</Text>
        </View>
        <View>
          <Text style={styles.identityName}>{displayName}</Text>
          <Text style={styles.identityEmail}>{session.user.email}</Text>
        </View>
      </View>
      <Text style={styles.copy}>Have a friend scan this to add you — you&apos;ll each confirm on your own phone.</Text>
      <Text style={styles.clockLine}>🕐 Code refreshes every 5 minutes — only works face to face.</Text>
      <View style={styles.consentCard}>
        <Text style={styles.consentText}>🔒 This works even with &quot;Findable by search&quot; off — in-person is always allowed, because handing someone your code is the consent.</Text>
      </View>
    </View>
  );
}

function ScanTab() {
  const [permission, requestPermission] = useCameraPermissions();
  const processingRef = useRef(false);

  // #239 (B): a permanent latch (never reset) fixes the re-fire but reintroduces a #278-shaped
  // dead end -- qr-confirm is pushed on top of this screen, not replacing it, so ScanTab only
  // blurs, it doesn't unmount; CANCEL (#236/#247) pops back to this same live screen. Resetting
  // the latch on focus (and re-latching on blur, for a stray frame that lands mid-navigation)
  // means the very next real scan after coming back works, without reopening the re-fire bug --
  // it's still latched for as long as this screen stays focused with a scan in flight.
  useFocusEffect(
    useCallback(() => {
      processingRef.current = false;
      return () => {
        processingRef.current = true;
      };
    }, []),
  );

  async function onScanned(data: string) {
    if (processingRef.current) return;
    const token = parseQrPayload(data);
    if (!token) return;
    processingRef.current = true;
    // #239 (B): the camera fires onBarcodeScanned continuously while a code is in frame (see
    // alertOnce below). processingRef used to reset in a `finally` that ran on the success path
    // too, so the next frame re-fired redeem_qr_token against the row it just created, and
    // ScanTab stays mounted beneath the pushed qr-confirm screen. Only reset it on a path that
    // isn't "successfully navigated away" -- once we've pushed qr-confirm, stay latched.
    const { data: friendship, error } = await supabase.rpc("redeem_qr_token", { scanned_token: token });
    if (error || !friendship) {
      alertOnce(redeemErrorMessage(error));
      processingRef.current = false;
      return;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const myId = session?.user.id;
    if (!myId) {
      processingRef.current = false;
      return;
    }
    // #250: redeem_qr_token signals an on-conflict hand-back of an already-accepted friendship
    // (any origin) via already_friends -- forwarded so qr-confirm.tsx can show that state honestly
    // instead of a doomed ADD/silently-no-op CANCEL.
    const alreadyFriends = friendship.already_friends ? "1" : "0";
    router.push(`/qr-confirm?userId=${otherUserId(friendship, myId)}&alreadyFriends=${alreadyFriends}`);
  }

  if (!permission) return <View style={styles.tabContent} />;
  if (!permission.granted) {
    // #278: once the OS stops prompting (canAskAgain false -- Android after a second denial),
    // requestPermission() resolves denied immediately with no native dialog at all, so the button
    // did nothing, forever. Route to Settings instead, the only way left to grant it.
    const canAskAgain = permission.canAskAgain;
    return (
      <View style={styles.tabContent}>
        <Text style={styles.copy}>Camera access is needed to scan a friend&apos;s code.</Text>
        <Pressable
          style={styles.permissionButton}
          onPress={canAskAgain ? requestPermission : Linking.openSettings}
          accessibilityRole="button"
          accessibilityLabel={canAskAgain ? "Grant camera access" : "Open Settings"}
        >
          <Text style={styles.permissionButtonText}>{canAskAgain ? "ALLOW CAMERA" : "OPEN SETTINGS"}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.scanCameraWrap}>
      <CameraView style={StyleSheet.absoluteFill} barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={(result) => onScanned(result.data)} />
    </View>
  );
}

// The camera fires onBarcodeScanned continuously while a code is in frame -- without this, a
// failed redeem (e.g. an expired code someone's still holding up) would re-alert every frame.
let lastAlert = 0;
function alertOnce(message: string) {
  const now = Date.now();
  if (now - lastAlert < 2000) return;
  lastAlert = now;
  Alert.alert("Couldn't add friend", message);
}

/** #184: dark "Add in person" screen -- MY CODE (own QR, refreshed every 5 min, polls for an
 * incoming scan while focused) / SCAN (camera + expo-camera's built-in QR barcode scanning). */
export default function AddFriendQrScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<"my-code" | "scan">("my-code");
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, []);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing(4.5) }]}>
      <View style={styles.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/add-friends"))} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Add in person</Text>
      </View>

      <SegmentedPill tab={tab} onChange={setTab} />

      {tab === "my-code" ? session ? <MyCodeTab session={session} /> : <View style={styles.tabContent} /> : <ScanTab />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.maroon900, paddingHorizontal: spacing(5), gap: spacing(4.5) },
  header: { flexDirection: "row", alignItems: "center", gap: spacing(3) },
  backChevron: { fontFamily: fonts.body400, fontSize: fs(28), lineHeight: fs(28), color: colors.paper50 },
  headerTitle: { fontFamily: fonts.display700, fontSize: fs(22), letterSpacing: 1, textTransform: "uppercase", color: colors.paper50 },

  segmentedPill: { flexDirection: "row", backgroundColor: withOpacity(colors.paper50, 12), borderRadius: radii.pill, padding: 3 },
  segment: { flex: 1, height: fs(36), alignItems: "center", justifyContent: "center", borderRadius: radii.pill },
  segmentActive: { backgroundColor: colors.gold500 },
  segmentText: { fontFamily: fonts.display600, fontSize: fs(13), letterSpacing: 1, color: withOpacity(colors.paper50, 65) },
  segmentTextActive: { color: colors.maroon900 },

  tabContent: { flex: 1, alignItems: "center", gap: spacing(4.5) },
  qrCard: { backgroundColor: colors.paper50, borderRadius: 10, padding: spacing(5.5) },
  qrErrorFallback: { alignItems: "center", justifyContent: "center", gap: spacing(3) },
  qrErrorText: { fontFamily: fonts.body400, fontSize: fs(13), color: colors.ink900, textAlign: "center" },

  identityRow: { flexDirection: "row", alignItems: "center", gap: spacing(2.5) },
  identityAvatar: { width: fs(40), height: fs(40), borderRadius: radii.pill, backgroundColor: colors.maroon600, borderWidth: 2, borderColor: colors.gold500, alignItems: "center", justifyContent: "center" },
  identityAvatarText: { fontFamily: fonts.display600, fontSize: fs(14), color: colors.paper50 },
  identityName: { fontFamily: fonts.body600, fontSize: fs(15), color: colors.paper50 },
  identityEmail: { fontFamily: fonts.body400, fontSize: fs(12), color: withOpacity(colors.paper50, 60) },

  copy: { fontFamily: fonts.body400, fontSize: fs(13), lineHeight: fs(19.5), color: withOpacity(colors.paper50, 80), textAlign: "center", maxWidth: fs(280) },
  clockLine: { fontFamily: fonts.body400, fontSize: fs(11), color: withOpacity(colors.paper50, 50), textAlign: "center" },

  consentCard: { marginTop: "auto", marginBottom: spacing(4), backgroundColor: withOpacity(colors.paper50, 8), borderWidth: 1, borderColor: withOpacity(colors.paper50, 15), borderRadius: radii.md, padding: spacing(3.5) },
  consentText: { fontFamily: fonts.body400, fontSize: fs(11), lineHeight: fs(16), color: withOpacity(colors.paper50, 70) },

  permissionButton: { height: fs(44), paddingHorizontal: spacing(5), borderRadius: radii.md, backgroundColor: colors.gold500, alignItems: "center", justifyContent: "center" },
  permissionButtonText: { fontFamily: fonts.display600, fontSize: fs(13), letterSpacing: 1, color: colors.maroon900 },
  scanCameraWrap: { flex: 1, borderRadius: radii.md, overflow: "hidden" },
});
