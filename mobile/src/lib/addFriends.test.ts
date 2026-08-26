import {
  addButtonLabel,
  avatarFillFor,
  buildQrMatrix,
  confirmErrorMessage,
  findIncomingQrConfirm,
  firstNameOf,
  initialsOf,
  otherUserId,
  parseQrPayload,
  qrPayloadFor,
  redeemErrorMessage,
  resultButtonState,
  sentAgoText,
  type FriendshipRow,
} from "./addFriends";

describe("otherUserId", () => {
  it("returns user_b when I'm user_a", () => {
    expect(otherUserId({ user_a: "me", user_b: "them" }, "me")).toBe("them");
  });
  it("returns user_a when I'm user_b", () => {
    expect(otherUserId({ user_a: "them", user_b: "me" }, "me")).toBe("them");
  });
});

describe("initialsOf / firstNameOf", () => {
  it("takes up to two initials, uppercased", () => {
    expect(initialsOf("sam casey")).toBe("SC");
    expect(initialsOf("Sam")).toBe("S");
    expect(initialsOf("Sam Casey Extra")).toBe("SC");
  });
  it("firstNameOf is the first whitespace-separated token", () => {
    expect(firstNameOf("Sam Casey")).toBe("Sam");
    expect(firstNameOf("Sam")).toBe("Sam");
  });
});

describe("avatarFillFor", () => {
  it("cycles through the four artboard fills", () => {
    expect(avatarFillFor(0)).toBe("#3b0a0f");
    expect(avatarFillFor(1)).toBe("#7c2430");
    expect(avatarFillFor(2)).toBe("#6b2f1e");
    expect(avatarFillFor(3)).toBe("#8a3a2c");
    expect(avatarFillFor(4)).toBe("#3b0a0f");
  });
});

describe("resultButtonState", () => {
  it("is add when no friendships row exists yet", () => {
    expect(resultButtonState(undefined)).toBe("add");
  });
  it("is requested once any row exists for the pair", () => {
    const row: FriendshipRow = { user_a: "me", user_b: "them", status: "pending", requested_by: "me", origin: "search", confirmed_a: null, confirmed_b: null };
    expect(resultButtonState(row)).toBe("requested");
  });
});

describe("sentAgoText", () => {
  const now = new Date("2026-08-24T12:00:00Z");
  it("says sent today for less than a day", () => {
    expect(sentAgoText("2026-08-24T06:00:00Z", now)).toBe("sent today");
  });
  it("singularizes 1 day", () => {
    expect(sentAgoText("2026-08-23T06:00:00Z", now)).toBe("sent 1 day ago");
  });
  it("pluralizes multiple days", () => {
    expect(sentAgoText("2026-08-20T06:00:00Z", now)).toBe("sent 4 days ago");
  });
});

describe("addButtonLabel", () => {
  it("is verb + uppercased first name", () => {
    expect(addButtonLabel("Sam Casey")).toBe("ADD SAM");
  });
});

describe("qr payload round-trip", () => {
  const token = "11111111-2222-3333-4444-555555555555";
  it("encodes as the bare token", () => {
    expect(qrPayloadFor(token)).toBe(token);
  });
  it("parses a valid uuid payload back out", () => {
    expect(parseQrPayload(token)).toBe(token);
  });
  it("parses case-insensitively and trims whitespace", () => {
    expect(parseQrPayload(`  ${token.toUpperCase()}  `)).toBe(token.toUpperCase());
  });
  it("rejects garbage (a URL, wifi QR, random text)", () => {
    expect(parseQrPayload("https://example.com")).toBeNull();
    expect(parseQrPayload("WIFI:S:home;;")).toBeNull();
    expect(parseQrPayload("")).toBeNull();
  });
});

describe("redeemErrorMessage", () => {
  it("maps the self-scan error", () => {
    expect(redeemErrorMessage({ message: "cannot add yourself" })).toBe("That's your own code.");
  });
  it("maps the expired/invalid error", () => {
    expect(redeemErrorMessage({ message: "invalid or expired code" })).toBe("This code has expired -- ask them to refresh it.");
  });
  it("falls back to a generic message for anything else", () => {
    expect(redeemErrorMessage({ message: "connection reset" })).toBe("Couldn't read this code. Try again.");
    expect(redeemErrorMessage(null)).toBe("Couldn't read this code. Try again.");
  });
});

describe("confirmErrorMessage", () => {
  it("maps the no-longer-pending error", () => {
    expect(confirmErrorMessage({ message: "no pending in-person request to confirm" })).toBe("This request is no longer available.");
  });
  it("falls back to a generic message", () => {
    expect(confirmErrorMessage({ message: "network down" })).toBe("Couldn't confirm. Try again.");
  });
});

describe("findIncomingQrConfirm", () => {
  const base: FriendshipRow = { user_a: "me", user_b: "them", status: "pending", requested_by: "them", origin: "qr", confirmed_a: null, confirmed_b: null };

  it("finds an unconfirmed qr-origin pending row involving me", () => {
    expect(findIncomingQrConfirm([base], "me")).toEqual(base);
  });
  it("ignores rows I'm not part of", () => {
    expect(findIncomingQrConfirm([base], "someone-else")).toBeNull();
  });
  it("ignores search-origin rows", () => {
    expect(findIncomingQrConfirm([{ ...base, origin: "search" }], "me")).toBeNull();
  });
  it("ignores already-accepted rows", () => {
    expect(findIncomingQrConfirm([{ ...base, status: "accepted", confirmed_a: "t", confirmed_b: "t" }], "me")).toBeNull();
  });
  it("ignores rows I've already confirmed (waiting on the other side, not a fresh incoming scan)", () => {
    expect(findIncomingQrConfirm([{ ...base, confirmed_a: "t" }], "me")).toBeNull();
  });
  // #239 (A): the scanner can confirm before the owner's next 3s poll lands, setting the
  // *other* side's confirm column while mine is still null. The old both-null check then never
  // matches again -- the owner is stranded. Only my own column should gate the match.
  it("matches when I haven't confirmed yet, even if the other side already has (fast scanner-confirm)", () => {
    const row = { ...base, confirmed_b: "them" };
    expect(findIncomingQrConfirm([row], "me")).toEqual(row);
  });
  it("still matches from the other side's perspective too (I'm user_b, confirmed_a already set)", () => {
    const row = { ...base, confirmed_a: "me" };
    expect(findIncomingQrConfirm([row], "them")).toEqual(row);
  });
});

describe("buildQrMatrix", () => {
  it("returns a square matrix of booleans", () => {
    const matrix = buildQrMatrix("11111111-2222-3333-4444-555555555555");
    expect(matrix.length).toBeGreaterThan(0);
    for (const row of matrix) {
      expect(row.length).toBe(matrix.length);
      for (const cell of row) expect(typeof cell).toBe("boolean");
    }
  });
  it("produces a different matrix for different data", () => {
    const a = buildQrMatrix("11111111-2222-3333-4444-555555555555");
    const b = buildQrMatrix("99999999-8888-7777-6666-555555555555");
    expect(a).not.toEqual(b);
  });
});
