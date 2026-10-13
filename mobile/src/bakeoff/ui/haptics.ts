import * as Haptics from "expo-haptics";

// NOTES' haptics: selection for detents, tabs and jumps; Light impact for opening a sheet. A device without the module
// (an older dev client) just goes without.
const quiet = (p: Promise<void>) => p.catch(() => {});
export const tick = () => { try { quiet(Haptics.selectionAsync()); } catch { /* no haptics */ } };
export const thunk = () => { try { quiet(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid)); } catch { /* no haptics */ } };
export const ding = () => { try { quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)); } catch { /* no haptics */ } };
export const thud = () => { try { quiet(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)); } catch { /* no haptics */ } };
