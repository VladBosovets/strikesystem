# Strike System

A progressive strike and auto-ban tracker for Reddit moderators. Issue numbered strikes to rule-breaking users directly from any post or comment, automatically notify them via DM, track their full moderation history in a shared dashboard, and auto-ban when they reach the configured limit.

---

## What it does

**Strike System gives mod teams a consistent, documented enforcement workflow — from first offense to auto-ban — without spreadsheets, memory, or coordination overhead.**

### Core features

| Feature | Description |
|---|---|
| **Issue Strike** | Right-click any post or comment → Issue Strike. Opens a form showing the user's full history before you act. |
| **Auto-ban** | When a user reaches the strike limit (default: 3), they are automatically banned. The ban reason is populated with the full strike history. |
| **DM notifications** | The user receives a DM explaining which rule was violated, which strike number this is, and what happens next. An escalation warning appears on the penultimate strike. |
| **View Strike History** | See any user's full history (strikes, resets, removals, mod notes) from any post or comment. |
| **Reset Strikes** | Clear a user's active strikes with a required reason. Unbans automatically if the user was auto-banned. |
| **Add Mod Note** | Attach a private internal note to any user's record from any post or comment. |
| **Remove & Log** | Remove a post or comment and log it against the user's record in one step. |
| **Mod Dashboard** | A persistent post showing all users with strikes — searchable, sortable by risk level, with the ability to issue strikes, reset records, and add notes without leaving the dashboard. |
| **Account intel** | When issuing a strike, the form shows account age and karma with risk flags (e.g., "Very new account", "Almost zero karma"). |

### How the strike limit works

- **Active strikes** are what count toward the ban threshold. They reset to 0 when a mod resets a user.
- **Total strikes** are a permanent all-time count and never go down.
- At the threshold, the user is auto-banned and the mod team is notified via modmail (configurable).

---

## Installation

1. Go to [developers.reddit.com/apps/strikesystem](https://developers.reddit.com/apps/strikesystem)
2. Click **Add to Community** and select your subreddit
3. Accept the permissions request
4. The Strike System menu items will immediately appear in mod menus on posts, comments, and the subreddit level

No further setup is required. The app works out of the box with sensible defaults.

---

## Configuration

Go to **Mod Tools → Apps → Strike System** after installing to configure:

| Setting | Default | Description |
|---|---|---|
| Max strikes before ban | 3 | Number of active strikes before auto-ban triggers |
| Ban duration (days) | 0 | How long the ban lasts. 0 = permanent ban |
| Subreddit rules | Rule 1 / Rule 2 / Rule 3 | One rule per line — these appear as a dropdown in the strike form |
| Custom strike message | (built-in template) | The DM sent to the user when they receive a strike. Leave blank to use the default |
| Notify mod team on auto-ban | On | Sends a modmail to the subreddit when a user is auto-banned |

### Setting up your rules

In the **Subreddit rules** field, enter one rule per line:

```
No spam or self-promotion
Be respectful to other users
No misinformation or unverified claims
Posts must be on-topic for this community
```

These appear as selectable options in the strike form so every mod picks from the same consistent list.

### Custom DM template

Leave blank to use the built-in message. If you want a custom message, use these placeholders:

| Placeholder | Replaced with |
|---|---|
| `{username}` | The user's Reddit username |
| `{subreddit}` | Your subreddit name |
| `{ruleName}` | The rule selected by the mod |
| `{strikeNumber}` | Which strike number this is |
| `{maxStrikes}` | The limit before auto-ban |

---

## Mod workflow

### Issuing a strike

1. Find the post or comment that broke a rule
2. Open the **three-dot menu** on the post or comment
3. Select **Issue Strike**
4. The form opens showing:
   - Account age and karma (with risk flags for suspicious accounts)
   - The user's current strike history
5. Select the rule violated from the dropdown
6. Add an optional moderator note (internal only — not sent to the user)
7. Click **Issue Strike**

The user receives a DM immediately. If this is the final strike, the form title shows a clear warning before you confirm, and the button changes to **Issue Strike & Ban**.

### Viewing a user's history

From any post or comment: **three-dot menu → View Strike History**

Shows: account intel, all strikes with dates and rules, resets with reasons, content removals, and mod notes.

### Resetting strikes

From a post or comment: **three-dot menu → Reset Strikes**

Requires a reason. If the user was auto-banned, the reset automatically unbans them.

From the dashboard: click into a user → **Reset Strikes** button.

### Opening the Mod Dashboard

From the subreddit menu: **Open Mod Dashboard**

Creates a persistent pinned post (creates once, reuses on subsequent opens). Shows all users with any moderation history, sorted by risk (banned first, then by active strike count). Supports username search. From any user row, click through to their full profile where you can issue strikes, reset, or add notes.

---

## Auto-ban behavior

When a user reaches the strike limit:

1. The user is banned from the subreddit
2. The ban reason is automatically filled with a summary of all their strikes and dates
3. The user receives a DM explaining they've been banned
4. The mod team receives a modmail notification (if enabled in settings)

All of this happens automatically on form submit — no additional mod action required.

---

## Data and privacy

Strike System makes **no external API calls**. All data is stored within Reddit's infrastructure using Devvit's built-in Redis storage, scoped per subreddit. No user data is sent to third-party services.

When posts or comments are deleted, Strike System automatically removes the associated URLs from its records. When a user's data needs to be cleared, mods can reset their record from the dashboard.

---

## Frequently asked questions

**Will it work with multiple moderators?**
Yes. All mods share the same strike record. Any mod can issue strikes and any mod sees the full history.

**What if a user was struck by mistake?**
Use **Reset Strikes** from any post, comment, or the dashboard. This clears their active strikes (and unbans them if they were auto-banned) and logs the reset with your reason.

**Can I customize the auto-ban duration?**
Yes. Set **Ban duration (days)** in the app settings. 0 = permanent.

**What if a user has their DMs disabled?**
The strike still goes through. The toast notification will indicate if the DM could not be delivered.

**What if the auto-unban fails during a reset?**
The toast and the user's mod note will explicitly say "Could not unban automatically — please unban manually." This way the mod team knows to take action.

---

## For App Reviewers

Please assign this app to the **Moderator Tools** category in the App Directory.

---

## Tech stack

- [Devvit](https://developers.reddit.com/) — Reddit's developer platform (`@devvit/web` 0.12.22)
- [Hono](https://hono.dev/) — lightweight web framework for the server layer
- [React](https://react.dev/) — dashboard UI
- [TypeScript](https://www.typescriptlang.org/) — end-to-end type safety
- Redis (Devvit built-in) — all strike records, config, and mod notes
