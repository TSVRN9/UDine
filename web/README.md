# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
npx sv@0.17.0 create --template minimal --types ts --no-install web
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Testing

Copy `.env.example` to `.env` first (`svelte-check`, `dev`, and the e2e test all read `PUBLIC_*` vars via `$env/static/public` and throw if unset — placeholder values are fine, the e2e flow never contacts Supabase).

- Type check: `pnpm check`
- End-to-end (Playwright, covers the browse-menu -> log -> today vertical slice): `npx playwright install chromium` once, then `npx playwright test`. Add `--headed` to watch it run or `--debug` to step through it; `npx playwright show-report` opens the last HTML report. The dev server is started automatically (`playwright.config.ts`'s `webServer`).

See `.github/workflows/ci.yml` for the full CI gate, including `@udine/shared` tests, `mobile`'s `npx tsc --noEmit`, and `supabase/functions`'s `deno test`.
