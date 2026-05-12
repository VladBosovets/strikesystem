# Option B — Interactive Post Dashboard
## Implementation Plan

Branch strategy: each step gets its own branch off `better-ui`.
After tests pass, merge back to `better-ui`, then cut next step branch.

```
better-ui
  └── step-1-build-setup       (vite config + devvit.json + skeleton HTML)
  └── step-2-api-endpoints     (Hono /api/ routes for dashboard data)
  └── step-3-create-post-menu  (menu item that submits the dashboard post)
  └── step-4-overview-view     (React overview: list of warned users)
  └── step-5-detail-view       (React detail: single user drill-down)
  └── step-6-polish            (loading states, error states, empty states, CSS)
```

---

## Naming Standards

### Branches
`step-N-short-description` — always branched from `better-ui`, merged back to `better-ui`.

### Files
| Type | Convention | Example |
|------|-----------|---------|
| React components | PascalCase `.tsx` | `Overview.tsx`, `UserRow.tsx` |
| React hooks | camelCase prefixed `use` | `useDashboard.ts`, `useUser.ts` |
| Shared types | camelCase `.ts` | `api.ts` |
| Styles | kebab-case `.css` | `dashboard.css`, `user-row.css` |
| Test files | same name + `.test.ts(x)` | `Overview.test.tsx`, `api.test.ts` |
| Server routes | camelCase `.ts` | `api.ts` (already exists) |

### Directories
```
src/
  client/                   ← all client-side code
    index.html              ← Vite entry point
    index.tsx               ← React root (mounts App)
    App.tsx                 ← view router (state-based, no React Router)
    views/
      Overview.tsx          ← warned users list view
      UserDetail.tsx        ← single user drill-down view
    components/
      StrikeBar.tsx         ← visual ██░ progress bar
      UserRow.tsx           ← one row in the overview list
      LoadingSpinner.tsx    ← full-screen loading state
      ErrorMessage.tsx      ← error display
    hooks/
      useDashboard.ts       ← fetches /api/dashboard/users
      useUser.ts            ← fetches /api/dashboard/user/:userId
    types/
      api.ts                ← response types (mirrored on server)
    styles/
      global.css            ← resets, variables, typography
      overview.css
      user-detail.css
      components.css        ← shared component styles
  routes/
    api.ts                  ← dashboard API endpoints (currently empty)
    ... (existing files)
```

### CSS classes
kebab-case, prefixed with component name to avoid collisions.
```css
.overview-header { }
.overview-user-list { }
.user-row { }
.user-row--banned { }       /* modifier: BEM double-dash */
.strike-bar { }
.strike-bar__filled { }     /* element: BEM double-underscore */
```

### API endpoints
All under `/api/dashboard/` to namespace away from future endpoints.
```
GET /api/dashboard/users              → all warned users (overview)
GET /api/dashboard/user/:userId       → one user full detail
GET /api/dashboard/config             → maxStrikes setting
```

### React component props
PascalCase interfaces, named `{ComponentName}Props`.
```typescript
interface UserRowProps { ... }
interface StrikeBarProps { ... }
```

### View state (App.tsx routing)
```typescript
type View =
  | { name: 'overview' }
  | { name: 'user-detail'; userId: string; username: string };
```

---

## Shared API Types  (`src/client/types/api.ts` + mirrored in server)

```typescript
// GET /api/dashboard/users
export type DashboardUser = {
  userId: string;
  username: string;
  activeStrikes: number;
  totalStrikes: number;
  isBanned: boolean;
  lastUpdated: string;        // ISO string
};
export type DashboardUsersResponse = {
  users: DashboardUser[];     // sorted: banned first, then by activeStrikes desc
  maxStrikes: number;
};

// GET /api/dashboard/user/:userId
export type DashboardUserDetail = {
  userId: string;
  username: string;
  activeStrikes: number;
  totalStrikes: number;
  isBanned: boolean;
  lastUpdated: string;
  strikes: StrikeEntry[];
  resets: ResetEntry[];
  removals: RemovalEntry[];
  modNotes: ModNote[];
};
export type DashboardUserDetailResponse = {
  user: DashboardUserDetail;
  maxStrikes: number;
};

// GET /api/dashboard/config
export type DashboardConfigResponse = {
  maxStrikes: number;
  subredditName: string;
};
```

---

## Step-by-Step Plan

---

### Step 1 — Build Setup
**Branch:** `step-1-build-setup`

**Goal:** Client code compiles and the skeleton HTML loads in the post — nothing functional yet.

**Changes:**
1. `vite.config.ts` — add client environment targeting `src/client/index.html` → `dist/client/`
   - Research exact config by checking `node_modules/@devvit/start/` for examples
   - May need `@vitejs/plugin-react` installed
2. `package.json` — add `@vitejs/plugin-react` as devDependency if needed; add `react`, `react-dom` as dependencies
3. `devvit.json` — add `"post"` section:
   ```json
   "post": {
     "dir": "dist/client",
     "entrypoints": {
       "default": {
         "entry": "index.html",
         "height": "tall",
         "inline": false
       }
     }
   }
   ```
4. `src/client/index.html` — minimal HTML shell with `<div id="root">` and script tag
5. `src/client/index.tsx` — React root that renders `<App />`
6. `src/client/App.tsx` — skeleton: renders `<h1>Dashboard loading...</h1>`
7. `tsconfig.json` — ensure `src/client/**` is included and JSX is configured

**Tests required:**
- `npm run type-check` passes
- `npm run build` (or `vite build`) produces `dist/client/index.html`
- No test file needed — build output is the proof

**Merge criteria:** `npm run build` succeeds, `npm run type-check` clean, `npm test` still 100/100.

---

### Step 2 — API Endpoints
**Branch:** `step-2-api-endpoints`

**Goal:** Server exposes the three dashboard data endpoints, fully tested.

**Changes:**
1. `src/routes/api.ts` — implement three GET handlers:
   - `GET /api/dashboard/config` — returns `{ maxStrikes, subredditName }`
   - `GET /api/dashboard/users` — reads `warned-index` sorted set, fetches all records in parallel, sorts (banned first, then by activeStrikes desc), returns `DashboardUsersResponse`
   - `GET /api/dashboard/user/:userId` — reads strike record + mod notes in parallel, returns `DashboardUserDetailResponse`
2. `src/client/types/api.ts` — create shared response types (client imports these)

**Tests required — `src/routes/api.test.ts`:**
- `GET /api/dashboard/config`:
  - returns maxStrikes from settings (default 3)
  - returns subredditName from context
- `GET /api/dashboard/users`:
  - returns empty array when no users warned
  - returns active users sorted by activeStrikes desc
  - puts banned users first in list
  - excludes no data for userId not in records (graceful null handling)
- `GET /api/dashboard/user/:userId`:
  - returns 404 when user has no record
  - returns full record with strikes, resets, removals, modNotes
  - returns correct maxStrikes

**Merge criteria:** All new tests pass, `npm test` still 100+/100+, type-check clean.

---

### Step 3 — Create Dashboard Post Menu Item
**Branch:** `step-3-create-post-menu`

**Goal:** Mod clicks "Open Mod Dashboard" in subreddit menu → dashboard post is created and mod is navigated to it.

**Changes:**
1. `devvit.json` — add subreddit menu item:
   ```json
   {
     "label": "Open Mod Dashboard",
     "description": "Open the Strike System mod dashboard for this subreddit.",
     "location": "subreddit",
     "forUserType": "moderator",
     "endpoint": "/internal/menu/create-dashboard-post"
   }
   ```
2. `src/routes/menu.ts` — add handler `POST /internal/menu/create-dashboard-post`:
   - Check mod permissions
   - Call `reddit.submitCustomPost({ subredditName, title: 'Mod Dashboard — Strike System', entry: 'default' })`
   - Return `{ navigateTo: postUrl }`
3. Research `reddit.submitCustomPost` signature in `node_modules/@devvit/reddit/RedditClient.d.ts` before implementing

**Tests required — add to `src/routes/menu.test.ts`:**
- Returns no-permission toast when mod lacks permissions
- Calls `reddit.submitCustomPost` with correct subredditName and entry
- Returns navigateTo URL pointing to the created post

**Merge criteria:** Tests pass, type-check clean, `npm test` all green.

---

### Step 4 — Overview View
**Branch:** `step-4-overview-view`

**Goal:** Dashboard post renders a list of warned users with their active strike count and a visual progress bar.

**Changes:**
1. `src/client/hooks/useDashboard.ts` — fetches `/api/dashboard/users`, handles loading/error states
2. `src/client/types/api.ts` — finalize types (from Step 2)
3. `src/client/components/StrikeBar.tsx` — visual `█░░` bar, props: `{ active: number, max: number }`
4. `src/client/components/UserRow.tsx` — single row: username, strike badge, StrikeBar, banned indicator
5. `src/client/views/Overview.tsx` — renders header (subreddit name, counts), user list, empty state
6. `src/client/components/LoadingSpinner.tsx` — centred spinner for loading states
7. `src/client/components/ErrorMessage.tsx` — error display with retry button
8. `src/client/App.tsx` — wire up view state, render Overview, handle click → navigate to UserDetail
9. `src/client/styles/` — CSS for all above components

**Tests required:**
- `src/client/hooks/useDashboard.test.ts`:
  - Calls correct API endpoint
  - Returns users and maxStrikes on success
  - Returns error state on fetch failure
  - Returns loading true initially
- `src/client/components/StrikeBar.test.tsx`:
  - Renders correct number of filled blocks for active/max
  - Shows all filled when active === max
  - Shows all empty when active === 0
- `src/client/components/UserRow.test.tsx`:
  - Renders username
  - Shows ⛔ indicator when isBanned
  - Does not show banned indicator when not banned
  - Renders StrikeBar with correct props

**Testing setup needed:** Install `@testing-library/react` + `jsdom` environment in vitest config for client tests.

**Merge criteria:** All component tests pass, visual check in playtest looks correct, `npm test` all green.

---

### Step 5 — User Detail View
**Branch:** `step-5-detail-view`

**Goal:** Clicking a user in the overview navigates to their full strike history, mod notes, and account intel.

**Changes:**
1. `src/client/hooks/useUser.ts` — fetches `/api/dashboard/user/:userId`, handles loading/error
2. `src/client/views/UserDetail.tsx` — renders:
   - Back button (returns to Overview)
   - Account summary: username, activeStrikes/maxStrikes badge, banned status
   - Strike history list (each strike: number, date, rule, mod, note)
   - Reset history (each reset: date, by, reason)
   - Removal log (each removal: date, rule, mod, note)
   - Mod notes (each note: date, author, text)
   - Empty states for each section
3. `src/client/App.tsx` — handle back navigation
4. `src/client/styles/user-detail.css`

**Tests required:**
- `src/client/hooks/useUser.test.ts`:
  - Calls correct API endpoint with userId
  - Returns user detail on success
  - Returns error state on 404
- `src/client/views/UserDetail.test.tsx`:
  - Renders username and strike count
  - Shows each section (strikes, resets, removals, notes)
  - Shows empty state messages when sections are empty
  - Back button click triggers onBack callback

**Merge criteria:** Tests pass, visual check in playtest — back button works, all sections render correctly.

---

### Step 6 — Polish
**Branch:** `step-6-polish`

**Goal:** App is visually polished, handles all edge cases, ready for demo.

**Changes:**
1. CSS refinements across all components — consistent spacing, colours, typography
2. Loading skeleton states (not just a spinner)
3. Auto-refresh on the overview every 30 seconds (so mods see live updates without reload)
4. Page title in HTML matches subreddit name (from `window.devvit.context`)
5. Graceful handling of users with no strike record in the index (cleanup stale index entries)
6. Responsive layout — works in both `inline` (compact) and `expanded` (tall modal) modes
7. `README.md` — update with dashboard section and screenshots

**Tests required:**
- Auto-refresh test in `useDashboard.test.ts` — verify refetch is triggered on interval
- Stale entry test in API — userId in index but no record returns gracefully (already handled, add explicit test)

**Merge criteria:** Full playtest walkthrough — create post, view overview, click user, back, all states work. `npm test` all green.

---

## What we are NOT building in Option B
- Text input inside the post (actions still use the existing mod menu forms)
- Multi-subreddit aggregation
- Sorting/filtering controls (deferred — list is already sorted by severity)
- Pagination (sorted set gives us all users; cap display at 50 if needed)

---

## Test infrastructure additions needed (Step 4)

Add to `vitest.config.ts` a separate workspace for client tests:
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    workspace: [
      { test: { include: ['src/core/**/*.test.ts', 'src/routes/**/*.test.ts'], environment: 'node' } },
      { test: { include: ['src/client/**/*.test.tsx', 'src/client/**/*.test.ts'], environment: 'jsdom' }, plugins: [react()] },
    ]
  }
});
```

---

## Definition of done (Option B)
- [ ] Dashboard post can be created from subreddit mod menu
- [ ] Overview shows all warned users, sorted, with progress bars
- [ ] Clicking a user shows full strike history + notes
- [ ] Back button works
- [ ] Loading and error states render correctly
- [ ] `npm test` passes (all existing 100+ tests + new client tests)
- [ ] `npm run type-check` clean
- [ ] Playtest walkthrough complete end-to-end
