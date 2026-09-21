import renderer, { act } from "react-test-renderer";
import { AppState } from "react-native";
import type { AllowanceStore } from "./compareAllowance";
import { msUntilNextMidnight, useAllowanceRefresh } from "./useAllowanceRefresh";

jest.mock("./db", () => ({ getDb: jest.fn() }));

const HOUR = 3_600_000;
const MARGIN = 1000; // the hook's own slack past midnight
const onPicks = jest.fn();
let handler: ((state: string) => void) | undefined;
const remove = jest.fn();
let reads = 0;
let json: string | null = null;
// A counting store: every read the hook makes shows up in `reads`.
const store: AllowanceStore = {
  read: async () => {
    reads++;
    return json;
  },
  write: async (next) => {
    json = next;
  },
};

function Probe({ clock }: { clock?: () => Date; tick?: number }) {
  useAllowanceRefresh(store, onPicks, clock);
  return null;
}

const flush = async () => {
  for (let i = 0; i < 5; i++)
    await act(async () => {
      await Promise.resolve();
    });
};
const advance = async (ms: number) => {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
  await flush();
};
const mount = async (clock?: () => Date) => {
  let root!: renderer.ReactTestRenderer;
  await act(async () => {
    root = renderer.create(<Probe clock={clock} />);
  });
  await flush();
  return root;
};
const seed = (date: string, count: number) => {
  json = JSON.stringify({ date, count });
};

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 8, 20, 12, 0, 0) });
  reads = 0;
  json = null;
  handler = undefined;
  onPicks.mockClear();
  remove.mockClear();
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_type: string, h: (state: string) => void) => {
    handler = h;
    return { remove };
  }) as never);
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers(); // fake timers never outlive a test: a live one fires into a torn-down worker
});

describe("useAllowanceRefresh triggers", () => {
  it("reads once on mount and hands the count over", async () => {
    seed("2026-09-20", 3);
    await mount();
    expect(reads).toBe(1);
    expect(onPicks).toHaveBeenLastCalledWith(3);
  });

  it("an unrelated re-render performs no read", async () => {
    const root = await mount();
    for (let i = 0; i < 3; i++) {
      await act(async () => root.update(<Probe tick={i} />));
      await flush();
    }
    expect(reads).toBe(1);
  });

  it("reads when the app becomes active, not for any other state", async () => {
    await mount();
    await act(async () => handler!("background"));
    await act(async () => handler!("inactive"));
    await flush();
    expect(reads).toBe(1);
    await act(async () => handler!("active"));
    await flush();
    expect(reads).toBe(2);
  });

  it("foreground across local midnight: the new day's count arrives with no user action, then again at the next midnight", async () => {
    seed("2026-09-20", 5);
    await mount();
    expect(onPicks).toHaveBeenLastCalledWith(5);
    await advance(12 * HOUR + MARGIN - 1); // one ms before the timeout
    expect(reads).toBe(1);
    await advance(2);
    expect(reads).toBe(2);
    expect(onPicks).toHaveBeenLastCalledWith(0);
    seed("2026-09-22", 4);
    await advance(24 * HOUR - 2); // re-armed: the second midnight still fires
    expect(reads).toBe(2);
    await advance(2);
    expect(reads).toBe(3);
    expect(onPicks).toHaveBeenLastCalledWith(4);
  });

  it("background then foreground across midnight: the count refreshes on return", async () => {
    seed("2026-09-20", 5);
    await mount();
    jest.setSystemTime(new Date(2026, 8, 21, 7, 0, 0)); // the timer slept through it
    await act(async () => handler!("active"));
    await flush();
    expect(onPicks).toHaveBeenLastCalledWith(0);
  });

  it("uses the injected clock for both the date it reads and the midnight it waits for", async () => {
    seed("2026-09-20", 5);
    const t = new Date(2026, 8, 20, 23, 0, 0).getTime();
    let offset = 0;
    await mount(() => new Date(t + offset));
    expect(onPicks).toHaveBeenLastCalledWith(5);
    offset = 2 * HOUR; // the injected clock says it is 1am; the system clock still says noon
    await advance(HOUR + MARGIN + 1); // armed 1h out on the injected clock, not 12h out on the system one
    expect(reads).toBe(2);
    expect(onPicks).toHaveBeenLastCalledWith(0);
  });
});

describe("useAllowanceRefresh cleanup", () => {
  it("unmount removes the AppState subscription, clears the timeout and stops reading", async () => {
    const root = await mount();
    const armed = jest.getTimerCount();
    act(() => root.unmount());
    expect(remove).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(armed - 1); // exactly the midnight timeout
    await advance(72 * HOUR);
    expect(reads).toBe(1);
  });

  it("a read that resolves after unmount does not reach onPicks", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: AllowanceStore = { read: async () => (await gate, null), write: async () => {} };
    function Slow() {
      useAllowanceRefresh(slow, onPicks);
      return null;
    }
    let root!: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(<Slow />);
    });
    act(() => root.unmount());
    release();
    await flush();
    expect(onPicks).not.toHaveBeenCalled();
  });
});

describe("the timeout lands on the next LOCAL midnight (dates built from local-time constructors, so this holds under any TZ)", () => {
  const days: [string, Date, Date][] = [
    ["an ordinary day", new Date(2026, 8, 20, 12, 0, 0), new Date(2026, 8, 21, 0, 0, 0)],
    ["the spring-forward day (23h in New York)", new Date(2026, 2, 8, 0, 30, 0), new Date(2026, 2, 9, 0, 0, 0)],
    ["the fall-back day (25h in New York)", new Date(2026, 10, 1, 0, 30, 0), new Date(2026, 10, 2, 0, 0, 0)],
    ["the last day of a month", new Date(2026, 8, 30, 23, 59, 0), new Date(2026, 9, 1, 0, 0, 0)],
  ];
  it.each(days)("%s", async (_name, start, midnight) => {
    jest.setSystemTime(start);
    await mount();
    const wait = midnight.getTime() - start.getTime();
    expect(msUntilNextMidnight(start)).toBe(wait);
    await advance(wait + MARGIN - 1);
    expect(reads).toBe(1);
    await advance(2);
    expect(reads).toBe(2);
    expect(new Date().getDate()).toBe(midnight.getDate()); // that read ran on the new local date
  });
});
