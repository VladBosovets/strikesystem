import { Hono } from 'hono';
import type {
  OnAppInstallRequest,
  OnPostDeleteRequest,
  OnCommentDeleteRequest,
  TriggerResponse,
} from '@devvit/web/shared';
import { context, reddit } from '@devvit/web/server';
import {
  getDashboardPost,
  clearDashboardPost,
  clearDeletedPostFromRecords,
  clearDeletedCommentFromRecords,
} from '../core/redis';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  const input = await c.req.json<OnAppInstallRequest>();
  const subredditName = input.subreddit?.name ?? '';
  console.log('Strike System installed on r/' + subredditName);

  try {
    await reddit.sendPrivateMessage({
      to: `/r/${subredditName}`,
      subject: 'Strike System installed — quick setup guide',
      text: `Strike System is now active on r/${subredditName}. Here is how to get started:

**Access the Mod Dashboard**
Go to your subreddit, open the three-dot (⋯) menu at the subreddit level, and select "Open Mod Dashboard." This creates a pinned post your whole mod team can use to see all users with active strikes.

**Issue a Strike**
Click the three-dot menu on any post or comment and select "Issue Strike." You will see the author's account info and strike history before confirming.

**Other actions**
- View Strike History — see a user's full record from any post or comment
- Reset Strikes — clear active strikes and optionally unban the user
- Remove & Log — remove content and log it against the author's record in one step
- Add Mod Note — attach a private internal note to any user's record

**Configure the app**
Go to Mod Tools → Apps → Strike System to set your strike threshold, ban duration, subreddit rules, and custom DM template.

If you have questions or issues, visit the app listing page for support.`,
    });
  } catch (err) {
    console.error('Failed to send install modmail:', err);
  }

  return c.json<TriggerResponse>({}, 200);
});

triggers.post('/on-post-delete', async (c) => {
  const input = await c.req.json<OnPostDeleteRequest>();
  const stored = await getDashboardPost(context.subredditId);
  if (stored && stored.id === input.postId) {
    await clearDashboardPost(context.subredditId);
    console.log(`Dashboard post ${input.postId} deleted — cleared stored ref for r/${input.subreddit?.name ?? 'unknown'}`);
  }
  await clearDeletedPostFromRecords(context.subredditId, input.postId);
  return c.json<TriggerResponse>({}, 200);
});

triggers.post('/on-comment-delete', async (c) => {
  const input = await c.req.json<OnCommentDeleteRequest>();
  await clearDeletedCommentFromRecords(context.subredditId, input.commentId);
  return c.json<TriggerResponse>({}, 200);
});
