# syntax=docker/dockerfile:1
# One image for a self-hosted Subsola: the map and MCP server (web) and the nightly build (ingest).
# See README, "Self-hosting", and compose.yaml.
FROM node:22-bookworm-slim

# workerd, wrangler's local runtime, needs CA certificates to fetch from city servers.
RUN apt-get update -q && apt-get install -y -q --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.0.9 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Patient on slow connections (workerd alone is tens of MB), and cached so a rebuild doesn't fetch
# everything again.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
  pnpm install --frozen-lockfile --fetch-timeout=600000 --fetch-retries=5 --network-concurrency=4

COPY . .
# The map reads its cells from this same server, under /local/cells (see selfhost/web.sh).
ENV VITE_CELLS_URL=/local/cells
RUN pnpm build
