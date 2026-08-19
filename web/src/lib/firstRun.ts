// Device-local "has the first-run card been dismissed" flag for the anonymous-first value prop
// (#68, part of epic #63). Zero server calls -- mirrors $lib/preferences.ts's localStorage pattern.
const KEY = "udine-first-run-dismissed";

export function isFirstRunDismissed(): boolean {
	return localStorage.getItem(KEY) === "true";
}

export function dismissFirstRun(): void {
	localStorage.setItem(KEY, "true");
}
