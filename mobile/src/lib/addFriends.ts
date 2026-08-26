/**
 * #184: pure logic behind the Add Friends surface (search results, in-person QR, scan-confirm) --
 * kept out of the screen components so it's testable without rendering RN, same split as
 * pingGesture.ts/SocialPane.tsx. RPC wiring and RN wiring live in the app/ screens; this file only
 * formats/decides.
 */
import qrcode from "qrcode-generator";

export type FriendshipRow = {
  user_a: string;
  user_b: string;
  status: "pending" | "accepted";
  requested_by: string;
  origin: "search" | "qr";
  confirmed_a: string | null;
  confirmed_b: string | null;
  created_at?: string;
};

/** Same pattern as SocialPane.tsx/friends.tsx's own otherUserId -- house convention is a small
 * per-file copy rather than a shared util (see friend/[id].tsx's own initialsOf, duplicated too). */
export function otherUserId(f: { user_a: string; user_b: string }, myId: string): string {
  return f.user_a === myId ? f.user_b : f.user_a;
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function firstNameOf(displayName: string): string {
  return displayName.split(/\s+/)[0] ?? displayName;
}

/** Artboard's four monogram fills, cycled per result row so the list doesn't read as one flat
 * block of maroon (mirrors SocialPane's AVATAR_FILLS, extended to the four the spec names). */
export const AVATAR_FILLS = ["#3b0a0f", "#7c2430", "#6b2f1e", "#8a3a2c"] as const;

export function avatarFillFor(index: number): string {
  return AVATAR_FILLS[index % AVATAR_FILLS.length];
}

/** Result row button state: ADD if no friendships row exists yet for this pair, REQUESTED if one
 * does (regardless of who requested -- once *a* row exists, search's own ADD button is spent;
 * REQUESTS FOR YOU / SENT sections are where an incoming one gets acted on). */
export function resultButtonState(existing: FriendshipRow | undefined): "add" | "requested" {
  return existing ? "requested" : "add";
}

/** "sent 2 days ago" / "sent today" -- Sent section's sub-line. */
export function sentAgoText(createdAt: string, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(createdAt).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days <= 0) return "sent today";
  if (days === 1) return "sent 1 day ago";
  return `sent ${days} days ago`;
}

/** ADD button label, "ADD SAM" pattern -- verb + first name, uppercase (the button's own text
 * style already uppercases visually via letter-spacing/caps in the artboard, but the *label text*
 * itself is spelled out uppercase per the artboard's literal "ADD SAM" example). */
export function addButtonLabel(displayName: string): string {
  return `ADD ${firstNameOf(displayName).toUpperCase()}`;
}

/** QR payload is just the raw token -- redeem_qr_token resolves everything else (owner identity,
 * expiry) server-side, so there's nothing else worth encoding into the code itself. */
export function qrPayloadFor(token: string): string {
  return token;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rejects anything that isn't a plausible token shape before it ever reaches the network --
 * scanning a random QR code (a URL, a wifi code, ...) should fail obviously and immediately, not
 * as a confusing "invalid or expired code" round-trip. */
export function parseQrPayload(raw: string): string | null {
  const trimmed = raw.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

/** Maps redeem_qr_token's thrown messages to the copy the scan screen shows. Falls back to a
 * generic message for anything unrecognized rather than surfacing a raw Postgres error string. */
export function redeemErrorMessage(error: { message?: string } | null | undefined): string {
  const msg = error?.message ?? "";
  if (msg.includes("cannot add yourself")) return "That's your own code.";
  if (msg.includes("invalid or expired code")) return "This code has expired -- ask them to refresh it.";
  return "Couldn't read this code. Try again.";
}

/** Maps confirm_friendship's thrown messages similarly. */
export function confirmErrorMessage(error: { message?: string } | null | undefined): string {
  const msg = error?.message ?? "";
  if (msg.includes("no pending in-person request")) return "This request is no longer available.";
  return "Couldn't confirm. Try again.";
}

/** The code-owner's "My code" screen polls for a fresh incoming qr friendship rather than
 * subscribing to realtime (friendships isn't in the supabase_realtime publication, and the owner
 * is already looking at this screen while showing their code -- see PR body for the tradeoff).
 * Gates on *my own* confirm column being null, not both -- #239: the scanner can call
 * confirm_friendship (setting their own column) before my next poll lands, and requiring both
 * null then never matches again, stranding me. My own column still going from null -> set is
 * exactly "I haven't acted on this yet," regardless of where the other side is. */
export function findIncomingQrConfirm(rows: FriendshipRow[], myId: string): FriendshipRow | null {
  return (
    rows.find((r) => {
      if (r.origin !== "qr" || r.status !== "pending") return false;
      if (r.user_a === myId) return r.confirmed_a === null;
      if (r.user_b === myId) return r.confirmed_b === null;
      return false;
    }) ?? null
  );
}

/** Renders `data` (the QR token) into a square dark/light module matrix -- a plain 2D boolean
 * array, not an SVG/canvas, so the screen can draw it as a grid of Views (this codebase has
 * declined react-native-svg elsewhere, see SocialPane's own text-glyph precedent). Type 0 =
 * automatic size selection (qrcode-generator picks the smallest type that fits the data), 'M'
 * error correction is the library's own suggested default. */
export function buildQrMatrix(data: string): boolean[][] {
  const qr = qrcode(0, "M");
  qr.addData(data);
  qr.make();
  const size = qr.getModuleCount();
  const matrix: boolean[][] = [];
  for (let row = 0; row < size; row++) {
    const line: boolean[] = [];
    for (let col = 0; col < size; col++) line.push(qr.isDark(row, col));
    matrix.push(line);
  }
  return matrix;
}
