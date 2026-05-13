import { Hono } from 'hono';
import type {
  OnAppInstallRequest,
  OnPostDeleteRequest,
  OnCommentDeleteRequest,
  TriggerResponse,
} from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import {
  getDashboardPost,
  clearDashboardPost,
  clearDeletedPostFromRecords,
  clearDeletedCommentFromRecords,
} from '../core/redis';

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
  await clearDeletedPostFromRecords(context.subredditId, input.postId);
  return c.json<TriggerResponse>({}, 200);
});

triggers.post('/on-comment-delete', async (c) => {
  const input = await c.req.json<OnCommentDeleteRequest>();
  await clearDeletedCommentFromRecords(context.subredditId, input.commentId);
  return c.json<TriggerResponse>({}, 200);
});
