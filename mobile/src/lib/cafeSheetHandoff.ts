/**
 * #177's probe-at-tap runtime model means a café WITH a locationId only reveals it has no real
 * menu (cafeTapTarget's "sheet" kind) after cafe/[name].tsx has already navigated there -- unlike
 * the no-locationId case, which index.tsx's HomePane already resolves inline before ever
 * navigating (see its own #245 item 8 comment). Left as-is, the "sheet" outcome rendered
 * CafeSheet *inside* the pushed route -- a blank pushed screen with the bottom sheet stacked on
 * top of it, instead of the sheet alone over Home.
 *
 * The fix: cafe/[name].tsx never renders the sheet itself. It calls `requestCafeSheet(name)` then
 * `router.back()`; HomePane picks the request up the moment it regains focus (the same instant the
 * back-navigation lands) and opens its own CafeSheet over itself, exactly like the no-locationId
 * path already does. One module-scope slot, not a queue -- at most one café tap is ever in flight
 * (the previous screen is gone before another tap is possible).
 */
let pendingCafeName: string | null = null;

export function requestCafeSheet(name: string): void {
  pendingCafeName = name;
}

export function takePendingCafeSheet(): string | null {
  const name = pendingCafeName;
  pendingCafeName = null;
  return name;
}
