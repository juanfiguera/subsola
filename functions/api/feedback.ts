import { handleFeedback, verifyTurnstile } from '../../server/feedback';

/** The D1 calls the feedback store needs; the full type lives in @cloudflare/workers-types. */
interface D1 {
  prepare: (sql: string) => {
    bind: (...values: unknown[]) => {
      first: <T>() => Promise<T | null>;
      run: () => Promise<unknown>;
    };
  };
}

interface Env {
  FEEDBACK_DB: D1;
  TURNSTILE_SECRET: string;
  FEEDBACK_SALT: string;
}

export const onRequest = async ({ request, env }: { request: Request; env: Env }) =>
  handleFeedback(request, {
    salt: env.FEEDBACK_SALT,
    verify: verifyTurnstile(env.TURNSTILE_SECRET),
    store: {
      countSince: async (visitor, since) =>
        (
          await env.FEEDBACK_DB.prepare(
            'SELECT COUNT(*) AS n FROM feedback WHERE visitor = ?1 AND created_at >= ?2',
          )
            .bind(visitor, since)
            .first<{ n: number }>()
        )?.n ?? 0,
      insert: async (row) => {
        await env.FEEDBACK_DB.prepare(
          'INSERT INTO feedback (created_at, visitor, message, email, page, country) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
        )
          .bind(row.created_at, row.visitor, row.message, row.email, row.page, row.country)
          .run();
      },
    },
  });
