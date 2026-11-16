-- How many questions /mcp has answered per window (server/mcp/limit.ts). `key` is a limit's name,
-- with a salted hash of the asker's IP for the per-visitor limits; the IP itself is never stored.
-- `bucket` is the window's start in Unix seconds. Rows older than two days are swept.
CREATE TABLE mcp_hits (
  key TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (key, bucket)
) WITHOUT ROWID;
CREATE INDEX mcp_hits_bucket ON mcp_hits (bucket);
