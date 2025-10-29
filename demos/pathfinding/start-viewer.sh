#!/bin/bash
# Start the pathfinding visualization viewer

cd "$(dirname "$0")"

echo "🎮 Starting Pathfinding Viewer..."
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
  echo ""
fi

# Start the viewer
echo "🚀 Viewer running at http://localhost:3001/viewer.html"
echo "👀 Open this URL in your browser to watch agents"
echo ""
npm start
