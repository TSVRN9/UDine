import type { ComponentProps } from "react";
import { m2 } from "../../lib/theme";
import { Press } from "./Press";
import { Text } from "./Text";

/** `fill` M2 `.btn`; `line` `.btn.line` (large) and `.dirb` (medium); `outline` `.obtn`, white on a maroon bar; `gold` `.gbtn`. */
export type ButtonKind = "fill" | "line" | "outline" | "gold";
/** `lg` 52 (a page's action), `md` 44 (a tap target), `bar` 48 (the plate bar's). */
export type ButtonSize = "lg" | "md" | "bar";

const SIZE = {
  lg: { height: m2.size.btn, text: "action" },
  md: { height: m2.size.tap, text: "link" },
  bar: { height: m2.size.gbtn, text: "button" },
} as const;
const KIND = {
  fill: { backgroundColor: m2.color.vm, color: m2.color.white },
  line: { borderWidth: m2.size.keyline, borderColor: m2.color.vm, color: m2.color.vm },
  outline: { borderWidth: m2.size.keyline, borderColor: m2.color.outline, color: m2.color.white },
  gold: { backgroundColor: m2.color.gold, color: m2.color.dm },
} as const;

/**
 * The kit's one button. `kind` is its ground and `size` its height and type; a medium line is M2's `.dirb` (16 across) and a medium outline `.obtn`
 * (14), a bar button `.gbtn` (18 across, 84 wide), or with `tight` the way the choose bar sets it (14, no minimum, shrinking to fit its hall).
 * It scales on press and takes the Pressable's own props.
 */
export function Button({ kind, size, label, tight, style, ...p }: { kind: ButtonKind; size: ButtonSize; label: string; tight?: boolean } & Omit<ComponentProps<typeof Press>, "children" | "feedback" | "tint">) {
  const { color, ...ground } = KIND[kind];
  const across = size === "bar" ? (tight ? m2.space.gbtnTight : m2.space.gbtn) : size === "md" ? (kind === "line" ? m2.space.dirb : m2.space.obtn) : 0;
  return (
    <Press accessibilityRole="button" {...p}
      style={[{ height: SIZE[size].height, borderRadius: m2.radius.button, alignItems: "center", justifyContent: "center" }, ground,
        across ? { paddingHorizontal: across } : null, size === "bar" ? { minWidth: tight ? 0 : m2.size.gbtnMin } : null, tight ? { flexShrink: 1 } : null, style]}>
      <Text v={SIZE[size].text} color={color} numberOfLines={tight ? 1 : undefined}>{label}</Text>
    </Press>
  );
}
