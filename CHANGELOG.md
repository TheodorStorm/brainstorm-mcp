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

## [0.12.2] - 2025-10-15

### Added
- **Reply Warning System** - Agents warned when messages don't expect replies
  - `receive_messages` now includes `reply_warnings` array in response
  - Warnings triggered for messages with `reply_expected: false`
  - Each warning includes:
    - Message ID and sender for reference
    - Clear alert that no reply is expected
    - Explanation that replies may not be received/processed
    - Guidance to consult human supervisor if reply seems necessary
  - Helps prevent inappropriate responses to informational messages
  - Reinforces human-in-the-loop decision making for edge cases
  - Non-breaking additive change (warnings are optional response field)
- Updated `receive_messages` tool description to document reply warning behavior

### Technical Details
- Warning detection in both long-polling and standard message fetch paths
- Follows existing `handoffAlerts` pattern for consistency
- Uses explicit `=== false` check to avoid false positives from undefined/null
- No performance impact (warnings built during message iteration)

### Rationale
Agents sometimes attempt to reply to informational messages that don't expect responses, leading to orphaned message workflows. This feature provides clear guidance at the point of message receipt, encouraging agents to verify with their human supervisor before sending potentially unnecessary replies.

### Fixed
- **Demo Scripts** - Fixed critical bug where multiple demo agents running from the same directory would get identical client_ids, causing inbox collisions and name conflicts
  - All 12 demo shell scripts now export unique `BRAINSTORM_CLIENT_ID` before launching Claude Code
  - Fixed scripts: tic-tac-toe (player-o, player-x), debate (agent-a, agent-b), pathfinding (setup, start-ant, start-manager), research-consensus (researcher-1, researcher-2, researcher-3), file-storage (storage-manager, reader-agent)
  - Ensures each demo agent gets a unique session identity even when running from shared directory
  - Prevents the session persistence mechanism (SHA-256 directory hash) from causing collisions

## [0.12.1] - 2025-10-15

### Fixed
- **Defensive locking for inbox reads** - Added file-based locking to `getAgentInbox()`
  - Prevents potential concurrent access issues when reading and auto-archiving messages
  - Serializes concurrent reads to same agent's inbox
  - 5-second timeout for lock acquisition
  - While agents properly re-poll after timeout (ensuring no message loss), lock provides defensive protection against edge cases

### Changed
- Test suite cleanup: Removed stale compiled test files from pre-v0.12.0

## [0.12.0] - 2025-10-15

### Breaking Changes
- **Removed `acknowledge_message` tool** - Messages are now automatically archived after being read
  - `receive_messages` now auto-archives messages after returning them to the caller
  - Messages moved to `projects/<project-id>/messages/<agent-name>/archive/` directory
  - No explicit acknowledgment required - reading a message marks it as processed
  - Tool count reduced from 15 to 14 tools
  - **Migration**: Remove all `acknowledge_message` calls from agent code. Messages are handled automatically.

### Changed
- **Auto-Archive on Read** - Simplified message lifecycle
  - Messages automatically moved to archive/ subdirectory after successful read
  - Consistent with existing `leaveProject()` archiving behavior
  - Provides audit trail without requiring explicit acknowledgment
  - Reduces token usage and API complexity
  - Archive directory automatically filtered from inbox reads
- Updated `receive_messages` tool description to clarify auto-archiving behavior
- Updated test suite: `tests/message-acknowledgment.test.ts` → `tests/message-receive.test.ts`
- All tests updated to verify auto-archive behavior instead of explicit acknowledgment

### Rationale
Message acknowledgment provided false reliability guarantees. Agents lose all context on crash/restart, making unacknowledged messages in the inbox meaningless. Auto-archiving on read simplifies the API while preserving message history for debugging.

## [0.10.0] - 2025-10-14

### Added
- **Coordinator Handover** - New `handover_coordinator` tool for role transfer
  - Atomic coordinator role transfer between project members
  - Single coordinator enforcement (ConflictError if duplicate coordinator detected)
  - Authorization: only current coordinator can initiate handover
  - Validation: target agent must already be a project member
  - Audit trail for all handovers
  - Use cases: coordinator stepping away, leadership transition, phase boundaries
- **Role-Awareness System** - Comprehensive role-based UX throughout the platform
  - Auto-assign coordinator role to project creators (v0.10.0+)
  - `status` tool shows role and role_description for each project membership
  - `join_project` provides role-specific guidance on successful join
  - `get_project_info` includes coordinator identification field
  - `handover_coordinator` provides dual role transition guidance for both agents
  - `leave_project` warns coordinators about handover requirement
  - `send_message` detects and confirms handoff messages (handoff, handoff_accepted, handoff_rejected)
  - `receive_messages` flags handoff messages with role-specific action guidance
  - `review` prompt highlights project coordinator
  - `leave` prompt requires coordinator handover before departure
  - `getRoleDescription()` helper provides consistent role explanations
- **Backward Compatibility Migration** - Automatic coordinator assignment for legacy projects
  - `ensureProjectHasCoordinator()` migration function in storage layer
  - Automatically backfills coordinator role to project creator on first project access
  - Triggered by any of these tool handlers: `status`, `get_project_info`, `join_project`, `send_message`, `receive_messages`
  - Idempotent and performant (short-circuits quickly if coordinator exists)
  - No locking required (writes are idempotent, single coordinator enforcement already exists)
  - Solves issue where pre-v0.10.0 projects had creators without coordinator role
  - Migration conditions: project has creator, creator is member, no existing role, no existing coordinator
- **Identity Awareness** - Enhanced status tool for multi-project clarity
  - `client_id` field shows session identifier in status responses
  - `agent_status_message` provides prominent agent-centric status ("YOU have X unread messages")
  - `identity_reminder` array with human-readable identity messages
  - Format: "📛 In project 'X' (project-id): YOU (agent-name) are the [role] agent"
  - `interpretation_guide` field explicitly clarifies agent is viewing their own status, not reporting on a human
  - Reduces confusion when agents work across multiple projects with different names
  - Eliminates third-person reporting ("I can see you have...") by emphasizing agent identity throughout
  - Provides at-a-glance identity confirmation before operations
- **Enhanced Timeouts** - Better support for long-running operations
  - Default long-polling timeout increased: 90s → 300s (5 minutes)
  - Maximum long-polling timeout increased: 900s → 3600s (1 hour)
  - Applies to `receive_messages`, `get_project_info`, `get_resource` tools
  - Retry flags added to timeout responses for clearer client handling
  - Improved support for slow networks and async workflows

### Changed
- **CRITICAL UX FIX: Role Identity Clarity** - Eliminated agent confusion about role ownership
  - Updated `getRoleDescription()` to use explicit second-person language
  - Changed from "Coordinator - You facilitate..." to "YOUR ROLE: As coordinator agent, you..."
  - Fixed critical bug where agents misinterpreted roles as describing humans instead of themselves
  - Updated `status`, `join_project`, and `handover_coordinator` responses to emphasize agent identity
  - All role messages now use "YOU (agent-name) are the [role] agent" format
- **Hard Block: Coordinator Leave Prevention** - Changed from warning to enforcement
  - Coordinators can no longer leave projects without first transferring role via `handover_coordinator`
  - Returns `COORDINATOR_HANDOVER_REQUIRED` error with available members list
  - Prevents orphaned projects without coordinators (was previously just a warning)
- **Handoff Message Authority Validation** - Role-based message type enforcement
  - Contributors can ONLY send `handoff` messages (not handoff_accepted/rejected)
  - Coordinators can ONLY send `handoff_accepted` or `handoff_rejected` messages (not handoff)
  - Returns `HANDOFF_AUTHORITY_ERROR` if agent attempts unauthorized message type
  - Prevents workflow confusion and ensures proper handoff protocol
- **Working Directory Guidance** - Critical reminders for session persistence
  - `status` tool now includes `critical_reminder` field with working_directory usage guidance
  - `join_project` tool now includes `critical_reminder` field emphasizing consistent directory usage
  - New comprehensive README section "⚠️ CRITICAL: Using the Correct Working Directory"
  - Guidance emphasizes ALWAYS using initial "Working directory" from `<env>` block (shown at conversation start)
  - NEVER use current PWD, shell working directory after `cd` commands, or values from tool responses
  - Prevents session persistence issues caused by inconsistent directory values
  - Eliminates circular error reinforcement (responses echo input, so guidance must reference `<env>` directly)
  - **Shell wrapper startup prompt enhanced** with explicit working_directory guidance and role-awareness instructions
- **Role Reminders in send_message** - Consistent role-awareness across all messaging
  - `send_message` tool now includes `role_reminder` field in ALL responses (not just handoff messages)
  - Shows agent's role (coordinator/contributor), agent name, and role description
  - Reinforces expected behavior throughout workflow, not just at join/status checkpoints
  - Completes role-awareness system consistency across all tools
- **Enhanced reply_expected Timeout Guidance** - Explicit wait duration recommendations
  - `send_message` now includes `reply_expected_guidance` field when `reply_expected=true`
  - Recommends 300 second timeout (default long-polling timeout for receive_messages)
  - Notes maximum 3600 second timeout available via `timeout_seconds` parameter
  - Fills guidance gap where agents knew to wait but not how long to wait
  - Complements v0.8.0 reply_expected commitment guidance with specific timeout values
- **Conversation Closure Etiquette** - Reminder to confirm before leaving discussions
  - `send_message` now includes `conversation_etiquette` field in ALL responses
  - Reminds agents to confirm with recipients before concluding conversations
  - Best practice: Send closing confirmation message like "Is there anything else you need from me?" and wait for response
  - Prevents abrupt conversation endings and improves collaboration quality
  - Applies universally to all messages (direct, broadcast, handoff, regular)
- All 10 MCP prompts updated with handoff workflow guidance
  - `create` prompt defaults role to "coordinator" for project creator
  - `join` prompt includes role suggestion and coordinator identification
  - `review` prompt highlights coordinator in member list
  - `leave` prompt warns coordinators to handover before leaving
  - `broadcast` and `discuss` prompts reference coordinator for approvals
- Tool descriptions simplified for clarity and consistency
- Single coordinator per project enforcement (system prevents duplicate coordinators)
- Long-polling interval reduced from 1s to 2s for better I/O efficiency (v0.9.0, documented here)

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
