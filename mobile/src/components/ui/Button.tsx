import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, type PressableProps, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { buttonColors, fonts, radii, spacing, type ButtonVariant } from "../../lib/theme";

type Props = Omit<PressableProps, "style"> & {
  variant?: ButtonVariant;
  size?: "default" | "sm";
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  children: ReactNode;
};

/** Base button; pair with exactly one variant. Mirrors .btn + .btn-primary/-secondary/-ghost. */
export function Button({ variant = "primary", size = "default", style, textStyle, disabled, children, ...props }: Props) {
  const c = buttonColors(variant);
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={[
        styles.base,
        size === "sm" && styles.sm,
        { backgroundColor: c.backgroundColor, borderColor: c.borderColor },
        disabled && styles.disabled,
        style,
      ]}
      {...props}
    >
      {typeof children === "string" ? (
        <Text style={[styles.text, size === "sm" && styles.textSm, { color: c.color }, textStyle]}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
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
    fontSize: 14,
    fontWeight: "600",
  },
  textSm: {
    fontSize: 13,
  },
});
