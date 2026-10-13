import { loadFixture } from "../logic/fixture";
import { act, create } from "react-test-renderer";
import { closeDish, getOpenDish, openDish, useClearOnUnmount } from "./dishSheet";

const [a, b] = loadFixture().dishes;
const ctx = { from: "hall" as const, place: "W" as const, meal: "lunch" as const, day: 0 };

afterEach(closeDish);
it("opens a dish with the place it was opened from, so a café serving keeps its place", () => {
  expect(openDish(a, { ...ctx, place: "c3" })).toBe(true);
  expect(getOpenDish()?.ctx.place).toBe("c3");
  expect(getOpenDish()?.dish).toBe(a);
});
it("refuses a second open while one is on screen or leaving, and takes one again after close", () => {
  expect(openDish(a, ctx)).toBe(true);
  expect(openDish(b, ctx)).toBe(false);
  expect(getOpenDish()?.dish).toBe(a);
  closeDish();
  expect(openDish(b, ctx)).toBe(true);
});

it("a host that unmounts while a dish is open does not leave every later open refused", () => {
  const Host = () => { useClearOnUnmount(); return null; };
  let r!: ReturnType<typeof create>;
  act(() => { r = create(<Host />); });
  expect(openDish(a, ctx)).toBe(true);
  act(() => r.unmount());
  expect(getOpenDish()).toBeNull();
  expect(openDish(b, ctx)).toBe(true);
});
