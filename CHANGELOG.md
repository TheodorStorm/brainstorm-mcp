# Changelog

All notable changes to Brainstorm MCP will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2025-10-08

### Added
- **Local file reference support** for large files (>10KB)
  - Added `local_path` parameter to `store_resource` tool for file references
  - Inline content limited to 10KB, file references support up to 500KB (configurable)
  - Path validation ensures files are within home directory and readable
  - Mutual exclusion: cannot specify both `content` and `local_path`
  - Helpful error messages guide agents to use correct parameter
- **Message flow management** with `response_expected` parameter
  - Agents must explicitly set `response_expected: boolean` when sending messages
  - If true, sender must immediately call `receive_messages(wait=true)`
  - If false, fire-and-forget message with no response expected
  - Prevents bugs where agents send requests but don't listen for responses

### Changed
- Reduced maximum payload size from 10MB to 500KB (configurable via `BRAINSTORM_MAX_PAYLOAD_SIZE`)
- Inline content in `store_resource` limited to 10KB
- Updated tool descriptions with usage guidance for new parameters

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
