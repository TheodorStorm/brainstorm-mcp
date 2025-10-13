# Changelog

All notable changes to Brainstorm MCP will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned for Future Releases

#### Medium Priority
- **Query Capabilities**
  - Filter messages by sender, date range, or content
  - Search resources by name, type, or tags
  - Summary views for large inboxes
- **Inference Improvements**
  - Manual override parameter for reply_expected when auto-detection fails
  - Confidence scoring for question detection
  - Fallback strategies for ambiguous messages
- **Alternative Session Persistence**
  - Environment variable-based client IDs for containerized deployments
  - Support for multiple clients in same working directory
  - Recovery mechanism for directory renames

#### Low Priority
- **Resource Conflict Resolution**
  - Version history tracking for shared resources
  - Merge support for concurrent edits
  - Conflict detection and resolution prompts
- **Message Threading**
  - Thread IDs for broadcast reply chains
  - Conversation grouping in review dashboard
  - Reply-to references for direct messages
- **Monitoring & Observability**
  - Activity log prompt for audit trail viewing
  - Health check prompt for detecting offline/stale agents
  - Project analytics (message counts, resource usage, member activity)

## [0.9.0] - 2025-10-13

### Added
- **Lifecycle Management** - Graceful project departure and archiving
  - `leave_project` tool for agents to gracefully leave projects and clean up memberships
  - `archive_project` tool to mark projects as completed/inactive (v0.9.0+)
  - Archive metadata: `archived`, `archived_at`, `archived_by`, `archive_reason` fields in ProjectMetadata
  - `leave` prompt for guided project departure workflow
  - `archive` prompt for guided project archiving workflow
  - Client memberships automatically cleaned up on project leave
- **Pagination Support** - Handle large projects efficiently (10+ agents)
  - `list_projects` now supports `offset` and `limit` parameters for pagination
  - `list_resources` now supports `offset` and `limit` parameters for pagination
  - Default limit of 100 items, configurable up to 1000
  - Enables efficient handling of large-scale deployments
- **Alternative Session Persistence** - Containerized deployment support
  - `BRAINSTORM_CLIENT_ID` environment variable for manual client ID specification
  - Resolves session persistence issues in containerized environments with unstable working directories
  - Falls back to directory-based generation when not set (backward compatible)
  - `resolveClientId()` helper function with validation (1-256 characters)
- **Performance Optimizations** - Better high-load handling (5+ concurrent agents)
  - Reduced long-polling interval from 1 second to 2 seconds (50% reduction in I/O load)
  - Applies to `get_project_info`, `receive_messages`, and `get_resource` handlers
  - Significantly improves CPU and I/O efficiency during high-concurrency scenarios

### Changed
- `join_project`, `status`, and `leave_project` now use `resolveClientId()` for client identity resolution
- Long-polling handlers now use 2-second intervals instead of 1-second intervals

## [0.8.0] - 2025-10-13

### Added
- **Session Persistence** - Automatic client tracking across restarts
  - Working directory-based client IDs (deterministic SHA-256 hash)
  - `join_project` now requires `working_directory` parameter for session tracking
  - `status` tool now shows all projects for your working directory (replaces agent_name parameter)
  - Client membership records persist across sessions
  - Project deletion automatically cleans up client memberships
- **Legacy Member Migration** - Seamless upgrade path from pre-v0.8.0
  - Agent names without `client_id` can be reclaimed by any client (convenience for local use)
  - Identity continuity preserved: `agent_id` and `joined_at` kept from legacy member
  - Automatic backfill of `client_id` when legacy names are claimed
- **MCP Prompts** - 8 conversational prompts for guided workflows (zero-parameter design)
  - `list` - List all projects (no arguments needed!)
  - `status` - Show your status across projects
  - `create` - Create project and auto-join with conflict detection
  - `join` - Join with role suggestions and current member list
  - `broadcast` - Send to all with guided reply_expected usage
  - `review` - Full project dashboard (members, messages, resources)
  - `share` - Publish resources with team notification
  - `discuss` - Reply with recent message context
- **Context Injection** - Prompts query storage to inject real-time state
  - Current members with online/offline status
  - Recent messages and unread counts
  - Available resources and suggested roles
  - Existing project IDs and conflict warnings
- **Smart Inference** - Prompts intelligently suggest values
  - Conversational parameter gathering (prompts ask for missing info)
  - Auto-detect reply_expected from message content (questions, requests)
  - Suggest available roles based on existing team members
  - Generate safe IDs from human-readable names
- **Enhanced reply_expected Guidance** - Comprehensive usage instructions
  - Tool description emphasizes binding commitment ("CRITICAL" prefix)
  - Parameter description clarifies when to use true vs false
  - Three messaging prompts (broadcast, share, discuss) include detailed guidance
  - Clear decision heuristics: questions/requests → true, informational → false
- **Comprehensive prompt documentation** in new PROMPTS.md file
- **Discovery-first design** - Start with zero-argument `list` prompt, then explore

## [0.6.0] - 2025-10-09

### Added
- **Version command**: New `version` tool to query server version information
  - Returns version, name, and description from package.json
  - Single source of truth: version info generated from package.json during build
  - Useful for debugging and compatibility checking
- **Agent status command**: New `status` tool to check agent activity across all projects
  - Shows all projects the agent is a member of
  - Displays unread message counts for each project
  - Returns total project count and total unread messages
  - Eliminates need to manually track project memberships

### Fixed
- **CRITICAL**: Fixed path traversal vulnerability in `assertSafePath`
  - Previous `startsWith()` check allowed sibling directories (e.g., `/home/user_evil` bypassed `/home/user` check)
  - Now uses `path.relative()` to correctly detect directory escape attempts
- **CRITICAL**: Fixed version.json loading crash on startup
  - Server now gracefully falls back to package.json when version.json doesn't exist
  - Prevents crashes in development mode and fresh clones
- **HIGH**: Added file size validation for `source_path` file references
  - Files referenced via `source_path` now validated against 500KB limit
  - Prevents registration of arbitrarily large files
- **MEDIUM**: Optimized `listResources` performance
  - Eliminated N+1 query pattern by using `getResourceManifestOnly()`
  - Avoids loading full payload data (up to 50KB per resource) when only manifests needed

## [0.5.1] - 2025-10-09

### Changed
- Renamed `local_path` parameter to `source_path` in `store_resource` tool
  - Consistent with manifest field name (`source_path` in ResourceManifest)
  - Updated all error messages and documentation
- Increased inline content limit from 10KB to 50KB
  - Better balance between inline storage and file references
  - `store_resource` now accepts inline content up to 50KB

## [0.5.0] - 2025-10-08

### Changed
- **BREAKING**: Renamed `creator_agent` parameter to `agent_name` in `store_resource` tool
  - Consistent with all other tools (join_project, send_message, etc.)
  - Clearer semantics: identifies who is performing the operation
  - `creator_agent` field now set internally by storage layer
  - Agents cannot set `creator_agent` - validation error if attempted
  - `creator_agent` field is never exposed to agents (security: prevent identity spoofing)
- **BREAKING**: Resource creators can now update permissions on their resources
  - Non-creators cannot change permissions (silently preserved)
  - `creator_agent` field is immutable (always preserved from original)
  - Legacy resources without `creator_agent` are backfilled on first update

### Fixed
- Fixed metadata preservation on permission-only updates
  - Storage-managed fields (`size_bytes`, `source_path`, `mime_type`) now preserved when updating permissions without new content
- Fixed legacy resource handling
  - Resources created before `creator_agent` field existed can now have permissions updated
  - `creator_agent` is backfilled with the first updating agent

## [0.4.0] - 2025-10-08

### Added
- **Local file reference support** for large files (>10KB)
  - Added `local_path` parameter to `store_resource` tool for file references
  - Inline content limited to 10KB, file references support up to 500KB (configurable)
  - Path validation ensures files are within home directory and readable
  - Mutual exclusion: cannot specify both `content` and `local_path`
  - Helpful error messages guide agents to use correct parameter
- **Message flow management** with `reply_expected` parameter
  - Agents must explicitly set `reply_expected: boolean` when sending messages
  - True: sender will call `receive_messages` to wait for a reply
  - False: fire-and-forget message with no response expected
  - Prevents bugs where agents send requests but don't listen for responses

### Changed
- **BREAKING**: Renamed `version` to `etag` for optimistic locking
  - ETags are now random 16-char hex strings (not sequential numbers)
  - Agents pass back exact ETag received (don't increment)
  - Clearer semantics: "pass what you received" vs "version number"
  - Automatic migration: existing resources get ETags on first read
  - Error code changed from `VERSION_CONFLICT` to `ETAG_MISMATCH`
- **BREAKING**: Removed `type` field from messages (was unused metadata that caused confusion with reply_expected)
- Reduced maximum payload size from 10MB to 500KB (configurable via `BRAINSTORM_MAX_PAYLOAD_SIZE`)
- Inline content in `store_resource` limited to 10KB
- Simplified tool descriptions for better agent comprehension
- Updated all demos to use `reply_expected` instead of `type`

## [0.3.0] - 2025-10-08

### Added
- **Optimistic locking with versioning** for resource updates to prevent lost updates and race conditions
  - All resources now have a `version` field that increments on each write
  - `store_resource` tool requires version number when updating existing resources
  - Returns `VERSION_CONFLICT` error when concurrent updates are detected
  - See `CONCURRENCY.md` for full documentation
- **New pathfinding demo** showcasing ant colony simulation with multiple coordinating agents
  - Demonstrates complex multi-agent pathfinding coordination
  - Includes visual web-based viewer for real-time grid updates
  - Agent swarm behavior with shared resource updates
- **New research consensus demo** with three researcher agents collaborating on research tasks
  - Lead researcher coordinates the research project
  - Data researcher and skeptic researcher provide different perspectives
  - Demonstrates broadcast messaging and shared document collaboration
- Comprehensive demos README documenting all available demonstrations

### Changed
- Enhanced tic-tac-toe demo with improved win detection logic
- Updated README tagline to include "Slack for AI agents" comparison
- Improved player instructions in tic-tac-toe demo (PLAYER_O.md and PLAYER_X.md)
- Added deadlock prevention guidance for lead researcher in research consensus demo
- Updated `npm run config` script to run `npm install` before build

### Fixed
- Fixed tic-tac-toe win detection algorithm
- Fixed permissions bug in research consensus demo
- Improved infrastructure reliability for demos

## [0.2.0] - 2025-01-15

### Added
- Initial release of Brainstorm MCP server
- Project-based organization for agent collaboration
- Direct and broadcast messaging between agents
- Shared resource storage with permissions
- Long-polling support for efficient message delivery
- File system-based storage (no database required)
- Comprehensive security features:
  - Path traversal prevention
  - Resource authorization (deny-by-default)
  - DoS protection for long-polling
  - Payload validation (JSON depth limits)
  - Project deletion authorization
- Audit logging for all operations
- Basic tic-tac-toe demo
- Automatic MCP configuration with `npm run config`
- Security test suite with 16 tests
