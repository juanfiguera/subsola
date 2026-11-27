-- Which arguments failed on a bad_args call (server/mcp/lenientArgs.ts problemLabel): tool field
-- names and zod issue codes like "address:missing", never a value that was sent. Null otherwise.
-- Additive, so the code already deployed keeps writing its rows.
ALTER TABLE mcp_calls ADD COLUMN problem TEXT;
-- Calls for a tool name the server doesn't have were counted as bad_args; they get their own
-- outcome so scanners trying names don't read as assistants sending bad arguments.
UPDATE mcp_calls SET outcome = 'unknown_tool' WHERE outcome = 'bad_args' AND method = 'tools/call' AND tool IS NULL;
