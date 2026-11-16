import { FAILURE_NOTES } from '../../../server/mcp/healthCheck';
import type { Alert } from './record';

export const STATS_URL = 'https://subsola.com/mcp/stats';

export interface Mail {
  subject: string;
  text: string;
}

const utc = (seconds: number) =>
  `${new Date(seconds * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

const minutes = (seconds: number) => {
  const total = Math.max(1, Math.round(seconds / 60));
  return total === 1 ? '1 minute' : `${total} minutes`;
};

const BY_HAND = `To run the check by hand, from the repository:

  node .github/scripts/mcp-health.mjs

or start the "MCP health" workflow in GitHub Actions.`;

export const alertMail = (alert: Alert): Mail => {
  if (alert.kind === 'failing')
    return {
      subject: `Subsola MCP is failing: ${FAILURE_NOTES[alert.reason]}`,
      text: `The health check of https://subsola.com/mcp failed twice in a row.

What failed: ${FAILURE_NOTES[alert.reason]} (${alert.reason})
Detail: ${alert.message}
Failing since: ${utc(alert.since)}

The check runs every 5 minutes. You'll get one more email when it passes again, and none in between.

History and stats: ${STATS_URL}

${BY_HAND}
`,
    };
  return {
    subject: 'Subsola MCP has recovered',
    text: `The health check of https://subsola.com/mcp passed again at ${utc(alert.at)}.

It had been failing since ${utc(alert.since)}, for about ${minutes(alert.at - alert.since)}.

History and stats: ${STATS_URL}

${BY_HAND}
`,
  };
};

export const testMail = (now: Date): Mail => ({
  subject: 'Subsola MCP health alerts: test',
  text: `A test of the alert email from the subsola-health Worker, sent ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC.

When the health check of https://subsola.com/mcp fails twice in a row, an email like this one says what failed and since when, and another says when it passes again.

History and stats: ${STATS_URL}
`,
});

// Headers must be plain ASCII on one line; the text is ours, so this only guards a slip.
const headerSafe = (value: string) => value.replace(/[^\x20-\x7e]/g, '?');

/**
 * A plain-text message as raw MIME, which the send_email binding takes as is. Built by hand: one
 * part, ASCII headers, UTF-8 body, so no MIME package is needed.
 */
export const rawMessage = (
  mail: Mail,
  { from, to, date, id }: { from: string; to: string; date: Date; id: string },
) => {
  const domain = from.split('@')[1] ?? 'subsola.com';
  const body = mail.text.replace(/\r?\n/g, '\r\n');
  return [
    `From: Subsola health <${headerSafe(from)}>`,
    `To: ${headerSafe(to)}`,
    `Subject: ${headerSafe(mail.subject)}`,
    `Date: ${date.toUTCString()}`,
    `Message-ID: <${headerSafe(id)}@${domain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
  ].join('\r\n');
};
