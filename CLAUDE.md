# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

A mobile-first SvelteKit PWA where two users (a couple) share recipes and daily shopping lists, with real-time sync between devices. The original design is in [specs/SPEC.md](specs/SPEC.md), but the code has moved on from it. Where they disagree, trust the code:

- The spec's `/calendar` routes are now `/shopping-list` (today's list) and `/shopping-list/[date]` (a specific day). The PWA `start_url` and offline fallback both point to `/shopping-list`.
- Features not in the spec: `/register` (public, next to `/login`), a `/backlog` of pending items (`pending_items` table) that can be moved into today's list, assigning a list to a user (`shopping_lists.assigned_to`), and Web Push notifications sent on assignment.
- Auth uses a hand-written JWT (`jose` + `bcryptjs`) in `src/lib/server/auth.ts`, not the better-auth add-on that AGENTS.md lists.

## Commands

```sh
npm run dev          # Vite dev server (the PWA service worker is also on in dev)
npm run build        # production build with adapter-node, output in build/
npm run start        # node build/index.js
npm run check        # svelte-kit sync + svelte-check (type checking)
npm run lint         # prettier --check . (Prettier is the only linter)
npm run format       # prettier --write .

npm run db:start     # local Postgres via docker compose (credentials match .env.example)
npm run db:generate  # create a SQL migration in drizzle/ from schema.ts
npm run db:migrate   # apply migrations
npm run db:push      # push schema straight to the DB, skipping migrations
npm run db:studio
```

There is no test suite. To check your work, run `npm run check` and `npm run lint`.

`scripts/seed.ts` inserts the two users. It has no npm script, so run it with a TypeScript runner, for example `npx tsx scripts/seed.ts`.

Environment variables (see `.env.example`): `DATABASE_URL`, `SESSION_SECRET`, `ORIGIN` (needed by adapter-node in production), and `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`. Push notifications are skipped quietly if the VAPID keys are missing.

## Architecture

**There is no separate API.** `+page.server.ts` `load` functions query Postgres through Drizzle, and every write is a named form action used with `use:enhance`. The only `+server.ts` endpoints are `api/sse` and `api/push/subscribe`.

**Svelte config is in `vite.config.ts`.** There is no `svelte.config.js`. The adapter, the runes-mode setting (runes are forced on for all non-`node_modules` files) and the PWA/Workbox config are all set in the `sveltekit()` and `SvelteKitPWA()` plugin options.

**Auth.** `src/hooks.server.ts` reads the `session` cookie (a stateless HS256 JWT that lasts 30 days, with no sessions table) and sets `event.locals.user`. It redirects every route except those in `PUBLIC_ROUTES` to `/login`. The root `+layout.server.ts` passes `user` and `vapidPublicKey` to every page.

**DB.** The schema is in `src/lib/server/db/schema.ts` (columns use snake_case). `db` in `src/lib/server/db/index.ts` is a lazy Proxy, so importing it does not need `DATABASE_URL` at build time. After changing the schema, run `db:generate` and commit the new file in `drizzle/`. Railway runs `db:migrate` before each deploy (see `railway.json`).

**Real-time sync works through three files that must stay in sync:**

1. `src/lib/types.ts` defines the `SSEEvent` union.
2. After writing to the DB, server actions call `broadcast(event)` from `src/lib/server/sse.ts`. This keeps an in-memory map of open connections, so it only works with a single process.
3. `src/lib/sse.svelte.ts` (started from the root `+layout.svelte`) listens for each event type and calls `invalidate('<key>')`. These keys match `depends('<key>')` calls in the `load` functions: `shopping-list`, `recipes`, `recipe:<id>` and `backlog`.

To add a new kind of change, add the event type to the union, broadcast it from the action, add a listener in `sse.svelte.ts`, and make sure the affected `load` calls `depends()` with the matching key.

**Shopping lists.** There is one list per calendar day (`date` is unique), shared by both users. A list is created the first time something is added to it, by `getOrCreateList`, which uses `INSERT ... ON CONFLICT DO NOTHING` and then selects again to handle both users creating it at once. `/shopping-list/+page.server.ts` (today, using `today()` from `src/lib/server/date.ts`) and `/shopping-list/[date]/+page.server.ts` contain largely the same actions, so a change to one usually needs the same change in the other. Items added from a recipe store `source_recipe_name` as a snapshot, so they keep their label if the recipe is deleted.

**Push.** `src/lib/push.svelte.ts` handles permission and subscription on the client and posts to `api/push/subscribe`. `src/lib/server/push.ts` sends notifications and removes subscriptions that return 404 or 410. Workbox loads the service worker's push and notification-click handlers from `static/push-handlers.js`.

**Client helpers** in `src/lib/` are rune-based `.svelte.ts` modules: `toast.svelte.ts` (`addToast`) and `swipe.svelte.ts` (the swipe-to-delete action).

## UI conventions (from the spec)

The app is mobile-first and touch-only, so do not rely on hover. Touch targets are at least 44×44px. Modals are bottom sheets. Fixed and sticky elements must allow for `env(safe-area-inset-*)`. Quantities are free text, so never use `type="number"`. Sub-pages need a visible back button because the standalone PWA has no browser back button. Use `lucide-svelte` for icons and Tailwind v4 (with the forms and typography plugins) for styling.
