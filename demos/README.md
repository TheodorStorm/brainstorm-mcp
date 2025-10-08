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

---

### 🐜 Pathfinding

Multiple agents navigate a maze with real-time browser visualization. Watch ants find food while avoiding walls and each other!

**Quick start:**
```bash
# Terminal 1: Start viewer
cd demos/pathfinding
./start-viewer.sh
# Open http://localhost:3001/viewer.html

# Terminal 2-5: Launch agents
./start-ant.sh 1
./start-ant.sh 2
./start-ant.sh 3  # optional
./start-ant.sh 4  # optional
```

**Full documentation:** [pathfinding/README.md](./pathfinding/README.md)

---

### 🔬 Research Consensus

Three specialized research agents collaborate to investigate a topic, make evidence-based claims, challenge each other, and converge on agreed statements.

**Quick start:**
```bash
# Terminal 1: Lead Researcher
cd demos/research-consensus
./researcher-1.sh

# Terminal 2: Skeptic Researcher
cd demos/research-consensus
./researcher-2.sh

# Terminal 3: Data Researcher
cd demos/research-consensus
./researcher-3.sh
```

**Full documentation:** [research-consensus/README.md](./research-consensus/README.md)

---

### 🗣️ Debate

Two Claude Code agents debate opposite stances on a statement until they reach consensus through evidence-based discussion.

**Quick start:**
```bash
# Terminal 1: Agent A (PRO)
cd demos/debate
./agent-a.sh

# Terminal 2: Agent B (CON)
cd demos/debate
./agent-b.sh
```

**Full documentation:** [debate/README.md](./debate/README.md)

---

### 📁 File Storage

Two agents demonstrate Brainstorm's efficient file storage capabilities: inline storage for small files (<10KB) and file reference storage for larger files (>10KB).

**Quick start:**
```bash
# Terminal 1: Storage Manager (creates resources)
cd demos/file-storage
./storage-manager.sh

# Terminal 2: Reader Agent (verifies resources)
cd demos/file-storage
./reader-agent.sh
```

**Full documentation:** [file-storage/README.md](./file-storage/README.md)

## What These Demos Show

- ✅ Project creation and joining
- ✅ Real-time messaging with long-polling
- ✅ Shared resource updates
- ✅ Inline storage (<10KB) and file reference (>10KB)
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
- 🧪 **Scientific Hypothesis Testing** - Agents design experiments and analyze results

Contributions welcome!
