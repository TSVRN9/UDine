# Auth status and verification procedures

Live state of Supabase Auth for project **UDine** (`ubogyqskqzvkcqboqbhw`), and how to re-verify each
guarantee without mutating the live project. Load this when a task touches auth, signup, the
`@umass.edu` restriction, or `supabase/migrations/*restrict_signup*`.

## Current live posture (as of 2026-08-26)

| Guarantee | Enforced by | Applied live? |
|---|---|---|
| Google is the only sign-in provider | Email provider disabled in dashboard (owner, #268 half 1, 2026-08-26) | Yes |
| Only `@umass.edu` emails can create accounts | `hook_restrict_signup_by_umass_domain`, a Before User Created Auth Hook — `supabase/migrations/20260817210000_restrict_signup_by_umass_domain.sql` (+ follow-up migration pinning `search_path` per the security advisor) | Yes — hook selected in dashboard (Authentication > Hooks (Beta) > Before User Created) |
| Only the `google` provider can create accounts (defense-in-depth if Email is ever re-enabled) | Same function, extended by `supabase/migrations/20260826120000_restrict_signup_by_google_provider.sql` (#268 half 2) | **Yes** — confirmed present in `list_migrations` as of 2026-08-27. Half 1 (provider off) is still what actually protects live today; half 2 is live defense-in-depth on top of it. |

`supabase/config.toml` mirrors the live posture locally (`[auth.email] enable_signup = false`). The
`[auth.hook.before_user_created]` block exists but is commented out — a deliberate scope decision, not
a CLI limitation — so the local stack has never had the hook registered; a local HTTP signup never
reaches it.

Once the domain restriction is confirmed live, profile/RLS policies don't need to re-check the email
domain — `auth.uid()` scoping is sufficient, since the hook guarantees no non-umass row can exist.

## Google OAuth

Client ID/secret configured by the owner directly in the dashboard (Authentication > Providers). No
MCP tool exposes provider config — don't try to re-verify by reading it. Verified live 2026-08-17 and
again 2026-08-26 by:

```
GET https://ubogyqskqzvkcqboqbhw.supabase.co/auth/v1/authorize?provider=google
```

which 302s to a real `accounts.google.com` consent screen with the correct callback URL. Re-run this
same curl to re-verify.

## Re-verification checks (all read-only or local)

1. **Provider stays off (live, read-only, repeatable):** `GET /auth/v1/settings` →
   `"external":{"email":false,"google":true}`. Non-mutating, no throwaway signup needed.
2. **Hook is still wired (live, read-only):** dashboard Authentication > Hooks (Beta) > Before User
   Created still shows `hook_restrict_signup_by_umass_domain` selected. Worth checking independently
   of check 1 — it's the layer that matters if Email is ever re-enabled.
3. **Hook logic is still correct (local, repeatable — the actual regression test):** call
   `hook_restrict_signup_by_umass_domain` directly with a simulated event payload (pgTAP or SQL
   Editor). `supabase/tests/database/13_restrict_signup_by_google_provider.sql` has the simulated
   event shape and covers: email+umass → rejected, google+umass → allowed, google+non-umass → still
   rejected by the domain check. Includes a migration-removed red run proving cases 1 and 5 (the
   actual exploit) fail against pre-fix main.

**Retired check — do not use:** `POST /auth/v1/signup` with a `@gmail.com` address expecting the hook's
403. With the Email provider off, GoTrue rejects at the provider gate before the hook runs; the same
curl now returns `400 {"error_code":"email_provider_disabled","msg":"Email signups are disabled"}`
both locally and live (confirmed 2026-08-26). It proves nothing about the hook anymore.

## History

- **2026-08-17 — `@umass.edu` restriction confirmed live.** After the owner selected the hook in the
  dashboard, POSTing a `@gmail.com` signup got
  `403 {"msg":"UDine accounts require a @umass.edu email address."}`, not a created user. A parallel
  `@umass.edu` signup was NOT rejected by the hook — it got past the check and hit Supabase's
  free-tier email-send rate limit (`429 over_email_send_rate_limit`), a separate platform constraint,
  not a hook bug. No stray test rows were left in `auth.users`. The hook rejects any email not
  ending in `@umass.edu` (case-insensitive, anchored so `evil.com/notumass.edu` tricks don't pass)
  before the `auth.users` row is created — no race window, no orphaned rows. **Applying the migration
  only creates the function; it does not enable the hook.** Registration is dashboard-only.
- **2026-08-26 — #268: email/password signup was live with no ownership check. Fixed, both halves.**
  The domain-only hook rejected the wrong domain but not the wrong *provider*: with the Email
  provider enabled, anyone could POST a password signup for `victim@umass.edu` and plant a
  discoverable, impersonating profile without ever proving they controlled that mailbox
  (`auth.users` row inserted before email confirmation, per `handle_new_user`'s `after insert`
  trigger). Half 1: owner disabled the Email provider (dashboard-only; no MCP/API surface for it).
  Confirmed same day: `GET /auth/v1/settings` → `"external":{"email":false,"google":true}`; a live
  `@umass.edu` password signup gets `400 email_provider_disabled`; the Google authorize redirect
  still 302s. Half 2: the hook now also rejects any signup whose
  `event->'user'->'app_metadata'->>'provider'` isn't `'google'` (same function name, no dashboard
  re-selection needed). Field choice (`provider`, not the sibling `providers` array) matches
  Supabase's own docs example (Auth Hooks > Before User Created > "Block by OAuth Provider"): at
  user-creation time exactly one identity is being created, so `providers` is always a one-element
  array holding the same value. This is an allowlist (`provider is distinct from 'google'`), not a
  Discord-style denylist, so it also rejects `/auth/v1/invite` and anonymous sign-in — both off live
  today, but a future owner turning either on shouldn't be surprised it gets caught.
