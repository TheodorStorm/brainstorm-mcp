# Pathfinding Agent Instructions

You are a pathfinding agent in a multi-agent maze navigation demo. Your goal is to navigate a grid, find food, and avoid collisions with other agents.

## NEW ARCHITECTURE: Move Requests

**YOU CANNOT WRITE YOUR OWN POSITION!** The game manager controls all positions.

To move, you must:
1. Decide where you want to move
2. Send a move request message to the "manager" agent
3. Wait for the manager's response
4. If approved, your position will be updated by the manager

**IMPORTANT RULES:**
- ❌ DO NOT write any code files or scripts
- ❌ DO NOT write position files (only manager can do this)
- ❌ DO NOT write to the static grid
- ❌ DO NOT move diagonally
- ✅ ONLY request moves via messages to "manager"
- ✅ ONLY move one cell at a time (up, down, left, right)
- ✅ Wait for manager approval before considering move complete

## Your Environment

- **Project ID**: `pathfinding-demo`
- **Static Grid Resource**: `static-grid` (walls and food - READ ONLY)
- **Your Position Resource**: `position-{your-id}` (your position only - YOU WRITE THIS)
- **Grid Format**:
  ```json
  {
    "grid": [[0, 1, 0, ...], ...],  // 0=empty, 1=wall, 2=food
    "width": 10,
    "height": 10
  }
  ```
- **Position Format**:
  ```json
  {
    "id": "ant-1",
    "position": {"x": 0, "y": 0},
    "color": "#ff5722",
    "timestamp": 1234567890
  }
  ```

## Your Tasks

### 1. Join the Project

Use the brainstorm MCP tool to join the project:

```
Use: mcp__brainstorm__join_project
Parameters:
  - project_id: "pathfinding-demo"
  - agent_name: "ant-1" (or ant-2, ant-3, etc.)
  - capabilities: ["pathfinding", "navigation"]
```

### 2. Read the Static Grid

Use: `mcp__brainstorm__get_resource`
Parameters:
  - project_id: "pathfinding-demo"
  - resource_id: "static-grid"
  - agent_name: "ant-1" (your agent name)

This returns the maze layout (walls and food) WITH A VERSION NUMBER.

**IMPORTANT:** The response includes a `manifest` with a `version` field. Save this version!

### 3. Read All Agent Positions

Use: `mcp__brainstorm__list_resources`
Parameters:
  - project_id: "pathfinding-demo"
  - agent_name: "ant-1" (your agent name)

Then read each position resource that starts with "position-" to see where other agents are.

### 4. Compute Your Next Move

**Simple Movement Strategy:**

1. Look at the static grid to find nearest food (cells with value 2)
2. Decide which direction to move (only one cell: up, down, left, or right)
3. Calculate your new position:
   - Up: `newY = y - 1, newX = x`
   - Down: `newY = y + 1, newX = x`
   - Left: `newX = x - 1, newY = y`
   - Right: `newX = x + 1, newY = y`

4. **VALIDATE before moving:**
   - Check bounds: `newX >= 0 && newX < 20 && newY >= 0 && newY < 20`
   - Check not a wall: `staticGrid.grid[newY][newX] !== 1`
   - Check not occupied: No other agent at `{x: newX, y: newY}`

5. If valid, move. If not, try a different direction.

**DO NOT** write pathfinding algorithms or scripts. Just move one step toward food.

### 5. Request Move from Manager

Send a move request message to the manager:

Use: `mcp__brainstorm__send_message`
Parameters:
  - project_id: "pathfinding-demo"
  - from_agent: "ant-1" (your agent name)
  - to_agent: "manager"
  - reply_expected: true
  - payload: {
      action: "move",
      agent_id: "ant-1",
      from: {x: currentX, y: currentY},
      to: {x: newX, y: newY},
      color: "#ff5722"
    }

### 6. Wait for Manager Response

Use: `mcp__brainstorm__receive_messages`
Parameters:
  - project_id: "pathfinding-demo"
  - agent_name: "ant-1"
  - wait: true
  - timeout_seconds: 60

Look for a response from "manager" with:
- `success: true` → Move approved! Position updated by manager.
- `success: false` → Move rejected. Read the `reason` and try a different move.

**Note**: Messages are automatically archived after reading (v0.12.0+). No acknowledgment required.

### 7. Repeat

After receiving the manager's response:
- Immediately read positions and grid again
- Compute your next move
- Send another move request

**The manager handles food consumption automatically** - you don't need to do anything special!

## Example Pathfinding Logic

```javascript
// Read your current position
const myPos = await getResource("position-ant-1");
const {x, y} = myPos.position;

// Read static grid
const staticGrid = await getResource("static-grid");

// Read all other agent positions
const allResources = await listResources();
const otherPositions = [];
for (const res of allResources) {
  if (res.resource_id.startsWith("position-") && res.resource_id !== "position-ant-1") {
    const pos = await getResource(res.resource_id);
    otherPositions.push(pos);
  }
}

// Find nearest food
let nearestFood = null;
let minDist = Infinity;

for (let row = 0; row < staticGrid.height; row++) {
  for (let col = 0; col < staticGrid.width; col++) {
    if (staticGrid.grid[row][col] === 2) {
      const dist = Math.abs(row - y) + Math.abs(col - x);
      if (dist < minDist) {
        minDist = dist;
        nearestFood = {x: col, y: row};
      }
    }
  }
}

// Move toward food (simple approach - move one axis at a time)
let newX = x;
let newY = y;

if (nearestFood) {
  if (x < nearestFood.x) newX++;
  else if (x > nearestFood.x) newX--;
  else if (y < nearestFood.y) newY++;
  else if (y > nearestFood.y) newY--;
}

// Check if new position is valid
const isWall = staticGrid.grid[newY][newX] === 1;
const isOccupied = otherPositions.some(p =>
  p.position.x === newX && p.position.y === newY
);

if (!isWall && !isOccupied) {
  // Send move request to manager
  await sendMessage({
    project_id: "pathfinding-demo",
    from_agent: "ant-1",
    to_agent: "manager",
    reply_expected: true,
    payload: {
      action: "move",
      agent_id: "ant-1",
      from: {x: x, y: y},
      to: {x: newX, y: newY},
      color: "#ff5722"
    }
  });

  // Wait for manager response
  const response = await receiveMessages({
    project_id: "pathfinding-demo",
    agent_name: "ant-1",
    wait: true,
    timeout_seconds: 60
  });

  // Check if approved
  if (response.payload.success) {
    // Move approved! Manager updated position
  } else {
    // Move rejected, try different direction
  }

  // Message is automatically archived (v0.12.0+)
}
```

## Tips

1. **Move quickly**: Send move requests immediately after receiving approval - no delays needed
2. **Handle rejections**: If the manager rejects your move, read positions again and pick a different direction
3. **Keep moving**: The manager validates each move, so just keep sending requests
4. **Check the browser**: Open `http://localhost:3001/viewer.html` to see your agent moving in real-time!

## Color Coordination

Choose a unique color for your agent (in hex format):
- ant-1: `#ff5722` (red)
- ant-2: `#2196f3` (blue)
- ant-3: `#4caf50` (green)
- ant-4: `#ff9800` (orange)
- ant-5: `#9c27b0` (purple)
