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
