import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { signInWithGoogle } from "../lib/auth";
import { dismissFirstRun } from "../lib/firstRun";
import { colors, fonts, radii, spacing, withOpacity } from "../lib/theme";

/**
 * First-launch screen (#96, canvas: "Login / first launch"). Pushed once over the pane shell on a
 * fresh install (see index.tsx); both paths dismiss the device-local first-run flag and pop back —
 * the anonymous path is a first-class exit, not a dodge, per the anonymous-first requirement.
 */
export default function LoginScreen() {
  const [busy, setBusy] = useState(false);

  async function done() {
    await dismissFirstRun();
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  async function handleSignIn() {
    setBusy(true);
    try {
      await signInWithGoogle();
      await done();
    } catch (err) {
      Alert.alert("Sign-in failed", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <LinearGradient colors={["#3b0a0f", "#2c0a08"]} start={{ x: 0.4, y: 0 }} end={{ x: 0.6, y: 1 }} style={styles.screen}>
      <Text style={styles.watermark}>U</Text>

      <View style={styles.top}>
        <View>
          <Text style={styles.brand}>UDINE</Text>
          <View style={styles.goldBar} />
        </View>
        <Text style={styles.pitch}>
          Every dish at every dining common, with the full nutrition label. Log what you eat. Rank what you love.
        </Text>
        <Text style={styles.privacy}>
          What you eat never leaves this phone — and you can export your history any time.
        </Text>
      </View>

      <View style={styles.bottom}>
        <Pressable style={styles.googleButton} onPress={handleSignIn} disabled={busy} accessibilityRole="button">
          {/* Text-glyph stand-in for the Google "G" — no react-native-svg/image asset dependency. */}
          <View style={styles.googleGlyphCircle}>
            <Text style={styles.googleGlyph}>G</Text>
          </View>
          <Text style={styles.googleButtonText}>Continue with Google</Text>
        </Pressable>
        <Text style={styles.caption}>
          UMass accounts only — signing in adds friends, pings, cross-device favorites and dish alerts. Nothing else.
        </Text>

        <Pressable style={styles.skipButton} onPress={done} accessibilityRole="button">
          <Text style={styles.skipButtonText}>Skip — use without an account</Text>
        </Pressable>
        <Text style={styles.caption}>Menus, logging, macros and rankings all work signed out.</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "space-between" },
  watermark: {
    position: "absolute",
    right: -60,
    top: 40,
    fontFamily: fonts.display700,
    fontSize: 360,
    lineHeight: 360,
    color: withOpacity(colors.paper50, 4),
  },
  top: { paddingTop: 110, paddingHorizontal: spacing(8), gap: spacing(4) },
  brand: { fontFamily: fonts.display700, fontSize: 56, lineHeight: 60, letterSpacing: 2, color: colors.paper50 },
  goldBar: { marginTop: spacing(1.5), height: 4, width: 88, backgroundColor: colors.gold500 },
  pitch: { fontFamily: fonts.body400, fontSize: 17, lineHeight: 25, color: withOpacity(colors.paper50, 85), maxWidth: 300 },
  privacy: { fontFamily: fonts.body400, fontSize: 13, lineHeight: 19, color: withOpacity(colors.paper50, 55), maxWidth: 300 },

  bottom: { paddingHorizontal: spacing(6), paddingBottom: 44, gap: spacing(3) },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing(3),
    height: 52,
    borderRadius: radii.md,
    backgroundColor: colors.paper50,
  },
  googleGlyphCircle: { width: 22, height: 22, borderRadius: radii.pill, alignItems: "center", justifyContent: "center", backgroundColor: "#4285F4" },
  googleGlyph: { fontFamily: fonts.body600, fontSize: 13, color: "#ffffff" },
  googleButtonText: { fontFamily: fonts.body600, fontSize: 15, color: colors.ink900 },
  skipButton: {
    height: 52,
    marginTop: spacing(2),
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: withOpacity(colors.paper50, 35),
    alignItems: "center",
    justifyContent: "center",
  },
  skipButtonText: { fontFamily: fonts.body600, fontSize: 15, color: colors.paper50 },
  caption: { textAlign: "center", fontFamily: fonts.body400, fontSize: 12, lineHeight: 17, color: withOpacity(colors.paper50, 50) },
});
