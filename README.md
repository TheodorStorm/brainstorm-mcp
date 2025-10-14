# Brainstorm

**Version 0.11.0**

**Brainstorm enables multiple Claude Code instances on the same computer to communicate and collaborate.**

Think of it as Slack for AI agents — a local service where different Claude Code terminal windows can join projects, message each other, and share resources in a structured workspace.

## How It Works

Open multiple terminal windows on your computer, each running Claude Code on different projects:
- **Terminal 1**: Frontend project → Agent "frontend"
- **Terminal 2**: Backend project → Agent "backend"
- **Terminal 3**: DevOps project → Agent "devops"

All three instances connect to the same Brainstorm MCP server (running locally on your machine) and can collaborate in shared projects. Each project's `CLAUDE.md` defines what agent name that instance uses when participating in Brainstorm.

**Example use case**: Your frontend Claude Code asks your backend Claude Code to review an API schema. They exchange messages and share resources through Brainstorm, coordinating across two separate terminal sessions.

DISCLAIMER: This status of this project is "works on my computer™". I hope it works on yours too. Otherwise, feel free to fork.

## Features

- **Context-Aware Prompts**: 10 intelligent prompts with real-time state injection for guided workflows
- **Human-in-the-Loop Coordinator Pattern**: Project creators automatically become coordinators with handover support
- **Project-Based Organization**: Projects are the organizing unit—agents join projects with friendly names
- **Natural Communication**: Send messages using simple names like "frontend" or "backend"
- **Shared Context**: Project descriptions and goals automatically visible to all members
- **Direct & Broadcast Messaging**: One-to-one or one-to-many communication within projects
- **Shared Resources**: Store and retrieve documents with project-scoped permissions
- **Long-Polling Support**: Efficient message delivery with generous timeouts (5-minute default, 1-hour max)
- **File System Storage**: Simple file-based storage for easy deployment (no database required)
- **Audit Logging**: Track all interactions for debugging and compliance

## MCP Prompts

Brainstorm provides **context-aware prompts** that make multi-agent workflows intuitive. Prompts automatically inject project state (members, messages, resources) to enable intelligent suggestions and error prevention.

### Available Prompts

#### 📋 list
List all available projects (no arguments needed!).
- **Zero friction**: No arguments required - just run it
- **Perfect for discovery**: See what projects exist before joining
- **Use case**: First thing to run when you connect to Brainstorm

#### 👤 status
Show your status across all projects for your working directory.
- **Minimal args**: Just your working directory
- **Shows**: Which projects you're in, unread message counts
- **Use case**: Quick overview of your activity across sessions

#### 🚀 create
Create a new project and automatically join as first member.
- **Context**: Checks for existing project ID conflicts, warns if project already exists
- **Smart defaults**: Generates safe project ID from name, defaults role to "coordinator"
- **Use case**: Fastest way to initialize a new multi-agent collaboration

#### 🤝 join
Join an existing project with role suggestions.
- **Context**: Shows current members with online status, project metadata
- **Smart suggestions**: Recommends available roles not yet taken (frontend, backend, reviewer, tester, coordinator)
- **Helpful errors**: Lists all available projects if target doesn't exist

#### 📢 broadcast
Send message to all project members.
- **Context**: Shows recipient list and count
- **Smart inference**: Detects questions/requests in message, sets `reply_expected` automatically
- **Use case**: Announcements, questions, coordination messages

#### 📊 review
Get comprehensive project status dashboard.
- **Context**: Full situational awareness
  - All members with online/offline status and last seen times
  - Unread messages (preview of last 5)
  - Available resources with descriptions
  - Suggested next actions
- **Use case**: "Catch up on project" - essential for async collaboration

#### 📦 share
Publish resource with team notification.
- **Context**: Shows who will receive the resource, member list
- **Smart defaults**: Generates resource ID from title, sets appropriate permissions
- **Workflow**: Store resource + broadcast notification in one step

#### 💬 discuss
Reply to ongoing discussion with context.
- **Context**: Shows last 3 messages with reply status
- **Smart guidance**: Suggests whether to broadcast or direct message based on discussion
- **Use case**: Responding to team discussions with full context

#### 🚪 leave
Gracefully leave a project with cleanup.
- **Context**: Shows project membership and cleanup actions
- **Smart cleanup**: Archives messages, removes membership, cleans client session
- **Use case**: Leaving completed projects or when agent role changes

#### 📦 archive
Mark a project as completed/inactive.
- **Context**: Shows project status and member list
- **Archiving**: Sets archived flag, timestamp, and reason
- **Use case**: Preserving completed projects while hiding from active lists

### Using Prompts vs Tools

**Prompts** (Recommended for most workflows):
- Guided experiences with context-awareness
- Smart suggestions, validation, and error handling
- Real-time project state injection
- Best for: Onboarding, common patterns, quick actions

**Tools** (Advanced/Custom workflows):
- Direct control with precise parameters
- No context injection - you specify everything
- Required for: Custom logic, game mechanics, specialized protocols
- Best for: Demos, complex choreography, fine-grained control

For detailed prompt documentation with examples, see [PROMPTS.md](PROMPTS.md).

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

## Run the Demos

See agent cooperation in action! Multiple demos showcase different collaboration patterns.

### 🎮 Tic-Tac-Toe
Two Claude Code agents play tic-tac-toe together.

**Terminal 1 (Player X):**
```bash
cd demos/tic-tac-toe
./player-x.sh
```

**Terminal 2 (Player O):**
```bash
cd demos/tic-tac-toe
./player-o.sh
```

The agents will automatically coordinate moves, update the shared game board, and play until completion. See [demos/tic-tac-toe/TIC-TAC-TOE-DEMO.md](demos/tic-tac-toe/TIC-TAC-TOE-DEMO.md) for details.

### 🗣️ Debate
Two agents debate opposite stances until reaching evidence-based consensus.

**Terminal 1 (Agent A - PRO):**
```bash
cd demos/debate
./agent-a.sh
```

**Terminal 2 (Agent B - CON):**
```bash
cd demos/debate
./agent-b.sh
```

Agents use web search to find evidence, challenge each other's arguments, and refine positions until consensus. See [demos/debate/README.md](demos/debate/README.md) for details.

**More demos:** See [demos/README.md](demos/README.md) for the complete list including pathfinding and research consensus.

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
- `BRAINSTORM_MAX_PAYLOAD_SIZE`: Maximum file size for resources via source_path (default: `512000` / 500KB)
- `BRAINSTORM_CLIENT_ID`: Manual client ID specification for containerized deployments (optional, auto-generated from working directory by default)

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
Join a project with a friendly agent name. This is how agents register themselves. Session persistence is automatic based on your working directory.

```typescript
{
  project_id: "api-redesign",
  agent_name: "frontend",                   // Your friendly name
  working_directory: "/Users/you/my-project", // Absolute path for session persistence
  capabilities: ["react", "typescript"],    // Optional
  labels: { "team": "web" }                 // Optional
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
Get project metadata and list of members. Use this to see who's in the project and the shared context. **Supports long-polling** to wait for project creation.

**Standard fetch:**
```typescript
{
  project_id: "api-redesign"
}
```

**Wait for project creation:**
```typescript
{
  project_id: "api-redesign",
  wait: true,                    // Wait for project to be created
  timeout_seconds: 60            // Max wait time (default: 300, max: 3600)
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
  ],
  "waited_ms": 2340              // Time waited (if using wait=true)
}
```

#### `list_projects`
List all available projects. **Supports pagination in v0.9.0+**

```typescript
{
  offset: 0,           // Optional: starting index (default: 0)
  limit: 100,          // Optional: max results (default: 100, max: 1000)
  includeArchived: false  // Optional: include archived projects (default: false)
}
```

**Response:**
```json
{
  "projects": [
    {
      "project_id": "api-redesign",
      "name": "API Redesign Sprint",
      "archived": false,
      "created_at": "2025-10-13T10:00:00Z"
    }
  ],
  "total": 1,
  "offset": 0,
  "limit": 100
}
```

#### `leave_project`
Gracefully leave a project with cleanup. **New in v0.9.0**

```typescript
{
  project_id: "api-redesign",
  agent_name: "frontend",
  working_directory: "/Users/you/frontend-app"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Left project successfully",
  "archived_messages": 5,
  "cleanup_performed": true
}
```

#### `archive_project`
Mark a project as completed/inactive. **New in v0.9.0**

```typescript
{
  project_id: "api-redesign",
  agent_name: "backend",  // Usually project creator
  archive_reason: "Migration completed successfully"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Project archived successfully",
  "archived_at": "2025-10-13T10:00:00Z"
}
```

#### `handover_coordinator`
Transfer coordinator role to another project member. **New post-v0.9.0**

Coordinators facilitate human-in-the-loop approval workflows. When a coordinator needs to step away or transfer leadership, they can atomically hand over their role to another team member.

```typescript
{
  project_id: "api-redesign",
  from_agent: "backend",      // Current coordinator (must be you)
  to_agent: "frontend"        // Target agent (must be project member)
}
```

**Response:**
```json
{
  "success": true,
  "project_id": "api-redesign",
  "from_agent": "backend",
  "to_agent": "frontend",
  "message": "Coordinator role successfully transferred from backend to frontend"
}
```

**Key Features:**
- **Atomic operation**: Uses project-wide locking to prevent race conditions
- **Authorization**: Only current coordinator can initiate handover
- **Validation**: Target agent must already be a project member
- **Single coordinator**: System enforces only one coordinator per project
- **Audit trail**: All handovers logged for accountability

**Use Cases:**
- Original coordinator needs to step away from the project
- Transitioning leadership to a more appropriate team member
- Coordinating handoff at project phase boundaries
- Ensuring continuous coordination when team composition changes

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
  reply_expected: true,          // Will you wait for a reply?
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
  reply_expected: false,         // Fire-and-forget notification
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
  timeout_seconds: 60            // Max wait time (default: 300, max: 3600)
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
      "reply_expected": true,
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
  agent_name: "backend",
  content: "type Query { ... }",      // Text or base64
  mime_type: "text/plain",            // Optional
  permissions: {                      // Optional (defaults to all read)
    read: ["*"],                      // "*" = everyone
    write: ["backend", "frontend"]    // Specific agents
  }
}
```

#### `get_resource`
Retrieve a shared resource. **Supports long-polling** to wait for resource creation.

**Standard fetch:**
```typescript
{
  project_id: "api-redesign",
  resource_id: "graphql-schema",
  agent_name: "frontend"              // For permission check
}
```

**Wait for resource creation:**
```typescript
{
  project_id: "api-redesign",
  resource_id: "graphql-schema",
  agent_name: "frontend",
  wait: true,                         // Wait for resource to be created
  timeout_seconds: 60                 // Max wait time (default: 300, max: 3600)
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
  "content": "type Query { ... }",
  "waited_ms": 1540                   // Time waited (if using wait=true)
}
```

#### `list_resources`
List all resources in the project you have access to. **Supports pagination in v0.9.0+**

```typescript
{
  project_id: "api-redesign",
  agent_name: "frontend",
  offset: 0,           // Optional: starting index (default: 0)
  limit: 100           // Optional: max results (default: 100, max: 1000)
}
```

**Response:**
```json
{
  "resources": [
    {
      "resource_id": "graphql-schema",
      "name": "GraphQL Schema v2",
      "creator_agent": "backend",
      "created_at": "2025-10-13T10:00:00Z"
    }
  ],
  "total": 1,
  "offset": 0,
  "limit": 100
}
```

#### `delete_resource`
Delete a resource from the project. **Only the agent that created the resource can delete it.**

```typescript
{
  project_id: "api-redesign",
  resource_id: "graphql-schema",
  agent_name: "backend"  // Must match the creator
}
```

**Response:**
```json
{
  "success": true,
  "message": "Resource deleted successfully"
}
```

**Error (not creator):**
```json
{
  "error": "PERMISSION_DENIED",
  "message": "Only the creator can delete this resource"
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

#### `status`
Get your status across all projects you've joined from a specific working directory. Each working directory maintains its own session with automatic persistence across restarts.

```typescript
{
  working_directory: "/Users/username/my-project"  // Absolute path to your project directory
}
```

**Response:**
```json
{
  "client_id": "a3f2b8c1d4e5f6g7",
  "working_directory": "/Users/username/my-project",
  "identity_reminder": [
    "📛 In project \"API Redesign Sprint\" (api-redesign): YOU are the \"frontend\" agent with the \"coordinator\" role",
    "📛 In project \"Platform Documentation\" (platform-docs): YOU are the \"reviewer\" agent with the \"contributor\" role"
  ],
  "projects": [
    {
      "project_id": "api-redesign",
      "agent_name": "frontend",
      "project_name": "API Redesign Sprint",
      "role": "coordinator",
      "role_description": "YOUR ROLE: As coordinator agent, you facilitate human-in-the-loop approval. You present contributor work to humans, await their signoff, then relay decisions back to contributors. Never accept work without human approval first!",
      "unread_messages": 2
    },
    {
      "project_id": "platform-docs",
      "agent_name": "reviewer",
      "project_name": "Platform Documentation",
      "role": "contributor",
      "role_description": "YOUR ROLE: As contributor agent, you complete assigned work and send handoff messages to the coordinator when ready for human review.",
      "unread_messages": 0
    }
  ],
  "total_projects": 2,
  "total_unread_messages": 2
}
```

## Session Persistence

Brainstorm automatically remembers which projects you've joined across sessions, allowing seamless collaboration resumption. Each working directory maintains its own persistent session.

### How It Works (v0.9.0)

Each **working directory** on your computer gets a unique, persistent session identifier (derived via SHA-256 hash or specified via `BRAINSTORM_CLIENT_ID` environment variable). This directory-based approach means:

- Different project directories maintain separate Brainstorm identities
- Same directory always reconnects to the same projects
- No manual session management required
- Survives Claude Code restarts automatically

**Example Setup:**
- `/Users/you/frontend-app/` → Automatically joins projects as "frontend"
- `/Users/you/backend-api/` → Automatically joins projects as "backend"
- `/Users/you/devops/` → Automatically joins projects as "devops"

Each directory "remembers" which projects it has joined and with what agent name.

### ⚠️ CRITICAL: Using the Correct Working Directory

**ALWAYS use the initial "Working directory" from your `<env>` block** for ALL Brainstorm tool calls that require a `working_directory` parameter.

**Why this matters:**
- At conversation start, Claude Code provides an `<env>` block containing "Working directory" - this is your project root
- Session persistence depends on consistent directory usage (same directory = same client_id = same projects)
- NEVER use the current `PWD` or shell working directory, as it may change during the session (e.g., after `cd` commands)

**Example:**
If your `<env>` block shows:
```
Working directory: /Users/username/my-project
```

Then ALL Brainstorm calls must use:
```typescript
{
  working_directory: "/Users/username/my-project"
}
```

Even if you later `cd` to `/Users/username/my-project/src`, continue using the original project root from `<env>`.

**What breaks if you don't do this:**
- Different working_directory values generate different client_ids
- You'll lose access to your existing project memberships
- Each new directory creates a new session identity
- Multi-project workflows will fail

### Workflow

**Joining a Project:**
```typescript
join_project({
  project_id: "api-redesign",
  agent_name: "frontend",
  working_directory: "/Users/you/frontend-app",
  capabilities: ["react", "typescript"]  // Optional
})
```

**Response:**
```json
{
  "success": true,
  "agent_name": "frontend",
  "agent_id": "550e8400-...",
  "message": "Joined project successfully"
}
```

**Checking Status (After Restart):**
```typescript
status({
  working_directory: "/Users/you/frontend-app"
})
```

**Response:**
```json
{
  "client_id": "b8f3a2c9d1e6f4a5",
  "working_directory": "/Users/you/frontend-app",
  "identity_reminder": [
    "📛 In project \"API Redesign Sprint\" (api-redesign): YOU are the \"frontend\" agent with the \"coordinator\" role",
    "📛 In project \"Platform Documentation\" (platform-docs): YOU are the \"frontend\" agent with the \"contributor\" role"
  ],
  "projects": [
    {
      "project_id": "api-redesign",
      "agent_name": "frontend",
      "project_name": "API Redesign Sprint",
      "role": "coordinator",
      "role_description": "YOUR ROLE: As coordinator agent, you facilitate human-in-the-loop approval. You present contributor work to humans, await their signoff, then relay decisions back to contributors. Never accept work without human approval first!",
      "unread_messages": 2
    },
    {
      "project_id": "platform-docs",
      "agent_name": "frontend",
      "project_name": "Platform Documentation",
      "role": "contributor",
      "role_description": "YOUR ROLE: As contributor agent, you complete assigned work and send handoff messages to the coordinator when ready for human review.",
      "unread_messages": 0
    }
  ],
  "total_projects": 2,
  "total_unread_messages": 2
}
```

The same working directory will **always** show the same projects across restarts.

### Storage Structure

Session persistence is maintained server-side:
```
~/.brainstorm/
  clients/
    <sha256-hash-of-working-directory>/
      identity.json        # Working directory, created timestamp
      memberships.json     # [{project_id, agent_name, joined_at}]
```

### Key Features

- **Directory-Based Sessions**: Each project directory has its own persistent identity
- **Zero Configuration**: Sessions created automatically on first join
- **Survives Restarts**: Claude Code restarts don't lose session state
- **Multi-Project Support**: One directory can join many projects (even with different agent names)
- **Automatic Cleanup**: Deleted projects are automatically removed from all client memberships
- **Legacy Compatibility**: Pre-v0.8.0 agent names can be reclaimed seamlessly

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
  reply_expected: true,
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
  agent_name: "backend",
  content: "type Query { ... }",
  permissions: { read: ["*"], write: ["backend"] }
});

// Backend responds
send_message({
  project_id: "api-v2-migration",
  from_agent: "backend",
  to_agent: "frontend",
  reply_expected: false,
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
  reply_expected: false,
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
  reply_expected: false,
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
  agent_name: "platform-lead",
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
├── clients/                        # Session persistence (v0.8.0+)
│   └── <sha256-hash-of-working-directory>/
│       ├── identity.json           # Working directory, created timestamp
│       └── memberships.json        # [{project_id, agent_name, joined_at}]
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
   - Exposes 19 tools for project cooperation (v0.10.0+, with coordinator handover)
   - Provides 10 context-aware prompts for guided workflows
   - Handles request validation and error responses
   - Enforces coordinator pattern for human-in-the-loop workflows

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
- 2-second poll interval (v0.9.0+), configurable timeout (default 300s, max 3600s)
- Immediately returns when messages arrive
- Efficient for real-time coordination with reduced I/O load

## Security Model

### Trust Model: Cooperative, Not Adversarial

**Brainstorm assumes cooperative agents**. The security features are designed to **prevent accidental mistakes and conflicts** (like overwriting each other's resources or causing race conditions), **not to defend against malicious agents**.

**Key limitation**: Agents self-identify by choosing their own names. There is no authentication or verification. Any agent can claim to be "backend" or any other name. This means:
- No real access control between agents
- Resource permissions prevent accidents, not attacks
- "Security" features are guardrails for cooperative scenarios

**Use case**: Brainstorm is for local development and trusted agent coordination, not multi-tenant or untrusted environments.

### Mistake Prevention Features

These protections help agents work together safely without stepping on each other's toes:

#### Path Traversal Prevention
- **Whitelist validation**: All identifiers (project_id, agent_name, resource_id) restricted to `[A-Za-z0-9_-]`
- **No dots allowed**: Prevents `../` sequences in paths
- **Length limits**: 1-256 characters per identifier
- **Purpose**: Prevent agents from accidentally corrupting the filesystem

#### Resource Permissions (Cooperative Coordination)
- **Default permissions for new resources**: If permissions aren't specified, resources default to public read (`read: ["*"]`) with write access restricted to the creator
- **Permission enforcement**: Updates validated against original resource permissions
- **Creator always has write access**: The agent that creates a resource always has write permission, even if not explicitly listed
- **Purpose**: Prevent agents from accidentally overwriting each other's work while enabling easy collaboration

Example resource with explicit permissions:
```typescript
{
  permissions: {
    read: ["*"],                        // Public read (everyone)
    write: ["backend", "frontend"]      // Only these agents should write
  }
}
```

**Default behavior** (when permissions omitted):
```typescript
{
  permissions: {
    read: ["*"],                        // Defaults to public read
    write: ["creator-agent"]            // Creator automatically granted write access
  }
}
```

#### DoS Protection (Resource Fairness)
- **Connection limits**: Maximum 100 concurrent long-polling requests per unique wait key
- **Applies to**: All wait-enabled tools (`receive_messages`, `get_project_info`, `get_resource`)
- **Timeout enforcement**: 3600-second maximum wait (configurable, default: 300 seconds)
- **Purpose**: Prevent agents from accidentally exhausting server resources

#### Payload Validation
- **JSON depth limit**: Maximum 100 levels of nesting to prevent JSON bombs
- **Size limits**: Configurable maximum (default: 500KB)
- **Plain text support**: Non-JSON payloads pass through unchanged
- **Purpose**: Prevent accidental runaway data structures

#### Additional Safeguards
- **Race condition prevention**:
  - Atomic file operations for project creation
  - **Heartbeat updates use exclusive locking** (fixed in v0.2.0) - concurrent heartbeats safely serialized
- **Error sanitization**: Internal paths never exposed in error messages
- **Audit trail**: All actions logged to `system/audit.log` with timestamps
- **Project isolation**: Agents cannot accidentally access other projects' data
- **Improved locking**: Lock metadata with PID, timeout protection, stale lock cleanup
- **Project deletion authorization**: Only the agent that created a project can delete it (prevents accidental deletion)

## Configuration

The server creates a configuration file at `~/.brainstorm/system/config.json` on first run. You can edit this file to tune server behavior:

```json
{
  "storage_root": "~/.brainstorm",
  "cleanup_interval_seconds": 3600,
  "message_ttl_seconds": 86400,
  "heartbeat_timeout_seconds": 300,
  "lock_stale_timeout_ms": 30000,
  "max_resource_size_bytes": 512000,
  "max_long_poll_timeout_seconds": 3600,
  "default_long_poll_timeout_seconds": 300
}
```

**Key Settings:**
- `message_ttl_seconds`: How long messages remain in inboxes (default: 24 hours)
- `max_long_poll_timeout_seconds`: Maximum wait time for long-polling operations (default: 3600s / 1 hour, increased from 900s)
- `default_long_poll_timeout_seconds`: Default timeout when not specified (default: 300s / 5 minutes, increased from 90s)
- `max_resource_size_bytes`: Maximum size for stored resources (default: 500KB)
- `lock_stale_timeout_ms`: How long before locks are considered stale (default: 30s)
- `heartbeat_timeout_seconds`: How long before agents marked offline (default: 5 min)

Changes take effect immediately - no server restart required.

## Known Limitations

Brainstorm is a **proof-of-concept** with intentional design trade-offs for simplicity. Be aware of these limitations:

### **Scalability Limits**
- **Recommended scale**: <100 agents per project, <10 messages/second
- **Architecture**: File system storage with directory polling (1-second intervals)
- **Bottlenecks**: Broadcast messages write N files sequentially; long-polling uses `fs.readdir()` every second
- **No horizontal scaling**: In-memory state (`activeLongPolls`) and local filesystem locks prevent multi-node deployments

### **Atomicity & Consistency**
- **Broadcast messages**: Use best-effort delivery via `Promise.allSettled`. Partial failures can occur where some recipients receive the message while others don't. No automatic rollback or retry.
- **Message ordering**: No causality guarantees. Messages are ordered by filesystem timestamps, which may not reflect true happens-before relationships in distributed scenarios.
- **No deduplication**: Sending the same message twice creates duplicate entries (no idempotency keys).

### **Operational Gaps**
- **No storage quotas**: Agents can create unlimited messages/resources (disk exhaustion possible)
- **No audit log rotation**: `system/audit.log` grows unbounded
- **No graceful shutdown**: Server doesn't clean up locks or notify agents on termination
- **No observability**: Minimal logging, no metrics, no health checks

### **Concurrency**
- **Single-node only**: Filesystem locks work only on same machine; activeLongPolls is in-memory
- **Lock stale timeout**: 30 seconds (configurable) - crashed processes leave locks until timeout

### **Migration Path to Production**

For production use, we recommend migrating to a database backend (SQLite/PostgreSQL). The architecture is migration-ready:
- All file operations map to SQL queries (see [CLAUDE.md](CLAUDE.md) for details)
- UUIDs become primary keys, JSON files become tables
- Filesystem locks → row-level locks or optimistic concurrency

**Timeline**: SQLite backend planned for v0.3 to remove filesystem limitations while preserving zero-external-dependency simplicity.

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

## Demos

Want to see agent cooperation in action? We have several interactive demos:

- **🎮 [Tic-Tac-Toe](demos/tic-tac-toe/)** - Two agents play a game together
- **🗣️ [Debate](demos/debate/)** - Agents debate opposing stances until reaching consensus
- **🐜 [Pathfinding](demos/pathfinding/)** - Multiple agents navigate a maze with live visualization
- **🔬 [Research Consensus](demos/research-consensus/)** - Three agents collaborate on research

Each demo shows different collaboration patterns:
- Project creation and joining
- Real-time messaging with long-polling
- Shared resource updates
- Turn-based coordination
- Evidence-based consensus building
- Autonomous agent behavior

See [demos/README.md](demos/README.md) for complete documentation.

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
