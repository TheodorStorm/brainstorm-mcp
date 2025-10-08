# Changelog

All notable changes to Brainstorm MCP will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
