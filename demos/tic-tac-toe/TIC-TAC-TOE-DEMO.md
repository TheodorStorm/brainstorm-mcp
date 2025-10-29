# Tic-Tac-Toe Agent Cooperation Demo

This demo shows two Claude Code agents playing tic-tac-toe together using the brainstorm MCP server.

## What This Demonstrates

- ✅ **Project creation and joining**
- ✅ **Real-time messaging** with long-polling
- ✅ **Shared resources** (game board state)
- ✅ **Turn-based coordination** between agents
- ✅ **Graceful game completion**

## Setup

### Prerequisites

1. Agent-coop MCP server is installed: `claude mcp list` should show `brainstorm`
2. Two terminal windows or Claude Code instances

## How to Run

Use the launcher scripts that automatically start Claude Code with the right instructions:

**Terminal 1: Player X**
```bash
cd demos/tic-tac-toe
./player-x.sh
```

**Terminal 2: Player O**
```bash
cd demos/tic-tac-toe
./player-o.sh
```

The agents will automatically receive their instructions and start playing!

### Watching the Game

Both agents will:
- Exchange moves via messages
- Update the shared game board resource
- Visualize the board state in messages
- Declare winner/draw when game ends
- Thank each other and stop

## What You'll See

**Player O makes opening move:**
```
 O |   |
---+---+---
   |   |
---+---+---
   |   |
```

**Player X responds:**
```
 O | X |
---+---+---
   |   |
---+---+---
   |   |
```

**Game continues until completion!**

## Expected Behavior

1. **Player X** creates project, initializes board, waits
2. **Player O** joins, makes first move, notifies Player X
3. **Player X** receives notification immediately (long-polling), makes move
4. **Both agents** take turns until:
   - Someone wins (3 in a row)
   - Draw (board full, no winner)
5. **Loser** congratulates winner
6. **Both agents** stop listening for messages

## Troubleshooting

**"Project not found"**
- Make sure Player X creates the project first

**"Resource not found"**
- Player X must initialize the board before Player O makes a move

**"No messages arriving"**
- Check both agents are using the same project_id: `tic-tac-toe`
- Verify agent names: `player-x` and `player-o`

**"Agent won't stop"**
- Some agents may need explicit instruction to stop after game ends
- Simply exit the session or say "stop"

## Files Created

During the game, check the MCP storage:

```bash
# View agents
ls ~/.brainstorm/agents/

# View player X inbox
ls ~/.brainstorm/agents/player-x/inbox/

# View player O inbox
ls ~/.brainstorm/agents/player-o/inbox/

# View game board (current state)
cat ~/.brainstorm/resources/shared/game-board/payload/data
```

## Tips for Best Results

- Let the agents read the instructions completely before starting
- Don't interrupt the game flow once started
- Watch both terminals to see the coordination in real-time
- The agents should handle game logic, win detection, and graceful completion autonomously

## Variations to Try

1. **Different starting positions** - Observe strategy differences
2. **Faster timeout** - Change timeout_seconds to 30 for quicker responses
3. **Add commentary** - Ask agents to add trash talk or commentary in messages
4. **Best of 3** - Modify instructions for multiple games with score tracking

Enjoy watching the agents play! 🎮
