// Minimal push-only service worker — no offline caching, no other PWA features (not needed for
// this ticket, see CLAUDE.md data residency: menu/log data intentionally never touches this file).
/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener("push", (event) => {
	// Server sends JSON.stringify({ title, body }) (see supabase/functions/check-favorited-foods) —
	// parse that shape, but fall back to plain text so a non-JSON payload doesn't just get dropped.
	let title = "UDine";
	let body = "You have a new UDine notification";
	try {
		const payload = event.data?.json() as { title?: string; body?: string } | undefined;
		if (payload?.title) title = payload.title;
		if (payload?.body) body = payload.body;
	} catch {
		body = event.data?.text() ?? body;
	}
	event.waitUntil(sw.registration.showNotification(title, { body }));
});
