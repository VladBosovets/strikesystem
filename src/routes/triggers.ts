import { Hono } from 'hono';
import type {
  OnAppInstallRequest,
  OnPostDeleteRequest,
  OnCommentDeleteRequest,
  TriggerResponse,
} from '@devvit/web/shared';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  const input = await c.req.json<OnAppInstallRequest>();
  console.log('Strike System installed on r/' + input.subreddit?.name);
  return c.json<TriggerResponse>({}, 200);
});

triggers.post('/on-post-delete', async (c) => {
  const input = await c.req.json<OnPostDeleteRequest>();
  // Strike records are stored per-user, not per-post — no post-specific
  // data to remove. Log for audit purposes only.
  console.log(
    `Post deleted: ${input.postId} by u/${input.author?.name ?? 'unknown'} in r/${input.subreddit?.name ?? 'unknown'}`
  );
  return c.json<TriggerResponse>({}, 200);
});

triggers.post('/on-comment-delete', async (c) => {
  const input = await c.req.json<OnCommentDeleteRequest>();
  console.log(
    `Comment deleted: ${input.commentId} by u/${input.author?.name ?? 'unknown'} in r/${input.subreddit?.name ?? 'unknown'}`
  );
  return c.json<TriggerResponse>({}, 200);
});
