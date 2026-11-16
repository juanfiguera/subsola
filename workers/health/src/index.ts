import { EmailMessage } from 'cloudflare:email';
import { checkHealth } from '../../../server/mcp/healthCheck';
import type { HealthDb } from './record';
import { runHealth, sendTestAlert, type RunDeps } from './run';

interface Env {
  DB: HealthDb<unknown>;
  ALERT_EMAIL: { send: (message: EmailMessage) => Promise<void> };
  ALERT_FROM: string;
  ALERT_TO: string;
  /** "1" sends a test email on every run as well; see docs/mcp.md for when to set it. */
  SEND_TEST_ALERT?: string;
}

interface ScheduledController {
  cron: string;
  scheduledTime: number;
}

// Never a real schedule. `wrangler dev --test-scheduled` can pass it (/__scheduled?cron=test-alert)
// to send one test email without checking or recording anything. Remote dev can't reach the email
// binding, though, so on Cloudflare a test send is a deploy with SEND_TEST_ALERT=1, then one without.
const TEST_ALERT = 'test-alert';

const deps = (env: Env): RunDeps<unknown> => ({
  db: env.DB,
  check: () => checkHealth(),
  send: (raw) => env.ALERT_EMAIL.send(new EmailMessage(env.ALERT_FROM, env.ALERT_TO, raw)),
  from: env.ALERT_FROM,
  to: env.ALERT_TO,
  now: () => new Date(),
});

export default {
  async scheduled(controller: ScheduledController, env: Env) {
    if (controller.cron === TEST_ALERT) return sendTestAlert(deps(env));
    if (env.SEND_TEST_ALERT === '1') await sendTestAlert(deps(env));
    await runHealth(deps(env));
  },
};
