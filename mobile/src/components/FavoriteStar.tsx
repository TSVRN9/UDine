import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet } from "react-native";
import { durations } from "../lib/motion";
import { colors, fs, withOpacity } from "../lib/theme";

interface Props {
  isFavorite: boolean;
  dishName: string;
  onPress: () => void;
}

/** Dish-row favorite toggle. RN's built-in `Animated` (not Reanimated) -- Toggle.tsx's own doc
 * comment established this as the app's precedent for a simple scale/color pop on toggle. Its own
 * file (not inlined in halls/[slug].tsx's renderDishRow) for two reasons: renderDishRow is called
 * as a plain function by SectionList's `renderItem`, not mounted as its own component instance, so
 * hooks can't safely live there -- and a real component here matches how Toggle.tsx/PaneHeader.tsx/
 * Press.tsx already isolate this exact `useRef(new Animated.Value(x)).current` idiom into their own
 * files so eslint's react-hooks/refs exemption (mobile/eslint.config.js) can be scoped narrowly
 * instead of disabled for a much bigger file. */
export function FavoriteStar({ isFavorite, dishName, onPress }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  // Skips the pop on this row's own first render -- only a real toggle (isFavorite changing after
  // mount) should animate, not every star popping the instant its row scrolls into view.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.25, duration: durations.favoritePop.in, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: durations.favoritePop.out, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [isFavorite, scale]);

  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${isFavorite ? "Unfavorite" : "Favorite"} ${dishName}`}>
      <Animated.Text style={[styles.star, isFavorite && styles.starActive, { transform: [{ scale }] }]}>{isFavorite ? "★" : "☆"}</Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  star: { fontSize: fs(20), color: withOpacity(colors.ink900, 30) },
  starActive: { color: colors.gold500 },
});
