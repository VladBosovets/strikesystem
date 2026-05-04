import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { reddit, context } from '@devvit/web/server';
import { addStrike, checkAndBan, buildWarningDM } from '../core/strikes';

type WarnUserFormValues = {
  userId?: string;
  username?: string;
  postUrl?: string;
  history?: string;
  rule?: string | string[];
  note?: string;
};

export const forms = new Hono();

forms.post('/warn-user-submit', async (c) => {
  try {
    const values = await c.req.json<WarnUserFormValues>();

    const userId = values.userId?.trim();
    const username = values.username?.trim();
    const postUrl = values.postUrl?.trim() ?? '';
    const note = values.note?.trim() ?? '';
    const ruleRaw = values.rule;
    const ruleViolated = Array.isArray(ruleRaw)
      ? (ruleRaw[0] ?? '').trim()
      : (ruleRaw ?? '').trim();

    if (!userId || !username) {
      return c.json<UiResponse>({ showToast: 'Missing user info. Try again.' }, 200);
    }
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

    try {
      await reddit.sendPrivateMessage({
        to: username,
        subject: `Warning from r/${subredditName}`,
        text: dmText,
      });
    } catch (dmErr) {
      console.error('Failed to send warning DM:', dmErr);
    }

    const wasBanned = await checkAndBan(subredditId, userId, subredditName);

    if (wasBanned) {
      return c.json<UiResponse>(
        {
          showToast: `u/${username} has been warned and auto-banned after reaching ${newTotal}/${config.maxStrikesBeforeBan} warnings.`,
        },
        200
      );
    }

    return c.json<UiResponse>(
      {
        showToast: `Warning ${newTotal}/${config.maxStrikesBeforeBan} issued to u/${username}.`,
      },
      200
    );
  } catch (err) {
    console.error('warn-user-submit error:', err);
    return c.json<UiResponse>({ showToast: 'Something went wrong. Try again.' }, 200);
  }
});
