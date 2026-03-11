#!/usr/bin/env bash
# feedright-tunnel.sh — Start a Cloudflare quick tunnel and save the public URL.
# The URL changes each restart, so this script extracts and saves it.

set -euo pipefail

LOG="/tmp/feedright-tunnel.log"
URL_FILE="/tmp/feedright-url.txt"

# Kill any existing tunnel
pkill -f "cloudflared tunnel --url" 2>/dev/null || true
sleep 1

# Start the tunnel in the background, logging to file
cloudflared tunnel --url http://localhost:3000 > "$LOG" 2>&1 &
TUNNEL_PID=$!
echo "Tunnel PID: $TUNNEL_PID"

# Wait for the URL to appear in logs (up to 30s)
for i in $(seq 1 30); do
    URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" 2>/dev/null | head -1 || true)
    if [[ -n "$URL" ]]; then
        echo "$URL" > "$URL_FILE"
        echo "============================================"
        echo "  FeedRight is live at:"
        echo "  $URL"
        echo "============================================"
        echo "  URL also saved to: $URL_FILE"
        exit 0
    fi
    sleep 1
done

echo "ERROR: Tunnel did not start within 30s. Check $LOG"
exit 1
