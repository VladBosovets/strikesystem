# Strike System — v2 Plan

This doc captures known issues and planned improvements after the v1 hackathon submission.
Issues are grouped by priority. Start with P1 before touching anything else.

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

### 2. Wrap reset, mod notes, and removal appends in updateStrikeRecord (issues #3, #7)

**Problem:** `addStrike` uses `updateStrikeRecord` with optimistic locking, but
`resetStrikes`, mod note additions, and removal logging all do plain read-mutate-write.
Concurrent mods can overwrite each other's writes.

**Fix:** Refactor `resetStrikes` in `strikes.ts` and the note/removal append logic in
`api.ts` and `forms.ts` to use the `updateStrikeRecord` callback pattern, which uses
`redis.watch` / MULTI / EXEC optimistic locking.

Files: `src/core/strikes.ts` (`resetStrikes`), `src/routes/api.ts` (note/removal appends),
`src/routes/forms.ts` (note/removal appends).

---

### 3. Guard auto-ban side effects atomically (issue #4)

**Problem:** `checkAndBan` reads `isBanned`, and if false, fires `banUser()` and sends
modmail. Two concurrent final strikes can both read `isBanned=false` before either writes
`isBanned=true`, causing duplicate bans and duplicate modmail.

**Fix:** Set `isBanned=true` inside the `updateStrikeRecord` callback (already atomic).
Move the `banUser()` / modmail calls to after the record write, and use the return value
of `updateStrikeRecord` to determine if this invocation was the one that flipped the flag.
Only the invocation that actually wrote `isBanned=true` fires the side effects.

Files: `src/core/strikes.ts` (`checkAndBan`, `addStrike`).

---

## P2 — UX Reliability (fix for production confidence)

### 4. Auto-refresh user detail view (issue #14)

**Problem:** The dashboard overview polls every 30s, but `useUser` only fetches on mount
and after local actions. A mod parked on a user detail page during an active incident
operates on indefinitely stale state.

**Fix:** Add a polling interval (e.g. 30s) in `useUser` using the same seqRef pattern
already in `useDashboard`. Or add a manual refresh button as a simpler alternative.

Files: `src/client/hooks/useUser.ts`.

---

### 5. Clarify stale dashboard detail on concurrent mod actions (issue #2)

**Problem:** If two mods act on the same user simultaneously, the second mod's UI may show
the pre-action state and display a confusing server error when they try to act.

**Fix:** After a failed action (non-ok response), always reload user data before showing
the error. This way the UI self-corrects rather than leaving the mod staring at wrong state.

Files: `src/client/views/UserDetail.tsx` (error handling in `StrikePanel`, `ResetPanel`).

---

### 6. Validate config values (issue #8)

**Problem:** `maxStrikes=0` or negative makes every strike immediately ban-worthy.
Negative `banDuration` is silently treated as permanent.

**Fix:** Clamp `maxStrikes` to at least 1 in `strikes.ts`. Clamp `banDuration` to 0 or
above. Optionally surface a warning toast on the settings page for out-of-range values.

Files: `src/core/strikes.ts` (add guards at read time), `devvit.json` (add `min` if SDK supports it).

---

### 7. Defensive fallback for empty rules (issue #9)

**Problem:** If a mod sets subreddit rules to only blank lines, the rules list filters to
empty and the strike/remove forms have no selectable rule, making them unusable.

**Fix:** After filtering, if `ruleOptions` is empty, fall back to `DEFAULT_CONFIG.rules`.
Add a visible warning in the form or settings so mods know their rules config is invalid.

Files: `src/routes/menu.ts` (rules parsing), possibly a settings validation step.

---

### 8. Recover stale dashboard post reference (issue #10)

**Problem:** The stored dashboard post reference can point to a deleted post if the delete
event was missed. Mods get sent to a broken URL with no recovery path.

**Fix:** When navigation to the stored URL fails (or ideally, before navigating),
attempt to fetch the post via Reddit API to confirm it exists. If it does not, clear the
stored ref and let the mod create a new dashboard post.

Files: `src/routes/menu.ts` (`create-dashboard-post` handler).

---

### 9. DM ordering — send after ban confirmation (issue #13)

**Problem:** The warning DM is built and sent before `checkAndBan` is called. If the ban
API fails, the user receives "you have been banned" but was not actually banned.

**Fix:** Move DM send to after `checkAndBan` resolves. Pass the ban outcome into the DM
template so the message accurately reflects what actually happened.

Files: `src/routes/forms.ts` (reorder DM send relative to `checkAndBan` call).

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

### 12. Wording: reset vs delete (issue #12)

Reset keeps full history and only clears active strikes. Update UI labels and README
to make this explicit: "Reset active strikes" not just "Reset Strikes". Add a tooltip
or helper text in the reset form.

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
