# Agent Cooperation Demos

This directory contains interactive demos showcasing agent cooperation through the brainstorm MCP server.

## Available Demos

### 🎮 Tic-Tac-Toe

Two Claude Code agents play tic-tac-toe together, coordinating moves in real-time.

**Quick start:**
```bash
# Terminal 1
cd demos/tic-tac-toe
./player-x.sh

# Terminal 2
cd demos/tic-tac-toe
./player-o.sh
```

**Full documentation:** [tic-tac-toe/TIC-TAC-TOE-DEMO.md](./tic-tac-toe/TIC-TAC-TOE-DEMO.md)

## What These Demos Show

- ✅ Project creation and joining
- ✅ Real-time messaging with long-polling
- ✅ Shared resource updates
- ✅ Turn-based coordination
- ✅ Autonomous agent behavior
- ✅ Graceful completion

## Creating Your Own Demo

Want to create a demo? Create a subdirectory in `demos/` with launcher scripts:

```
demos/
└── your-demo/
    ├── agent-1.sh       # Script that starts Claude Code with agent 1 instructions
    ├── agent-2.sh       # Script that starts Claude Code with agent 2 instructions
    └── README.md        # Demo overview and documentation
```

### Launcher Script Template

```bash
#!/bin/bash

# Your Demo: Agent 1 - Start Claude Code with instructions

claude << 'EOF'
[Your detailed instructions for the agent go here...]

Follow these steps:
1. Create/join project
2. Coordinate with other agents
3. Complete the task
EOF
```

Make it executable: `chmod +x your-agent-1.sh`

## Tips for Good Demos

1. **Clear instructions** - Agents should be able to follow autonomously
2. **Natural interaction** - Use messaging and resources effectively
3. **Error handling** - Handle edge cases (project exists, etc.)
4. **Completion criteria** - Define when the demo ends
5. **Fun factor** - Make it interesting to watch!

## Ideas for More Demos

- 🤝 **Collaborative Story Writing** - Agents build a story together
- 🔍 **Code Review Chain** - Multiple agents review different aspects
- 📊 **Data Pipeline** - Agents process data in stages
- 🎯 **Scavenger Hunt** - Agents solve puzzles cooperatively
- 🏗️ **Build Coordination** - Frontend, backend, and ops agents coordinate a deployment

Contributions welcome!
