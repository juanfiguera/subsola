-- Who uses /mcp, anonymously (server/mcp/requester.ts). `requester` is the first 12 hex
-- characters of an HMAC-SHA256 of the caller's IP under the REQUESTER_KEY secret: the same caller
-- groups together, and the IP itself is never stored. `network` is Cloudflare's
-- request.cf.asOrganization (at most 80 characters) and `country` its two-letter request.cf.country.
-- All three are null on rows written before this migration. Additive only, so the code already
-- deployed keeps writing its rows.
ALTER TABLE mcp_calls ADD COLUMN requester TEXT;
ALTER TABLE mcp_calls ADD COLUMN network TEXT;
ALTER TABLE mcp_calls ADD COLUMN country TEXT;
CREATE INDEX mcp_calls_requester_at ON mcp_calls (requester, at);

-- One row per run of the health-check Worker (workers/health), every 5 minutes, kept 30 days.
-- It sees the server from outside, so it records an outage that never reaches /mcp. `reason` is a
-- short code and `message` a short line, both null on a pass; never a response body.
CREATE TABLE health_checks (
  id INTEGER PRIMARY KEY,
  -- Unix seconds when the run started.
  at INTEGER NOT NULL,
  ok INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  reason TEXT,
  message TEXT
);
CREATE INDEX health_checks_at ON health_checks (at);
