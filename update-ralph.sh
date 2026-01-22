#!/bin/bash
# Script to update Ralph Wiggum on Orgo VM
# Usage: ./update-ralph.sh <COMPUTER_ID> <ORGO_API_KEY>

set -e

COMPUTER_ID="${1:-a3889135-1195-46ba-ac97-2c60df45c59e}"
ORGO_API_KEY="${2:-sk_live_baff28cac7dfec50e3203d2aaf67e0cba865ce6968a1aba2}"
RALPH_GIST_URL="https://gist.githubusercontent.com/Prakshal-Jain/660d4b056a0f2554a663a171fda40c9f/raw/9840198380b8d0bae3b7397caf6519be3644b45c/ralph_wiggum.py"

ORGO_API="https://www.orgo.ai/api"

echo "🔄 Updating Ralph Wiggum..."
echo "Computer ID: $COMPUTER_ID"
echo ""

# Function to run bash command
run_cmd() {
    local cmd="$1"
    local desc="$2"
    echo "📌 $desc"
    curl -s -X POST "$ORGO_API/computers/$COMPUTER_ID/bash" \
        -H "Authorization: Bearer $ORGO_API_KEY" \
        -H "Content-Type: application/json" \
        -d "{\"command\": \"$cmd\"}" | jq -r '.output // .error // .'
    echo ""
}

# Step 1: Install Pillow
run_cmd "pip3 install Pillow --break-system-packages" "Installing Pillow..."

# Step 2: Stop existing Ralph processes
run_cmd "killall -9 python3 2>/dev/null; rm -f /tmp/ralph_task.lock; echo 'Stopped'" "Stopping existing Ralph processes..."

# Step 3: Download updated Ralph script
run_cmd "curl -fsSL '$RALPH_GIST_URL' -o ~/ralph_wiggum.py && chmod +x ~/ralph_wiggum.py && head -5 ~/ralph_wiggum.py" "Downloading updated Ralph script..."

# Step 4: Verify Pillow
run_cmd "python3 -c 'import PIL; print(\"Pillow OK\")'" "Verifying Pillow installation..."

# Step 5: Restart Ralph
run_cmd "(bash -c '~/start-ralph.sh >/dev/null 2>&1 &') && sleep 2 && echo 'Started'" "Starting Ralph Wiggum..."

# Step 6: Check if Ralph is running
run_cmd "ps aux | grep -E '[r]alph_wiggum.py' && echo '✓ Ralph is running' || echo '⚠ Not found yet'" "Checking Ralph status..."

echo "✅ Update complete!"
echo "📋 Check logs with: curl -X POST '$ORGO_API/computers/$COMPUTER_ID/bash' -H 'Authorization: Bearer $ORGO_API_KEY' -H 'Content-Type: application/json' -d '{\"command\": \"tail -20 ~/ralph_wiggum.log\"}' | jq -r '.output'"

