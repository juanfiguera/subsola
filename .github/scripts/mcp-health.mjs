// Checks that https://subsola.com/mcp connects and answers a real question, by hand or from the
// manual workflow in .github/workflows/mcp-health.yml; the scheduled check is the subsola-health
// Worker (workers/health). Both run the same check, server/mcp/healthCheck.ts, which Node 22.18+
// loads straight from TypeScript. Exits non-zero on any failure. MCP_URL and MCP_HEALTH_ADDRESS
// override the defaults.

import { checkHealth } from '../../server/mcp/healthCheck.ts';

const result = await checkHealth({
  url: process.env.MCP_URL,
  address: process.env.MCP_HEALTH_ADDRESS,
});

for (const line of result.log) console.log(line);
for (const failure of result.failures)
  console.log(
    `::error::${failure.message} [${failure.reason}]${failure.detail ? `: ${failure.detail}` : ''}`,
  );

if (!result.ok) {
  console.log(`\n${result.failures.length} check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll checks passed in ${result.durationMs} ms.`);
