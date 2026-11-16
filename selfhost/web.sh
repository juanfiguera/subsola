#!/bin/sh
# Serves the built map, the MCP server at /mcp and the cells the ingest service writes, with
# Cloudflare's local Pages runtime, the same code that runs on subsola.com.
set -eu
cd /app
# The feedback form and the MCP rate limits keep their rows in a local SQLite copy of D1.
pnpm exec wrangler d1 migrations apply subsola-feedback --local
exec pnpm exec wrangler pages dev dist \
  --ip 0.0.0.0 --port "${PORT:-8080}" \
  --binding CELLS_URL=/local/cells \
  --binding FEEDBACK_SALT="${FEEDBACK_SALT:-change-me}" \
  --binding REQUESTER_KEY="${REQUESTER_KEY:-change-me-too}"
