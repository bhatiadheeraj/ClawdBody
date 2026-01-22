#!/bin/bash
# Script to check Ralph Wiggum task execution status on Orgo VM
# Usage: ./check-ralph-status.sh [COMPUTER_ID] [ORGO_API_KEY]

COMPUTER_ID="${1:-a3889135-1195-46ba-ac97-2c60df45c59e}"
ORGO_API_KEY="${2:-sk_live_baff28cac7dfec50e3203d2aaf67e0cba865ce6968a1aba2}"
ORGO_API="https://www.orgo.ai/api"

echo "🔍 Checking Ralph Wiggum Status..."
echo "Computer ID: $COMPUTER_ID"
echo ""

# Function to run bash command
run_cmd() {
    local cmd="$1"
    curl -s -X POST "$ORGO_API/computers/$COMPUTER_ID/bash" \
        -H "Authorization: Bearer $ORGO_API_KEY" \
        -H "Content-Type: application/json" \
        -d "{\"command\": \"$cmd\"}" | jq -r '.output // .error // .'
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 RALPH PROCESS STATUS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
run_cmd "ps aux | grep -E '[r]alph_wiggum.py' | head -5 || echo 'No Ralph process found'"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔒 TASK LOCK STATUS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
run_cmd "if [ -f /tmp/ralph_task.lock ]; then echo '⚠️  Task in progress:'; cat /tmp/ralph_task.lock; else echo '✅ No active task (lock file not found)'; fi"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 RECENT LOGS (last 30 lines)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
run_cmd "tail -30 ~/ralph_wiggum.log 2>/dev/null || echo 'No log file found'"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 ACTIVE TASKS (tasks.md)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
run_cmd "if [ -f ~/vault/tasks.md ]; then grep -E '^- \[ \]' ~/vault/tasks.md | head -10 || echo 'No uncompleted tasks'; else echo 'tasks.md not found'; fi"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ RECENT COMPLETED TASKS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
run_cmd "if [ -d ~/vault/completed_tasks ]; then ls -lt ~/vault/completed_tasks/*.md 2>/dev/null | head -5 | awk '{print \$9}' | xargs -I {} basename {} || echo 'No completed tasks'; else echo 'completed_tasks directory not found'; fi"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📅 TODAY'S VAULT LOGS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
run_cmd "today=\$(date +%Y-%m-%d); if [ -f ~/vault/logs/\${today}.md ]; then tail -20 ~/vault/logs/\${today}.md; else echo 'No logs for today'; fi"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔄 GIT STATUS (uncommitted changes)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
run_cmd "cd ~/vault && git status --short 2>/dev/null | head -10 || echo 'No uncommitted changes or not a git repo'"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💡 QUICK COMMANDS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Watch logs live:     tail -f ~/ralph_wiggum.log"
echo "View tasks:          cat ~/vault/tasks.md"
echo "Check lock file:     cat /tmp/ralph_task.lock"
echo "View completed:      ls -lt ~/vault/completed_tasks/"

