#!/bin/bash
# Start a pathfinding agent

if [ -z "$1" ]; then
  echo "Usage: ./start-ant.sh <ant-number>"
  echo "Example: ./start-ant.sh 1"
  exit 1
fi

ANT_NUM=$1
ANT_ID="ant-$ANT_NUM"

# Color mapping
case $ANT_NUM in
  1) COLOR="#ff5722" ;; # red
  2) COLOR="#2196f3" ;; # blue
  3) COLOR="#4caf50" ;; # green
  4) COLOR="#ff9800" ;; # orange
  5) COLOR="#9c27b0" ;; # purple
  *) COLOR="#607d8b" ;; # grey
esac

# Starting positions (corners and edges)
case $ANT_NUM in
  1) START_X=0; START_Y=0 ;;
  2) START_X=19; START_Y=0 ;;
  3) START_X=0; START_Y=19 ;;
  4) START_X=19; START_Y=19 ;;
  5) START_X=9; START_Y=0 ;;
  6) START_X=9; START_Y=19 ;;
  7) START_X=0; START_Y=9 ;;
  8) START_X=19; START_Y=9 ;;
  *) START_X=0; START_Y=0 ;;
esac

echo "🐜 Starting $ANT_ID (color: $COLOR, position: $START_X,$START_Y)"
echo ""

export BRAINSTORM_CLIENT_ID="pathfinding-$ANT_ID"
claude "You are $ANT_ID in a pathfinding demo. Read and follow the instructions in agent-instructions.md EXACTLY. Use color $COLOR and start at position {x: $START_X, y: $START_Y}.

CRITICAL RULES:
- ONLY use brainstorm MCP tools
- DO NOT write any code or scripts
- DO NOT write position files (only manager can!)
- ONLY send move requests to 'manager' agent
- Wait for manager approval before next move
- Manager validates all moves and updates positions

Join the project and start sending move requests to the manager." --allowedTools "mcp__brainstorm"
