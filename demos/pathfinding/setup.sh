#!/bin/bash
# Setup script for pathfinding demo

cd "$(dirname "$0")"

echo "🚀 Setting up Pathfinding Demo..."
echo ""
echo "This will:"
echo "  - Create the project"
echo "  - Initialize the maze"
echo "  - Start the game manager"
echo ""
echo "Next steps (in separate terminals):"
echo "  1. ./start-viewer.sh"
echo "  2. ./start-ant.sh 1"
echo "  3. ./start-ant.sh 2"
echo ""
echo "Starting manager..."
echo ""

claude "Read and follow the instructions in SETUP.md" --allowedTools "mcp__brainstorm"
