// Minimal push-only service worker — no offline caching, no other PWA features (not needed for
// this ticket, see CLAUDE.md data residency: menu/log data intentionally never touches this file).
/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener("push", (event) => {
	const text = event.data?.text() ?? "You have a new UDine notification";
	event.waitUntil(sw.registration.showNotification("UDine", { body: text }));
});
