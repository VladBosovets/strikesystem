import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { reddit, context } from '@devvit/web/server';
import { addStrike, checkAndBan, buildWarningDM, resetStrikes } from '../core/strikes';
import { popPendingWarn, popPendingReset, popPendingModNote, getModNotes, saveModNotes, popPendingRemoval, getStrikeRecord, saveStrikeRecord } from '../core/redis';
import type { ModNote, RemovalEntry } from '../core/redis';

type WarnUserFormValues = {
  history?: string;
  rule?: string | string[];
  note?: string;
};

export const forms = new Hono();

forms.post('/warn-user-submit', async (c) => {
  try {
    const values = await c.req.json<WarnUserFormValues>();

    const modUserId = context.userId;
    if (!modUserId) {
      return c.json<UiResponse>({ showToast: 'Could not identify your account.' }, 200);
    }
    const pending = await popPendingWarn(context.subredditId, modUserId);
    if (!pending) {
      return c.json<UiResponse>({ showToast: 'Session expired. Please try again.' }, 200);
    }

    const { userId, username, postUrl } = pending;
    const note = values.note?.trim() ?? '';
    const ruleRaw = values.rule;
    const ruleViolated = Array.isArray(ruleRaw)
      ? (ruleRaw[0] ?? '').trim()
      : (ruleRaw ?? '').trim();

    if (!ruleViolated) {
      return c.json<UiResponse>({ showToast: 'Please select a rule.' }, 200);
    }

    const issuedBy = context.username ?? 'moderator';
    const subredditId = context.subredditId;
    const subredditName = context.subredditName;

    const { newTotal, config } = await addStrike(subredditId, userId, {
      username,
      ruleViolated,
      note,
      issuedBy,
      postUrl,
    });

    const dmText = buildWarningDM(
      username,
      subredditName,
      newTotal,
      config.maxStrikesBeforeBan,
      ruleViolated,
      note,
      config.warningMessageTemplate
    );

    let dmFailed = false;
    try {
      await reddit.sendPrivateMessage({
        to: username,
        subject: `Strike from r/${subredditName}`,
        text: dmText,
      });
    } catch (dmErr) {
      console.error('Failed to send warning DM:', dmErr);
      dmFailed = true;
    }

    const wasBanned = await checkAndBan(subredditId, userId, subredditName, config);
    const dmNote = dmFailed ? ' (DM not delivered — user has messages restricted)' : '';

    if (wasBanned) {
      return c.json<UiResponse>(
        {
          showToast: `u/${username} has been struck and auto-banned after reaching ${newTotal}/${config.maxStrikesBeforeBan} strikes.${dmNote}`,
        },
        200
      );
    }

    return c.json<UiResponse>(
      {
        showToast: `Strike ${newTotal}/${config.maxStrikesBeforeBan} issued to u/${username}.${dmNote}`,
      },
      200
    );
  } catch (err) {
    console.error('warn-user-submit error:', err);
    return c.json<UiResponse>({ showToast: 'Something went wrong. Try again.' }, 200);
  }
});

forms.post('/view-strikes-close', async (c) => {
  return c.json<UiResponse>({}, 200);
});

forms.post('/reset-strikes-submit', async (c) => {
  try {
    const values = await c.req.json<{ reason?: string }>();

    const modUserId = context.userId;
    if (!modUserId) {
      return c.json<UiResponse>({ showToast: 'Could not identify your account.' }, 200);
    }

    const pending = await popPendingReset(context.subredditId, modUserId);
    if (!pending) {
      return c.json<UiResponse>({ showToast: 'Session expired. Please try again.' }, 200);
    }

    const reason = values.reason?.trim() ?? '';
    if (!reason) {
      return c.json<UiResponse>({ showToast: 'Please provide a reason for the reset.' }, 200);
    }

    const resetBy = context.username ?? 'moderator';

    const recordBeforeReset = await getStrikeRecord(context.subredditId, pending.userId);
    const wasBanned = recordBeforeReset?.isBanned ?? false;

    const strikesCleared = await resetStrikes(
      context.subredditId,
      pending.userId,
      resetBy,
      reason
    );

    if (strikesCleared === null) {
      return c.json<UiResponse>(
        { showToast: `No strike record found for u/${pending.username}.` },
        200
      );
    }

    let unbanFailed = false;
    if (wasBanned) {
      try {
        await reddit.unbanUser(pending.username, context.subredditName);
      } catch (err) {
        console.error('Failed to unban user during reset:', err);
        unbanFailed = true;
        // resetStrikes() already set isBanned=false in Redis — restore it so the
        // record stays in sync with actual Reddit state.
        const current = await getStrikeRecord(context.subredditId, pending.userId);
        if (current) {
          current.isBanned = true;
          await saveStrikeRecord(context.subredditId, pending.userId, current);
        }
      }
    }

    const existingNotes = await getModNotes(context.subredditId, pending.userId);
    const autoNote: ModNote = {
      id: `reset-${Date.now()}`,
      text: `⚠️ Strikes reset (${strikesCleared} cleared)${wasBanned && !unbanFailed ? ' — user unbanned' : wasBanned ? ' — unban failed, manual action required' : ''} — Reason: ${reason}`,
      author: resetBy,
      createdAt: new Date().toISOString(),
    };
    await saveModNotes(context.subredditId, pending.userId, [...existingNotes, autoNote]);

    const unbanNote = wasBanned
      ? unbanFailed
        ? ' ⚠️ Could not unban automatically — please unban manually.'
        : ' User has been unbanned.'
      : '';
    return c.json<UiResponse>(
      { showToast: `Strikes reset for u/${pending.username}. ${strikesCleared} active strike(s) cleared.${unbanNote}` },
      200
    );
  } catch (err) {
    console.error('reset-strikes-submit error:', err);
    return c.json<UiResponse>({ showToast: 'Something went wrong. Try again.' }, 200);
  }
});

forms.post('/add-mod-note-submit', async (c) => {
  try {
    const values = await c.req.json<{ note?: string }>();

    const modUserId = context.userId;
    if (!modUserId) {
      return c.json<UiResponse>({ showToast: 'Could not identify your account.' }, 200);
    }

    const pending = await popPendingModNote(context.subredditId, modUserId);
    if (!pending) {
      return c.json<UiResponse>({ showToast: 'Session expired. Please try again.' }, 200);
    }

    const noteText = values.note?.trim() ?? '';
    if (!noteText) {
      return c.json<UiResponse>({ showToast: 'Note cannot be empty.' }, 200);
    }

    const existing = await getModNotes(context.subredditId, pending.userId);
    const newNote: ModNote = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: noteText,
      author: context.username ?? 'moderator',
      createdAt: new Date().toISOString(),
    };
    await saveModNotes(context.subredditId, pending.userId, [...existing, newNote]);

    return c.json<UiResponse>(
      { showToast: `Mod note saved for u/${pending.username}.` },
      200
    );
  } catch (err) {
    console.error('add-mod-note-submit error:', err);
    return c.json<UiResponse>({ showToast: 'Something went wrong. Try again.' }, 200);
  }
});

forms.post('/remove-and-log-submit', async (c) => {
  try {
    const values = await c.req.json<{ rule?: string | string[]; note?: string }>();

    const modUserId = context.userId;
    if (!modUserId) {
      return c.json<UiResponse>({ showToast: 'Could not identify your account.' }, 200);
    }

    const pending = await popPendingRemoval(context.subredditId, modUserId);
    if (!pending) {
      return c.json<UiResponse>({ showToast: 'Session expired. Please try again.' }, 200);
    }

    const ruleRaw = values.rule;
    const ruleViolated = Array.isArray(ruleRaw)
      ? (ruleRaw[0] ?? '').trim()
      : (ruleRaw ?? '').trim();

    if (!ruleViolated) {
      return c.json<UiResponse>({ showToast: 'Please select a rule.' }, 200);
    }

    const note = values.note?.trim() ?? '';
    const removedBy = context.username ?? 'moderator';

    await reddit.remove(pending.contentId as `t1_${string}` | `t3_${string}`, false);

    const existing = await getStrikeRecord(context.subredditId, pending.userId);
    const record = existing ?? {
      userId: pending.userId,
      username: pending.username,
      strikes: [],
      resets: [],
      removals: [],
      totalStrikes: 0,
      activeStrikes: 0,
      isBanned: false,
      lastUpdated: new Date().toISOString(),
    };

    const removal: RemovalEntry = {
      contentId: pending.contentId,
      contentUrl: pending.contentUrl,
      ruleViolated,
      note,
      removedBy,
      removedAt: new Date().toISOString(),
    };

    record.removals = [...(record.removals ?? []), removal];
    record.lastUpdated = new Date().toISOString();
    await saveStrikeRecord(context.subredditId, pending.userId, record);

    return c.json<UiResponse>(
      { showToast: `${pending.contentType === 'comment' ? 'Comment' : 'Post'} removed and logged for u/${pending.username}.` },
      200
    );
  } catch (err) {
    console.error('remove-and-log-submit error:', err);
    return c.json<UiResponse>({ showToast: 'Something went wrong. Try again.' }, 200);
  }
});
