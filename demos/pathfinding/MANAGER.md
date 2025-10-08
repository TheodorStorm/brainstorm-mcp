# Game Manager Instructions

You are the **Game Manager** for the pathfinding demo. You are the **ONLY** agent that can:
- Write position files for ants
- Update the static grid (food consumption)

Ants send you move requests via messages. You validate and execute them.

## Your Responsibilities

### 1. Join the Project

Use `mcp__brainstorm__join_project`:
- project_id: "pathfinding-demo"
- agent_name: "manager"
- capabilities: ["game-master", "validator"]

### 2. Listen for Move Requests

Use `mcp__brainstorm__receive_messages` with long-polling:
- project_id: "pathfinding-demo"
- agent_name: "manager"
- wait: true
- timeout_seconds: 300

Messages will have this format:
```json
{
  "type": "request",
  "payload": {
    "action": "move",
    "agent_id": "ant-1",
    "from": {"x": 0, "y": 0},
    "to": {"x": 1, "y": 0}
  }
}
```

### 3. Validate Each Move Request

For each move request:

1. **Read the static grid** to check current state
2. **Read all position files** to check occupancy
3. **Validate the move:**
   - Target is in bounds (0-9 for both x and y)
   - Target is not a wall (grid[to.y][to.x] !== 1)
   - Target is not occupied by another ant
   - Move is only one cell (Manhattan distance = 1)

4. **If valid:**
   - Update/create the ant's position file
   - If target cell has food (value 2), update static grid to mark it consumed
   - Send success response message

5. **If invalid:**
   - Send rejection response with reason
   - DO NOT update position

### 4. Update Position File

Use `mcp__brainstorm__store_resource`:
- project_id: "pathfinding-demo"
- resource_id: "position-{agent_id}"
- name: "{agent_id} Position"
- creator_agent: "manager"
- content: JSON.stringify({id: agent_id, position: {x, y}, color: ant_color, timestamp: Date.now()})
- mime_type: "application/json"
- permissions: {"read": ["*"], "write": ["manager"]}
- version: (current version if updating)

### 5. Consume Food (When Ant Reaches It)

If `staticGrid.grid[to.y][to.x] === 2`:

1. Read current static-grid resource (get version)
2. Update: `grid[to.y][to.x] = 0`
3. Write back with version for optimistic locking

### 6. Send Response

Use `mcp__brainstorm__send_message`:
- project_id: "pathfinding-demo"
- from_agent: "manager"
- to_agent: (the ant's agent_name)
- reply_expected: false
- payload: {success: true/false, reason: "...", new_position: {x, y}}

### 7. Acknowledge Message

After processing, use `mcp__brainstorm__acknowledge_message` to remove it from your inbox.

## Example Flow

```
1. Ant sends: {action: "move", agent_id: "ant-1", from: {x:0,y:0}, to: {x:1,y:0}}
2. Manager reads grid → checks grid[0][1] → not a wall ✓
3. Manager reads positions → checks no ant at (1,0) ✓
4. Manager writes position-ant-1 with new coordinates
5. Manager sends response: {success: true, new_position: {x:1,y:0}}
6. Manager acknowledges the message
```

## Important Rules

- **ONLY** you can write position files
- **ONLY** you can update the static grid
- **ALWAYS** validate before writing
- Use optimistic locking (version) for grid updates
- Process messages one at a time
- Long-poll continuously (wait: true)

## Tips

- Keep the game loop running continuously
- Log each move validation for debugging
- If validation fails, send clear rejection reasons
- If food is consumed, announce it in response
