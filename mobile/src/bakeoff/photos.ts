// Gitignored photos: run `pnpm bakeoff-assets` before bundling (Metro fails on a missing file).
import type { ImageSourcePropType } from "react-native";
import type { PlaceKey } from "./logic/types";

export const HALL_PHOTO: Record<"W" | "F" | "H" | "B", ImageSourcePropType> = {
  W: require("../../assets/bakeoff/worcester.jpg"),
  F: require("../../assets/bakeoff/franklin.jpg"),
  H: require("../../assets/bakeoff/hampshire.jpg"),
  B: require("../../assets/bakeoff/berkshire.jpg"),
};
export const CAFE_PHOTO: Record<string, ImageSourcePropType> = {
  Wasabi: require("../../assets/bakeoff/retail/wasabi.jpg"),
  Tamales: require("../../assets/bakeoff/retail/tamales.jpg"),
  "Harvest Market": require("../../assets/bakeoff/retail/harvest-market.jpg"),
  "Newman Café": require("../../assets/bakeoff/retail/newman-caf.jpg"),
};
/** Background-position x of the photo in a hall header (src.html .ph-W/F/H/B), as a fraction. */
export const PHOTO_POS: Record<"W" | "F" | "H" | "B", number> = { W: 0.72, F: 0.42, H: 0.6, B: 0.62 };
/** The band's window into the header photo, as a fraction of header height (OFF, OFFC). */
export const PHOTO_OFF: Record<"W" | "F" | "H" | "B", number> = { W: 0.3, F: 0.1, H: 0.24, B: 0.22 };
export const CAFE_OFF = 0.3;
export const photoOf = (key: PlaceKey, name: string): ImageSourcePropType | undefined =>
  key.startsWith("c") ? CAFE_PHOTO[name] : HALL_PHOTO[key as "W"];
/** The holiday note's banner (M2 `EVIMG`), by event title: the one event that lands on a hall's list. */
export const EVENT_PHOTO: Record<string, ImageSourcePropType> = { "Indigenous Peoples Day": require("../../assets/bakeoff/ev/ipd.jpg") };
