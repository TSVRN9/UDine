import { StyleSheet, Text as RNText, type StyleProp, type TextProps, type TextStyle } from "react-native";
import { m2 } from "../../lib/theme";

type Variant = keyof typeof m2.type;

/** The room below a tight line of `size`: Oswald's descenders reach below a line box of 1 x its size (M2's `line-height: 1`), and Android clips text to its view. */
export const descenderRoom = (size: number) => Math.ceil(size * m2.ratio.descender);

// RN's precedence for a side: the side itself, then the axis, then all four
const side = (...v: unknown[]) => v.find((x): x is number => typeof x === "number") ?? 0;

/**
 * What a tight line adds to the caller's `style`: the view gets `room` below the text, and the same comes off its bottom margin, so the glyphs
 * and the layout stay where M2 has them. The caller's own bottom margin is the layout, so the room comes off that, and its own bottom padding
 * is added to.
 */
export function withRoom(size: number, style: StyleProp<TextStyle>): TextStyle {
  const room = descenderRoom(size), own = StyleSheet.flatten(style) ?? {};
  return {
    paddingBottom: side(own.paddingBottom, own.paddingVertical, own.padding) + room,
    marginBottom: side(own.marginBottom, own.marginVertical, own.margin) - room,
  };
}

/** M2's type, by variant: its family, size and line (design-tokens/m2.json `type`), tabular figures where the number is Oswald. */
export function Text({ v = "date", color = m2.color.ink, style, ...p }: TextProps & { v?: Variant; color?: string }) {
  const t = m2.type[v];
  const s: TextStyle = { fontFamily: t.font, fontSize: t.size, lineHeight: t.line, color, ...(t.tabular ? { fontVariant: ["tabular-nums"] } : null) };
  return <RNText {...p} style={t.line < t.size * 1.2 ? [s, style, withRoom(t.size, style)] : [s, style]} />;
}
