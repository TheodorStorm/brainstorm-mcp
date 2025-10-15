#!/bin/bash
# Start the game manager agent

cd "$(dirname "$0")"

echo "🎮 Starting Game Manager..."
echo ""
echo "The manager will:"
echo "  - Validate all move requests"
echo "  - Enforce wall collision rules"
echo "  - Manage food consumption"
echo "  - Update ant positions"
echo ""

export BRAINSTORM_CLIENT_ID="pathfinding-manager"
claude "You are the game manager for the pathfinding demo. Read and follow the instructions in MANAGER.md EXACTLY.

CRITICAL RESPONSIBILITIES:
- YOU are the ONLY agent that can write position files
- YOU are the ONLY agent that can update the static grid
- ALWAYS validate moves before approving them
- Check walls, bounds, and occupancy
- Use long-polling to continuously process requests

Join the project as 'manager' and start processing move requests immediately." --allowedTools "mcp__brainstorm"
