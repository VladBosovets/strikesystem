# Strike System — v2 Plan

This doc captures known issues and planned improvements after the v1 hackathon submission.
Issues are grouped by priority. Start with P1 before touching anything else.

---

## Completed (on `development` / `feedback-fixes` branches)

### P1 #3 — Guard auto-ban side effects atomically ✅
`isBanned=true` is now set inside the `updateStrikeRecord` callback. `checkAndBan` is deleted.
Only the invocation that flips the flag fires `banUser()` and modmail. If `banUser` throws,
`isBanned` is restored to `false`. `addStrike` now takes `subredditName` as a parameter.

### P1 #2 — Wrap `resetStrikes` in `updateStrikeRecord` ✅
`resetStrikes` now uses the callback pattern with optimistic locking.
`strikesAtReset` is captured via closure from the winning callback execution.
Note: mod note additions and removal appends are still plain read-mutate-write (see P1 #2 below).

### P2 #4 — Auto-refresh user detail view ✅
`useUser.ts` now polls every 30s using the seqRef pattern. Stale state during active incidents
is no longer possible.

### P2 #5 — Reload after failed action ✅
`StrikePanel` and `ResetPanel` accept an `onReload` prop. On any failed action the UI
reloads user data before displaying the error, so concurrent mod conflicts self-correct.

### P2 #6 — Validate config values ✅
`loadConfig` clamps `maxStrikesBeforeBan` to `Math.max(1, ...)` and `banDuration` to
`Math.max(0, ...)`. Bad settings can no longer trigger immediate bans or silently behave wrong.

### P2 #7 — Defensive fallback for empty rules ✅
Both `menu.ts` and `api.ts` now fall back to `DEFAULT_CONFIG.rules` when the parsed rules
list is empty. Strike/remove forms are never left with no selectable rule.

### P4 #12 — Reset wording ✅
Button label and panel title updated to "Reset Active Strikes" throughout `UserDetail.tsx`.

### Additional fixes shipped outside the original plan

- **Emoji/black-box fix**: `buildAccountIntelDisplay`, `buildStrikeHistoryDisplay`, and
  `menu.ts` view-all-warnings replaced all emoji and Unicode block chars (`⛔ 🚨 ⚠️ █ ░ ✓`)
  with plain ASCII equivalents (`[BANNED]`, `[!!]`, `[!]`). Devvit paragraph fields render
  emoji as black boxes.

- **DM reply warning**: Warning DMs now open with an explicit note that replies go to an
  unmonitored account and direct users to the modmail link instead.

- **Dashboard duplicate creation fix**: After creating a dashboard post, the handler
  re-reads the stored ref. If it doesn't match the new post, the new post is deleted and
  the mod is navigated to the existing one.

- **App install modmail**: `on-app-install` trigger now sends a setup guide to subreddit
  modmail covering all menu actions and configuration steps.

- **Dashboard mod-only message**: Non-mods who open the dashboard post see "This dashboard
  is for moderators only." instead of a blank/broken loading state. Implemented by detecting
  the 403 from `/api/dashboard/users` in `useDashboard.ts` and rendering a gate in `App.tsx`.

---

## P1 — Data Integrity (fix before any broad install)

### 1. Per-form pending tokens (issue #1)

**Problem:** Pending state is keyed by `subredditId + modUserId`. If a mod opens a strike
form for User A, then opens one for User B before submitting, submitting A's form will
strike User B. Same risk for reset, mod note, and remove & log.

**Fix:** Include a random nonce/token in the form payload when the menu item fires.
Echo it back on submit. The handler validates the token matches before acting.
This makes each form instance unique regardless of how many a mod has open.

Files: `src/core/redis.ts` (pending key shape), `src/routes/menu.ts` (add nonce to form),
`src/routes/forms.ts` (validate nonce on submit).

---

### 2. Wrap mod notes and removal appends in updateStrikeRecord (issues #3, #7)

**Problem:** Mod note additions and removal logging still do plain read-mutate-write.
Concurrent mods can overwrite each other's writes. (`resetStrikes` is already fixed — see above.)

**Fix:** Refactor the note/removal append logic in `api.ts` and `forms.ts` to use the
`updateStrikeRecord` callback pattern with `redis.watch` / MULTI / EXEC optimistic locking.

Files: `src/routes/api.ts` (note/removal appends), `src/routes/forms.ts` (note/removal appends).

---

## P2 — UX Reliability (fix for production confidence)

### 8. Recover stale dashboard post reference (issue #10)

**Problem:** The stored dashboard post reference can point to a deleted post if the delete
event was missed. Mods get sent to a broken URL with no recovery path.

**Fix:** When navigation to the stored URL fails (or ideally, before navigating),
attempt to fetch the post via Reddit API to confirm it exists. If it does not, clear the
stored ref and let the mod create a new dashboard post.

Files: `src/routes/menu.ts` (`create-dashboard-post` handler).

---

## P3 — Scale (fix before large-community rollout)

### 10. Paginate dashboard and "View All Strikes" (issue #5)

**Problem:** Dashboard and "View All Strikes" load every warned user and every record in
one shot. At hundreds or thousands of records, this is slow, memory-heavy, and can hit
rate limits.

**Fix:** Add server-side pagination to `/api/dashboard/users`. The sorted set already
supports `ZRANGE` with offset/count. Return a page of results plus a total count.
Add a "Load more" button or page controls on the dashboard UI.

Files: `src/routes/api.ts`, `src/core/redis.ts` (`getWarnedUserIds` with offset/limit),
`src/client/views/Dashboard.tsx` (pagination controls).

---

### 11. Limit delete-event cleanup scan (issue #6)

**Problem:** `clearDeletedPostFromRecords` and `clearDeletedCommentFromRecords` scan every
warned user on every delete event. In active subreddits this becomes expensive background
work.

**Fix options:**
- Add a reverse index: when a post/comment ID is stored in a strike/removal record, also
  write a `content-to-user:{contentId}` key. Delete cleanup becomes O(1) lookup instead of
  O(n) scan.
- Or: process cleanup in a queue/batch rather than synchronously in the trigger handler,
  so it does not block the trigger response.

Files: `src/core/redis.ts`, `src/routes/triggers.ts`.

---

## P4 — Polish / Nice-to-Have

### 13. Manual ban/unban reconciliation (issue #11)

If a mod manually bans/unbans outside the app, the dashboard shows the wrong state.
Full fix requires polling Reddit's ban list on each load (expensive). Pragmatic minimum:
add a "Sync from Reddit" button on the user detail page that refreshes `isBanned` from
a live Reddit API call.

---

## P5 — Competitive Differentiation (judge / grand prize concerns)

### 14. Analytics and impact metrics

**Problem:** The judge flagged "does not yet show measurable impact, analytics, or
queue-time reduction" as a reason the app would not contend for grand prize. The dashboard
shows per-user state but nothing that tells a story about the subreddit as a whole.

**Fix:** Add a stats panel to the dashboard showing community-level metrics:
- Total strikes issued (all time and last 30 days)
- Total auto-bans triggered
- Most-violated rules (ranked list)
- Active vs. cleared strikes ratio
- Strikes issued per week/month (simple trend, no chart library needed — just numbers)

These numbers make the value proposition concrete: "We issued 47 strikes this month,
auto-banned 3 users, and rule #2 is violated 2x more than any other." Judges and mods
can see impact at a glance.

**Implementation:**
- Add a `stats:{subredditId}` Redis hash that increments counters on each strike, ban, and
  reset event. Counters: `totalStrikes`, `totalBans`, `totalResets`, `strikes:{ruleName}`,
  `strikesThisMonth:{YYYY-MM}` (rotates monthly, old keys auto-expire via `redis.expire`).
- Add a `/api/dashboard/stats` endpoint that reads the hash.
- Add a `StatsPanel` component at the top of the dashboard above the user list.

Files: `src/core/redis.ts` (stats key + increment helpers), `src/core/strikes.ts`
(increment on strike/ban), `src/routes/api.ts` (new stats endpoint),
`src/client/views/Dashboard.tsx` (StatsPanel component).

---

### 15. Sharpen the "why this beats existing strike bots" narrative

**Problem:** The judge noted strike/warning systems are familiar, and the app needs a
clearer pitch on why it is better than existing Reddit bots (AutoModerator rules,
Moderator Toolbox, external Discord bots). Without this, the novelty score stays low.

**Fix:** Update README and the dashboard's own UI copy to make the Devvit-native
advantages explicit and scannable:

**README additions:**
- Add a "Why Strike System?" section near the top with a direct comparison table:

  | Capability | AutoMod | External bot | Strike System |
  |---|---|---|---|
  | Context-menu strike from any post/comment | — | — | Yes |
  | Strike history visible inside Reddit UI | — | — | Yes |
  | Auto-ban with configurable threshold | Partial | Yes | Yes |
  | Mod team dashboard inside Reddit | — | — | Yes |
  | No external server or auth setup needed | Yes | — | Yes |
  | Removal log linked to user record | — | Partial | Yes |

- Add a "How it works in 30 seconds" section with a 3-step flow (mod sees bad post →
  clicks three-dot menu → selects Issue Strike → done) so evaluators who skim can
  immediately grasp the UX.

**Dashboard UI copy:**
- Add a subtitle or tagline on the dashboard post itself (the one created in the
  subreddit) that explains the app to any mod who encounters it for the first time,
  not just the one who set it up.

Files: `README.md`, `src/routes/menu.ts` (dashboard post body text when created).

---

## Not Fixing

- **30-day data expiry**: Not required by Devvit Rules. Rules require handling account
  deletion (not yet possible — `onAccountDelete` is not exposed by the SDK), not
  automatic expiry of all records.
- **Account deletion**: `onAccountDelete` is not in the `@devvit/web` config schema.
  Document the limitation. Revisit when the SDK adds support.
- **Manual bans fully invisible**: Would require polling Reddit's ban list on every
  detail load. Too expensive for the gain; covered by the "Sync" button in P4.
