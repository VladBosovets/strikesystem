# Strike System — Phase 2 Features
*Planning doc for new additions. Build after core flow is confirmed working.*

---

## Overview of additions

| Feature | New menu items | Data model change | Est. time |
|---|---|---|---|
| 1. View Strike History | "View Strike History" (post + comment) | None | ~45 min |
| 2. Reset Strikes | "Reset Strikes" (post + comment) | Add `resets[]` to StrikeRecord | ~1 hr |
| 3. Mod Notes | "Mod Notes" (post + comment) | New Redis key `mod-notes:{sub}:{user}` | ~1.5 hr |
| 4. Account Intelligence | None (enriches existing forms) | None | ~1 hr |
| 5. Remove & Log | "Remove & Log" (post + comment) | Add `removals[]` to StrikeRecord | ~1 hr |

**Total estimate: ~5.5 hours**

---

## Build order

Build in this sequence — each step depends on the previous:

```
1. Data model changes (StrikeRecord + new types in redis.ts)
2. Account intelligence helper function (used by steps 3 + 4)
3. View Strike History (confirms the pattern, uses existing data)
4. Reset Strikes (new action, uses updated data model)
5. Mod Notes (standalone new key, new menu + form)
6. Remove & Log (new action, uses updated data model)
7. devvit.json — add all new menu items + form registrations
8. Update existing warning form to show account intel + notes
```

---

## Data model changes

### StrikeRecord additions (`src/core/redis.ts`)

Add two new arrays to the existing `StrikeRecord` type:

```typescript
type ResetEntry = {
  resetAt: string;       // ISO timestamp
  resetBy: string;       // mod username
  reason: string;        // optional reason
  strikesAtReset: number; // how many strikes were active when reset
};

type RemovalEntry = {
  contentId: string;     // t1_ or t3_ ID of removed content
  contentUrl: string;
  ruleViolated: string;
  note: string;
  removedBy: string;
  removedAt: string;     // ISO timestamp
};

// Updated StrikeRecord:
type StrikeRecord = {
  userId: string;
  username: string;
  strikes: StrikeEntry[];
  resets: ResetEntry[];       // NEW — audit trail of resets
  removals: RemovalEntry[];   // NEW — informal removal log
  totalStrikes: number;       // all-time count, never decremented
  activeStrikes: number;      // NEW — count since last reset (used for ban threshold)
  isBanned: boolean;
  lastUpdated: string;
};
```

**Key rule:** ban threshold checks use `activeStrikes`, not `totalStrikes`.
On reset: set `activeStrikes = 0`, push to `resets[]`, keep `strikes[]` untouched.
On new strike: increment both `totalStrikes` and `activeStrikes`.

**Backwards compatibility:** existing records won't have `resets`, `removals`, or
`activeStrikes`. All reads must default these:
```typescript
record.resets    = record.resets    ?? [];
record.removals  = record.removals  ?? [];
record.activeStrikes = record.activeStrikes ?? record.totalStrikes;
```

### Mod Notes (new Redis key)

```typescript
type ModNote = {
  id: string;        // Date.now().toString() — simple unique ID
  text: string;
  author: string;    // mod username
  createdAt: string; // ISO timestamp
};

// Redis key: mod-notes:{subredditId}:{userId} → JSON array of ModNote
```

New functions in `redis.ts`:
```typescript
getModNotes(subredditId, userId) → ModNote[]
saveModNotes(subredditId, userId, notes) → void
```

---

## Feature 1: View Strike History

### User flow
1. Mod right-clicks post or comment → "View Strike History"
2. Form opens (read-only display) showing:
   - **Account intelligence** (age, karma, risk signals)
   - **Strike history** (all strikes with dates and rules)
   - **Reset history** (if any resets have occurred)
   - **Removal log** (informal content removals)
   - **Mod notes** (all team notes on this user)
3. Submit button says "Done" — handler just returns an empty success toast

### New files/changes
- `devvit.json` — add menu item `"View Strike History"` (location: post + comment), form `viewStrikes`
- `src/routes/menu.ts` — add `POST /view-strikes` handler
- `src/routes/forms.ts` — add `POST /view-strikes-close` handler (no-op, returns empty toast)

### Menu handler logic (`/internal/menu/view-strikes`)
```
1. Get targetId from request
2. Resolve author (same as warn-user handler)
3. Check mod permissions
4. Fetch: getStrikeRecord, getModNotes, reddit.getUserById (for account intel)
5. Build display text for each section
6. Return showForm with name: 'viewStrikes'
```

### Form fields
```
- accountInfo   (paragraph, read-only label, shows age/karma/signals)
- strikeHistory (paragraph, read-only label, shows all strikes + resets)
- removalLog    (paragraph, read-only label, shows informal removals)
- modNotes      (paragraph, read-only label, shows all mod notes)
```

No editable fields. Submit = "Done". The form is purely informational.

### Account intelligence display format
```
u/username — Account info
• Created: 14 days ago ⚠️ (new account)
• Karma: 23 total (3 post / 20 comment) ⚠️ (very low)
• Subreddit: joined ~14 days ago
```

Red flag thresholds:
- Account age < 30 days → `⚠️ new account`
- Total karma < 100 → `⚠️ very low karma`
- Both present → show prominently

---

## Feature 2: Reset Strikes

### User flow
1. Mod right-clicks post or comment → "Reset Strikes"
2. Form shows:
   - Current active strike count
   - Full strike history (read-only)
   - Optional reason field
   - Confirm toggle
3. On submit:
   - Push `ResetEntry` to `resets[]`
   - Set `activeStrikes = 0`
   - Set `isBanned = false` (allow re-entry if they were banned)
   - Toast: `"Strikes reset for u/username. They had X active strikes."`

### New files/changes
- `devvit.json` — add menu item `"Reset Strikes"` (post + comment), form `resetStrikes`
- `src/routes/menu.ts` — add `POST /reset-strikes` handler
- `src/routes/forms.ts` — add `POST /reset-strikes-submit` handler
- `src/core/strikes.ts` — add `resetStrikes()` function (update to new model)

### Form fields
```
- history   (paragraph, shows current active strikes + all-time total)
- reason    (string, optional, "Reason for reset")
- confirm   (boolean, required, "I confirm I want to reset this user's strikes")
```

### Edge cases
- User has 0 active strikes → toast "u/username has no active strikes to reset." (no form)
- User not found → toast "No strike record found for this user."

---

## Feature 3: Mod Notes

### User flow
1. Mod right-clicks post or comment → "Mod Notes"
2. Form shows:
   - All existing notes (numbered list, read-only paragraph)
   - Text area to add a new note
   - Optional: number field "Delete note #" (blank = don't delete)
3. On submit:
   - If new note text is not empty → append to notes array
   - If delete number is filled → remove that note by index
   - Both can happen in same submit
   - Toast: "Note added." / "Note deleted." / "Note added and note #X deleted."

### New files/changes
- `devvit.json` — add menu item `"Mod Notes"` (post + comment), form `modNotes`
- `src/routes/menu.ts` — add `POST /mod-notes` handler
- `src/routes/forms.ts` — add `POST /mod-notes-submit` handler
- `src/core/redis.ts` — add `getModNotes`, `saveModNotes`

### Form fields
```
- existingNotes  (paragraph, read-only display, numbered list of all notes)
- newNote        (paragraph, "Add a note", optional)
- deleteNote     (number, "Delete note # (optional)", optional)
```

### Notes display format in existing warning form
```
Mod notes (2)
#1 [2026-05-10] testmod: Keep an eye on this one — possible alt account.
#2 [2026-05-11] anothermod: Responded well to previous warning.
```

### Notes display when no notes exist
```
No mod notes yet.
```

### Show mod notes in:
- Warning form (view-only, between history and rule dropdown)
- View Strike History form (view-only)

---

## Feature 4: Account Intelligence

### Not a new menu item — enriches existing forms

Fetch via `reddit.getUserById(authorId)` — already called in `menu.ts`.
Currently discarding most of the data. Surface it instead.

### Data to extract
```typescript
const accountAgeMs = Date.now() - new Date(user.createdAt).getTime();
const accountAgeDays = Math.floor(accountAgeMs / (1000 * 60 * 60 * 24));
const totalKarma = (user.linkKarma ?? 0) + (user.commentKarma ?? 0);
```

### Risk signal logic
```typescript
const signals: string[] = [];
if (accountAgeDays < 30)  signals.push('⚠️ New account (<30 days)');
if (accountAgeDays < 7)   signals.push('🚨 Very new account (<7 days)');
if (totalKarma < 100)     signals.push('⚠️ Very low karma');
if (totalKarma < 10)      signals.push('🚨 Almost zero karma');
```

### Display format (paragraph field, read-only label)
```
u/username — Account
• Age: 14 days  ⚠️ New account (<30 days)
• Karma: 23 (3 post / 20 comment)  ⚠️ Very low karma
```

### Where to add it
1. Warning form — new paragraph field above history
2. View Strike History form — first field shown

### Implementation location
Extract into a helper function in `src/core/strikes.ts`:
```typescript
buildAccountIntelDisplay(user: User): string
```
Call it from both the warn-user and view-strikes menu handlers.

---

## Feature 5: Remove & Log

### User flow
1. Mod right-clicks post or comment → "Remove & Log"
2. Form shows:
   - Rule violated (dropdown, same as warning form)
   - Note (optional)
   - No confirmation needed — action is clear from menu label
3. On submit:
   - Remove the post/comment via Reddit API (`comment.remove()` / `post.remove()`)
   - Append `RemovalEntry` to user's `removals[]` in Redis
   - No DM sent to user
   - No strike count change
   - Toast: `"Content removed and logged against u/username."`

### New files/changes
- `devvit.json` — add menu item `"Remove & Log"` (post + comment), form `removeLog`
- `src/routes/menu.ts` — add `POST /remove-log` handler
- `src/routes/forms.ts` — add `POST /remove-log-submit` handler
- `src/core/strikes.ts` — add `logRemoval()` function
- `src/core/redis.ts` — `RemovalEntry` type + save logic (via `saveStrikeRecord`)

### Form fields
```
- rule  (select, same rule options as warning form)
- note  (paragraph, optional)
```

### Removal log display in View Strike History
```
Content removals (3)
• [2026-05-08] testmod removed post — Rule 2 - No spam
• [2026-05-09] testmod removed comment — Rule 1 - Be respectful
• [2026-05-11] anothermod removed comment — Rule 3 - No misinformation
  Note: "Third time this week"
```

### Edge cases
- Content already removed → Reddit API will error; catch and show "Content was already removed. Log still saved."
- No existing record for user → create one with empty strikes[], push to removals[]

---

## devvit.json changes needed

### New menu items to add
```json
{ "label": "View Strike History", "location": "comment", "forUserType": "moderator", "endpoint": "/internal/menu/view-strikes" },
{ "label": "View Strike History", "location": "post",    "forUserType": "moderator", "endpoint": "/internal/menu/view-strikes" },
{ "label": "Reset Strikes",       "location": "comment", "forUserType": "moderator", "endpoint": "/internal/menu/reset-strikes" },
{ "label": "Reset Strikes",       "location": "post",    "forUserType": "moderator", "endpoint": "/internal/menu/reset-strikes" },
{ "label": "Mod Notes",           "location": "comment", "forUserType": "moderator", "endpoint": "/internal/menu/mod-notes" },
{ "label": "Mod Notes",           "location": "post",    "forUserType": "moderator", "endpoint": "/internal/menu/mod-notes" },
{ "label": "Remove & Log",        "location": "comment", "forUserType": "moderator", "endpoint": "/internal/menu/remove-log" },
{ "label": "Remove & Log",        "location": "post",    "forUserType": "moderator", "endpoint": "/internal/menu/remove-log" }
```

### New forms to register
```json
"viewStrikes":    "/internal/form/view-strikes-close",
"resetStrikes":   "/internal/form/reset-strikes-submit",
"modNotes":       "/internal/form/mod-notes-submit",
"removeLog":      "/internal/form/remove-log-submit"
```

---

## Updated warning form (existing feature)

When complete, the warning form gains two new read-only sections above the rule dropdown:

```
Issue Warning to u/username (Warning 2/3)
─────────────────────────────────────────
Account info
• Age: 14 days  ⚠️ New account
• Karma: 23  ⚠️ Very low karma

Warning history
Current warnings: 1/3
#1: Rule 1 — 2026-05-10

Mod notes (1)
#1 [2026-05-10] testmod: Possible alt account.

Content removals (2)
• [2026-05-09] post removed — Rule 2
• [2026-05-10] comment removed — Rule 1

Rule violated  ▾
[dropdown]

Moderator note (optional)
[text area]

[Cancel]  [Issue Warning]
```

---

## Tests to write

For each new feature, add test cases to `src/core/strikes.test.ts`:

**Reset Strikes**
- `activeStrikes` resets to 0 after reset
- `totalStrikes` is not changed by reset
- `resets[]` gets a new entry with correct metadata
- `checkAndBan` uses `activeStrikes`, not `totalStrikes`
- Reset clears `isBanned` flag

**Mod Notes**
- Adding a note saves it to Redis
- Deleting a note by index removes correct entry
- Deleting out-of-range index is handled gracefully
- Empty notes array returns empty display

**Remove & Log**
- Removal is saved to `removals[]`
- Strike counts are not affected by a removal
- Existing record without `removals` field is handled (backwards compat)

**Account Intelligence**
- `buildAccountIntelDisplay` formats age correctly for days/months/years
- Risk signals appear at correct thresholds
- No signals shown for established accounts
