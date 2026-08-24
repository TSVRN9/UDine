import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, type PressableProps, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { Press } from "../Press";
import { buttonColors, fonts, fs, radii, spacing, type ButtonVariant } from "../../lib/theme";

type Props = Omit<PressableProps, "style"> & {
  variant?: ButtonVariant;
  size?: "default" | "sm";
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  children: ReactNode;
};

/** Base button; pair with exactly one variant. Mirrors .btn + .btn-primary/-secondary/-ghost.
 * A free-standing element, so it gets `.press` (scale(0.97) 120ms, #179 press-feedback rules) --
 * `Press` supplies that; disabled buttons skip it (no feedback for a tap that does nothing). */
export function Button({ variant = "primary", size = "default", style, textStyle, disabled, children, ...props }: Props) {
  const c = buttonColors(variant);
  const content = typeof children === "string" ? (
    <Text style={[styles.text, size === "sm" && styles.textSm, { color: c.color }, textStyle]}>{children}</Text>
  ) : (
    children
  );
  const buttonStyle = [styles.base, size === "sm" && styles.sm, { backgroundColor: c.backgroundColor, borderColor: c.borderColor }, disabled && styles.disabled, style];

  if (disabled) {
    return (
      <Pressable accessibilityRole="button" disabled style={buttonStyle} {...props}>
        {content}
      </Pressable>
    );
  }
  return (
    <Press accessibilityRole="button" style={buttonStyle} {...props}>
      {content}
    </Press>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing(1.5),
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(3.5),
  },
  sm: {
    paddingVertical: spacing(1),
    paddingHorizontal: spacing(2),
  },
  disabled: {
    opacity: 0.45,
  },
  text: {
    fontFamily: fonts.body,
    fontSize: fs(14),
    fontWeight: "600",
  },
  textSm: {
    fontSize: fs(13),
  },
});
