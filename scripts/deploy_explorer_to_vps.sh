#!/usr/bin/env bash
set -euo pipefail

VPS_HOST="root@89.125.130.116"
EXPLORER_DIR="/opt/quavence_explorer"

echo "============================================================"
echo "🚀 Deploying Quavence Explorer to VPS ($VPS_HOST)"
echo "============================================================"

# Check for dist/ folder
if [ ! -d "dist" ]; then
  echo "==> Building explorer first..."
  npm run build
fi

echo "==> [1/3] Uploading dist/ build to VPS..."
ssh "$VPS_HOST" "mkdir -p $EXPLORER_DIR/dist"
scp -r dist/* "$VPS_HOST:$EXPLORER_DIR/dist/"

echo "==> [2/3] Restarting Explorer service on VPS..."
ssh "$VPS_HOST" "systemctl restart quavence-explorer 2>/dev/null || pm2 restart explorer 2>/dev/null || systemctl restart explorer 2>/dev/null || true"

echo "==> [3/3] Checking status..."
ssh "$VPS_HOST" "systemctl status quavence-explorer --no-pager 2>/dev/null || pm2 status || true"

echo "✅ Explorer successfully deployed to VPS!"
