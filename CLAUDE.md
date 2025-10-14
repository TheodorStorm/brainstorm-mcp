# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Brainstorm** is an MCP (Model Context Protocol) server that enables **multiple Claude Code instances on the same computer to communicate and collaborate**.

### How It Works

Each Claude Code instance (different terminal windows, different projects) can:
- Connect to the shared Brainstorm MCP server
- Join projects with a unique agent name
- Discover other Claude Code instances in the same project
- Exchange messages and share resources

**Example**: You have three terminal windows open on your computer:
- Window 1: Claude Code working on a frontend project (agent name: "frontend")
- Window 2: Claude Code working on a backend project (agent name: "backend")
- Window 3: Claude Code working on DevOps (agent name: "devops")

All three instances connect to the same Brainstorm server (running on your machine) and can collaborate in shared projects.

### Agent Identity

**IMPORTANT**: Each project's `CLAUDE.md` file should define what agent name that Claude Code instance uses when participating in Brainstorm projects. This allows different projects on your computer to have different identities when collaborating.

Example section to add to your project's CLAUDE.md:
```markdown
## Brainstorm Agent Name

When participating in Brainstorm projects, this Claude Code instance identifies as: **frontend-agent**

Use this name for all Brainstorm operations:
- `join_project` with agent_name: "frontend-agent"
- `send_message` with from_agent: "frontend-agent"
- `receive_messages` with agent_name: "frontend-agent"
- `status` with agent_name: "frontend-agent"
```

## Development Commands

```bash
# Install dependencies
npm install

# Build TypeScript to dist/
npm run build

# Watch mode for development
npm run dev

# Run the server
npm start

# Run security tests
npm test

# Run with custom storage path
BRAINSTORM_STORAGE=/path/to/storage npm start

# Run with custom payload size limit (default: 500KB)
BRAINSTORM_MAX_PAYLOAD_SIZE=1048576 npm start  # 1MB

# Auto-configure in Claude Code (builds + updates ~/.claude/mcp_config.json)
npm run config

# Delete a project (admin/testing - bypasses authorization)
npm run cleanup -- <project_id>
```

Default storage location: `~/.brainstorm`

## Architecture

### Three-Layer Design

1. **MCP Protocol Layer** (`src/server.ts`)
   - `AgentCoopServer` class implements the MCP server
   - Exposes 15 tools for agent cooperation (create_project, delete_project, join_project, send_message, receive_messages, acknowledge_message, store_resource, get_resource, list_resources, delete_resource, get_project_info, list_projects, heartbeat, version, status)
   - Provides 8 context-aware prompts (list, mystatus, create, join, broadcast, review, share, discuss)
   - Uses stdio transport for communication with MCP clients
   - All tool handlers map to storage layer operations

2. **Storage Abstraction Layer** (`src/storage.ts`)
   - `FileSystemStorage` class provides all persistence operations
   - Implements atomic writes (temp file → fsync → rename)
   - Cross-platform file locking using `O_CREAT|O_EXCL` flag
   - Handles concurrency for agent status updates and channel membership changes
   - **Migration-ready**: All operations designed to map directly to SQL transactions

3. **Type System** (`src/types.ts`)
   - Core data models: `AgentMetadata`, `AgentStatus`, `Message`, `ChannelMetadata`, `ResourceManifest`
   - All types include `schema_version` for forward compatibility
   - JSON schemas designed to map one-to-one with future database tables

### File System Storage Layout

```
<root>/
  agents/<agent-id>/
    metadata.json      # Immutable: project, capabilities, labels
    status.json        # Mutable: online status, last_seen, channel memberships
    inbox/            # Incoming messages (timestamp-uuid.json)
    sent/             # Processed messages

  channels/<channel-id>/
    metadata.json     # Channel configuration
    members.json      # Current member list
    backlog/         # Message history (timestamp-uuid.json)

  resources/shared/<resource-id>/
    manifest.json     # Metadata and permissions
    payload/data      # Actual content

  locks/             # Lock files for concurrency control
  system/
    config.json      # Server configuration
    audit.log        # Append-only activity log
```

### Key Design Patterns

**Atomic Operations**: All writes use temp file → fsync → atomic rename to ensure durability even on crash.

**Message Flow**:
- Direct messages: Written directly to recipient's `inbox/`
- Channel messages: Written to channel `backlog/`, then fan-out copied to each member's `inbox/`
- Message files named with ISO timestamp + UUID for natural ordering and uniqueness

**Locking Strategy**:
- Lock files in `locks/` directory using exclusive creation flag (`wx`)
- Lock metadata includes PID, timestamp, and operation reason
- Stale lock detection (30 second timeout) with automatic cleanup
- Timeout protection (60 second default max wait)
- Lock scope kept narrow (read → modify in memory → atomic write → release)
- Debug logging for stale lock removal

**Permission Model** (v0.2.0 - Deny-by-Default):
- Resources **must** have explicit `permissions` field with `read` and `write` arrays when created
- Resources without permissions are rejected (no implicit access)
- `"*"` in read array grants public read access
- Write permission checks verify caller is in original resource's `write` array
- Permission checks happen in storage layer before any operation
- **Permissions are immutable**: On resource updates, existing permissions are automatically preserved (cannot be changed)

## MCP Configuration

**Automatic setup**: Run `npm run config` to automatically add this server to `~/.claude/mcp_config.json`

**Manual setup**: Add to `~/.claude/mcp_config.json`:

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

The configuration script (`scripts/configure-mcp.js`) handles building the project and updating the config file with the correct absolute path.

## Shell Wrapper for Auto-Check on Startup

To automatically check Brainstorm status when starting Claude Code, add this wrapper function to your `~/.zshrc` (or `~/.bashrc`):

```bash
# Claude Code smart wrapper - auto-check Brainstorm on startup
claude() {
  # Verify claude binary exists
  if ! command -v claude >/dev/null 2>&1; then
    echo "Error: claude command not found. Please install Claude Code first." >&2
    return 1
  fi

  # If no arguments provided, check Brainstorm status first
  if [ $# -eq 0 ]; then
    local prompt="CRITICAL: Check Brainstorm status using mcp__brainstorm__status with working_directory set to the EXACT initial 'Working directory' path from the <env> block (shown at conversation start - NOT the current PWD). Show: (1) Your agent name and role (coordinator/contributor) in each project, (2) Unread message counts, (3) Any handoff messages requiring action. If you have unread messages, ask if I want to review them before proceeding with other tasks."
    command claude "$prompt"
  else
    command claude "$@"
  fi
}
```

After adding this function, reload your shell configuration:

```bash
source ~/.zshrc
```

**How it works**:
- `claude` (no arguments) → Automatically checks Brainstorm status and shows active projects/unread messages
- `claude "your prompt"` → Works normally, passes your prompt through unchanged

This ensures you never miss important Brainstorm notifications when starting a new Claude Code session.

## Version Management

Version information is stored in a single source of truth: `package.json`

**Build Process**:
- During `npm run build`, `scripts/generate-version.js` extracts version info from `package.json`
- Generates `dist/src/version.json` with version, name, and description
- Server imports this file at runtime to ensure consistency

**Query Version**: Use the `version` tool to retrieve current server version information.

**Updating Version**:
1. Update version in `package.json`
2. Run `npm run build` to regenerate `version.json`
3. Version is automatically included in server responses and audit logs

## Security (v0.4.0)

All user-controlled identifiers are validated to prevent security vulnerabilities:

- **Path Traversal Prevention**: All project_id, agent_name, resource_id validated with `assertSafeId()`
  - Whitelist: Only `[A-Za-z0-9_-]` allowed (no dots, slashes, or special chars)
  - Explicit checks for `..`, `/`, `\` sequences
  - Length limits: 1-256 characters

- **Resource Authorization**: Deny-by-default permission model
  - All resources must have explicit `permissions.read` and `permissions.write` arrays
  - Resources without permissions are rejected
  - Write operations check original resource permissions

- **DoS Protection**: Long-polling connections are rate-limited
  - Maximum 100 concurrent requests per agent
  - 300-second timeout (configurable)

- **Payload Validation**: JSON bombs are prevented
  - Maximum 100 levels of JSON nesting
  - Plain text payloads pass through unchanged
  - Inline content limit: 50KB (use source_path for larger files)
  - Maximum file size via source_path: 500KB (configurable via BRAINSTORM_MAX_PAYLOAD_SIZE)

- **File Reference Support** (v0.4.0): Store large files efficiently
  - `store_resource` accepts `content` (inline <50KB) or `source_path` (file reference >50KB)
  - Path validation: Must be within home directory, no traversal attacks
  - Agents read referenced files directly from filesystem

- **Race Condition Prevention**: Atomic file system operations
  - `fs.mkdir(path, { recursive: false })` for check-and-create atomicity
  - No TOCTOU vulnerabilities in project creation

- **Project Deletion Authorization**: Creator-only deletion model
  - Only the agent that created a project can delete it via `delete_project` tool
  - Projects without a creator cannot be deleted (safety measure)
  - Admin bypass available via `npm run cleanup` for testing/recovery

## Testing

Security test suite covers all threat mitigations:

```bash
npm test
```

Test categories:
- Path traversal protection (3 tests)
- Resource authorization (3 tests)
- Error message sanitization (1 test)
- Race condition prevention (1 test)
- Payload validation (3 tests)
- Project deletion authorization (5 tests)

All identifiers in tests use valid characters. When adding features, ensure security tests cover:
- Invalid identifier rejection
- Permission enforcement
- Race condition handling

## Adding New Tools

1. Add tool definition to `setupHandlers()` in `src/server.ts`
2. Add case to the switch statement in `CallToolRequestSchema` handler
3. Add corresponding storage method to `FileSystemStorage` if needed
4. **Security**: Validate all user-controlled identifiers with `assertSafeId()`
5. **Security**: Check permissions before allowing operations
6. Update audit logging for the new operation
7. Add types to `src/types.ts` if new data structures are needed
8. Add security tests to `tests/security.test.ts`

## MCP Prompts (v0.8.0)

Brainstorm provides **context-aware prompts** that wrap tools with intelligent guidance:

### How Prompts Work

Prompts are **not tools** - they're guided workflows that:
1. Accept high-level arguments from Claude Code
2. Query the storage layer for real-time state (projects, members, messages, resources)
3. Inject context into the prompt text
4. Return instructions telling Claude which tools to call and with what parameters

### Available Prompts

- **`list`**: List all projects (NO args - discovery!)
- **`status`**: Show your status across projects (only agent_name)
- **`create`**: Create project + auto-join with conflict detection
- **`join`**: Join project with role suggestions and member list
- **`broadcast`**: Send to all with auto-inferred reply_expected
- **`review`**: Full project dashboard (members, messages, resources)
- **`share`**: Publish resource + notify team
- **`discuss`**: Reply with recent message context

### Adding New Prompts

1. Add prompt definition to `PROMPTS` constant in `src/server.ts`:
   ```typescript
   'my-prompt': {
     name: 'my-prompt',
     description: 'What this prompt does',
     arguments: [
       { name: 'arg1', description: '...', required: true }
     ]
   }
   ```

2. Add case to `GetPromptRequestSchema` handler switch statement:
   ```typescript
   case 'my-prompt': {
     const arg1 = args.arg1 as string;

     // Query storage for context
     const context = await this.storage.getSomeState(...);

     // Generate prompt text with instructions
     return {
       messages: [{
         role: 'user',
         content: {
           type: 'text',
           text: `Here's what I want to do: ${arg1}

           **Context**: ${context}

           Please use these tools:
           - \`tool_name\` with param1="${arg1}"`
         }
       }]
     };
   }
   ```

3. **Best practices**:
   - Query storage to inject real-time state
   - Use markdown formatting for clarity
   - Provide specific tool instructions with exact parameters
   - Handle error cases (e.g., project not found)
   - Show contextual information (who's online, what's available)
   - Use smart defaults and inference where appropriate

## Storage Migration Path

When migrating to a database:
- All UUIDs (agent_id, message_id, resource_id) can become primary keys
- JSON files map directly to tables with same field names
- `FileSystemStorage` methods map to repository/DAO methods
- Atomic file operations become database transactions
- Lock files become row-level locks or optimistic locking with versioning
