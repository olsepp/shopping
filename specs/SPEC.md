# Meal Planner & Shopping List App — Implementation Spec

## Overview

A mobile-first Progressive Web App (PWA) built with SvelteKit. Two users (a couple) share recipes and daily shopping lists. Data is stored in PostgreSQL. The app is self-hosted on a Hetzner server. Real-time sync between devices is handled via Server-Sent Events (SSE).

---

## Tech Stack

| Concern       | Choice                                                                               |
| ------------- | ------------------------------------------------------------------------------------ |
| Framework     | SvelteKit (latest stable)                                                            |
| Language      | TypeScript throughout                                                                |
| Styling       | Tailwind CSS                                                                         |
| Database      | PostgreSQL                                                                           |
| DB client     | `postgres` (node-postgres) or Drizzle ORM — agent's choice, but use one consistently |
| Auth          | Username + password, session-based (cookie)                                          |
| Real-time     | Server-Sent Events (SSE) via a SvelteKit `+server.ts` endpoint                       |
| PWA           | `@vite-pwa/sveltekit` (Workbox)                                                      |
| Icons         | Lucide Svelte                                                                        |
| Date handling | `date-fns`                                                                           |
| Deployment    | Node adapter (`@sveltejs/adapter-node`), Docker or PM2 on Hetzner                    |

---

## Architecture Overview

SvelteKit handles everything — no separate API service.

- **Data fetching:** `+page.server.ts` `load()` functions query Postgres directly
- **Mutations:** SvelteKit form actions (`+page.server.ts` `actions`) handle all writes
- **Auth:** Session cookie checked in `hooks.server.ts`; unauthenticated requests redirected to `/login`
- **Real-time:** A `GET /api/sse` endpoint streams events to connected clients; mutations broadcast change events after committing to DB

---

## Database Schema

```sql
-- Users
CREATE TABLE users (
  id          SERIAL PRIMARY KEY,
  username    TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Recipes
CREATE TABLE recipes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Ingredients (child rows of a recipe)
CREATE TABLE ingredients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id   UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  quantity    TEXT,          -- free text, e.g. "500g", "2 cans"
  position    INTEGER NOT NULL DEFAULT 0  -- for ordering
);

-- Shopping lists (one per calendar day, shared between both users)
CREATE TABLE shopping_lists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date        DATE NOT NULL UNIQUE,   -- YYYY-MM-DD, one list per day
  note        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Shopping list items
CREATE TABLE shopping_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id          UUID NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  quantity         TEXT,
  checked          BOOLEAN NOT NULL DEFAULT FALSE,
  source_recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  source_recipe_name TEXT,   -- denormalized snapshot of recipe name at time of adding
  position         INTEGER NOT NULL DEFAULT 0
);
```

**Notes:**

- Shopping lists are shared — not per-user. Both users see and edit the same list for any given day.
- `source_recipe_name` is denormalized so that deleting a recipe doesn't blank out the label on existing list items.
- Passwords are hashed with `bcrypt` (or `argon2` — agent's choice, use a well-maintained library).

---

## Auth

### Sessions

- On login, create a signed, HTTP-only, `SameSite=Lax` cookie named `session`
- Store session data in a stateless signed JWT (no sessions table — fits the 2-user scale, zero DB overhead)
- Session lifetime: 30 days, sliding expiry on activity
- `hooks.server.ts` validates the session cookie on every request and attaches `event.locals.user` (or redirects to `/login`)

```ts
// src/app.d.ts
declare global {
	namespace App {
		interface Locals {
			user: { id: number; username: string } | null;
		}
	}
}
```

### Routes

```
GET  /login         → login page
POST /login         → form action: validate credentials, set cookie, redirect to /calendar
POST /logout        → form action: clear cookie, redirect to /login
```

### Pages

- `/login` is the only public route
- All other routes require an authenticated session; unauthenticated requests are redirected to `/login` in `hooks.server.ts`
- No registration UI — users are seeded directly in the database (it's two people, this is intentional)

---

## Real-Time Sync (SSE)

### How it works

1. When a page loads, the client opens a persistent `EventSource` connection to `GET /api/sse`
2. The server keeps a registry of open SSE connections (in-memory Map, keyed by a connection ID)
3. After any mutation (check item, add recipe, etc.), the server broadcasts a typed event to all connected clients
4. The client receives the event and either re-runs the page's `load` function (via SvelteKit's `invalidate()`) or applies a small local patch to the store

### SSE endpoint (`src/routes/api/sse/+server.ts`)

```ts
// Simplified structure — agent implements fully
export function GET({ request }) {
	const stream = new ReadableStream({
		start(controller) {
			const id = registerConnection(controller);
			request.signal.addEventListener('abort', () => removeConnection(id));
		}
	});
	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
}
```

### Event types

```ts
type SSEEvent =
	| { type: 'shopping_list_updated'; date: string }
	| { type: 'recipe_updated'; recipeId: string }
	| { type: 'recipe_deleted'; recipeId: string }
	| { type: 'item_checked'; listDate: string; itemId: string; checked: boolean };
```

### Client-side handling (`src/lib/sse.ts`)

- A singleton that opens the `EventSource` on app mount
- On `item_checked` events: patch the local item state directly (no full reload — this is the most frequent event and must feel instant)
- On `shopping_list_updated` and `recipe_updated`: call SvelteKit's `invalidate('/api/sse')` or a named dependency to trigger a re-`load`
- Reconnect automatically on connection drop (EventSource does this natively)
- SSE client is initialised in the root `+layout.svelte`

**Important:** The in-memory connection registry is per-process. This is fine for a single-server Hetzner deployment. If the app is ever scaled to multiple processes, this needs a pub/sub layer (e.g. Redis) — out of scope for now.

---

## App Structure

```
src/
  routes/
    +layout.svelte          ← root layout: bottom nav, SSE init
    +layout.server.ts       ← load user from session for layout
    login/
      +page.svelte
      +page.server.ts       ← login/logout actions
    calendar/
      +page.svelte          ← week strip + day-card list
      +page.server.ts       ← load: all shopping lists with completion status
      [date]/
        +page.svelte        ← shopping list for a day
        +page.server.ts     ← load list + items; actions: add item, check item, add recipe, delete item, delete list
    recipes/
      +page.svelte          ← recipe list
      +page.server.ts       ← load all recipes
      new/
        +page.svelte        ← create recipe form
        +page.server.ts     ← create action
      [id]/
        +page.svelte        ← view / edit recipe
        +page.server.ts     ← load recipe; actions: update, delete
    api/
      sse/
        +server.ts          ← SSE endpoint
  lib/
    db.ts                   ← Postgres client / Drizzle instance
    sse.ts                  ← SSE connection registry + broadcast helper
    auth.ts                 ← session helpers
  hooks.server.ts           ← auth guard
```

---

## Pages & Features

### 1. Bottom Navigation

- Fixed to the bottom of the screen
- Two tabs: **Calendar** (calendar icon) and **Recipes** (book icon)
- Active tab is visually highlighted
- Handles iOS safe area: `padding-bottom: env(safe-area-inset-bottom)`
- Rendered in root `+layout.svelte`; hidden on `/login`

---

### 2. Calendar Page (`/calendar`)

**Two-zone layout: scrollable week strip + upcoming list of day cards.**

**`load` function returns:**

- All `shopping_lists` rows with their date and a computed `status`:
  - `empty` — no list exists for this day
  - `partial` — list exists, some items unchecked
  - `complete` — list exists, all items checked (or list has 0 items but was explicitly created)

---

**Zone A: Week strip (horizontal scroll, fixed at top)**

- Horizontally scrollable row of day pills: today + next 6 days (7 days total).
- Each pill shows:
  - Weekday abbreviation (e.g. "Mon")
  - Date number (e.g. "14")
  - A small colored dot for status: grey (no list), amber (partial), green (complete).
- **Today's pill** has a tinted background or ring to stand out.
- Tapping a pill navigates to `/calendar/[date]`.
- On scroll, the strip lazy-loads additional days (both forward and backward) — at minimum, the user can reach any day in the current month and the next.

---

**Zone B: Upcoming list (vertical scroll, below the strip)**

- A vertical list of day cards, initially showing today + the next ~14 days, then a "Show more" button to load older/earlier days.
- Each card spans full width and contains:
  - **Left side:** Date number (large) + weekday name below.
  - **Right side:** Status badge and item summary:
    - No list: "No plans" in muted text.
    - Partial: amber badge showing checked/total count (e.g. "3/8").
    - Complete: green checkmark + "All done".
  - **Background:** White card with subtle shadow, rounded corners.
- Tapping a card navigates to `/calendar/[date]`.
- Scrolling down far enough loads past days (infinite-scroll or explicit "Older" button at the bottom).
- The initial visible range is "today + upcoming 14 days + a handful of recent past days" so the list feels useful immediately.

---

**Zone C: Month picker (header button)**

- A button in the header (e.g. "June 2026 ▼") opens a compact month/year picker.
- Picker UI: a lightweight overlay showing all 12 months with the current year, plus left/right arrows to change year.
- Selecting a month scrolls both the week strip and the day-card list to that month's first day.
- Tapping "Today" in the picker snaps back to the current date.

---

### 3. Shopping List Page (`/calendar/[date]`)

**`load` function returns:**

- The `shopping_list` row for this date (or `null` if none exists yet)
- All `shopping_items` for this list, ordered by `position`
- All recipes (for the "add recipe" picker)

**If no list exists yet:**

- Show an empty state: "Nothing planned for this day yet"
- Show two CTAs: "Add a recipe" and "Add an item"
- First action (whichever the user picks) implicitly creates the shopping_list row. Use `INSERT ... ON CONFLICT (date) DO NOTHING RETURNING id` to handle the rare case where both users create the list simultaneously — one wins, both get the same list id.

**Header:**

- Human-readable date: e.g. "Saturday, 14 June"
- Back button → `/calendar`
- Overflow menu (⋮): "Delete list" (with confirmation), optionally "Add a note"

**Item list:**

Items are grouped visually:

- One group per recipe that contributed items, with a collapsible sub-header showing the recipe name
- One "Other" group for manually added items
- Within each group, items respect their `position` order

Each item row:

- Checkbox (left side) — large tap target (min 44×44px)
- Item name + quantity
- Checking an item calls the `checkItem` form action and immediately broadcasts an `item_checked` SSE event
- Checked items: strikethrough text, reduced opacity; they stay in place (do not auto-sink — this can be a future toggle)
- Swipe left on a row (or a long-press context menu) reveals a **Delete** button

**"Add recipe" flow:**

- Triggered by a prominent button or FAB
- Opens a bottom sheet listing all recipes (name + ingredient count)
- User taps a recipe → the `addRecipe` form action runs:
  - Inserts all recipe ingredients as `shopping_items` with `source_recipe_id` and `source_recipe_name` set
  - If any ingredient names already exist in the list (case-insensitive match), respond with a confirmation prompt: "X items from this recipe are already in the list. Add anyway? / Skip duplicates / Cancel"
  - After insert, broadcast `shopping_list_updated` SSE event
- A recipe can be added more than once (if confirmed) — useful for doubling quantities

**"Add custom item" flow:**

- A sticky "+ Add item" bar at the bottom of the list (above the keyboard when open)
- Fields: item name (required), quantity (optional)
- Submit with the Enter key or a "+" button
- Appends item with no `source_recipe_id`; broadcasts `shopping_list_updated`

**Completion state:**

- When all items are checked, show a subtle banner at the top: "All done! 🎉"
- Calendar view reflects this automatically via SSE or next load

---

### 4. Recipes Page (`/recipes`)

**`load` returns:** All recipes ordered by `updated_at DESC`.

**Recipe card:**

- Recipe name
- Ingredient count (e.g. "8 ingredients")
- Created by (username) + last updated date
- Tap → `/recipes/[id]`

**Empty state:** "No recipes yet. Add your first one." + button

**FAB:** "+" → `/recipes/new`

---

### 5. Create Recipe Page (`/recipes/new`)

**Fields:**

- Recipe name (required)
- Description (optional, single-line or short textarea)
- Ingredient list (dynamic rows):
  - Each row: ingredient name (required) + quantity (optional free text)
  - "Add ingredient" button appends a new row
  - Delete icon per row
  - Rows are reorderable — implement with up/down buttons (simpler) or drag handles

**Save action:**

- Validates: name non-empty, at least one ingredient with a non-empty name
- Inserts `recipe` + all `ingredient` rows in a transaction
- Sets `created_by` to the current user's ID
- Broadcasts `recipe_updated` SSE event
- Redirects to `/recipes/[newId]`

---

### 6. View / Edit Recipe Page (`/recipes/[id]`)

**`load` returns:** Recipe row + all ingredient rows ordered by `position`.

**Display mode by default.** An "Edit" button switches to edit mode inline (or navigates to an edit sub-view — agent's choice).

**Edit mode fields:** Same as create page, pre-populated.

**Save action:**

- Updates recipe row (`name`, `description`, `updated_at`)
- Replaces all ingredient rows (delete existing, insert new) in a transaction — simple and correct
- Broadcasts `recipe_updated`
- Returns to display mode

**Delete action:**

- Accessible from an overflow menu (⋮) in the header
- Confirmation dialog: "Delete [Recipe Name]? Items already added to shopping lists will not be removed."
- Deletes recipe (cascades to ingredients; `shopping_items.source_recipe_id` is SET NULL)
- Broadcasts `recipe_deleted`
- Redirects to `/recipes`

---

## Form Actions Pattern

All mutations use SvelteKit named form actions. Example for the shopping list page:

```ts
// src/routes/calendar/[date]/+page.server.ts
export const actions = {
  checkItem: async ({ request, locals }) => { ... },
  addItem: async ({ request, locals }) => { ... },
  addRecipe: async ({ request, locals }) => { ... },
  deleteItem: async ({ request, locals }) => { ... },
  deleteList: async ({ request, locals }) => { ... },
};
```

Use `use:enhance` on all forms in `.svelte` files for progressive enhancement (no full page reload on action submit).

---

## PWA Requirements

- `manifest.webmanifest`:
  - `name`: "Meal Planner"
  - `short_name`: "Planner"
  - `display`: `standalone`
  - `start_url`: `/calendar`
  - `theme_color`: matches app primary colour
  - Icons: 192×192 and 512×512 PNG
- Service worker via Workbox (`@vite-pwa/sveltekit`):
  - Precache all app shell assets
  - **Do not cache API or SSE routes**
  - App shell loads offline; data pages show a "you're offline" state if the network is unavailable
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
- `<meta name="apple-mobile-web-app-capable" content="yes">`
- `<meta name="apple-mobile-web-app-status-bar-style" content="default">`

---

## Mobile UX Requirements

- **Touch targets:** All interactive elements minimum 44×44px (checkboxes, buttons, nav tabs)
- **Bottom sheets** for modals (recipe picker, confirmations) — slide up from bottom, with a drag handle, backdrop tap to dismiss
- **No hover-only interactions** — everything must work on touch
- **Input types:** `inputmode="text"` for all text fields; no `type="number"` spinners (quantity is free text)
- **Keyboard behaviour:** When a soft keyboard opens, the active input must remain visible. The "Add item" bar uses `position: sticky` with appropriate bottom offset. Test on both iOS Safari and Android Chrome.
- **Safe areas:** All fixed/sticky elements account for `env(safe-area-inset-bottom)` and `env(safe-area-inset-top)`
- **Scroll:** Lists scroll inside their container; the page itself does not double-scroll
- **Swipe gestures:** Swipe-to-delete on list items. Use a CSS/JS approach (e.g. a small Svelte action) — no heavy gesture library needed
- **Pull-to-refresh:** Calendar day-card list and recipes list support pull-to-refresh (native iOS rubber-banding or a CSS/JS implementation). Triggers a server load refresh. The shopping list page itself does not need pull-to-refresh since SSE keeps it live.
- **Page transitions & navigation feedback:**
  - Use SvelteKit `onNavigate` with the `ViewTransition` API for smooth cross-page transitions (e.g. calendar → shopping list, recipes → recipe detail). Provides a native-app-like feel in standalone PWA where no browser chrome transitions exist.
  - **Preload on intent:** All `<a>` links that navigate between app pages use `data-sveltekit-preload-data="tap"` so data fetching starts on `touchstart`. By the time the finger lifts, page data is already resolved (or nearly).
  - **Navigation progress bar:** A thin (2–3px), animated progress bar fixed to the top of the viewport, driven by the `onNavigate` lifecycle in the root layout. Appears instantly when navigation starts (no delay), advances during the fetch, and completes when the new page renders. Gives immediate visual feedback even on sub-200ms navigations, eliminating any perception of "stuck."
- **Back navigation:** All sub-pages have a visible back button in the header (←) for standalone PWA use (no browser chrome back affordance).
- **Loading states:** All pages show skeleton placeholders (animated pulsing rectangles) while `load` data is being fetched. Form submissions show a subtle loading indicator on the submit button (spinner replacing label) via `use:enhance` pending state.
- **Error states:** Form validation errors appear inline below the relevant field (red text). Network/server errors show a toast notification at the top or bottom of the screen (auto-dismiss after 5s, with a retry action when applicable). Empty-list states have friendly copy and a CTA button.

---

## Visual Design

- **Feel:** Clean, warm, minimal — a kitchen notebook, not a productivity dashboard
- **Palette:**
  - Background: `#FFF8E1` (pastel yellow)
  - Text: `#4E342E` (dark brown)
  - Primary: `#E07A5F` (warm terracotta) — used for CTAs, active nav tab, completion badges
  - Accent: `#81B29A` (sage green) — used for "partial" list badges, highlights
  - Surface: `#FFFFFF` — cards, bottom sheets
  - Muted: `#8D6E63` (medium brown) — secondary text, checked item text
- **Typography:** System font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`) — no web font loading, instant render
- **Border radius:** 12–16px on cards and bottom sheets; 8px on smaller elements
- **Shadows:** Subtle (`0 1px 3px rgba(0,0,0,0.08)`) on cards; stronger on bottom sheets
- **Checked items:** Strikethrough + `color: #8D6E63` + `opacity: 0.7` — still visible, clearly done
- **"All complete" day on calendar:** Terracotta filled badge with a checkmark, immediately readable at a glance

---

## Environment Variables

```
DATABASE_URL=postgres://user:password@localhost:5432/mealplanner
SESSION_SECRET=<random 32+ char string>
```

---

## Out of Scope

- Recipe preparation steps / cooking instructions
- Nutritional information
- Recipe import from URLs
- Multiple shopping lists per day
- User registration UI (seed users directly in DB)
- Push notifications / reminders
- Aisle/category grouping for shopping items (future addition)
- Multi-server / horizontal scaling (single Hetzner VPS is the target)
