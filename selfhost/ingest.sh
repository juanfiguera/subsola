#!/bin/sh
# Downloads one city's public records, builds the cells the map and MCP server read, and swaps
# them in whole, so a reader never sees half a build; then waits a day and does it again.
set -eu
cd /app
: "${CITY:=sea}"
work=/data/work
public=/data/public
mkdir -p "$work" "$public"
while true; do
  echo "subsola ingest: downloading and building $CITY"
  if SUBSOLA_DATA_DIR="$work" CITY="$CITY" pnpm download &&
    SUBSOLA_DATA_DIR="$work" CITY="$CITY" pnpm build-cells; then
    # Insights (subsola.com/insights) are a nicety; a failure there doesn't hold back the map.
    SUBSOLA_DATA_DIR="$work" CITY="$CITY" pnpm insights && cp "$work/insights.json" "$work/cells/" || true
    rm -rf "$public/next" "$public/old"
    cp -r "$work/cells" "$public/next"
    [ -d "$public/cells" ] && mv "$public/cells" "$public/old"
    mv "$public/next" "$public/cells"
    rm -rf "$public/old"
    echo "subsola ingest: $CITY is live"
  else
    echo "subsola ingest: build failed; keeping the last good cells" >&2
  fi
  sleep "${INGEST_EVERY_SECONDS:-86400}"
done
