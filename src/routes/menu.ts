import { Hono } from 'hono';
import type { MenuItemRequest, UiResponse } from '@devvit/web/shared';
import type { FormField } from '@devvit/shared-types/shared/form.js';
import { reddit, context, settings } from '@devvit/web/server';
import { getStrikes, buildAccountIntelDisplay, buildStrikeHistoryDisplay } from '../core/strikes';
import { DEFAULT_CONFIG, savePendingWarn, getModNotes, savePendingReset, savePendingModNote } from '../core/redis';

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
    let authorUser: Awaited<ReturnType<typeof reddit.getUserById>> | null = null;

    if (targetId.startsWith('t1_')) {
      const comment = await reddit.getCommentById(targetId as `t1_${string}`);
      if (!comment.authorId) {
        return c.json<UiResponse>({ showToast: 'Could not find the comment author.' }, 200);
      }
      authorUser = await reddit.getUserById(comment.authorId);
      targetUser = { id: comment.authorId, username: authorUser?.username ?? '' };
      postUrl = `https://reddit.com${comment.permalink}`;
    } else if (targetId.startsWith('t3_')) {
      const post = await reddit.getPostById(targetId as `t3_${string}`);
      if (!post.authorId) {
        return c.json<UiResponse>({ showToast: 'Could not find the post author.' }, 200);
      }
      authorUser = await reddit.getUserById(post.authorId);
      targetUser = { id: post.authorId, username: authorUser?.username ?? '' };
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

    const accountIntel = authorUser
      ? buildAccountIntelDisplay(authorUser)
      : 'Account info unavailable.';

    const fields: FormField[] = [
      {
        name: 'accountInfo',
        label: `Account — u/${targetUser.username}`,
        type: 'paragraph',
        defaultValue: accountIntel,
      },
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

menu.post('/view-strikes', async (c) => {
  try {
    const request = await c.req.json<MenuItemRequest>();
    const targetId = request.targetId;

    const user = await reddit.getCurrentUser();
    if (!user) {
      return c.json<UiResponse>({ showToast: 'Could not identify your account.' }, 200);
    }

    let targetUser: { id: string; username: string } | null = null;

    if (targetId.startsWith('t1_')) {
      const comment = await reddit.getCommentById(targetId as `t1_${string}`);
      if (!comment.authorId) {
        return c.json<UiResponse>({ showToast: 'Could not find the comment author.' }, 200);
      }
      const author = await reddit.getUserById(comment.authorId);
      targetUser = { id: comment.authorId, username: author?.username ?? '' };
    } else if (targetId.startsWith('t3_')) {
      const post = await reddit.getPostById(targetId as `t3_${string}`);
      if (!post.authorId) {
        return c.json<UiResponse>({ showToast: 'Could not find the post author.' }, 200);
      }
      const author = await reddit.getUserById(post.authorId);
      targetUser = { id: post.authorId, username: author?.username ?? '' };
    }

    if (!targetUser?.username) {
      return c.json<UiResponse>({ showToast: 'Could not find the author.' }, 200);
    }

    const modPermissions = await user.getModPermissionsForSubreddit(context.subredditName);
    const canMod = modPermissions.includes('all') || modPermissions.includes('posts');
    if (!canMod) {
      return c.json<UiResponse>({ showToast: 'You do not have mod permissions.' }, 200);
    }

    const maxStrikes =
      (await settings.get<number>('maxStrikes')) ?? DEFAULT_CONFIG.maxStrikesBeforeBan;

    const [record, notes, authorUser] = await Promise.all([
      getStrikes(context.subredditId, targetUser.id),
      getModNotes(context.subredditId, targetUser.id),
      reddit.getUserById(targetUser.id as `t2_${string}`),
    ]);

    const accountIntel = authorUser
      ? buildAccountIntelDisplay(authorUser)
      : 'Account info unavailable.';

    const strikeHistory = buildStrikeHistoryDisplay(record, maxStrikes);

    const removalDisplay =
      record?.removals?.length
        ? record.removals
            .map((r) => `[${r.removedAt.slice(0, 10)}] u/${r.removedBy} — ${r.ruleViolated}${r.note ? `\n  Note: ${r.note}` : ''}`)
            .join('\n')
        : 'No removals logged.';

    const notesDisplay =
      notes.length
        ? notes.map((n, i) => `#${i + 1} [${n.createdAt.slice(0, 10)}] u/${n.author}:\n  ${n.text}`).join('\n')
        : 'No mod notes yet.';

    const fields: FormField[] = [
      {
        name: 'accountInfo',
        label: `Account — u/${targetUser.username}`,
        type: 'paragraph',
        defaultValue: accountIntel,
      },
      {
        name: 'strikeHistory',
        label: 'Warning history',
        type: 'paragraph',
        defaultValue: strikeHistory,
      },
      {
        name: 'removalLog',
        label: 'Content removals',
        type: 'paragraph',
        defaultValue: removalDisplay,
      },
      {
        name: 'modNotes',
        label: 'Mod notes',
        type: 'paragraph',
        defaultValue: notesDisplay,
      },
    ];

    return c.json<UiResponse>(
      {
        showForm: {
          name: 'viewStrikes',
          form: {
            title: `Strike History — u/${targetUser.username}`,
            fields,
            acceptLabel: 'Close',
            cancelLabel: 'Close',
          },
        },
      },
      200
    );
  } catch (err) {
    console.error('view-strikes menu error:', err);
    return c.json<UiResponse>({ showToast: 'Something went wrong. Try again.' }, 200);
  }
});

menu.post('/reset-strikes', async (c) => {
  try {
    const request = await c.req.json<MenuItemRequest>();
    const targetId = request.targetId;

    const user = await reddit.getCurrentUser();
    if (!user) {
      return c.json<UiResponse>({ showToast: 'Could not identify your account.' }, 200);
    }

    let targetUser: { id: string; username: string } | null = null;

    if (targetId.startsWith('t1_')) {
      const comment = await reddit.getCommentById(targetId as `t1_${string}`);
      if (!comment.authorId) {
        return c.json<UiResponse>({ showToast: 'Could not find the comment author.' }, 200);
      }
      const author = await reddit.getUserById(comment.authorId);
      targetUser = { id: comment.authorId, username: author?.username ?? '' };
    } else if (targetId.startsWith('t3_')) {
      const post = await reddit.getPostById(targetId as `t3_${string}`);
      if (!post.authorId) {
        return c.json<UiResponse>({ showToast: 'Could not find the post author.' }, 200);
      }
      const author = await reddit.getUserById(post.authorId);
      targetUser = { id: post.authorId, username: author?.username ?? '' };
    }

    if (!targetUser?.username) {
      return c.json<UiResponse>({ showToast: 'Could not find the author.' }, 200);
    }

    const modPermissions = await user.getModPermissionsForSubreddit(context.subredditName);
    const canMod = modPermissions.includes('all') || modPermissions.includes('posts');
    if (!canMod) {
      return c.json<UiResponse>({ showToast: 'You do not have mod permissions.' }, 200);
    }

    const [existing, maxStrikes] = await Promise.all([
      getStrikes(context.subredditId, targetUser.id),
      settings.get<number>('maxStrikes').then((v) => v ?? DEFAULT_CONFIG.maxStrikesBeforeBan),
    ]);

    if (!existing || existing.activeStrikes === 0) {
      return c.json<UiResponse>(
        { showToast: `u/${targetUser.username} has no active warnings to reset.` },
        200
      );
    }

    const modUserId = context.userId;
    if (!modUserId) {
      return c.json<UiResponse>({ showToast: 'Could not identify your account.' }, 200);
    }

    await savePendingReset(context.subredditId, modUserId, {
      userId: targetUser.id,
      username: targetUser.username,
    });

    const statusText = `Active warnings: ${existing.activeStrikes}/${maxStrikes}${existing.isBanned ? '\n⛔ User is currently banned — reset will also clear the ban flag.' : ''}`;

    const fields: FormField[] = [
      {
        name: 'status',
        label: `Current status — u/${targetUser.username}`,
        type: 'paragraph',
        defaultValue: statusText,
      },
      {
        name: 'reason',
        label: 'Reason for reset',
        type: 'paragraph',
        required: true,
        defaultValue: '',
      },
    ];

    return c.json<UiResponse>(
      {
        showForm: {
          name: 'resetStrikes',
          form: {
            title: `Reset Warnings — u/${targetUser.username}`,
            fields,
            acceptLabel: 'Reset Warnings',
            cancelLabel: 'Cancel',
          },
        },
      },
      200
    );
  } catch (err) {
    console.error('reset-strikes menu error:', err);
    return c.json<UiResponse>({ showToast: 'Something went wrong. Try again.' }, 200);
  }
});

menu.post('/add-mod-note', async (c) => {
  try {
    const request = await c.req.json<MenuItemRequest>();
    const targetId = request.targetId;

    const user = await reddit.getCurrentUser();
    if (!user) {
      return c.json<UiResponse>({ showToast: 'Could not identify your account.' }, 200);
    }

    let targetUser: { id: string; username: string } | null = null;

    if (targetId.startsWith('t1_')) {
      const comment = await reddit.getCommentById(targetId as `t1_${string}`);
      if (!comment.authorId) {
        return c.json<UiResponse>({ showToast: 'Could not find the comment author.' }, 200);
      }
      const author = await reddit.getUserById(comment.authorId);
      targetUser = { id: comment.authorId, username: author?.username ?? '' };
    } else if (targetId.startsWith('t3_')) {
      const post = await reddit.getPostById(targetId as `t3_${string}`);
      if (!post.authorId) {
        return c.json<UiResponse>({ showToast: 'Could not find the post author.' }, 200);
      }
      const author = await reddit.getUserById(post.authorId);
      targetUser = { id: post.authorId, username: author?.username ?? '' };
    }

    if (!targetUser?.username) {
      return c.json<UiResponse>({ showToast: 'Could not find the author.' }, 200);
    }

    const modPermissions = await user.getModPermissionsForSubreddit(context.subredditName);
    const canMod = modPermissions.includes('all') || modPermissions.includes('posts');
    if (!canMod) {
      return c.json<UiResponse>({ showToast: 'You do not have mod permissions.' }, 200);
    }

    const modUserId = context.userId;
    if (!modUserId) {
      return c.json<UiResponse>({ showToast: 'Could not identify your account.' }, 200);
    }

    await savePendingModNote(context.subredditId, modUserId, {
      userId: targetUser.id,
      username: targetUser.username,
    });

    const fields: FormField[] = [
      {
        name: 'note',
        label: `Note about u/${targetUser.username}`,
        type: 'paragraph',
        required: true,
        defaultValue: '',
      },
    ];

    return c.json<UiResponse>(
      {
        showForm: {
          name: 'addModNote',
          form: {
            title: `Add Mod Note — u/${targetUser.username}`,
            fields,
            acceptLabel: 'Save Note',
            cancelLabel: 'Cancel',
          },
        },
      },
      200
    );
  } catch (err) {
    console.error('add-mod-note menu error:', err);
    return c.json<UiResponse>({ showToast: 'Something went wrong. Try again.' }, 200);
  }
});
