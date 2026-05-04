import { Hono } from 'hono';
import type { MenuItemRequest, UiResponse } from '@devvit/web/shared';
import type { FormField } from '@devvit/shared-types/shared/form.js';
import { reddit, context, settings } from '@devvit/web/server';
import { getStrikes } from '../core/strikes';
import { DEFAULT_CONFIG, savePendingWarn } from '../core/redis';

export const menu = new Hono();

menu.post('/warn-user', async (c) => {
  try {
    const request = await c.req.json<MenuItemRequest>();
    const targetId = request.targetId;

    const user = await reddit.getCurrentUser();
    if (!user) {
      return c.json<UiResponse>({ showToast: 'Could not identify your account.' }, 200);
    }

    let targetUser: { id: string; username: string } | null = null;
    let postUrl = '';

    if (targetId.startsWith('t1_')) {
      const comment = await reddit.getCommentById(targetId as `t1_${string}`);
      if (!comment.authorId) {
        return c.json<UiResponse>({ showToast: 'Could not find the comment author.' }, 200);
      }
      const author = await reddit.getUserById(comment.authorId);
      targetUser = { id: comment.authorId, username: author?.username ?? '' };
      postUrl = `https://reddit.com${comment.permalink}`;
    } else if (targetId.startsWith('t3_')) {
      const post = await reddit.getPostById(targetId as `t3_${string}`);
      if (!post.authorId) {
        return c.json<UiResponse>({ showToast: 'Could not find the post author.' }, 200);
      }
      const author = await reddit.getUserById(post.authorId);
      targetUser = { id: post.authorId, username: author?.username ?? '' };
      postUrl = `https://reddit.com${post.permalink}`;
    }

    if (!targetUser?.username) {
      return c.json<UiResponse>({ showToast: 'Could not find the post or comment author.' }, 200);
    }

    const modPermissions = await user.getModPermissionsForSubreddit(
      context.subredditName
    );
    const canMod =
      modPermissions.includes('all') || modPermissions.includes('posts');
    if (!canMod) {
      return c.json<UiResponse>({ showToast: 'You do not have mod permissions.' }, 200);
    }

    const existing = await getStrikes(context.subredditId, targetUser.id);
    const currentStrikes = existing?.totalStrikes ?? 0;
    const maxStrikes =
      (await settings.get<number>('maxStrikes')) ??
      DEFAULT_CONFIG.maxStrikesBeforeBan;

    const rulesRaw =
      (await settings.get<string>('rules')) ?? DEFAULT_CONFIG.rules.join('\n');
    const rules = rulesRaw.split('\n').filter(Boolean);
    const ruleOptions = rules.map((r) => ({ label: r, value: r }));

    let historyText =
      currentStrikes === 0
        ? 'No previous warnings.'
        : `Current warnings: ${currentStrikes}/${maxStrikes}`;

    if (existing?.strikes?.length) {
      const lines = existing.strikes.map(
        (s) =>
          `#${s.strikeNumber}: ${s.ruleViolated} — ${s.issuedAt.slice(0, 10)}`
      );
      historyText += '\n' + lines.join('\n');
    }

    if (existing?.isBanned) {
      return c.json<UiResponse>(
        { showToast: `u/${targetUser.username} is already banned.` },
        200
      );
    }

    const modUserId = context.userId;
    if (!modUserId) {
      return c.json<UiResponse>({ showToast: 'Could not identify your account.' }, 200);
    }

    await savePendingWarn(context.subredditId, modUserId, {
      userId: targetUser.id,
      username: targetUser.username,
      postUrl,
    });

    const fields: FormField[] = [
      {
        name: 'history',
        label: 'Warning history',
        type: 'paragraph',
        defaultValue: historyText,
      },
      {
        name: 'rule',
        label: 'Rule violated',
        type: 'select',
        options: ruleOptions,
        required: true,
      },
      {
        name: 'note',
        label: 'Moderator note (optional)',
        type: 'paragraph',
        required: false,
        defaultValue: '',
      },
    ];

    const isFinalStrike = currentStrikes + 1 >= maxStrikes;
    const title = isFinalStrike
      ? `⚠️ Issue Warning to u/${targetUser.username} — WARNING: This will trigger AUTO-BAN (${currentStrikes + 1}/${maxStrikes})`
      : `Issue Warning to u/${targetUser.username} (Warning ${currentStrikes + 1}/${maxStrikes})`;

    return c.json<UiResponse>(
      {
        showForm: {
          name: 'warnUser',
          form: {
            title,
            fields,
            acceptLabel: isFinalStrike ? 'Issue Warning & Ban' : 'Issue Warning',
            cancelLabel: 'Cancel',
          },
        },
      },
      200
    );
  } catch (err) {
    console.error('warn-user menu error:', err);
    return c.json<UiResponse>({ showToast: 'Something went wrong. Try again.' }, 200);
  }
});
