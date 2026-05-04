# Strike System

A progressive warning and ban tracker for Reddit moderators. Issue structured warnings to rule-breaking users directly from the post or comment menu, automatically notify them with a clear explanation, track their full history, and auto-ban when they reach the configured strike limit.

---

## What it does

- **One-click warnings** — right-click any post or comment and select "Issue Warning"
- **Strike history** — the warning form shows the user's full warning history before you act
- **Automatic DMs** — warned users receive a clear message explaining which rule they broke, which warning number it is, and what happens next
- **Auto-ban** — when a user reaches the configured strike limit, they are automatically banned and the mod team is notified via modmail
- **Shared history** — all mods see the same strike record, so no institutional knowledge is lost between moderators
- **Zero required setup** — works out of the box with sensible defaults; configure rules and limits at your own pace

---

## Installation

1. Go to [developers.reddit.com/apps/strikesystem](https://developers.reddit.com/apps/strikesystem)
2. Click **Add to Community** and select your subreddit
3. Accept the permissions request
4. The "Issue Warning" option will immediately appear in the mod menu on posts and comments

---

## Configuration

After installing, go to your subreddit's **Mod Tools → Apps → Strike System** to configure:

| Setting | Default | Description |
|---|---|---|
| Max warnings before ban | 3 | Number of warnings before auto-ban triggers |
| Ban duration (days) | 0 | How long the ban lasts. 0 = permanent |
| Subreddit rules | Rule 1 / Rule 2 / Rule 3 | One rule per line — these appear as options in the warning form |
| Custom warning message | (default template) | The DM sent to warned users. Leave blank to use the built-in message |
| Notify mod team on auto-ban | On | Sends a modmail when a user is auto-banned |

### Setting up your rules

In the **Subreddit rules** field, enter one rule per line. Example:

```
Rule 1 - No spam or self-promotion
Rule 2 - Be respectful to other users
Rule 3 - No misinformation
Rule 4 - Posts must be on-topic
```

These will appear as a dropdown in the warning form so mods always pick from a consistent list.

### Custom warning message

You can write a custom DM template using these placeholders:

| Placeholder | Replaced with |
|---|---|
| `{username}` | The warned user's Reddit username |
| `{subreddit}` | Your subreddit name |
| `{ruleName}` | The rule selected by the mod |
| `{strikeNumber}` | Which warning number this is |
| `{maxStrikes}` | The total warnings before auto-ban |

Leave blank to use the built-in message.

---

## How to issue a warning

1. Find the post or comment that broke a rule
2. Click the **three-dot menu** on the post or comment
3. Select **"Issue Warning"**
4. The form opens showing the user's warning history and current strike count
5. Select the rule that was violated from the dropdown
6. Add an optional note (only visible to mods, not sent to the user)
7. Click **Issue Warning**

The warned user receives a DM immediately. If this is their final warning, the form title will show a clear alert before you confirm.

---

## Auto-ban

When a user receives their final warning (default: 3rd warning), the app automatically:

1. Bans the user from the subreddit
2. Populates the ban reason with a summary of all their warnings
3. Sends the mod team a modmail notification with the full history

Mods are not required to take any extra action — the entire flow completes on form submit.

---

## Frequently asked questions

**Will the app work if I have multiple moderators?**
Yes — all mods share the same strike history. Any mod can issue warnings and any mod will see the full history when opening the warning form.

**What if a user was warned in error?**
Strike records are stored per user. Contact the mod team about record adjustments — a reset feature is on the roadmap.

**What happens to data if the app is uninstalled?**
All strike history and configuration data is stored within Reddit's infrastructure and will be removed if the app is uninstalled.

---

## Tech stack

- [Devvit](https://developers.reddit.com/) — Reddit's developer platform
- [Hono](https://hono.dev/) — lightweight web framework for backend logic
- [TypeScript](https://www.typescriptlang.org/) — type-safe development
- Redis (built-in via Devvit) — strike and config storage

## Privacy

Strike System makes no external API calls. All data is stored within Reddit's platform using Devvit's built-in Redis storage, scoped per subreddit. No user data is sent to third-party services.
