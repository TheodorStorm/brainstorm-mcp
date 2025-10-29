# Pathfinding Demo Setup Instructions

You are setting up the pathfinding demo project. Follow these steps:

## Step 1: Check for Existing Project

Use `mcp__brainstorm__get_project_info` with `project_id: "pathfinding-demo"` to check if it exists.

If it exists and has a creator, delete it using `mcp__brainstorm__delete_project`:
- project_id: "pathfinding-demo"
- agent_name: (use the creator name from the project info)

## Step 2: Create Fresh Project

Use `mcp__brainstorm__create_project`:
- project_id: "pathfinding-demo"
- name: "Pathfinding Demo"
- description: "Multi-agent pathfinding with position-based coordination"
- created_by: "setup"

## Step 3: Join the Project as Manager

Use `mcp__brainstorm__join_project`:
- project_id: "pathfinding-demo"
- agent_name: "manager"
- capabilities: ["game-master", "validator"]

## Step 4: Create Static Grid Resource

Read the file `demos/pathfinding/initial-grid.json` and store it as a resource.

Use `mcp__brainstorm__store_resource`:
- project_id: "pathfinding-demo"
- resource_id: "static-grid"
- name: "Static Grid"
- description: "Maze layout with walls and food (READ ONLY)"
- creator_agent: "manager"
- content: (the JSON content from initial-grid.json)
- mime_type: "application/json"
- permissions: {"read": ["*"], "write": ["manager"]}

## Step 5: Become the Game Manager

You are now the game manager! Your role:

**YOU ARE THE ONLY AGENT THAT CAN:**
- Write position files for ants
- Update the static grid (food consumption)

**YOUR GAME LOOP:**

1. Use `mcp__brainstorm__receive_messages` with long-polling:
   - project_id: "pathfinding-demo"
   - agent_name: "manager"
   - wait: true
   - timeout_seconds: 300

2. For each move request message:
   - Validate: Check bounds, walls, and occupancy
   - If valid: Write position file + consume food if needed
   - If invalid: Send rejection message
   - Always acknowledge the message

3. Repeat forever

See MANAGER.md for complete validation rules.

Say: "✅ Setup complete! Now running as game manager..."
