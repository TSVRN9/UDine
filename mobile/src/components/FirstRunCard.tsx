import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card } from "./ui";
import { colors, fonts, spacing, withOpacity } from "../lib/theme";
import { dismissFirstRun, isFirstRunDismissed } from "../lib/firstRun";

// #68 (onboarding/first-run, part of epic #63): shown once on the home screen, device-local
// (AsyncStorage, see ../lib/firstRun.ts), zero server calls. Lives outside components/ui/ --
// that folder is #65's shared design-system primitives, this is a one-off screen section built
// from them.
export function FirstRunCard() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    isFirstRunDismissed().then((dismissed) => setVisible(!dismissed));
  }, []);

  if (!visible) return null;

  async function handleDismiss() {
    await dismissFirstRun();
    setVisible(false);
  }

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={styles.title}>Welcome to UDine</Text>
          <Text style={styles.body}>
            Menus, logging, macros and dish rankings all work with no account — what you eat never leaves this
            device. Export your full history any time from Today&rsquo;s macros.
          </Text>
          <Text style={styles.body}>
            Signing in only adds friends, pings, cross-device favorites and favorited-dish push alerts — nothing
            else.
          </Text>
        </View>
        <Pressable
          onPress={handleDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss welcome message"
          hitSlop={8}
        >
          <Text style={styles.dismiss}>Got it</Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: spacing(3), padding: spacing(4) },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing(3) },
  copy: { flex: 1, gap: spacing(2) },
  title: {
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: "700",
    textTransform: "uppercase",
    color: colors.maroon900,
  },
  body: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: withOpacity(colors.ink900, 80) },
  dismiss: { color: colors.maroon600, fontFamily: fonts.body, fontWeight: "600", fontSize: 13 },
});
