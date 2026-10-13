import { FadeOut, LinearTransition } from "react-native-reanimated";
import { m2Motion } from "../../lib/motion";

/** M2's `exit` (150 ms, emphasized accelerate): what a removed row does while the rows below close up into its place. */
export const exitOut = FadeOut.duration(m2Motion.exit.d).easing(m2Motion.exit.e);
export const exitLayout = LinearTransition.duration(m2Motion.exit.d).easing(m2Motion.exit.e);
