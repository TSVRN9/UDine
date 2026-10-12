// Gitignored photos: run `pnpm bakeoff-assets` before bundling (Metro fails on a missing file).
import type { ImageSourcePropType } from "react-native";
import type { PlaceKey } from "./logic/types";

export const HALL_PHOTO: Record<"W" | "F" | "H" | "B", ImageSourcePropType> = {
  W: require("../../assets/bakeoff/worcester.jpg"),
  F: require("../../assets/bakeoff/franklin.jpg"),
  H: require("../../assets/bakeoff/hampshire.jpg"),
  B: require("../../assets/bakeoff/berkshire.jpg"),
};
/** A café's own location-card photo, by name (M2 `RIMG`); a café without one has the plain maroon header (M2 `nophoto`). */
export const CAFE_PHOTO: Record<string, ImageSourcePropType> = {
  "Paciugo": require("../../assets/bakeoff/retail/paciugo.jpg"),
  "Tavola": require("../../assets/bakeoff/retail/tavola.jpg"),
  "Yum! Bakery": require("../../assets/bakeoff/retail/yum-bakery.jpg"),
  "Green Fields": require("../../assets/bakeoff/retail/green-fields.jpg"),
  "Tamales": require("../../assets/bakeoff/retail/tamales.jpg"),
  "Wasabi": require("../../assets/bakeoff/retail/wasabi.jpg"),
  "Deli Delish": require("../../assets/bakeoff/retail/deli-delish.jpg"),
  "Star Ginger": require("../../assets/bakeoff/retail/star-ginger.jpg"),
  "The Grill": require("../../assets/bakeoff/retail/the-grill.jpg"),
  "People's Organic Coffee": require("../../assets/bakeoff/retail/people-s-organic-coffee.jpg"),
  "Harvest Market": require("../../assets/bakeoff/retail/harvest-market.jpg"),
  "UMass Store": require("../../assets/bakeoff/retail/umass-store.jpg"),
  "Worcester Café": require("../../assets/bakeoff/retail/worcester-caf.png"),
  "ISB Café": require("../../assets/bakeoff/retail/isb-caf.jpg"),
  "Morrill Café": require("../../assets/bakeoff/retail/morrill-caf.jpg"),
  "Snack Overflow": require("../../assets/bakeoff/retail/snack-overflow.jpg"),
  "The Hub": require("../../assets/bakeoff/retail/the-hub.jpg"),
  "Newman Café": require("../../assets/bakeoff/retail/newman-caf.jpg"),
  "Peet's Coffee & Tea": require("../../assets/bakeoff/retail/peet-s-coffee-tea.jpg"),
  "Procrastination Station": require("../../assets/bakeoff/retail/procrastination-station.jpg"),
  "Whitmore Café": require("../../assets/bakeoff/retail/whitmore-caf.jpg"),
  "Carney Café": require("../../assets/bakeoff/retail/carney-caf.jpg"),
  "Post & Bean Café": require("../../assets/bakeoff/retail/post-bean-caf.jpg"),
  "Hampshire Café": require("../../assets/bakeoff/retail/hampshire-caf.jpg"),
  "Argo Tea": require("../../assets/bakeoff/retail/argo-tea.jpg"),
  "Roots Café": require("../../assets/bakeoff/retail/roots-caf.jpg"),
  "Courtside Café": require("../../assets/bakeoff/retail/courtside-caf.jpg"),
  "Terrace": require("../../assets/bakeoff/retail/terrace.png"),
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
