#!/usr/bin/env node
import chokidar from 'chokidar';
import express from 'express';
import { WebSocketServer } from 'ws';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = 3001;
const BRAINSTORM_ROOT = process.env.BRAINSTORM_STORAGE || join(homedir(), '.brainstorm');
const PROJECT_ID = 'pathfinding-demo';
const RESOURCES_DIR = join(BRAINSTORM_ROOT, 'projects', PROJECT_ID, 'resources');
const STATIC_GRID_PATH = join(RESOURCES_DIR, 'static-grid', 'payload', 'data');

// State cache for diffing
let staticGrid = null;
let agentPositions = new Map(); // agentId -> {position, color, timestamp}

// Express app for serving static files
const app = express();
app.use(express.static(__dirname));

const server = app.listen(PORT, () => {
  console.log(`🎮 Pathfinding Viewer running at http://localhost:${PORT}`);
  console.log(`📁 Watching: ${RESOURCES_DIR}`);
  console.log(`\nOpen http://localhost:${PORT}/viewer.html in your browser`);
});

// WebSocket server
const wss = new WebSocketServer({ server });

// Broadcast to all connected clients
function broadcast(message) {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // OPEN
      client.send(data);
    }
  });
}

// Read static grid
function readStaticGrid() {
  if (!existsSync(STATIC_GRID_PATH)) {
    return null;
  }

  try {
    const content = readFileSync(STATIC_GRID_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error('Error reading static grid:', err.message);
    return null;
  }
}

// Read a position file
function readPositionFile(resourceId) {
  const posPath = join(RESOURCES_DIR, resourceId, 'payload', 'data');

  if (!existsSync(posPath)) {
    return null;
  }

  try {
    const content = readFileSync(posPath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    console.error(`Error reading ${resourceId}:`, err.message);
    return null;
  }
}

// Aggregate all agent positions
function aggregateState() {
  const agents = [];

  for (const [agentId, data] of agentPositions.entries()) {
    agents.push({
      id: agentId,
      position: data.position,
      color: data.color
    });
  }

  return {
    grid: staticGrid?.grid || [],
    agents: agents
  };
}

// Handle position file update
function handlePositionUpdate(resourceId) {
  const posData = readPositionFile(resourceId);

  if (!posData || !posData.id) {
    return;
  }

  const agentId = posData.id;
  const oldPos = agentPositions.get(agentId);

  // Update our cache
  agentPositions.set(agentId, {
    position: posData.position,
    color: posData.color,
    timestamp: posData.timestamp
  });

  // Determine change type
  let change;
  if (!oldPos) {
    // New agent joined
    change = {
      type: 'agent_joined',
      agentId: agentId,
      position: posData.position,
      color: posData.color
    };
    console.log(`🐜 Agent ${agentId} joined at (${posData.position.x}, ${posData.position.y})`);
  } else if (oldPos.position.x !== posData.position.x ||
             oldPos.position.y !== posData.position.y) {
    // Agent moved
    change = {
      type: 'agent_moved',
      agentId: agentId,
      from: oldPos.position,
      to: posData.position
    };
    console.log(`🐜 Agent ${agentId} moved to (${posData.position.x}, ${posData.position.y})`);
  }

  if (change) {
    broadcast({
      type: 'updates',
      timestamp: Date.now(),
      changes: [change],
      fullState: aggregateState()
    });
  }
}

// Handle static grid update
function handleStaticGridUpdate() {
  const newGrid = readStaticGrid();

  if (newGrid) {
    staticGrid = newGrid;
    console.log('📊 Static grid loaded');

    broadcast({
      type: 'full_state',
      timestamp: Date.now(),
      grid: aggregateState()
    });
  }
}

// Watch for file changes in resources directory
const watcher = chokidar.watch(RESOURCES_DIR, {
  persistent: true,
  ignoreInitial: false,
  depth: 4, // resources/{resource-id}/payload/data
  awaitWriteFinish: {
    stabilityThreshold: 50,
    pollInterval: 10
  }
});

watcher
  .on('add', (path) => {
    if (path.includes('static-grid')) {
      console.log('📝 Static grid file created');
      handleStaticGridUpdate();
    } else if (path.includes('position-') && path.endsWith('data')) {
      const resourceId = path.split('/').find(p => p.startsWith('position-'));
      if (resourceId) {
        handlePositionUpdate(resourceId);
      }
    }
  })
  .on('change', (path) => {
    if (path.includes('static-grid')) {
      console.log('🔄 Static grid file updated');
      handleStaticGridUpdate();
    } else if (path.includes('position-') && path.endsWith('data')) {
      const resourceId = path.split('/').find(p => p.startsWith('position-'));
      if (resourceId) {
        handlePositionUpdate(resourceId);
      }
    }
  })
  .on('error', (error) => {
    console.error('❌ Watcher error:', error);
  });

// Handle WebSocket connections
wss.on('connection', (ws) => {
  console.log('🔌 Browser connected');

  // Send current state to new client
  const currentState = aggregateState();
  if (currentState && staticGrid) {
    ws.send(JSON.stringify({
      type: 'full_state',
      timestamp: Date.now(),
      grid: currentState
    }));
  }

  ws.on('close', () => {
    console.log('🔌 Browser disconnected');
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down viewer...');
  watcher.close();
  server.close();
  process.exit(0);
});
