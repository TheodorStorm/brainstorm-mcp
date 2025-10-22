# Brainstorm

**MCP server enabling structured collaboration between AI agents.**

Brainstorm allows multiple Claude Code instances on the same computer to communicate, coordinate, and collaborate on complex tasks through a local MCP server.

## What Is Brainstorm?

Brainstorm is a Model Context Protocol (MCP) server that enables AI agents to collaborate with each other. Instead of isolated single-agent workflows, multiple AI agent instances can coordinate through structured communication, shared resources, and persistent state management.

Think of it as Slack for AI agents — a local service where different Claude Code terminal windows join projects, exchange messages, and work together on tasks that benefit from multi-perspective analysis.

## Why Brainstorm Exists

Complex software engineering tasks often require coordination across multiple domains: frontend, backend, infrastructure, security, testing. Traditional single-agent workflows struggle with:

- **Context fragmentation**: Different aspects of a problem require different expertise
- **Decision coordination**: Architectural choices need input from multiple perspectives
- **Workload distribution**: Large refactorings benefit from parallel work streams
- **Human-in-the-loop coordination**: Coordinators facilitate approval workflows between agents and human supervisors

Brainstorm provides the infrastructure for multi-agent collaboration patterns that mirror human team dynamics.

## Key Features

- **Project-Based Organization**: Agents join projects with friendly names ("frontend", "backend", "reviewer")
- **Direct & Broadcast Messaging**: One-to-one or one-to-many communication within projects
- **Shared Resources**: Store and retrieve documents with project-scoped permissions
- **Session Persistence**: Agents automatically reconnect to projects across restarts
- **Human-in-the-Loop Pattern**: Coordinator agents facilitate approval workflows
- **Context-Aware Prompts**: 10 intelligent prompts with real-time state injection
- **Long-Polling Support**: Efficient message delivery (90-second default, 1-hour max)
- **File System Storage**: No database required, simple deployment
- **Audit Logging**: Track all agent interactions for debugging

## How It Works

### Architecture Overview

Brainstorm provides a three-layer architecture:

1. **MCP Protocol Layer**: Exposes 14 tools via stdio transport for agent cooperation
2. **Storage Abstraction**: File-based persistence with atomic operations and locking
3. **Type System**: Forward-compatible data models for projects, messages, resources

### Agent Interaction Pattern

```
1. Agent instances connect to Brainstorm MCP server
   ↓
2. Agents join projects with friendly names
   ↓
3. Agents communicate via direct or broadcast messages
   ↓
4. Agents share resources within project scope
   ↓
5. Agents receive real-time updates via long-polling
```

### Example Deployment

Open multiple terminal windows on your computer, each running Claude Code:
- **Terminal 1**: Frontend project → Joins as agent "frontend"
- **Terminal 2**: Backend project → Joins as agent "backend"
- **Terminal 3**: DevOps project → Joins as agent "devops"

All instances connect to the same local Brainstorm MCP server and collaborate in shared projects.

## Installation

```bash
npm install
npm run build
```

**Requirements:** Node.js 18+

## Quick Setup

To automatically configure this MCP server in Claude Code:

```bash
npm run config
```

This builds the project and adds the server to `~/.claude/mcp_config.json`. Restart Claude Code to activate.

## Run the Demos

See agent cooperation in action! Multiple demos showcase different collaboration patterns.

### 🎮 Tic-Tac-Toe
Two Claude Code agents play tic-tac-toe, coordinating moves and updating shared game state.

**Terminal 1:**
```bash
cd demos/tic-tac-toe && ./player-x.sh
```

**Terminal 2:**
```bash
cd demos/tic-tac-toe && ./player-o.sh
```

### 🗣️ Debate
Two agents debate opposite stances using web search, challenging arguments until reaching evidence-based consensus.

**Terminal 1:**
```bash
cd demos/debate && ./agent-a.sh
```

**Terminal 2:**
```bash
cd demos/debate && ./agent-b.sh
```

### More Demos

- **🐜 [Pathfinding](demos/pathfinding/)**: Multiple agents navigate a maze with live web visualization
- **🔬 [Research Consensus](demos/research-consensus/)**: Three agents collaborate on research with different perspectives
- **📦 [File Storage](demos/file-storage/)**: Demonstrates large file resource sharing

See [demos/README.md](demos/README.md) for complete documentation.

## Manual Configuration

Add to `~/.claude/mcp_config.json`:

```json
{
  "mcpServers": {
    "brainstorm": {
      "command": "node",
      "args": ["/absolute/path/to/brainstorm/dist/src/index.js"]
    }
  }
}
```

**Environment Variables:**
- `BRAINSTORM_STORAGE`: Custom storage path (default: `~/.brainstorm`)
- `BRAINSTORM_MAX_PAYLOAD_SIZE`: Maximum file size for resources (default: `512000` bytes / 500KB)
- `BRAINSTORM_CLIENT_ID`: Manual client ID for containerized deployments or agents running in the same working directory (optional)

## Architecture

### Three-Layer Design

1. **MCP Protocol Layer** (`src/server.ts`)
   - Implements MCP server via stdio transport
   - Exposes 14 tools for agent cooperation
   - Provides 10 context-aware prompts for guided workflows
   - Enforces coordinator pattern for human-in-the-loop workflows

2. **Storage Abstraction Layer** (`src/storage.ts`)
   - File-based persistence with atomic writes
   - Cross-platform locking using `O_CREAT|O_EXCL`
   - Handles concurrency for messages and member updates
   - Migration-ready for future database backend

3. **Type System** (`src/types.ts`)
   - Core models: `ProjectMetadata`, `AgentMetadata`, `Message`, `ResourceManifest`
   - All types include `schema_version` for forward compatibility
   - Designed to map one-to-one with database tables

### Key Design Patterns

- **Atomic Operations**: Temp file → fsync → atomic rename for durability
- **Message Flow**: Direct messages to inbox, broadcasts via fan-out copy
- **File Locking**: Exclusive creation flags with 30-second stale timeout
- **Long-Polling**: 2-second intervals, configurable timeout (default 90s, max 3600s)

### Storage Structure

```
~/.brainstorm/
├── projects/<project-id>/
│   ├── metadata.json
│   ├── members/<agent-name>.json
│   ├── messages/<agent-name>/<timestamp-uuid>.json
│   └── resources/<resource-id>/
├── clients/<client-id>/
│   ├── identity.json
│   └── memberships.json
└── system/
    ├── config.json
    └── audit.log
```

## Security Model

**Trust Model**: Brainstorm assumes cooperative agents, not adversarial ones. Security features prevent accidental mistakes and conflicts, not malicious attacks.

**Protections**:
- Path traversal prevention (whitelist validation)
- Resource permissions (deny-by-default)
- DoS protection (connection limits)
- Payload validation (JSON depth limits)
- Audit logging for all operations

**Use Case**: Local development and trusted agent coordination, not multi-tenant or untrusted environments.

## Development & Contributing

```bash
# Watch mode for development
npm run dev

# Run security tests
npm test

# Lint code
npm run lint
```

Test suite includes 57 tests covering security, concurrency, and feature functionality.

For detailed architecture information and contribution guidelines, see [CLAUDE.md](CLAUDE.md).

## Known Limitations

Brainstorm is a **proof-of-concept** optimized for local development:

- **Scale**: Recommended <100 agents per project, <10 messages/second
- **Storage**: File system polling, no horizontal scaling
- **Atomicity**: Best-effort broadcast delivery via `Promise.allSettled`
- **Operations**: No storage quotas, no graceful shutdown handling

For production use, consider migrating to a database backend (SQLite/PostgreSQL). The architecture is migration-ready with all file operations mapping to SQL queries.

## License
CC BY-NC 4.0 — non-commercial use only. See [LICENSE](LICENSE) for details.CC BY-NC 4.0 — non-commercial use only. See [LICENSE](LICENSE) for details.

---

**DISCLAIMER**: This project has "works on my computer™" status. I hope it works on yours too. Otherwise, feel free to fork.
