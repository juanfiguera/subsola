import type { CheckResult } from '../../../server/mcp/healthCheck';
import { alertMail, rawMessage, testMail, type Mail } from './email';
import { recordRun, type HealthDb } from './record';

export interface RunDeps<Statement> {
  db: HealthDb<Statement>;
  check: () => Promise<CheckResult>;
  /** Hands a raw MIME message to the send_email binding. */
  send: (raw: string) => Promise<void>;
  from: string;
  to: string;
  now: () => Date;
  random?: () => number;
}

const deliver = async <Statement>(deps: RunDeps<Statement>, mail: Mail) => {
  const date = deps.now();
  await deps.send(
    rawMessage(mail, { from: deps.from, to: deps.to, date, id: crypto.randomUUID() }),
  );
};

/**
 * One scheduled run: check, store the result, and email on a change of state. A failed send is
 * logged and the run still counts; a failed write to D1 throws, so Cloudflare marks the run failed.
 */
export const runHealth = async <Statement>(deps: RunDeps<Statement>) => {
  const at = Math.floor(deps.now().getTime() / 1000);
  const result = await deps.check();
  const failure = result.failures[0];
  // Codes and the short message only: the answer text stays out of the logs.
  console.log(
    result.ok
      ? `health: passed in ${result.durationMs} ms`
      : `health: failed (${failure?.reason}) in ${result.durationMs} ms: ${failure?.message}`,
  );
  const alert = await recordRun(deps.db, result, at, deps.random);
  if (!alert) return { result, alert, sent: false };
  try {
    await deliver(deps, alertMail(alert));
    console.log(`health: sent the ${alert.kind} alert`);
    return { result, alert, sent: true };
  } catch (error) {
    console.error(
      `health: the ${alert.kind} alert was not sent:`,
      error instanceof Error ? error.message : String(error),
    );
    return { result, alert, sent: false };
  }
};

/** Sends the test alert and lets any refusal throw, so whoever triggered it sees the error. */
export const sendTestAlert = async <Statement>(deps: RunDeps<Statement>) => {
  await deliver(deps, testMail(deps.now()));
  console.log(`health: sent the test alert to ${deps.to}`);
};
