# Brainstorm

An MCP (Model Context Protocol) server that enables Claude Code agents to collaborate, communicate, and share resources through a simple **project-centric** workflow.
DISCLAIMER: This status of this project is "works on my computer™". I hope it works on yours too. Otherwise, feel free to fork.

## Features

- **Project-Based Organization**: Projects are the organizing unit—agents join projects with friendly names
- **Natural Communication**: Send messages using simple names like "frontend" or "backend"
- **Shared Context**: Project descriptions and goals automatically visible to all members
- **Direct & Broadcast Messaging**: One-to-one or one-to-many communication within projects
- **Shared Resources**: Store and retrieve documents with project-scoped permissions
- **Long-Polling Support**: Efficient message delivery without constant polling
- **File System Storage**: Simple file-based storage for easy deployment (no database required)
- **Audit Logging**: Track all interactions for debugging and compliance

## Installation

```bash
npm install
npm run build
```

## Quick Setup

To automatically configure this MCP server in Claude Code:

```bash
npm run config
```

This will build the project and add the server to `~/.claude/mcp_config.json`. Restart Claude Code to activate.

## Manual Configuration

Alternatively, manually add to your MCP settings (`~/.claude/mcp_config.json`):

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

## How It Works

### Core Concepts

**Projects** are the organizing unit for agent cooperation. Think of a project as a workspace where agents collaborate on a specific goal.

**Agents** join projects with **friendly names** (like "frontend", "backend", "security"). Names are scoped to the project, so "frontend" in project A is different from "frontend" in project B.

**Messages** are sent between agents using their friendly names. You can send direct messages or broadcast to all project members.

**Resources** are shared documents, artifacts, or data that agents can store and retrieve within a project.

### Typical Workflow

```
1. User or lead agent creates a project
   ↓
2. Agents join the project with friendly names
   ↓
3. Agents communicate and share resources
   ↓
4. Agents receive updates via long-polling
```

## Available Tools

### Project Management

#### `create_project`
Create a new cooperation project. This sets up the workspace where agents will collaborate.

```typescript
{
  project_id: "api-redesign",           // Unique identifier
  name: "API Redesign Coordination",    // Human-readable name
  description: "Coordinate frontend and backend for API v2",
  context: {                            // Optional: shared context
    goal: "Migrate from REST to GraphQL",
    timeline: "2 weeks",
    docs_url: "https://..."
  }
}
```

**Response:**
```json
{
  "success": true,
  "project_id": "api-redesign",
  "message": "Project created. Agents can now join using join_project."
}
```

#### `join_project`
Join a project with a friendly agent name. This is how agents register themselves.

```typescript
{
  project_id: "api-redesign",
  agent_name: "frontend",               // Your friendly name
  capabilities: ["react", "typescript"], // Optional
  labels: { "team": "web" }             // Optional
}
```

**Response:**
```json
{
  "success": true,
  "agent_name": "frontend",
  "agent_id": "550e8400-...",  // Auto-generated UUID
  "message": "Joined project successfully. You can now send and receive messages."
}
```

#### `get_project_info`
Get project metadata and list of members. Use this to see who's in the project and the shared context.

```typescript
{
  project_id: "api-redesign"
}
```

**Response:**
```json
{
  "project": {
    "project_id": "api-redesign",
    "name": "API Redesign Coordination",
    "description": "...",
    "context": { "goal": "...", "timeline": "..." },
    "created_at": "2025-01-15T10:00:00Z"
  },
  "members": [
    {
      "agent_name": "frontend",
      "capabilities": ["react", "typescript"],
      "online": true,
      "last_seen": "2025-01-15T10:05:00Z"
    },
    {
      "agent_name": "backend",
      "capabilities": ["fastapi", "postgresql"],
      "online": true,
      "last_seen": "2025-01-15T10:04:00Z"
    }
  ]
}
```

#### `list_projects`
List all available projects.

```typescript
{}
```

#### `delete_project`
Delete a project and all its data. **Only the agent that created the project can delete it.**

```typescript
{
  project_id: "api-redesign",
  agent_name: "backend"  // Must match the creator
}
```

**Response:**
```json
{
  "success": true,
  "message": "Project deleted successfully"
}
```

**Admin bypass** (for testing/recovery):
```bash
npm run cleanup -- <project_id>
```

### Messaging

#### `send_message`
Send a message to another agent or broadcast to all project members.

**Direct message:**
```typescript
{
  project_id: "api-redesign",
  from_agent: "frontend",
  to_agent: "backend",           // Target agent by name
  type: "request",               // request | response | event
  payload: {
    action: "review_schema",
    schema_url: "https://..."
  },
  metadata: {                    // Optional
    priority: "high",
    trace_id: "abc-123"
  }
}
```

**Broadcast message:**
```typescript
{
  project_id: "api-redesign",
  from_agent: "backend",
  broadcast: true,               // Send to all members
  type: "event",
  payload: {
    status: "schema_updated",
    version: "2.0"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message_id": "msg-550e8400-..."
}
```

#### `receive_messages`
Get messages from your inbox. Supports **long-polling** for efficient real-time updates.

**Standard fetch:**
```typescript
{
  project_id: "api-redesign",
  agent_name: "frontend",
  limit: 10                      // Optional
}
```

**Long-polling (recommended):**
```typescript
{
  project_id: "api-redesign",
  agent_name: "frontend",
  wait: true,                    // Wait for messages
  timeout_seconds: 30            // Max wait time (default: 30, max: 300)
}
```

**Response (with messages):**
```json
{
  "messages": [
    {
      "message_id": "msg-...",
      "from_agent": "backend",
      "to_agent": "frontend",
      "type": "response",
      "payload": { "status": "approved" },
      "created_at": "2025-01-15T10:06:00Z"
    }
  ],
  "count": 1,
  "waited_ms": 1245              // Time waited (if using long-polling)
}
```

**Response (timeout):**
```json
{
  "messages": [],
  "count": 0,
  "waited_ms": 30000,
  "timeout": true
}
```

#### `acknowledge_message`
Mark a message as processed. This removes it from your inbox.

```typescript
{
  project_id: "api-redesign",
  agent_name: "frontend",
  message_id: "msg-550e8400-..."
}
```

### Shared Resources

#### `store_resource`
Store a shared document or artifact in the project.

```typescript
{
  project_id: "api-redesign",
  resource_id: "graphql-schema",
  name: "GraphQL Schema v2",
  description: "Updated API schema",
  creator_agent: "backend",
  content: "type Query { ... }",      // Text or base64
  mime_type: "text/plain",            // Optional
  permissions: {                      // Optional (defaults to all read)
    read: ["*"],                      // "*" = everyone
    write: ["backend", "frontend"]    // Specific agents
  }
}
```

#### `get_resource`
Retrieve a shared resource.

```typescript
{
  project_id: "api-redesign",
  resource_id: "graphql-schema",
  agent_name: "frontend"              // For permission check
}
```

**Response:**
```json
{
  "manifest": {
    "resource_id": "graphql-schema",
    "name": "GraphQL Schema v2",
    "creator_agent": "backend",
    "created_at": "2025-01-15T10:00:00Z",
    "size_bytes": 1024
  },
  "content": "type Query { ... }"
}
```

#### `list_resources`
List all resources in the project you have access to.

```typescript
{
  project_id: "api-redesign",
  agent_name: "frontend"
}
```

### Status Management

#### `heartbeat`
Update your online status. Call periodically to show you're active.

```typescript
{
  project_id: "api-redesign",
  agent_name: "frontend",
  online: true                        // Optional (defaults to true)
}
```

## Usage Examples

### Example 1: Cross-Project Code Review

User wants frontend and backend agents to coordinate on an API change.

```typescript
// User or lead agent creates project
create_project({
  project_id: "api-v2-migration",
  name: "API v2 Migration",
  description: "Coordinate REST to GraphQL migration",
  context: {
    goal: "Zero-downtime migration",
    timeline: "Sprint 23",
    docs: "https://wiki.company.com/api-v2"
  }
});

// Frontend agent joins
join_project({
  project_id: "api-v2-migration",
  agent_name: "frontend",
  capabilities: ["react", "graphql-client"]
});

// Backend agent joins
join_project({
  project_id: "api-v2-migration",
  agent_name: "backend",
  capabilities: ["nodejs", "graphql-server"]
});

// Frontend asks backend to review schema
send_message({
  project_id: "api-v2-migration",
  from_agent: "frontend",
  to_agent: "backend",
  type: "request",
  payload: {
    action: "review_schema",
    resource_id: "proposed-schema"
  }
});

// Backend polls for messages (with long-polling)
receive_messages({
  project_id: "api-v2-migration",
  agent_name: "backend",
  wait: true,
  timeout_seconds: 60
});

// Backend stores reviewed schema
store_resource({
  project_id: "api-v2-migration",
  resource_id: "approved-schema-v2",
  name: "Approved GraphQL Schema",
  creator_agent: "backend",
  content: "type Query { ... }",
  permissions: { read: ["*"], write: ["backend"] }
});

// Backend responds
send_message({
  project_id: "api-v2-migration",
  from_agent: "backend",
  to_agent: "frontend",
  type: "response",
  payload: {
    status: "approved",
    resource_id: "approved-schema-v2"
  }
});
```

### Example 2: Incident Response

Multiple agents coordinate during a production incident.

```typescript
// Create incident project
create_project({
  project_id: "incident-2025-01-15",
  name: "Production Outage - Auth Service",
  context: {
    severity: "high",
    started_at: "2025-01-15T14:30:00Z",
    affected_services: ["auth", "api-gateway"]
  }
});

// Agents join
join_project({ project_id: "incident-2025-01-15", agent_name: "monitoring" });
join_project({ project_id: "incident-2025-01-15", agent_name: "backend" });
join_project({ project_id: "incident-2025-01-15", agent_name: "sre" });

// Monitoring broadcasts alert
send_message({
  project_id: "incident-2025-01-15",
  from_agent: "monitoring",
  broadcast: true,
  type: "event",
  payload: {
    alert: "Error rate exceeded 50%",
    service: "auth",
    metric: "http_5xx_rate",
    value: 0.52
  }
});

// Backend broadcasts fix deployed
send_message({
  project_id: "incident-2025-01-15",
  from_agent: "backend",
  broadcast: true,
  type: "event",
  payload: {
    action: "hotfix_deployed",
    commit: "abc123",
    rollout_progress: "25%"
  }
});
```

### Example 3: Shared Knowledge Base

Store architecture docs accessible to all agents.

```typescript
// Architecture lead creates project
create_project({
  project_id: "platform-architecture",
  name: "Platform Architecture Docs",
  description: "Shared architecture knowledge base"
});

// Store API guidelines
store_resource({
  project_id: "platform-architecture",
  resource_id: "api-design-guide",
  name: "API Design Guidelines",
  creator_agent: "platform-lead",
  content: "# API Guidelines\n\n## REST vs GraphQL...",
  mime_type: "text/markdown",
  permissions: {
    read: ["*"],                    // Everyone can read
    write: ["platform-lead"]        // Only lead can update
  }
});

// Any agent can retrieve
get_resource({
  project_id: "platform-architecture",
  resource_id: "api-design-guide",
  agent_name: "frontend"
});
```

## File System Structure

```
~/.brainstorm/
├── projects/
│   └── <project-id>/
│       ├── metadata.json           # Project info, context, goals
│       ├── members/
│       │   ├── frontend.json       # Member profiles
│       │   ├── backend.json
│       │   └── ...
│       ├── messages/
│       │   ├── frontend/           # Per-agent inboxes
│       │   │   └── 2025-01-15T10-00-00-msg-uuid.json
│       │   ├── backend/
│       │   └── ...
│       └── resources/
│           └── <resource-id>/
│               ├── manifest.json   # Metadata, permissions
│               └── payload/data    # Actual content
├── locks/                          # Concurrency control
│   └── *.lock
└── system/
    ├── config.json                 # Server configuration
    └── audit.log                   # Activity log
```

## Architecture

### Three-Layer Design

1. **MCP Protocol Layer** (`src/server.ts`)
   - Implements MCP server over stdio transport
   - Exposes 11 tools for project cooperation
   - Handles request validation and error responses

2. **Storage Abstraction Layer** (`src/storage.ts`)
   - Provides all persistence operations
   - Implements atomic writes (temp file → fsync → rename)
   - Cross-platform file locking using `O_CREAT|O_EXCL`
   - Handles concurrency for message delivery and member updates

3. **Type System** (`src/types.ts`)
   - Core data models: `ProjectMetadata`, `ProjectMember`, `Message`, `ResourceManifest`
   - All types include `schema_version` for forward compatibility
   - Designed to map one-to-one with future database tables

### Key Design Patterns

**Atomic Operations**: All writes use temp file → fsync → atomic rename for durability.

**Message Flow**:
- Direct messages: Written directly to recipient's inbox
- Broadcast messages: Fan-out copied to each member's inbox using `Promise.allSettled`
- Message files named with ISO timestamp + UUID for natural ordering

**Locking Strategy**:
- Lock files in `locks/` directory using exclusive creation flag
- Stale lock detection (30 second timeout)
- Lock scope kept narrow for maximum concurrency

**Long-Polling**:
- 1-second poll interval, configurable timeout (max 300s)
- Immediately returns when messages arrive
- Efficient for real-time coordination

## Security

Brainstorm implements defense-in-depth security with protection against common vulnerabilities:

### Path Traversal Prevention
- **Whitelist validation**: All identifiers (project_id, agent_name, resource_id) restricted to `[A-Za-z0-9_-]`
- **No dots allowed**: Prevents `../` sequences in paths
- **Length limits**: 1-256 characters per identifier

### Resource Authorization (Deny-by-Default)
- **Explicit permissions required**: All resources must define `permissions.read` and `permissions.write` arrays
- **No implicit access**: Resources without permissions are rejected
- **Write permission checks**: Updates validated against original resource permissions

Example secure resource:
```typescript
{
  permissions: {
    read: ["*"],                        // Public read
    write: ["backend", "frontend"]      // Restricted write
  }
}
```

### DoS Protection
- **Connection limits**: Maximum 100 concurrent long-polling requests per agent
- **Timeout enforcement**: 300-second maximum wait (configurable)
- **Graceful degradation**: Excess requests receive errors instead of hanging

### Payload Validation
- **JSON depth limit**: Maximum 100 levels of nesting to prevent JSON bombs
- **Size limits**: Configurable maximum (default: 10MB)
- **Plain text support**: Non-JSON payloads pass through unchanged

### Additional Protections
- **Race condition prevention**: Atomic file operations for project creation
- **Error sanitization**: Internal paths never exposed in error messages
- **Audit trail**: All actions logged to `system/audit.log` with timestamps
- **Project isolation**: Agents cannot access other projects' data
- **Improved locking**: Lock metadata with PID, timeout protection, stale lock cleanup
- **Project deletion authorization**: Only the agent that created a project can delete it

## Configuration

The server creates a configuration file at `~/.brainstorm/system/config.json` on first run. You can edit this file to tune server behavior:

```json
{
  "server_version": "0.2.0",
  "storage_root": "~/.brainstorm",
  "cleanup_interval_seconds": 3600,
  "message_ttl_seconds": 86400,
  "heartbeat_timeout_seconds": 300,
  "lock_stale_timeout_ms": 30000,
  "max_resource_size_bytes": 10485760,
  "max_long_poll_timeout_seconds": 900,
  "default_long_poll_timeout_seconds": 90
}
```

**Key Settings:**
- `message_ttl_seconds`: How long messages remain in inboxes (default: 24 hours)
- `max_long_poll_timeout_seconds`: Maximum wait time for `receive_messages` (default: 900s / 15 min)
- `default_long_poll_timeout_seconds`: Default timeout when not specified (default: 90s)
- `max_resource_size_bytes`: Maximum size for stored resources (default: 10MB)
- `lock_stale_timeout_ms`: How long before locks are considered stale (default: 30s)
- `heartbeat_timeout_seconds`: How long before agents marked offline (default: 5 min)

Changes take effect immediately - no server restart required.

## Migration Path

The file system storage is designed for easy migration to a database:

- All UUIDs (agent_id, message_id, resource_id) can become primary keys
- JSON files map directly to tables with same field names
- `FileSystemStorage` methods map to repository/DAO methods
- Atomic file operations become database transactions
- Lock files become row-level locks or optimistic locking with versioning

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch mode for development
npm run dev

# Run security tests
npm test

# Lint code
npm run lint

# Auto-configure in Claude Code
npm run config
```

### Testing

Comprehensive security test suite with 16 tests covering:
- Path traversal protection (3 tests)
- Resource authorization (3 tests)
- Error message sanitization (1 test)
- Race condition prevention (1 test)
- Payload validation (3 tests)
- Project deletion authorization (5 tests)

All tests pass on Node.js 18+. Run `npm test` before submitting changes.

See [demos/tic-tac-toe/](demos/tic-tac-toe/) for a complete working example of two agents coordinating through the MCP server.

## Demo

Want to see agent cooperation in action? Try the **Tic-Tac-Toe Demo**!

Two Claude Code agents play tic-tac-toe together, coordinating moves through the MCP server:

```bash
cd demos/tic-tac-toe/
cat TIC-TAC-TOE-DEMO.md
```

The demo shows:
- Project creation and joining
- Real-time messaging with long-polling
- Shared resource updates (game board)
- Turn-based coordination
- Graceful game completion

Perfect for understanding how agents cooperate!

## Troubleshooting

**Agent can't join project:**
- Verify project exists with `list_projects` or `get_project_info`
- Check agent_name isn't already taken in that project

**Messages not arriving:**
- Ensure both sender and recipient are in the same project
- Use long-polling with `wait: true` for real-time delivery
- Check message TTL hasn't expired (default: 24 hours)

**Resource access denied:**
- Verify agent has read permission in resource manifest
- Use `"*"` in `permissions.read` to grant public read access

**Server won't start:**
- Check storage path permissions: `~/.brainstorm`
- Verify Node.js version (requires Node 18+)
- Check MCP configuration in `~/.claude/mcp_config.json`

## License

MIT
