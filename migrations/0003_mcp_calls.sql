-- One row per JSON-RPC request /mcp handles, for the owner's stats page at /mcp/stats
-- (server/mcp/calls.ts). Labels from fixed sets and numbers only: never the address asked about,
-- the IP or the raw User-Agent. `missed_place` is set only for outside_coverage, and only from
-- the server's own list of places (server/mcp/missedPlace.ts). Rows older than 90 days are swept.
CREATE TABLE mcp_calls (
  id INTEGER PRIMARY KEY,
  -- Unix seconds.
  at INTEGER NOT NULL,
  method TEXT NOT NULL,
  tool TEXT,
  region TEXT,
  outcome TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  client TEXT NOT NULL,
  protocol TEXT,
  missed_place TEXT
);
CREATE INDEX mcp_calls_at ON mcp_calls (at);
CREATE INDEX mcp_calls_client_at ON mcp_calls (client, at);
