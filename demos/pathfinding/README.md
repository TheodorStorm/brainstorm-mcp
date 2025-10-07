# Pathfinding Demo

Real-time browser visualization of multi-agent pathfinding using the Brainstorm MCP server.

## What This Demo Shows

- **Multi-agent coordination**: Multiple Claude Code instances coordinate through shared resources
- **Real-time visualization**: Browser displays agent movements as they happen
- **Pathfinding logic**: Agents navigate a maze, find food, and avoid collisions
- **File system as communication layer**: All coordination happens through `~/.brainstorm/` file system storage

## Architecture

```
Claude Code (Agent 1) ──┐
Claude Code (Agent 2) ──┼──> ~/.brainstorm/ <──── viewer.js ───> Browser
Claude Code (Agent 3) ──┘   (shared storage)    (watches FS)
```

Each agent:
1. Reads the shared grid state via MCP tools
2. Computes next move using pathfinding logic
3. Updates grid atomically via MCP tools
4. Repeats every 1-2 seconds

The viewer:
1. Watches `~/.brainstorm/projects/pathfinding-demo/resources/shared/grid/payload/data`
2. Detects changes using `chokidar`
3. Broadcasts updates to browser via WebSocket
4. Browser animates agent movements on canvas

## How to Run

**Terminal 1: Setup & Start Manager**
```bash
cd demos/pathfinding
./setup.sh
```
This creates the project and runs the game manager (validates moves, enforces rules).

**Terminal 2: Start the Viewer**
```bash
cd demos/pathfinding
./start-viewer.sh
```
Open http://localhost:3001/viewer.html in your browser.

**Terminal 3: Launch Ant 1**
```bash
cd demos/pathfinding
./start-ant.sh 1
```

**Terminal 4: Launch Ant 2**
```bash
cd demos/pathfinding
./start-ant.sh 2
```

**Terminal 5+: Launch More Ants** (optional)
```bash
./start-ant.sh 3
./start-ant.sh 4
```

The ants will request moves from the manager, who validates and executes them!

### What You'll See

The browser shows a live 10x10 grid with:
- **White cells**: Empty space
- **Black cells**: Walls
- **Green cells**: Food
- **Colored circles**: Agents (ants) moving in real-time

Each ant navigates independently, avoiding walls and other ants while seeking food.

## How It Works

### Grid Format

The grid is stored as a JSON resource:

```json
{
  "grid": [
    [0, 1, 0, ...],  // 0=empty, 1=wall, 2=food
    [0, 0, 0, ...],
    ...
  ],
  "agents": [
    {
      "id": "ant-1",
      "position": {"x": 2, "y": 3},
      "color": "#ff5722"
    }
  ]
}
```

### Agent Behavior

Each agent:
1. Reads grid state via `mcp__brainstorm__get_resource`
2. Finds nearest food using Manhattan distance
3. Computes next move (simple greedy approach toward food)
4. Checks if move is valid (no walls, no other agents)
5. Updates grid via `mcp__brainstorm__store_resource`
6. Waits 1-2 seconds and repeats

### Collision Avoidance

Agents avoid collisions through:
- **Read-before-write**: Check other agent positions before moving
- **Atomic updates**: MCP's file system operations prevent race conditions
- **Retry logic**: If update fails, agent re-reads and tries again

### Real-Time Updates

The viewer uses `chokidar` to watch for file changes with:
- `awaitWriteFinish` to avoid partial reads
- Debouncing (50ms stability threshold)
- WebSocket broadcasting for instant browser updates

## Customization

### Modify the Maze

Edit `initial-grid.json`:
- `0` = empty space
- `1` = wall
- `2` = food

### Change Agent Behavior

In the agent instructions, modify the pathfinding logic:
- Add A* for optimal paths
- Add random exploration
- Implement cooperation (share paths via messages)
- Add agent "personality" (cautious vs aggressive)

### Add More Agents

Launch additional Claude Code instances with unique IDs (ant-5, ant-6, etc.) and colors.

## Troubleshooting

### Viewer not detecting changes

- Verify the project was created: `ls ~/.brainstorm/projects/pathfinding-demo`
- Check the resource path: `ls ~/.brainstorm/projects/pathfinding-demo/resources/shared/grid/payload/data`
- Look at viewer logs for file watch events

### Agents not moving

- Check agent is joined: Use `mcp__brainstorm__get_project_info`
- Verify permissions: Grid resource should have `read: ["*"], write: ["*"]`
- Look for errors in Claude Code's MCP tool responses

### Browser not updating

- Check WebSocket connection status (should show green dot)
- Open browser console for errors
- Verify viewer.js is running (check terminal output)

## Next Steps

Extend this demo by:
- Adding channels for agent communication (coordinate paths)
- Implementing formation movement (agents travel together)
- Creating competitive scenarios (agents race for limited food)
- Adding obstacles that appear dynamically
- Recording agent "memories" as shared resources
