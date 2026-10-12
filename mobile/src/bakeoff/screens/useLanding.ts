import { useEffect, useRef, useState, type RefObject } from "react";
import type { Item } from "../logic/menuView";
import type { ServeTarget } from "../logic/dishSheet";
import type { PagerHandle } from "./MealPager";

/**
 * Bringing a dish up (M2 `toDish`): a where-served button, or a pushed hall, names a dish; once the list has it (revealed first if the preferences hide
 * it) the list is scrolled to it and the row is tinted (`.row.here`) until the next dish is brought up. `onSettled` fires when it has landed.
 * `setGoto` names the dish; `hereKey` is the one that is tinted.
 */
export function useLanding({ at, items, warm, showAll, setShowAll, pager, refreshHeads, pin, onSettled }: {
  at?: ServeTarget; items: Item[]; warm: boolean; showAll: boolean; setShowAll: (v: boolean) => void; pager: RefObject<PagerHandle | null>; refreshHeads: () => void; pin: number; onSettled?: () => void;
}) {
  // the dish a where-served button (or the dev entry) is bringing up: scrolled to once the list has it, revealed first if preferences hide it
  const [goto, setGoto] = useState<string | null>(at?.dish ?? null);
  // the row M2 brought the dish up to stays tinted (`.row.here`) until the next dish is brought up
  const [hereKey, setHereKey] = useState<string | null>(null);
  // false once the screen unmounts: the landing loop below polls on timers and must stop with it
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => {
    if (!goto || !warm) return;
    const i = items.findIndex((it) => it.t === "dish" && it.dish.key === goto);
    if (i >= 0) {
      // FlashList places a row it has not drawn yet from its estimated heights (scrollToIndex landed stations past the dish), so the
      // offset is taken from the row's layout, and again as each pass draws more of the list: the last lands on measured rows. A
      // pushed hall does this out of sight and only then reports `onSettled`, so it arrives already at the dish (M2 `toDish(id, true)`).
      let k = 0, last = -1, same = 0;
      const done = () => { refreshHeads(); setHereKey(goto); requestAnimationFrame(() => requestAnimationFrame(() => { if (alive.current) onSettled?.(); })); };
      const go = () => {
        if (!alive.current) return;   // the screen is gone: the loop ends with it, it never reaches a list that no longer exists
        const l = pager.current?.list();
        const lay = l?.getLayout(i);
        if (!l || !lay) { if (++k > 40) done(); else setTimeout(go, 40); return; }
        const off = Math.max(0, lay.y + l.getFirstItemOffset() - pin - 8);
        // stable: the row is drawn and its layout has not moved over two passes (a pass that comes before the list has drawn
        // around the new offset computes the same estimate again, so one equal pass is not enough)
        const { startIndex, endIndex } = l.computeVisibleIndices();
        const drawn = i >= startIndex && i <= endIndex;
        same = Math.abs(off - last) < 1 && drawn ? same + 1 : 0;
        if (same >= 2 || ++k > 40) { done(); return; }
        last = off;
        l.scrollToOffset({ offset: off, animated: false });
        setTimeout(go, 40);
      };
      go();
      setGoto(null);
      return;
    }
    if (!showAll) setShowAll(true);
    else { setGoto(null); onSettled?.(); }
  }, [goto, items, warm, showAll]); // eslint-disable-line react-hooks/exhaustive-deps
  return { setGoto, hereKey };
}
