import { Hono } from 'hono';
import type {
  OnAppInstallRequest,
  OnPostDeleteRequest,
  OnCommentDeleteRequest,
  TriggerResponse,
} from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { getDashboardPost, clearDashboardPost } from '../core/redis';

export const triggers = new Hono();

triggers.post('/on-app-install', async (c) => {
  const input = await c.req.json<OnAppInstallRequest>();
  console.log('Strike System installed on r/' + input.subreddit?.name);
  return c.json<TriggerResponse>({}, 200);
});

triggers.post('/on-post-delete', async (c) => {
  const input = await c.req.json<OnPostDeleteRequest>();
  const stored = await getDashboardPost(context.subredditId);
  if (stored && stored.id === input.postId) {
    await clearDashboardPost(context.subredditId);
    console.log(`Dashboard post ${input.postId} deleted — cleared stored ref for r/${input.subreddit?.name ?? 'unknown'}`);
  }
  return c.json<TriggerResponse>({}, 200);
});

triggers.post('/on-comment-delete', async (c) => {
  const input = await c.req.json<OnCommentDeleteRequest>();
  console.log(
    `Comment deleted: ${input.commentId} by u/${input.author?.name ?? 'unknown'} in r/${input.subreddit?.name ?? 'unknown'}`
  );
  return c.json<TriggerResponse>({}, 200);
});
