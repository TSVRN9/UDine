import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet } from "react-native";
import { durations } from "../lib/motion";
import { colors, fs, withOpacity } from "../lib/theme";

interface Props {
  isFavorite: boolean;
  dishName: string;
  onPress: () => void;
}

// Its own component (not inlined in renderDishRow) because SectionList's renderItem calls it as a
// plain function, not a mounted component instance -- hooks can't live there.
export function FavoriteStar({ isFavorite, dishName, onPress }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  // Skips the pop on first render -- only a real toggle after mount should animate.
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
