# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Brainstorm** is an MCP (Model Context Protocol) server that enables multi-agent collaboration. Claude Code agents can discover each other, exchange messages, and share resources through a project-centric workflow.

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
   - Exposes 13 tools for agent cooperation (create_project, delete_project, join_project, send_message, store_resource, etc.)
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

## Security (v0.2.0)

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
  - Size limit: 10MB (configurable)

- **Race Condition Prevention**: Atomic file system operations
  - `fs.mkdir(path, { recursive: false })` for check-and-create atomicity
  - No TOCTOU vulnerabilities in project creation

- **Project Deletion Authorization**: Creator-only deletion model
  - Only the agent that created a project can delete it via `delete_project` tool
  - Projects without a creator cannot be deleted (safety measure)
  - Admin bypass available via `npm run cleanup` for testing/recovery

See `SECURITY.md` for complete security documentation.

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

## Storage Migration Path

When migrating to a database:
- All UUIDs (agent_id, message_id, resource_id) can become primary keys
- JSON files map directly to tables with same field names
- `FileSystemStorage` methods map to repository/DAO methods
- Atomic file operations become database transactions
- Lock files become row-level locks or optimistic locking with versioning
