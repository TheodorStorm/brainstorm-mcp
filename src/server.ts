/**
 * MCP Server Implementation for Multi-Agent Collaboration
 *
 * This module implements the Model Context Protocol (MCP) server that enables
 * multiple Claude Code instances to communicate and collaborate within shared projects.
 *
 * **Architecture:**
 * - Implements 15 MCP tools for agent cooperation
 * - Provides 8 context-aware prompts for guided workflows
 * - Uses stdio transport for MCP communication
 * - Delegates all persistence to {@link FileSystemStorage}
 *
 * **Key Features:**
 * - Project management (create, join, delete, list)
 * - Message passing (direct and broadcast)
 * - Resource sharing with permissions
 * - Session persistence via working directory mapping
 * - Long-polling support for real-time collaboration
 * - DoS protection for concurrent requests
 *
 * **Coordinator Pattern (Human-in-the-Loop):**
 * - Each project has ONE coordinator stored in project metadata (v0.11.0+)
 * - Project creator automatically becomes coordinator (metadata.coordinator_agent)
 * - **CRITICAL**: Coordinator is a PROXY for human approval, NOT an autonomous decision-maker
 * - Coordinator MUST present work to human, await signoff, THEN respond to contributors
 *
 * **When to Use Handoff Workflow:**
 * - ✅ Work was assigned/discussed THROUGH Brainstorm (coordinator delegated it, team discussed it)
 * - ✅ Coordinator is aware of the work and expects results
 * - ✅ There's a Brainstorm conversation thread about this task
 * - ❌ Work was assigned directly by human (outside Brainstorm) → report to human directly, NO handoff
 * - ❌ No Brainstorm discussion exists about the task → report to human directly, NO handoff
 *
 * **Handoff Workflow (For Brainstorm-Coordinated Work):**
 *
 * **Contributors** complete Brainstorm-assigned work and hand off:
 * 1. Send handoff message to coordinator (find via get_project_info, use project.coordinator field)
 * 2. Set payload.type = 'handoff'
 * 3. Include summary of completed work in payload.summary
 * 4. Set reply_expected = TRUE (handoff requires coordinator acceptance)
 * 5. MUST call receive_messages with wait=true to wait for coordinator's response
 *
 * **Coordinators** review and facilitate human approval:
 * 1. Receive handoff from contributor
 * 2. **MUST present work to HUMAN user for review** (this is your primary responsibility!)
 * 3. **MUST wait for HUMAN signoff** (approval or rejection with feedback)
 * 4. Based on HUMAN decision:
 *    - **If human approves**: Send acceptance (payload.type = 'handoff_accepted') to contributor
 *    - **If human rejects**: Send rejection (payload.type = 'handoff_rejected') with human feedback to contributor
 * 5. If rejected, contributor revises and sends new handoff (repeat from step 1)
 *
 * Example handoff message from contributor:
 * ```typescript
 * {
 *   to_agent: "coordinator-name",
 *   payload: {
 *     type: "handoff",
 *     summary: "Completed frontend implementation. All tests passing.",
 *     details: { ... }
 *   },
 *   reply_expected: true  // MUST wait for coordinator acceptance!
 * }
 * ```
 *
 * Example coordinator acceptance (AFTER human approval):
 * ```typescript
 * {
 *   to_agent: "contributor-name",
 *   payload: {
 *     type: "handoff_accepted",
 *     message: "Human user has approved your work. Great job!"
 *   },
 *   reply_expected: false
 * }
 * ```
 *
 * Example coordinator rejection (based on human feedback):
 * ```typescript
 * {
 *   to_agent: "contributor-name",
 *   payload: {
 *     type: "handoff_rejected",
 *     message: "Human user requests changes: [specific feedback from human]",
 *     human_feedback: "The API response format needs to include error codes"
 *   },
 *   reply_expected: false
 * }
 * ```
 *
 * **Coordinator Role Handover (v0.9.0+):**
 * Coordinators can transfer their role to another project member for smooth leadership transitions:
 * - Use the `handover_coordinator` tool to transfer the coordinator role
 * - Only the current coordinator can initiate a handover
 * - Target agent must already be a member of the project
 * - Operation is atomic (uses project-wide lock to prevent race conditions)
 * - Handover is audited for accountability
 *
 * Example coordinator handover:
 * ```typescript
 * // Coordinator transfers role to another team member
 * handover_coordinator({
 *   project_id: "api-redesign",
 *   from_agent: "coordinator-name",  // Current coordinator
 *   to_agent: "new-coordinator-name" // Target project member
 * });
 * // Result: coordinator role removed from from_agent, added to to_agent
 * ```
 *
 * **Use Cases for Handover:**
 * - Original coordinator needs to step away from the project
 * - Transitioning leadership to a more appropriate team member
 * - Coordinating handoff at project phase boundaries
 * - Ensuring continuous coordination when team composition changes
 *
 * **Working Directory Isolation (File Sharing):**
 * - Each agent has its own working directory - agents CANNOT access each other's local files
 * - ❌ Wrong: Responding "See /Users/alice/docs/api.md" (other agents cannot read this)
 * - ✅ Right: Read file locally → `store_resource` (creates shared resource) → share resource_id → others use `get_resource`
 *
 * **Security:**
 * - Path validation (working_directory must be absolute and normalized)
 * - Error sanitization (system errors hidden, user errors preserved)
 * - Rate limiting (max 100 concurrent long-polls per agent/resource)
 * - Audit logging for all operations
 *
 * @module server
 * @see {@link AgentCoopServer} for main server class
 * @see {@link FileSystemStorage} for persistence layer
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID, createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join, dirname, isAbsolute, normalize } from 'path';
import { fileURLToPath } from 'url';
import { FileSystemStorage } from './storage.js';
import { isUserError } from './errors.js';
import type {
  ProjectMetadata,
  ProjectMember,
  Message,
  ResourceManifest
} from './types.js';

/**
 * Get human-readable description of agent role.
 *
 * Provides clear explanation of responsibilities for each role to help agents
 * understand their function in the project.
 *
 * **Roles:**
 * - **coordinator**: Facilitates human-in-the-loop approval workflow
 * - **contributor** (default): Completes work and sends handoffs for approval
 *
 * **Complexity:** O(1) - simple string lookup
 *
 * @param role - Agent's role label (from member.labels.role)
 * @returns Human-readable description of role responsibilities
 *
 * @example
 * getRoleDescription('coordinator')
 * // "Coordinator - You facilitate human-in-the-loop approval..."
 *
 * getRoleDescription(undefined)
 * // "Contributor - Complete assigned work..."
 */
function getRoleDescription(role?: string): string {
  if (role === 'coordinator') {
    return 'YOUR ROLE: As coordinator agent, you facilitate human-in-the-loop approval. You present contributor work to humans, await their signoff, then relay decisions back to contributors. Never accept work without human approval first!';
  }
  return 'YOUR ROLE: As contributor agent, complete work assigned through Brainstorm collaboration. When work is assigned/discussed IN Brainstorm, send handoff messages to coordinator upon completion. For direct human instructions (outside Brainstorm), report back to human directly - no coordinator handoff needed.';
}

/**
 * Generate deterministic client ID from working directory path.
 *
 * This function creates a stable client identity based on the working directory,
 * enabling automatic session persistence. The same directory always produces the
 * same client_id, allowing agents to reclaim their names across restarts.
 *
 * **Algorithm:**
 * 1. SHA-256 hash of the working directory path
 * 2. Format first 32 hex characters as UUID format
 *
 * **Use Case:**
 * - `/Users/alice/projects/frontend` → same client_id every time
 * - Different directories → different client identities
 * - Enables smart name reclaiming (see {@link ProjectMember.client_id})
 *
 * **Complexity:** O(n) where n is the length of the working directory string
 *
 * @param workingDirectory - Absolute path to the working directory
 * @returns UUID-formatted client identifier (derived from SHA-256 hash)
 *
 * @example
 * const clientId = generateDeterministicClientId('/Users/alice/projects/frontend');
 * // Returns: "a3f2b8c1-d4e5-f6g7-h8i9-j0k1l2m3n4o5"
 * // Same directory always returns the same ID
 */
function generateDeterministicClientId(workingDirectory: string): string {
  const hash = createHash('sha256').update(workingDirectory).digest('hex');
  // Format as UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`;
}

/**
 * Resolve client ID with optional environment variable override (v0.9.0+).
 *
 * This function provides flexible client identity resolution for different deployment scenarios:
 * 1. **BRAINSTORM_CLIENT_ID env var** → Use explicit client ID (containerized deployments)
 * 2. **No env var** → Generate from working directory (default, local development)
 *
 * **Use Cases:**
 * - **Containerized deployments**: Set BRAINSTORM_CLIENT_ID to stable value
 *   - Working directory changes on container restart
 *   - Manual client ID ensures consistent identity
 * - **Local development**: Omit env var for automatic directory-based identity
 *   - Same directory always produces same client_id
 *
 * **Environment Variable:**
 * - `BRAINSTORM_CLIENT_ID`: Manual client ID override (UUID format recommended)
 * - Example: `export BRAINSTORM_CLIENT_ID=a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6`
 *
 * **Complexity:** O(n) where n is the length of the working directory string (if no env var)
 *
 * @param workingDirectory - Absolute path to the working directory (fallback source)
 * @returns Client identifier (from env var or generated from directory)
 *
 * @example
 * // Container deployment with explicit client ID
 * // BRAINSTORM_CLIENT_ID=abc123...
 * const clientId = resolveClientId('/app/workspace');
 * // Returns: "abc123..." (from environment)
 *
 * // Local development without env var
 * const clientId = resolveClientId('/Users/alice/projects/frontend');
 * // Returns: "a3f2b8c1..." (generated from directory)
 */
function resolveClientId(workingDirectory: string): string {
  // Check for manual override via environment variable (v0.9.0+)
  const envClientId = process.env.BRAINSTORM_CLIENT_ID;
  if (envClientId) {
    // Validate it's a non-empty string
    const trimmed = envClientId.trim();
    if (trimmed.length > 0 && trimmed.length <= 256) {
      return trimmed;
    }
  }

  // Fall back to directory-based deterministic generation
  return generateDeterministicClientId(workingDirectory);
}

/**
 * Load version information with graceful fallback strategy.
 *
 * This function attempts to load version info from multiple sources in order of preference:
 * 1. Generated `version.json` (created during build by `scripts/generate-version.js`)
 * 2. `package.json` (always available in source)
 * 3. Hardcoded fallback values (last resort)
 *
 * **Build Process:**
 * - `npm run build` generates `dist/src/version.json` from `package.json`
 * - This ensures version consistency without runtime package.json access
 *
 * **Complexity:** O(1) - reads at most 3 files sequentially
 *
 * @returns Version metadata object containing version, name, and optional description
 *
 * @example
 * const info = loadVersionInfo();
 * // { version: "0.8.0", name: "brainstorm", description: "..." }
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadVersionInfo(): { version: string; name: string; description?: string } {
  // Try to load from generated version.json (exists after build)
  const versionPaths = [
    join(__dirname, 'version.json'),
    join(__dirname, '..', 'version.json')
  ];

  for (const candidate of versionPaths) {
    if (existsSync(candidate)) {
      try {
        return JSON.parse(readFileSync(candidate, 'utf-8'));
      } catch (err) {
        // Continue to next candidate or fallback
      }
    }
  }

  // Fallback to package.json (always exists)
  const pkgPath = join(__dirname, '..', '..', 'package.json');
  try {
    const packageJson = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return {
      version: packageJson.version,
      name: packageJson.name,
      description: packageJson.description
    };
  } catch (err) {
    // Last resort: return hardcoded values
    return {
      version: '0.6.0',
      name: 'brainstorm',
      description: 'MCP server enabling multi-agent collaboration and coordination'
    };
  }
}

const versionInfo = loadVersionInfo();

/**
 * MCP Server for Multi-Agent Collaboration
 *
 * This class implements the Model Context Protocol (MCP) server that enables multiple
 * Claude Code instances to communicate and collaborate through shared projects.
 *
 * **Architecture:**
 * - Uses MCP SDK's {@link Server} for protocol handling
 * - Delegates all persistence to {@link FileSystemStorage}
 * - Communicates via stdio transport (stdin/stdout)
 * - Implements 15 tools and 8 context-aware prompts
 *
 * **Key Components:**
 * - **Tool Handlers**: Implement MCP tool operations (create_project, send_message, etc.)
 * - **Prompt Handlers**: Provide context-aware guided workflows
 * - **Error Handling**: Sanitizes system errors, preserves user errors
 * - **Long-Polling**: Supports real-time collaboration with DoS protection
 *
 * **Security Features:**
 * - Rate limiting: Max 100 concurrent long-polls per agent/resource
 * - Path validation: working_directory must be absolute and normalized
 * - Error sanitization: System errors hidden, user errors with structured data
 * - Audit logging: All operations logged for accountability
 *
 * **Session Persistence (v0.8.0+):**
 * - Client identity derived from working directory (deterministic client_id)
 * - Same directory = same identity = can reclaim agent names
 * - Membership tracking across restarts
 *
 * @example
 * // Create and run the server
 * const server = new AgentCoopServer('/Users/alice/.brainstorm');
 * await server.run();
 * // Server now listens on stdin/stdout for MCP protocol messages
 */
export class AgentCoopServer {
  /** MCP SDK server instance handling protocol communication */
  private server: Server;

  /** File system storage layer for all persistence operations */
  private storage: FileSystemStorage;

  /** Active long-polling connection tracking for DoS protection (key: operation ID, value: count) */
  private activeLongPolls = new Map<string, number>();

  /** Maximum concurrent long-polling connections per agent/resource (DoS protection) */
  private readonly MAX_CONCURRENT_POLLS = 100;

  // MCP Prompts for guided multi-agent workflows
  private readonly PROMPTS = {
    'create': {
      name: 'create',
      description: 'Create a new multi-agent collaboration project. I\'ll ask you for the details conversationally.',
      arguments: []
    },
    'join': {
      name: 'join',
      description: 'Join an existing collaboration project. I\'ll show you available projects and help you choose.',
      arguments: []
    },
    'broadcast': {
      name: 'broadcast',
      description: 'Send a message to all agents in a project. I\'ll help you compose and send it.',
      arguments: []
    },
    'review': {
      name: 'review',
      description: 'Catch up on project activity. I\'ll show you members, messages, and resources.',
      arguments: []
    },
    'share': {
      name: 'share',
      description: 'Share a resource or document with the project team. I\'ll guide you through the process.',
      arguments: []
    },
    'discuss': {
      name: 'discuss',
      description: 'Reply to ongoing project discussions. I\'ll show you recent context and help you respond.',
      arguments: []
    },
    'list': {
      name: 'list',
      description: 'List all available projects. Perfect for discovery - no arguments needed!',
      arguments: []
    },
    'status': {
      name: 'status',
      description: 'Show your Brainstorm project memberships for this working directory.',
      arguments: []
    },
    'leave': {
      name: 'leave',
      description: 'Leave a project gracefully. I\'ll help you archive your messages and clean up your membership.',
      arguments: []
    },
    'archive': {
      name: 'archive',
      description: 'Archive a completed project. I\'ll help you mark it as inactive while preserving all data.',
      arguments: []
    }
  };

  /**
   * Create a new Brainstorm MCP server instance.
   *
   * Initializes the server with file system storage at the specified path and
   * sets up all MCP tool and prompt handlers.
   *
   * **Storage Initialization:**
   * - Creates storage directory structure if it doesn't exist
   * - Loads or creates system configuration
   * - No network connections or external dependencies
   *
   * **Complexity:** O(1) - lightweight initialization, actual storage setup happens in `run()`
   *
   * @param storagePath - Absolute path to storage root directory (e.g., ~/.brainstorm)
   *
   * @example
   * const server = new AgentCoopServer('/Users/alice/.brainstorm');
   * await server.run(); // Start listening on stdio
   */
  constructor(storagePath: string) {
    this.storage = new FileSystemStorage(storagePath);

    this.server = new Server(
      {
        name: versionInfo.name,
        version: versionInfo.version
      },
      {
        capabilities: {
          tools: {},
          prompts: {}
        }
      }
    );

    this.setupHandlers();
  }

  /**
   * Centralized error handler that preserves UserError metadata and sanitizes system errors.
   *
   * This method implements a security-conscious error handling strategy:
   * - **UserError**: Preserve structured error data (safe for clients)
   * - **System Error**: Sanitize to "Internal server error" (prevent information leakage)
   *
   * **Error Flow:**
   * 1. Log full error server-side for debugging
   * 2. Check if error is UserError (ValidationError, NotFoundError, etc.)
   * 3. If UserError: return structured JSON with message, code, details
   * 4. If system error: return sanitized generic error
   *
   * **Security Rationale:**
   * - UserError instances are designed to be safe (no sensitive data)
   * - System errors might expose file paths, stack traces, or internal state
   * - Prevents information disclosure vulnerabilities
   *
   * **Complexity:** O(1) - simple type check and JSON serialization
   *
   * @param error - Error object (UserError or system Error)
   * @param toolName - Name of the tool that threw the error (for logging)
   * @returns MCP error response with isError: true flag
   *
   * @example
   * try {
   *   await this.storage.getResource(projectId, resourceId, agentName);
   * } catch (error) {
   *   return this.formatError(error, 'get_resource');
   * }
   */
  private formatError(error: unknown, toolName: string) {
    // Log detailed error server-side for debugging
    console.error(`Tool error [${toolName}]:`, error);

    // Check if this is a user-facing error with structured data
    if (isUserError(error)) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            error: error.message,
            code: error.code,
            details: error.details
          })
        }],
        isError: true
      };
    }

    // System error - sanitize for security
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          error: 'Internal server error',
          code: 'INTERNAL_ERROR'
        })
      }],
      isError: true
    };
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: 'create_project',
          description: 'Create a new cooperation project. Projects are the organizing unit for agent collaboration - all agents must join a project to communicate.',
          inputSchema: {
            type: 'object',
            properties: {
              project_id: {
                type: 'string',
                description: 'Unique project identifier (e.g., "api-redesign")'
              },
              name: {
                type: 'string',
                description: 'Human-readable project name'
              },
              description: {
                type: 'string',
                description: 'Project description and goals'
              },
              context: {
                type: 'object',
                description: 'Additional context (goal, timeline, docs_url, etc.)'
              },
              created_by: {
                type: 'string',
                description: 'Agent name creating this project (optional)'
              }
            },
            required: ['project_id', 'name']
          }
        },
        {
          name: 'join_project',
          description: 'Join a project with agent name. Membership automatically tracked by working directory.',
          inputSchema: {
            type: 'object',
            properties: {
              project_id: {
                type: 'string',
                description: 'Project to join'
              },
              agent_name: {
                type: 'string',
                description: 'Your friendly name within this project (e.g., "frontend", "backend")'
              },
              working_directory: {
                type: 'string',
                description: 'Absolute path to your project directory - provides automatic session persistence'
              },
              capabilities: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of capabilities you provide'
              },
              labels: {
                type: 'object',
                description: 'Key-value labels for this agent'
              }
            },
            required: ['project_id', 'agent_name', 'working_directory']
          }
        },
        {
          name: 'get_project_info',
          description: 'Get project metadata and list of members. Use this to see project context and who else is in the project. Supports waiting for project creation.',
          inputSchema: {
            type: 'object',
            properties: {
              project_id: {
                type: 'string',
                description: 'Project ID to query'
              },
              wait: {
                type: 'boolean',
                description: 'If true, wait for project to be created if it doesn\'t exist yet (long-polling)'
              },
              timeout_seconds: {
                type: 'number',
                description: 'Maximum seconds to wait when wait=true (default: 300, max: 3600)',
                minimum: 1,
                maximum: 3600
              }
            },
            required: ['project_id']
          }
        },
        {
          name: 'list_projects',
          description: 'List all available projects. Supports pagination for large project lists (10+ projects).',
          inputSchema: {
            type: 'object',
            properties: {
              offset: {
                type: 'number',
                description: 'Number of projects to skip (default: 0). Use with limit for pagination.',
                minimum: 0
              },
              limit: {
                type: 'number',
                description: 'Maximum number of projects to return. Omit to return all projects.',
                minimum: 1
              }
            }
          }
        },
        {
          name: 'send_message',
          description: 'Send message to agent or broadcast to all. Set reply_expected=true only if you\'ll immediately wait for responses using receive_messages.',
          inputSchema: {
            type: 'object',
            properties: {
              project_id: {
                type: 'string',
                description: 'Project you are in'
              },
              from_agent: {
                type: 'string',
                description: 'Your agent name in this project'
              },
              to_agent: {
                type: 'string',
                description: 'Recipient agent name (for direct messages)'
              },
              broadcast: {
                type: 'boolean',
                description: 'If true, send to all project members (do not use with to_agent)'
              },
              reply_expected: {
                type: 'boolean',
                description: 'Set true if requesting action/question AND you\'ll immediately wait for replies via receive_messages. False for informational messages. True commits you to wait. CRITICAL: Handoff messages (payload.type="handoff") MUST use true - they are approval requests, NOT informational messages.'
              },
              payload: {
                type: 'object',
                description: 'Message content'
              },
              metadata: {
                type: 'object',
                description: 'Optional metadata (priority, trace_id)'
              }
            },
            required: ['project_id', 'from_agent', 'reply_expected', 'payload']
          }
        },
        {
          name: 'receive_messages',
          description: 'Get inbox messages. Supports pagination and long-polling. Respond to messages with reply_expected=true.',
          inputSchema: {
            type: 'object',
            properties: {
              project_id: {
                type: 'string',
                description: 'Project you are in'
              },
              agent_name: {
                type: 'string',
                description: 'Your agent name'
              },
              offset: {
                type: 'number',
                description: 'Number of messages to skip (default: 0). Use with limit for pagination.',
                minimum: 0
              },
              limit: {
                type: 'number',
                description: 'Maximum number of messages to retrieve. Omit to return all messages.'
              },
              wait: {
                type: 'boolean',
                description: 'If true, wait for messages to arrive instead of returning empty immediately (long-polling)'
              },
              timeout_seconds: {
                type: 'number',
                description: 'Maximum seconds to wait for messages when wait=true (default: 300, max: 3600)',
                minimum: 1,
                maximum: 3600
              }
            },
            required: ['project_id', 'agent_name']
          }
        },
        {
          name: 'acknowledge_message',
          description: 'Mark a message as processed (removes it from your inbox)',
          inputSchema: {
            type: 'object',
            properties: {
              project_id: {
                type: 'string',
                description: 'Project you are in'
              },
              agent_name: {
                type: 'string',
                description: 'Your agent name'
              },
              message_id: {
                type: 'string',
                description: 'Message ID to acknowledge'
              }
            },
            required: ['project_id', 'agent_name', 'message_id']
          }
        },
        {
          name: 'store_resource',
          description: 'Store shared resource. Use content for <50KB, source_path for >50KB (max 500KB). With source_path: path stored in manifest, agents read file directly. For updates: include etag to prevent conflicts.',
          inputSchema: {
            type: 'object',
            properties: {
              project_id: {
                type: 'string',
                description: 'Project you are in'
              },
              resource_id: {
                type: 'string',
                description: 'Unique resource identifier'
              },
              name: {
                type: 'string',
                description: 'Resource name'
              },
              description: {
                type: 'string',
                description: 'Resource description'
              },
              agent_name: {
                type: 'string',
                description: 'Your agent name within the project'
              },
              content: {
                type: 'string',
                description: 'Inline resource content (<50KB). Use source_path for larger files.'
              },
              source_path: {
                type: 'string',
                description: 'Absolute path to file for large data (>50KB). File must be within home directory and readable. This path will be stored in the manifest for other agents to read.'
              },
              mime_type: {
                type: 'string',
                description: 'Content MIME type'
              },
              etag: {
                type: 'string',
                description: 'ETag from when you read the resource (required when updating). Pass back exactly what you received. Omit for new resources.'
              },
              permissions: {
                type: 'object',
                properties: {
                  read: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Agent names with read access (use "*" for everyone)'
                  },
                  write: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Agent names with write access'
                  }
                }
              }
            },
            required: ['project_id', 'resource_id', 'name', 'agent_name']
          }
        },
        {
          name: 'get_resource',
          description: 'Retrieve shared resource. If manifest has source_path: use Read tool on that path (content field undefined). Changed etag means re-read source_path file. Supports long-polling.',
          inputSchema: {
            type: 'object',
            properties: {
              project_id: {
                type: 'string',
                description: 'Project you are in'
              },
              resource_id: {
                type: 'string',
                description: 'Resource ID to retrieve'
              },
              agent_name: {
                type: 'string',
                description: 'Your agent name (for permission check)'
              },
              wait: {
                type: 'boolean',
                description: 'If true, wait for resource to be created if it doesn\'t exist yet (long-polling)'
              },
              timeout_seconds: {
                type: 'number',
                description: 'Maximum seconds to wait when wait=true (default: 300, max: 3600)',
                minimum: 1,
                maximum: 3600
              }
            },
            required: ['project_id', 'resource_id', 'agent_name']
          }
        },
        {
          name: 'list_resources',
          description: 'List all resources in the project you have access to. Supports pagination for large resource lists.',
          inputSchema: {
            type: 'object',
            properties: {
              project_id: {
                type: 'string',
                description: 'Project you are in'
              },
              agent_name: {
                type: 'string',
                description: 'Your agent name (for filtering accessible resources)'
              },
              offset: {
                type: 'number',
                description: 'Number of resources to skip (default: 0). Use with limit for pagination.',
                minimum: 0
              },
              limit: {
                type: 'number',
                description: 'Maximum number of resources to return. Omit to return all accessible resources.',
                minimum: 1
              }
            },
            required: ['project_id', 'agent_name']
          }
        },
        {
          name: 'delete_resource',
          description: 'Delete a resource from the project. Only the resource creator can delete it.',
          inputSchema: {
            type: 'object',
            properties: {
              project_id: {
                type: 'string',
                description: 'Project containing the resource'
              },
              resource_id: {
                type: 'string',
                description: 'Resource ID to delete'
              },
              agent_name: {
                type: 'string',
                description: 'Your agent name (must be the resource creator)'
              }
            },
            required: ['project_id', 'resource_id', 'agent_name']
          }
        },
        {
          name: 'heartbeat',
          description: 'Update your online status. Call periodically to show you are active.',
          inputSchema: {
            type: 'object',
            properties: {
              project_id: {
                type: 'string',
                description: 'Project you are in'
              },
              agent_name: {
                type: 'string',
                description: 'Your agent name'
              },
              online: {
                type: 'boolean',
                description: 'Whether you are online'
              }
            },
            required: ['project_id', 'agent_name']
          }
        },
        {
          name: 'handover_coordinator',
          description: 'Transfer coordinator role to another member. Only current coordinator can initiate. Target must be existing member.',
          inputSchema: {
            type: 'object',
            properties: {
              project_id: {
                type: 'string',
                description: 'Project containing both agents'
              },
              from_agent: {
                type: 'string',
                description: 'Current coordinator agent name (must be your agent name)'
              },
              to_agent: {
                type: 'string',
                description: 'Target agent name to become new coordinator'
              }
            },
            required: ['project_id', 'from_agent', 'to_agent']
          }
        },
        {
          name: 'delete_project',
          description: 'Delete a project. Only the agent that created the project can delete it.',
          inputSchema: {
            type: 'object',
            properties: {
              project_id: {
                type: 'string',
                description: 'Project ID to delete'
              },
              agent_name: {
                type: 'string',
                description: 'Your agent name (must match project creator)'
              }
            },
            required: ['project_id', 'agent_name']
          }
        },
        {
          name: 'version',
          description: 'Get the current Brainstorm server version',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'status',
          description: 'Get your Brainstorm project status. Shows project memberships for your working directory with seamless session persistence - same directory always shows the same projects.',
          inputSchema: {
            type: 'object',
            properties: {
              working_directory: {
                type: 'string',
                description: 'Absolute path to your project directory - shows all projects joined from this directory'
              }
            },
            required: ['working_directory']
          }
        },
        {
          name: 'leave_project',
          description: 'Leave a project gracefully. Archives your unread messages and removes your membership. You can rejoin later to reclaim your agent name.',
          inputSchema: {
            type: 'object',
            properties: {
              project_id: {
                type: 'string',
                description: 'Project ID to leave'
              },
              agent_name: {
                type: 'string',
                description: 'Your agent name in this project'
              },
              working_directory: {
                type: 'string',
                description: 'Absolute path to your project directory - required for session management'
              }
            },
            required: ['project_id', 'agent_name', 'working_directory']
          }
        },
        {
          name: 'archive_project',
          description: 'Mark a project as archived (inactive but recoverable). Only the project creator can archive. Archived projects remain readable but signal completion.',
          inputSchema: {
            type: 'object',
            properties: {
              project_id: {
                type: 'string',
                description: 'Project ID to archive'
              },
              agent_name: {
                type: 'string',
                description: 'Your agent name (must be the project creator)'
              },
              reason: {
                type: 'string',
                description: 'Optional reason for archiving (e.g., "Project completed", "Goals achieved")'
              }
            },
            required: ['project_id', 'agent_name']
          }
        }
      ];

      return { tools };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!args) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: 'Missing arguments' })
          }],
          isError: true
        };
      }

      try {
        switch (name) {
          case 'create_project': {
            const metadata: ProjectMetadata = {
              project_id: args.project_id as string,
              name: args.name as string,
              description: args.description as string | undefined,
              context: args.context as Record<string, unknown> | undefined,
              created_by: args.created_by as string | undefined,
              created_at: new Date().toISOString(),
              schema_version: '1.0'
            };

            await this.storage.createProject(metadata);

            await this.storage.auditLog({
              timestamp: new Date().toISOString(),
              actor: metadata.created_by || 'system',
              action: 'create_project',
              target: metadata.project_id
            });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  project_id: metadata.project_id,
                  message: 'Project created. Agents can now join using join_project.'
                }, null, 2)
              }]
            };
          }

          case 'join_project': {
            const projectId = args.project_id as string;
            const agentName = args.agent_name as string;
            const workingDirectory = args.working_directory as string;

            // Validate working_directory is absolute and normalized
            if (!isAbsolute(workingDirectory)) {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    error: 'working_directory must be an absolute path',
                    code: 'INVALID_WORKING_DIRECTORY',
                    details: { working_directory: workingDirectory }
                  })
                }],
                isError: true
              };
            }

            const normalizedPath = normalize(workingDirectory);
            if (normalizedPath !== workingDirectory) {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    error: 'working_directory must be normalized (no .. or . segments)',
                    code: 'INVALID_WORKING_DIRECTORY',
                    details: {
                      working_directory: workingDirectory,
                      normalized: normalizedPath
                    }
                  })
                }],
                isError: true
              };
            }

            // Resolve client_id (env var or directory-based generation)
            const clientId = resolveClientId(workingDirectory);

            // Get project metadata to check if this agent is the creator
            const projectMetadata = await this.storage.getProjectMetadata(projectId);

            const member: ProjectMember = {
              project_id: projectId,
              agent_name: agentName,
              agent_id: randomUUID(),
              client_id: clientId, // Include client_id for name reclaiming
              capabilities: (args.capabilities as string[]) || [],
              labels: (args.labels as Record<string, string>) || {}, // Custom agent labels only (not structural roles)
              joined_at: new Date().toISOString(),
              last_seen: new Date().toISOString(),
              online: true
            };

            await this.storage.joinProject(member);

            // Ensure project has coordinator (v0.11.0 migration - backfills metadata for legacy projects)
            await this.storage.ensureProjectHasCoordinator(projectId);

            // Refresh metadata to get coordinator_agent field (may have been set by migration)
            const updatedMetadata = await this.storage.getProjectMetadata(projectId);
            const projectName = updatedMetadata?.name || projectId;

            // Store client identity and record membership
            await this.storage.storeClientIdentity(clientId);
            await this.storage.recordClientMembership(clientId, projectId, agentName, projectName);

            await this.storage.auditLog({
              timestamp: new Date().toISOString(),
              actor: member.agent_name,
              action: 'join_project',
              target: member.project_id,
              details: { agent_id: member.agent_id, client_id: clientId, working_directory: workingDirectory }
            });

            // Determine role based on project metadata (structural role, not custom label)
            const isCoordinator = updatedMetadata?.coordinator_agent === agentName;

            const structuralRole = isCoordinator ? 'coordinator' : 'contributor';
            let roleMessage: string;
            if (isCoordinator) {
              roleMessage = `✅ YOU are now the "${agentName}" agent with the COORDINATOR role in this project. You facilitate human-in-the-loop approval: present contributor work to humans, await signoff, relay decisions. Use handover_coordinator tool to transfer role if needed.`;
            } else {
              roleMessage = `✅ YOU are now the "${agentName}" agent with the CONTRIBUTOR role in this project. For work assigned/discussed IN Brainstorm, send handoff messages to coordinator when done. For direct human instructions (outside Brainstorm), report to human directly - no handoff needed.`;
            }

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  working_directory: workingDirectory,
                  critical_reminder: '⚠️ CRITICAL: For ALL future Brainstorm tool calls (leave_project, status, etc.), ALWAYS use the initial "Working directory" value from your <env> block (shown at conversation start). NEVER use current PWD or values from tool responses. Session persistence depends on using the exact same directory consistently throughout your conversation.',
                  agent_name: member.agent_name,
                  agent_id: member.agent_id,
                  role: structuralRole,
                  role_description: getRoleDescription(structuralRole),
                  message: roleMessage
                }, null, 2)
              }]
            };
          }

          case 'get_project_info': {
            const projectId = args.project_id as string;
            const wait = args.wait as boolean || false;

            // Get timeout settings from system config
            const config = await this.storage.getSystemConfig();
            const defaultTimeout = config?.default_long_poll_timeout_seconds || 300;
            const maxTimeout = config?.max_long_poll_timeout_seconds || 3600;
            const timeoutSeconds = Math.min(args.timeout_seconds as number || defaultTimeout, maxTimeout);

            // Long-polling: wait for project to be created
            if (wait) {
              // DoS protection: limit concurrent long-polling connections
              const pollKey = `get_project:${projectId}`;
              const currentPolls = this.activeLongPolls.get(pollKey) || 0;

              if (currentPolls >= this.MAX_CONCURRENT_POLLS) {
                return {
                  content: [{
                    type: 'text',
                    text: JSON.stringify({
                      error: 'Too many concurrent requests'
                    })
                  }],
                  isError: true
                };
              }

              // Increment counter
              this.activeLongPolls.set(pollKey, currentPolls + 1);

              try {
                const startTime = Date.now();
                const timeoutMs = timeoutSeconds * 1000;
                const pollIntervalMs = 2000; // Check every 2 seconds (v0.9.0 perf optimization)

                while (Date.now() - startTime < timeoutMs) {
                  const metadata = await this.storage.getProjectMetadata(projectId);
                  if (metadata) {
                    // Ensure project has coordinator (v0.11.0 migration)
                    await this.storage.ensureProjectHasCoordinator(projectId);

                    // Refresh metadata to get coordinator_agent field (may have been set by migration)
                    const updatedMetadata = await this.storage.getProjectMetadata(projectId);
                    const members = await this.storage.listProjectMembers(projectId);

                    return {
                      content: [{
                        type: 'text',
                        text: JSON.stringify({
                          project: updatedMetadata,
                          members: members,
                          coordinator: updatedMetadata?.coordinator_agent || null,
                          waited_ms: Date.now() - startTime
                        }, null, 2)
                      }]
                    };
                  }
                  await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
                }

                // Timeout - project never created
                return {
                  content: [{
                    type: 'text',
                    text: JSON.stringify({
                      error: 'Project not found',
                      waited_ms: Date.now() - startTime,
                      timeout: true,
                      retry: true,
                      message: 'Long-poll timeout reached. The project was not created within the wait period. You can retry this request to wait again.'
                    })
                  }]
                };
              } finally {
                // Decrement counter and cleanup
                const current = this.activeLongPolls.get(pollKey) || 1;
                const remaining = current - 1;
                if (remaining <= 0) {
                  this.activeLongPolls.delete(pollKey);
                } else {
                  this.activeLongPolls.set(pollKey, remaining);
                }
              }
            }

            // Standard non-blocking fetch
            const metadata = await this.storage.getProjectMetadata(projectId);
            if (!metadata) {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({ error: 'Project not found' })
                }],
                isError: true
              };
            }

            // Ensure project has coordinator (v0.11.0 migration)
            await this.storage.ensureProjectHasCoordinator(projectId);

            // Refresh metadata to get coordinator_agent field (may have been set by migration)
            const updatedMetadata = await this.storage.getProjectMetadata(projectId);
            const members = await this.storage.listProjectMembers(projectId);

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  project: updatedMetadata,
                  members: members,
                  coordinator: updatedMetadata?.coordinator_agent || null
                }, null, 2)
              }]
            };
          }

          case 'list_projects': {
            const offset = args.offset as number | undefined;
            const limit = args.limit as number | undefined;
            const projects = await this.storage.listProjects(offset, limit);

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  projects: projects,
                  count: projects.length,
                  pagination: {
                    offset: offset || 0,
                    limit: limit,
                    returned: projects.length
                  }
                }, null, 2)
              }]
            };
          }

          case 'send_message': {
            const projectId = args.project_id as string;
            const fromAgent = args.from_agent as string;
            const toAgent = args.to_agent as string | undefined;
            const broadcast = args.broadcast as boolean || false;
            const replyExpected = args.reply_expected;

            // Validate reply_expected is explicitly set
            if (typeof replyExpected !== 'boolean') {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    error: 'reply_expected must be explicitly set to true or false',
                    code: 'REPLY_EXPECTED_REQUIRED',
                    details: { provided: replyExpected }
                  })
                }],
                isError: true
              };
            }

            // Validate message has exactly one target
            const hasToAgent = toAgent !== undefined && toAgent !== null && toAgent !== '';
            if (!hasToAgent && !broadcast) {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({ error: 'Must specify either to_agent or broadcast=true' })
                }],
                isError: true
              };
            }

            if (hasToAgent && broadcast) {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({ error: 'Cannot specify both to_agent and broadcast' })
                }],
                isError: true
              };
            }

            // Get sender's role for validation and response guidance
            const sender = await this.storage.getProjectMember(projectId, fromAgent);
            const senderRole = sender?.labels?.role || 'contributor';

            // Validate handoff message authority based on sender role
            const payload = args.payload as Record<string, unknown>;
            const isHandoffMessage =
              payload?.type === 'handoff' ||
              payload?.type === 'handoff_accepted' ||
              payload?.type === 'handoff_rejected';

            if (isHandoffMessage) {
              // CRITICAL: Handoff messages MUST have reply_expected=true, EXCEPT handoff_accepted (terminal response)
              // - handoff (contributor): MUST use reply_expected=true (waits for approval/rejection)
              // - handoff_rejected (coordinator): MUST use reply_expected=true (expects revised handoff)
              // - handoff_accepted (coordinator): Can use reply_expected=false (terminal, no reply needed)
              const isTerminalAccept = payload?.type === 'handoff_accepted';

              if (!replyExpected && !isTerminalAccept) {
                return {
                  content: [{
                    type: 'text',
                    text: JSON.stringify({
                      error: 'HANDOFF_REPLY_EXPECTED_REQUIRED',
                      message: 'Handoff messages MUST have reply_expected=true (except handoff_accepted which is terminal). Handoffs and rejections are synchronous approval requests requiring immediate wait for response, NOT informational fire-and-forget messages.',
                      provided: {
                        reply_expected: replyExpected,
                        payload_type: payload?.type
                      },
                      correct_usage: {
                        handoff: 'reply_expected=true (contributor waits for coordinator response)',
                        handoff_rejected: 'reply_expected=true (coordinator waits for revised handoff)',
                        handoff_accepted: 'reply_expected=false or true (terminal response, work complete)'
                      }
                    }, null, 2)
                  }],
                  isError: true
                };
              }

              // Validation rules:
              // - ONLY contributors can send 'handoff' messages
              // - ONLY coordinators can send 'handoff_accepted' or 'handoff_rejected' messages

              // Check: handoff_accepted/rejected MUST be from coordinator
              if (payload?.type === 'handoff_accepted' || payload?.type === 'handoff_rejected') {
                if (senderRole !== 'coordinator') {
                  return {
                    content: [{
                      type: 'text',
                      text: JSON.stringify({
                        error: 'HANDOFF_AUTHORITY_ERROR',
                        message: `ONLY coordinators can send "${payload?.type}" messages. YOU are: ${senderRole}`,
                        your_role: senderRole,
                        required_role: 'coordinator',
                        details: 'Approval/rejection messages can only come from the coordinator who facilitates human review.'
                      }, null, 2)
                    }],
                    isError: true
                  };
                }
              }

              // Check: handoff MUST be from contributor
              if (payload?.type === 'handoff') {
                if (senderRole !== 'contributor') {
                  return {
                    content: [{
                      type: 'text',
                      text: JSON.stringify({
                        error: 'HANDOFF_AUTHORITY_ERROR',
                        message: `ONLY contributors can send "handoff" messages. YOU are: ${senderRole}`,
                        your_role: senderRole,
                        required_role: 'contributor',
                        details: 'Handoff messages come from contributors submitting work for approval. Coordinators receive handoffs and send approval/rejection responses.'
                      }, null, 2)
                    }],
                    isError: true
                  };
                }
              }
            }

            const message: Message = {
              message_id: randomUUID(),
              project_id: projectId,
              from_agent: fromAgent,
              to_agent: toAgent,
              broadcast: broadcast,
              reply_expected: replyExpected,
              payload: args.payload,
              created_at: new Date().toISOString(),
              metadata: args.metadata as Message['metadata']
            };

            await this.storage.sendMessage(message);

            // Ensure project has coordinator (v0.10.0 migration)
            await this.storage.ensureProjectHasCoordinator(projectId);

            await this.storage.auditLog({
              timestamp: new Date().toISOString(),
              actor: fromAgent,
              action: 'send_message',
              target: toAgent || 'broadcast',
              details: { project_id: projectId, message_id: message.message_id }
            });

            // Provide confirmation guidance for handoff messages (payload/metadata/isHandoffMessage already extracted above for validation)
            const response: Record<string, unknown> = {
              success: true,
              message_id: message.message_id,
              role_reminder: {
                your_role: senderRole,
                your_agent_name: fromAgent,
                role_description: getRoleDescription(senderRole)
              }
            };

            if (isHandoffMessage) {
              if (payload?.type === 'handoff') {
                // Contributor sending handoff to coordinator
                response.handoff_detected = {
                  type: 'handoff_to_coordinator',
                  message: '✅ Handoff message sent to coordinator',
                  next_steps: [
                    'You MUST now call receive_messages with wait=true to wait for coordinator response',
                    'The coordinator will present your work to the human user for approval',
                    'Wait for either handoff_accepted (approved) or handoff_rejected (needs revision)'
                  ],
                  reminder: 'Do NOT leave the discussion until you receive coordinator approval'
                };
              } else if (payload?.type === 'handoff_accepted') {
                // Coordinator accepting handoff
                response.handoff_detected = {
                  type: 'handoff_accepted',
                  message: '✅ Handoff acceptance sent to contributor',
                  reminder: 'This should only be sent AFTER receiving human user approval'
                };
              } else if (payload?.type === 'handoff_rejected') {
                // Coordinator rejecting handoff
                response.handoff_detected = {
                  type: 'handoff_rejected',
                  message: '✅ Handoff rejection sent to contributor with feedback',
                  reminder: 'Make sure you included specific human feedback in the message for the contributor to act on'
                };
              }
            }

            // Add wait guidance for reply_expected messages
            if (replyExpected) {
              response.reply_expected_guidance = {
                message: '⏳ You set reply_expected=true - you MUST now wait for a response',
                action_required: 'Call receive_messages with wait=true to wait for the recipient\'s reply',
                recommended_timeout: 300,
                timeout_note: 'Wait at least 300 seconds (5 minutes) - this is the default long-polling timeout. You can specify timeout_seconds up to 3600 (1 hour) if needed.'
              };
            }

            // Always include conversation etiquette reminder
            response.conversation_etiquette = {
              message: '🤝 Conversation Etiquette',
              reminder: 'Before leaving this conversation, confirm with the recipient that they have nothing more to discuss',
              best_practice: 'Send a closing message like "Is there anything else you need from me?" and wait for confirmation before concluding'
            };

            return {
              content: [{
                type: 'text',
                text: JSON.stringify(response, null, 2)
              }]
            };
          }

          case 'receive_messages': {
            const projectId = args.project_id as string;
            const agentName = args.agent_name as string;
            const offset = args.offset as number | undefined;
            const limit = args.limit as number | undefined;
            const wait = args.wait as boolean || false;

            // Get timeout settings from system config
            const config = await this.storage.getSystemConfig();
            const defaultTimeout = config?.default_long_poll_timeout_seconds || 300;
            const maxTimeout = config?.max_long_poll_timeout_seconds || 3600;
            const timeoutSeconds = Math.min(args.timeout_seconds as number || defaultTimeout, maxTimeout);

            // Long-polling: wait for messages to arrive
            if (wait) {
              // DoS protection: limit concurrent long-polling connections per agent
              const pollKey = `${projectId}:${agentName}`;
              const currentPolls = this.activeLongPolls.get(pollKey) || 0;

              if (currentPolls >= this.MAX_CONCURRENT_POLLS) {
                return {
                  content: [{
                    type: 'text',
                    text: JSON.stringify({
                      error: 'Too many concurrent requests'
                    })
                  }],
                  isError: true
                };
              }

              // Increment counter
              this.activeLongPolls.set(pollKey, currentPolls + 1);

              try {
                const startTime = Date.now();
                const timeoutMs = timeoutSeconds * 1000;
                const pollIntervalMs = 2000; // Check every 2 seconds (v0.9.0 perf optimization)

                while (Date.now() - startTime < timeoutMs) {
                  const messages = await this.storage.getAgentInbox(projectId, agentName, offset, limit);
                  if (messages.length > 0) {
                    // Ensure project has coordinator (v0.10.0 migration)
                    await this.storage.ensureProjectHasCoordinator(projectId);

                    // Detect handoff messages and provide role-specific guidance
                    const handoffAlerts: Array<Record<string, unknown>> = [];
                    for (const msg of messages) {
                      const payload = msg.payload as Record<string, unknown>;

                      if (payload?.type === 'handoff') {
                        handoffAlerts.push({
                          message_id: msg.message_id,
                          from: msg.from_agent,
                          type: 'handoff_to_coordinator',
                          alert: '📬 HANDOFF RECEIVED: A contributor has completed their work and is waiting for your approval',
                          coordinator_action_required: [
                            '1. Review the contributor\'s work summary in the message payload',
                            '2. MUST present this work to the HUMAN user for review',
                            '3. MUST wait for HUMAN approval or rejection',
                            '4. Send handoff_accepted (if human approves) or handoff_rejected with human feedback (if human rejects)',
                            '5. Use send_message to relay the human decision back to the contributor'
                          ],
                          critical_reminder: 'You are a PROXY for human decisions. Never accept work without human approval first!'
                        });
                      } else if (payload?.type === 'handoff_accepted') {
                        handoffAlerts.push({
                          message_id: msg.message_id,
                          from: msg.from_agent,
                          type: 'handoff_accepted',
                          alert: '✅ WORK APPROVED: The coordinator (via human user) has approved your completed work',
                          contributor_action: 'Your work is complete and approved. You may now conclude your contribution to this project.'
                        });
                      } else if (payload?.type === 'handoff_rejected') {
                        handoffAlerts.push({
                          message_id: msg.message_id,
                          from: msg.from_agent,
                          type: 'handoff_rejected',
                          alert: '🔄 REVISION REQUESTED: The human user (via coordinator) has requested changes',
                          contributor_action: 'Review the human feedback in the message, make the requested changes, then send a new handoff message to the coordinator'
                        });
                      }
                    }

                    const response: Record<string, unknown> = {
                      messages,
                      count: messages.length,
                      waited_ms: Date.now() - startTime,
                      pagination: {
                        offset: offset || 0,
                        limit: limit,
                        returned: messages.length
                      }
                    };

                    if (handoffAlerts.length > 0) {
                      response.handoff_alerts = handoffAlerts;
                    }

                    return {
                      content: [{
                        type: 'text',
                        text: JSON.stringify(response, null, 2)
                      }]
                    };
                  }
                  await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
                }

                return {
                  content: [{
                    type: 'text',
                    text: JSON.stringify({
                      messages: [],
                      count: 0,
                      waited_ms: Date.now() - startTime,
                      timeout: true,
                      retry: true,
                      message: 'Long-poll timeout reached. No messages arrived within the wait period. You can retry this request to wait again.',
                      pagination: {
                        offset: offset || 0,
                        limit: limit,
                        returned: 0
                      }
                    }, null, 2)
                  }]
                };
              } finally {
                // Decrement counter and cleanup
                const current = this.activeLongPolls.get(pollKey) || 1;
                const remaining = current - 1;
                if (remaining <= 0) {
                  this.activeLongPolls.delete(pollKey);
                } else {
                  this.activeLongPolls.set(pollKey, remaining);
                }
              }
            }

            // Standard non-blocking fetch
            const messages = await this.storage.getAgentInbox(projectId, agentName, offset, limit);

            // Ensure project has coordinator (v0.10.0 migration)
            await this.storage.ensureProjectHasCoordinator(projectId);

            // Detect handoff messages and provide role-specific guidance
            const handoffAlerts: Array<Record<string, unknown>> = [];
            for (const msg of messages) {
              const payload = msg.payload as Record<string, unknown>;

              if (payload?.type === 'handoff') {
                handoffAlerts.push({
                  message_id: msg.message_id,
                  from: msg.from_agent,
                  type: 'handoff_to_coordinator',
                  alert: '📬 HANDOFF RECEIVED: A contributor has completed their work and is waiting for your approval',
                  coordinator_action_required: [
                    '1. Review the contributor\'s work summary in the message payload',
                    '2. MUST present this work to the HUMAN user for review',
                    '3. MUST wait for HUMAN approval or rejection',
                    '4. Send handoff_accepted (if human approves) or handoff_rejected with human feedback (if human rejects)',
                    '5. Use send_message to relay the human decision back to the contributor'
                  ],
                  critical_reminder: 'You are a PROXY for human decisions. Never accept work without human approval first!'
                });
              } else if (payload?.type === 'handoff_accepted') {
                handoffAlerts.push({
                  message_id: msg.message_id,
                  from: msg.from_agent,
                  type: 'handoff_accepted',
                  alert: '✅ WORK APPROVED: The coordinator (via human user) has approved your completed work',
                  contributor_action: 'Your work is complete and approved. You may now conclude your contribution to this project.'
                });
              } else if (payload?.type === 'handoff_rejected') {
                handoffAlerts.push({
                  message_id: msg.message_id,
                  from: msg.from_agent,
                  type: 'handoff_rejected',
                  alert: '🔄 REVISION REQUESTED: The human user (via coordinator) has requested changes',
                  contributor_action: 'Review the human feedback in the message, make the requested changes, then send a new handoff message to the coordinator'
                });
              }
            }

            const response: Record<string, unknown> = {
              messages,
              count: messages.length,
              pagination: {
                offset: offset || 0,
                limit: limit,
                returned: messages.length
              }
            };

            if (handoffAlerts.length > 0) {
              response.handoff_alerts = handoffAlerts;
            }

            return {
              content: [{
                type: 'text',
                text: JSON.stringify(response, null, 2)
              }]
            };
          }

          case 'acknowledge_message': {
            const projectId = args.project_id as string;
            const agentName = args.agent_name as string;
            const messageId = args.message_id as string;

            await this.storage.markMessageProcessed(projectId, agentName, messageId);

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ success: true }, null, 2)
              }]
            };
          }

          case 'store_resource': {
            const agentName = args.agent_name as string;
            const manifest: ResourceManifest = {
              resource_id: args.resource_id as string,
              project_id: args.project_id as string,
              name: args.name as string,
              description: args.description as string | undefined,
              // creator_agent is NOT set here - storage layer sets it internally
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              etag: args.etag as string | undefined || '', // Will be set by storage layer
              mime_type: args.mime_type as string | undefined,
              permissions: args.permissions as ResourceManifest['permissions'] | undefined,
              metadata: args.metadata as Record<string, unknown> | undefined
            };

            const content = args.content as string | undefined;
            const sourcePath = args.source_path as string | undefined;

            await this.storage.storeResource(manifest, agentName, content, sourcePath);

            await this.storage.auditLog({
              timestamp: new Date().toISOString(),
              actor: agentName,
              action: 'store_resource',
              target: manifest.resource_id,
              details: {
                project_id: manifest.project_id,
                storage_type: sourcePath ? 'file_reference' : 'inline'
              }
            });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  resource_id: manifest.resource_id,
                  storage_type: sourcePath ? 'file_reference' : 'inline'
                }, null, 2)
              }]
            };
          }

          case 'get_resource': {
            const projectId = args.project_id as string;
            const resourceId = args.resource_id as string;
            const agentName = args.agent_name as string;
            const wait = args.wait as boolean || false;

            // Get timeout settings from system config
            const config = await this.storage.getSystemConfig();
            const defaultTimeout = config?.default_long_poll_timeout_seconds || 300;
            const maxTimeout = config?.max_long_poll_timeout_seconds || 3600;
            const timeoutSeconds = Math.min(args.timeout_seconds as number || defaultTimeout, maxTimeout);

            // Long-polling: wait for resource to be created
            if (wait) {
              // DoS protection: limit concurrent long-polling connections per resource
              const pollKey = `get_resource:${projectId}:${resourceId}:${agentName}`;
              const currentPolls = this.activeLongPolls.get(pollKey) || 0;

              if (currentPolls >= this.MAX_CONCURRENT_POLLS) {
                return {
                  content: [{
                    type: 'text',
                    text: JSON.stringify({
                      error: 'Too many concurrent requests'
                    })
                  }],
                  isError: true
                };
              }

              // Increment counter
              this.activeLongPolls.set(pollKey, currentPolls + 1);

              try {
                const startTime = Date.now();
                const timeoutMs = timeoutSeconds * 1000;
                const pollIntervalMs = 2000; // Check every 2 seconds (v0.9.0 perf optimization)

                while (Date.now() - startTime < timeoutMs) {
                  try {
                    const result = await this.storage.getResource(projectId, resourceId, agentName);
                    if (result) {
                      let contentStr: string | undefined;
                      if (result.payload) {
                        contentStr = result.payload.toString('utf-8');
                      }

                      return {
                        content: [{
                          type: 'text',
                          text: JSON.stringify({
                            manifest: result.manifest,
                            content: contentStr,
                            waited_ms: Date.now() - startTime
                          }, null, 2)
                        }]
                      };
                    }
                  } catch (error: unknown) {
                    // Fail fast on validation and permission errors
                    if (isUserError(error)) {
                      const failFastCodes = [
                        'NO_READ_PERMISSIONS',
                        'READ_PERMISSION_DENIED',
                        'INVALID_ID_FORMAT',
                        'INVALID_ID_LENGTH',
                        'PATH_TRAVERSAL_DETECTED'
                      ];
                      if (error.code && failFastCodes.includes(error.code)) {
                        // Resource exists but access denied, or invalid input - return error immediately
                        return this.formatError(error, name);
                      }
                    }
                    // Otherwise continue polling (resource might not exist yet)
                  }
                  await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
                }

                // Timeout - resource never created
                return {
                  content: [{
                    type: 'text',
                    text: JSON.stringify({
                      error: 'Resource not found',
                      waited_ms: Date.now() - startTime,
                      timeout: true,
                      retry: true,
                      message: 'Long-poll timeout reached. The resource was not created within the wait period. You can retry this request to wait again.'
                    })
                  }]
                };
              } finally {
                // Decrement counter and cleanup
                const current = this.activeLongPolls.get(pollKey) || 1;
                const remaining = current - 1;
                if (remaining <= 0) {
                  this.activeLongPolls.delete(pollKey);
                } else {
                  this.activeLongPolls.set(pollKey, remaining);
                }
              }
            }

            // Standard non-blocking fetch
            const result = await this.storage.getResource(projectId, resourceId, agentName);
            if (!result) {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({ error: 'Resource not found' })
                }],
                isError: true
              };
            }

            let contentStr: string | undefined;
            if (result.payload) {
              contentStr = result.payload.toString('utf-8');
            }

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  manifest: result.manifest,
                  content: contentStr
                }, null, 2)
              }]
            };
          }

          case 'list_resources': {
            const projectId = args.project_id as string;
            const agentName = args.agent_name as string;
            const offset = args.offset as number | undefined;
            const limit = args.limit as number | undefined;

            const resources = await this.storage.listResources(projectId, agentName, offset, limit);

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  resources,
                  count: resources.length,
                  pagination: {
                    offset: offset || 0,
                    limit: limit,
                    returned: resources.length
                  }
                }, null, 2)
              }]
            };
          }

          case 'delete_resource': {
            const projectId = args.project_id as string;
            const resourceId = args.resource_id as string;
            const agentName = args.agent_name as string;

            await this.storage.deleteResource(projectId, resourceId, agentName);

            await this.storage.auditLog({
              timestamp: new Date().toISOString(),
              actor: agentName,
              action: 'delete_resource',
              target: resourceId,
              details: { project_id: projectId }
            });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: 'Resource deleted successfully'
                }, null, 2)
              }]
            };
          }

          case 'heartbeat': {
            const projectId = args.project_id as string;
            const agentName = args.agent_name as string;
            const online = args.online !== undefined ? (args.online as boolean) : true;

            await this.storage.updateMemberHeartbeat(projectId, agentName, online);

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  agent_name: agentName,
                  online: online
                }, null, 2)
              }]
            };
          }

          case 'handover_coordinator': {
            const projectId = args.project_id as string;
            const fromAgent = args.from_agent as string;
            const toAgent = args.to_agent as string;

            await this.storage.handoverCoordinator(projectId, fromAgent, toAgent);

            await this.storage.auditLog({
              timestamp: new Date().toISOString(),
              actor: fromAgent,
              action: 'handover_coordinator',
              target: projectId,
              details: { from_agent: fromAgent, to_agent: toAgent }
            });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  project_id: projectId,
                  message: `✅ Coordinator role successfully transferred from "${fromAgent}" to "${toAgent}"`,
                  role_changes: {
                    [fromAgent]: {
                      old_role: 'coordinator',
                      new_role: 'contributor',
                      guidance: getRoleDescription('contributor'),
                      note: `YOU (${fromAgent}) are no longer the coordinator. YOU are now a contributor agent. Complete assigned work and send handoff messages to the new coordinator "${toAgent}" when done.`
                    },
                    [toAgent]: {
                      old_role: 'contributor',
                      new_role: 'coordinator',
                      guidance: getRoleDescription('coordinator'),
                      note: `YOU (${toAgent}) are now the coordinator agent. CRITICAL: YOU are the human's PROXY for approvals. Present contributor work to the human user, await their signoff, then relay their decision. Never accept work without human approval first!`
                    }
                  },
                  next_steps: {
                    for_previous_coordinator: `You (${fromAgent}) can now focus on contributor work or leave the project if done.`,
                    for_new_coordinator: `You (${toAgent}) should acknowledge this handover and check for any pending handoff messages from contributors.`
                  }
                }, null, 2)
              }]
            };
          }

          case 'delete_project': {
            const projectId = args.project_id as string;
            const agentName = args.agent_name as string;

            await this.storage.deleteProject(projectId, agentName);

            // Cleanup: remove this project from all client membership files
            await this.storage.removeProjectFromAllClients(projectId);

            await this.storage.auditLog({
              timestamp: new Date().toISOString(),
              actor: agentName,
              action: 'delete_project',
              target: projectId
            });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: 'Project deleted successfully. All client memberships have been removed.'
                }, null, 2)
              }]
            };
          }

          case 'version': {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify(versionInfo, null, 2)
              }]
            };
          }

          case 'status': {
            const workingDirectory = args.working_directory as string;

            // Validate working_directory is absolute and normalized
            if (!isAbsolute(workingDirectory)) {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    error: 'working_directory must be an absolute path',
                    code: 'INVALID_WORKING_DIRECTORY',
                    details: { working_directory: workingDirectory }
                  })
                }],
                isError: true
              };
            }

            const normalizedPath = normalize(workingDirectory);
            if (normalizedPath !== workingDirectory) {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    error: 'working_directory must be normalized (no .. or . segments)',
                    code: 'INVALID_WORKING_DIRECTORY',
                    details: {
                      working_directory: workingDirectory,
                      normalized: normalizedPath
                    }
                  })
                }],
                isError: true
              };
            }

            // Resolve client_id (env var or directory-based generation)
            const clientId = resolveClientId(workingDirectory);

            // Store/update client identity
            await this.storage.storeClientIdentity(clientId);

            // Get memberships for this client
            const memberships = await this.storage.getClientMemberships(clientId);
            const projectStatuses = [];

            for (const membership of memberships) {
              try {
                // Ensure project has coordinator (v0.11.0 migration)
                await this.storage.ensureProjectHasCoordinator(membership.project_id);

                const messages = await this.storage.getAgentInbox(membership.project_id, membership.agent_name);
                const member = await this.storage.getProjectMember(membership.project_id, membership.agent_name);

                // Get project metadata to determine structural role (coordinator vs contributor)
                const projectMetadata = await this.storage.getProjectMetadata(membership.project_id);
                const isCoordinator = projectMetadata?.coordinator_agent === membership.agent_name;
                const structuralRole = isCoordinator ? 'coordinator' : 'contributor';

                projectStatuses.push({
                  project_id: membership.project_id,
                  project_name: membership.project_name,
                  agent_name: membership.agent_name,
                  role: structuralRole,
                  role_description: getRoleDescription(structuralRole),
                  labels: member?.labels || {}, // Include custom agent labels
                  joined_at: membership.joined_at,
                  last_seen: member?.last_seen || membership.joined_at,
                  online: member?.online || false,
                  unread_messages: messages.length,
                  has_unread: messages.length > 0
                });
              } catch {
                // Project might have been deleted - skip it
              }
            }

            // Build identity reminder - emphasize agent identity
            const identityReminder = projectStatuses.map(p => {
              return `📛 In project "${p.project_name}" (${p.project_id}): YOU (${p.agent_name}) are the ${p.role} agent`;
            });

            // Build agent-centric status message
            const totalUnread = projectStatuses.reduce((sum, p) => sum + p.unread_messages, 0);
            const agentStatusMessage = projectStatuses.length === 0
              ? '🤖 AGENT STATUS: You are not currently a member of any Brainstorm projects'
              : totalUnread === 0
              ? `🤖 AGENT STATUS: You are a member of ${projectStatuses.length} project(s) with no unread messages`
              : `🤖 AGENT STATUS: YOU have ${totalUnread} unread message(s) across ${projectStatuses.length} project(s)`;

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  agent_status_message: agentStatusMessage,
                  client_id: clientId,
                  working_directory: workingDirectory,
                  critical_reminder: '⚠️ CRITICAL: For ALL Brainstorm tool calls requiring working_directory parameter, ALWAYS use the initial "Working directory" value from your <env> block (shown at conversation start). NEVER use current PWD, shell working directory, or values from tool responses. Session persistence depends on using the exact same directory consistently throughout your conversation.',
                  identity_reminder: identityReminder.length > 0
                    ? identityReminder
                    : ['You are not currently a member of any projects'],
                  projects: projectStatuses,
                  total_projects: projectStatuses.length,
                  total_unread_messages: totalUnread,
                  interpretation_guide: '📖 The data above shows YOUR status as an agent. When you see "unread_messages: N", these are messages in YOUR inbox. When you see project memberships, these are projects YOU are a member of. You are not reporting on a human user - you ARE the project member.'
                }, null, 2)
              }]
            };
          }

          case 'leave_project': {
            const projectId = args.project_id as string;
            const agentName = args.agent_name as string;
            const workingDirectory = args.working_directory as string;

            // Validate working_directory is absolute and normalized
            if (!isAbsolute(workingDirectory)) {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    error: 'working_directory must be an absolute path',
                    code: 'INVALID_WORKING_DIRECTORY',
                    details: { working_directory: workingDirectory }
                  })
                }],
                isError: true
              };
            }

            const normalizedPath = normalize(workingDirectory);
            if (normalizedPath !== workingDirectory) {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    error: 'working_directory must be normalized (no .. or . segments)',
                    code: 'INVALID_WORKING_DIRECTORY',
                    details: {
                      working_directory: workingDirectory,
                      normalized: normalizedPath
                    }
                  })
                }],
                isError: true
              };
            }

            // Resolve client_id (env var or directory-based generation)
            const clientId = resolveClientId(workingDirectory);

            // Check if leaving agent is the coordinator - HARD BLOCK if so
            const projectMetadata = await this.storage.getProjectMetadata(projectId);
            const isCoordinator = projectMetadata?.coordinator_agent === agentName;

            // HARD BLOCK: Coordinators must handover before leaving
            if (isCoordinator) {
              // Get other members for handover suggestion
              const members = await this.storage.listProjectMembers(projectId);
              const otherMembers = members.filter(m => m.agent_name !== agentName);

              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    error: 'COORDINATOR_HANDOVER_REQUIRED',
                    message: 'YOU cannot leave while YOU are the coordinator. YOU must use handover_coordinator to transfer the coordinator role to another member first.',
                    your_role: 'coordinator',
                    required_action: {
                      tool: 'handover_coordinator',
                      parameters: {
                        project_id: projectId,
                        from_agent: agentName,
                        to_agent: '<choose-a-member>'
                      }
                    },
                    available_members: otherMembers.map(m => ({
                      agent_name: m.agent_name,
                      online: m.online,
                      last_seen: m.last_seen
                    })),
                    why: 'The coordinator role is essential for human-in-the-loop approval. Without a coordinator, contributors cannot get their work approved. You must transfer this responsibility before leaving.'
                  }, null, 2)
                }],
                isError: true
              };
            }

            // Leave the project (archives messages, removes membership)
            const archivedCount = await this.storage.leaveProject(projectId, agentName, clientId);

            await this.storage.auditLog({
              timestamp: new Date().toISOString(),
              actor: agentName,
              action: 'leave_project',
              target: projectId,
              details: { client_id: clientId, archived_messages: archivedCount, was_coordinator: false } // Always false since coordinators are blocked above
            });

            // Build simple success response (coordinators are blocked above, so this is always a regular member)
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  project_id: projectId,
                  archived_messages: archivedCount,
                  message: `Left project successfully. ${archivedCount} unread messages archived. You can rejoin later to reclaim your agent name.`
                }, null, 2)
              }]
            };
          }

          case 'archive_project': {
            const projectId = args.project_id as string;
            const agentName = args.agent_name as string;
            const reason = args.reason as string | undefined;

            // Archive the project (only creator can do this)
            await this.storage.archiveProject(projectId, agentName, reason);

            await this.storage.auditLog({
              timestamp: new Date().toISOString(),
              actor: agentName,
              action: 'archive_project',
              target: projectId,
              details: { reason: reason || 'No reason provided' }
            });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  project_id: projectId,
                  message: reason
                    ? `Project archived successfully. Reason: ${reason}`
                    : 'Project archived successfully. Project remains readable but signals completion.'
                }, null, 2)
              }]
            };
          }

          default:
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ error: `Unknown tool: ${name}` })
              }],
              isError: true
            };
        }
      } catch (error: unknown) {
        return this.formatError(error, name);
      }
    });

    // List available prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: Object.values(this.PROMPTS)
      };
    });

    // Handle prompt requests with contextual intelligence
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const promptName = request.params.name;
      const args = request.params.arguments || {};

      const prompt = this.PROMPTS[promptName as keyof typeof this.PROMPTS];
      if (!prompt) {
        throw new Error(`Prompt not found: ${promptName}`);
      }

      try {
        switch (promptName) {
          case 'create': {
            // Get context: check current status and existing projects
            const existingProjects = await this.storage.listProjects();

            return {
              messages: [
                {
                  role: 'user',
                  content: {
                    type: 'text',
                    text: `I want to create a new multi-agent collaboration project.

**First, let me check your current status:**
1. Read your working directory from \`<env>\` (look for "Working directory:")
2. Use the \`status\` tool with working_directory=[value from env]

${existingProjects.length > 0 ? `\n**Existing projects** (${existingProjects.length}):\n${existingProjects.map(p => `- **${p.project_id}**: ${p.name}`).join('\n')}\n` : '**Note**: No projects exist yet - you\'ll be creating the first one!\n'}
**Then, please ask me:**
- What should the project be called?
- What's the goal or purpose?

**Once I provide this info, you'll:**
1. Generate a project_id from the name (lowercase, alphanumeric + dashes)
2. Check if it conflicts with existing projects
3. Create it with \`create_project\` (set created_by to your agent name)
4. Join it automatically with \`join_project\`

**IMPORTANT - Coordinator Role (Human-in-the-Loop):**
- As the project creator, you will automatically become the **coordinator** (project.coordinator_agent)
- Only ONE coordinator is allowed per project (stored in project metadata)
- **CRITICAL**: As coordinator, you are a PROXY for human approval, NOT an autonomous decision-maker
- Your responsibilities:
  1. **Receive** handoffs from contributors when they complete work
  2. **Present** their work to the HUMAN user for review
  3. **Wait** for HUMAN signoff (approval or rejection with feedback)
  4. **Relay** human decision back to contributors:
     - If human approves → send \`handoff_accepted\` to contributor
     - If human rejects → send \`handoff_rejected\` with human feedback to contributor
  5. **If needed**: Transfer coordinator role to another member using \`handover_coordinator\` tool
- **Never accept work without human approval first!**`
                  }
                }
              ]
            };
          }

          case 'join': {
            // List available projects for selection
            const projects = await this.storage.listProjects();

            if (projects.length === 0) {
              return {
                messages: [
                  {
                    role: 'user',
                    content: {
                      type: 'text',
                      text: `❌ **No Projects Available**

There are no collaboration projects to join yet.

**Next steps**:
- Use the **create** prompt to start a new project
- Ask other agents to create a project first`
                    }
                  }
                ]
              };
            }

            const projectList = projects.map(p => {
              return `### 📁 ${p.name} (\`${p.project_id}\`)
**Description**: ${p.description || '(No description)'}
**Created**: ${new Date(p.created_at).toLocaleString()}`;
            }).join('\n\n');

            return {
              messages: [
                {
                  role: 'user',
                  content: {
                    type: 'text',
                    text: `I want to join a collaboration project.

**First, let me check your current status:**
1. Read your working directory from \`<env>\` (look for "Working directory:")
2. Use the \`status\` tool to see which projects you're already in

**Available Projects** (${projects.length}):

${projectList}

**Then, please ask me:**
- Which project would you like to join? (provide the project_id)
- What role will you play? (e.g., "frontend", "backend", "reviewer")

**Once I provide this info, you'll:**
1. Get detailed project info with \`get_project_info\` to see current members
2. Check who is the coordinator (use the \`coordinator\` field from get_project_info response)
3. Suggest available contributor roles based on existing members
4. Join with \`join_project\` (use labels for custom agent descriptions like "frontend", "backend")
5. Check for unread messages with \`receive_messages\`

**IMPORTANT - Contributor Role:**
- Each project already has ONE coordinator (the creator, unless role was handed over)
- You are joining as a **contributor**, not the coordinator
- As a contributor, you are responsible for:
  - Completing work assigned/discussed through Brainstorm
  - **When to use handoffs**: ONLY for work assigned IN Brainstorm (coordinator delegated it, or team discussed it)
  - **When NOT to use handoffs**: For direct human instructions (outside Brainstorm), report to human directly
  - If work was discussed in Brainstorm: send handoff to coordinator when done, wait for approval
  - Making revisions if coordinator requests changes
- **Note**: If the coordinator transfers their role to you using \`handover_coordinator\`, you will become the new coordinator`
                  }
                }
              ]
            };
          }

          case 'broadcast': {
            // Check status to determine which project to broadcast to
            return {
              messages: [
                {
                  role: 'user',
                  content: {
                    type: 'text',
                    text: `I want to broadcast a message to all members of a project.

**First, let me check your current status:**
1. Read your working directory from \`<env>\` (look for "Working directory:")
2. Use the \`status\` tool to see your active projects

**Then:**
- If you're in exactly 1 project → I'll ask for the message and broadcast to that project
- If you're in multiple projects → I'll ask which project and what message
- If you're in 0 projects → I'll guide you to join or create one first

**Once we determine the project, please tell me:**
- What message do you want to broadcast?

**I'll then:**
1. Get the project members list with \`get_project_info\`
2. Check who is the coordinator (use the \`coordinator\` field from response)
3. Analyze if your message expects responses (questions, requests, assignments)
4. Send with \`send_message\` using broadcast=true

**IMPORTANT - File Sharing:**
- If broadcast mentions files/docs: Use \`store_resource\` first, then broadcast resource_id
- ❌ Wrong: "/Users/me/api-spec.json" | ✅ Right: "I've shared API spec in resource 'api-spec-v2'"

**IMPORTANT - Coordinator Pattern:**
- If you are a **contributor** (not coordinator) completing work:
  - Do NOT broadcast to all members
  - Instead, send a HANDOFF message directly to the coordinator
  - See handoff workflow below
- If you are the **coordinator**, you can broadcast freely
- **Coordinator Handover**: If you need to transfer coordinator role to another member, use \`handover_coordinator\` tool

**Handoff Workflow (Human-Approved):**
**When to use handoffs:**
- ✅ Work was assigned/discussed IN Brainstorm (coordinator delegated it, team discussed it)
- ❌ Direct human instructions (outside Brainstorm) → report to human directly, NO handoff

**Contributors** - when you've completed work assigned IN Brainstorm:
1. Find the coordinator using \`get_project_info\` (use the \`coordinator\` field from response)
2. Send direct message to coordinator with:
   - payload.type = 'handoff'
   - payload.summary = "Brief summary of completed work"
   - reply_expected = TRUE ⚠️ **CRITICAL**: Handoffs are NOT informational messages - they are synchronous approval requests. You MUST set reply_expected=true because you need to wait for human approval/rejection before proceeding.
3. MUST call \`receive_messages\` with wait=true to wait for coordinator's response
4. Coordinator will present your work to HUMAN user for review
5. If human approves (payload.type = 'handoff_accepted'), you're done
6. If human rejects (payload.type = 'handoff_rejected'), make revisions per human feedback and send new handoff

**Coordinators** - when you receive handoff:
1. Review the contributor's work summary
2. **MUST present work to HUMAN user** and explain what the contributor accomplished
3. **MUST wait for HUMAN approval/rejection**
4. Relay human decision:
   - If human approves → send \`handoff_accepted\` with message "Human user has approved your work"
   - If human rejects → send \`handoff_rejected\` with human's specific feedback

**CRITICAL - reply_expected Usage:**
- Set \`reply_expected: true\` if your broadcast asks a question or requests action from team members
- If you set it to \`true\`, you MUST immediately call \`receive_messages\` with \`wait=true\` to wait for replies
- Set \`reply_expected: false\` if your broadcast is informational (announcements, updates, status reports)
- This is a commitment: \`true\` means you will wait for responses, \`false\` means you won't`
                  }
                }
              ]
            };
          }

          case 'review': {
            // Check status first to see which project to review
            return {
              messages: [
                {
                  role: 'user',
                  content: {
                    type: 'text',
                    text: `I want to review project activity.

**First, let me check your current status:**
1. Read your working directory from \`<env>\` (look for "Working directory:")
2. Use the \`status\` tool to see your projects and unread message counts

**Then:**
- If you're in exactly 1 project → I'll review that one automatically
- If you're in multiple projects → I'll ask which one to review
- If you're in 0 projects → I'll suggest joining or creating a project

**The review will show:**
- 📋 Project overview (name, description, created date)
- 👥 Team members (who's online, when they joined)
- 🎯 **Coordinator** (who is responsible for human-in-the-loop approval - from project.coordinator field)
- 📬 Your unread messages (recent messages with previews)
- 📦 Available resources (shared documents and data)

**I'll use these tools:**
- \`get_project_info\` for project details, members, and coordinator identification
- \`receive_messages\` for your inbox
- \`list_resources\` for shared resources

**IMPORTANT - Coordinator Role:**
- The coordinator field from \`get_project_info\` shows who facilitates human approvals
- If you're a contributor, send handoff messages to coordinator ONLY for work assigned IN Brainstorm
  - ⚠️ **CRITICAL**: Handoffs MUST use reply_expected=true (they are approval requests, NOT informational messages)
- For direct human instructions (outside Brainstorm), report to human directly - NO handoff
- If you're the coordinator, you MUST present contributor work to humans before accepting`
                  }
                }
              ]
            };
          }

          case 'share': {
            // Check status to determine which project to share with
            return {
              messages: [
                {
                  role: 'user',
                  content: {
                    type: 'text',
                    text: `I want to share a resource with the project team.

**First, let me check your current status:**
1. Read your working directory from \`<env>\` (look for "Working directory:")
2. Use the \`status\` tool to see your projects

**Then:**
- If you're in exactly 1 project → I'll ask for the resource details
- If you're in multiple projects → I'll ask which project first
- If you're in 0 projects → I'll guide you to join or create one

**Please tell me:**
- What's the resource title?
- What does it contain? (brief description)
- Do you have a file path to share, or will you provide inline content?

**CRITICAL - Working Directory Isolation:**
- Each agent operates in its own working directory - agents CANNOT access each other's files
- ❌ WRONG: "See the API docs at /Users/alice/docs/api.md" (other agents cannot read this)
- ✅ RIGHT: Read file locally → \`store_resource\` → share resource_id → others use \`get_resource\`
- Example response: "I've shared the API docs in resource 'api-documentation' - use get_resource to access it"
- NEVER respond with local file paths when another agent requests documentation

**I'll then:**
1. Generate a resource_id from the title
2. Store it with \`store_resource\` (using source_path for files >50KB, content for smaller data)
3. Set permissions (read: everyone, write: you)
4. Broadcast a notification to the team with \`send_message\`

**CRITICAL - reply_expected Usage:**
When broadcasting the notification about the shared resource:
- Set \`reply_expected: true\` if you want feedback, review, or acknowledgment from team members
- If you set it to \`true\`, you MUST immediately call \`receive_messages\` with \`wait=true\` to wait for responses
- Set \`reply_expected: false\` if this is just an FYI notification (most common for resource sharing)
- This is a commitment: \`true\` means you will wait for responses, \`false\` means you won't`
                  }
                }
              ]
            };
          }

          case 'discuss': {
            // Check status to see ongoing discussions
            return {
              messages: [
                {
                  role: 'user',
                  content: {
                    type: 'text',
                    text: `I want to contribute to an ongoing project discussion.

**First, let me check your current status:**
1. Read your working directory from \`<env>\` (look for "Working directory:")
2. Use the \`status\` tool to see your projects and unread messages

**Then:**
- If you're in exactly 1 project → I'll show recent messages and ask for your response
- If you're in multiple projects → I'll ask which project first
- If you have unread messages → I'll show them for context
- If you're in 0 projects → I'll guide you to join one

**Please tell me:**
- What do you want to say or contribute?

**I'll then:**
1. Get recent messages with \`receive_messages\` for context
2. Get project info with \`get_project_info\` to check who is coordinator
3. Determine if this is a reply to someone specific or a general contribution
4. Analyze if your message expects a response (questions, requests, assignments)
5. Send your response with \`send_message\` (direct or broadcast as appropriate)

**IMPORTANT - File Sharing:**
- If requests documentation/files: Read locally → \`store_resource\` → share resource_id (NOT local paths like "/Users/me/config.json")

**IMPORTANT - Coordinator Pattern (Human-in-the-Loop):**
- If you are a **contributor** completing work and ready to hand off:
  - Do NOT just reply with your results
  - Send a HANDOFF message directly to the coordinator
  - Coordinator will present your work to HUMAN user
  - Wait for human approval (via coordinator) before leaving discussion
- If you are the **coordinator**:
  - You can discuss freely during the project
  - When contributors send handoff messages:
    1. **MUST present their work to HUMAN user** for review
    2. **MUST wait for HUMAN approval/rejection**
    3. Relay human decision back to contributor
  - **You are a PROXY for human decisions, NOT an autonomous decision-maker**
  - Accept with payload.type = 'handoff_accepted' **ONLY AFTER human approves**
  - Reject with payload.type = 'handoff_rejected' **with human's specific feedback**
  - **If needed**: Transfer coordinator role to another member using \`handover_coordinator\` tool

**Handoff Workflow (Human-Approved):**
**When to use handoffs:**
- ✅ Work was assigned/discussed IN Brainstorm (coordinator delegated it, team discussed it)
- ❌ Direct human instructions (outside Brainstorm) → report to human directly, NO handoff

**Contributors** - when you've completed work assigned IN Brainstorm:
1. Find the coordinator using \`get_project_info\` (use the \`coordinator\` field from response)
2. Send direct message to coordinator with:
   - payload.type = 'handoff'
   - payload.summary = "Brief summary of completed work"
   - reply_expected = TRUE ⚠️ **CRITICAL**: Handoffs are NOT informational messages - they are synchronous approval requests. You MUST set reply_expected=true because you need to wait for human approval/rejection before proceeding.
3. MUST call \`receive_messages\` with wait=true to wait for coordinator's response
4. Coordinator will present your work to HUMAN user for review
5. If human approves (payload.type = 'handoff_accepted'), you're done
6. If human rejects (payload.type = 'handoff_rejected'), make revisions per human feedback and send new handoff

**Coordinators** - when you receive handoff:
1. Review the contributor's work summary
2. **MUST present work to HUMAN user** and explain what the contributor accomplished
3. **MUST wait for HUMAN approval/rejection**
4. Relay human decision:
   - If human approves → send \`handoff_accepted\` with message "Human user has approved your work"
   - If human rejects → send \`handoff_rejected\` with human's specific feedback

**CRITICAL - reply_expected Usage:**
- Set \`reply_expected: true\` if your message asks a question or requests action
- If you set it to \`true\`, you MUST immediately call \`receive_messages\` with \`wait=true\` to wait for the reply
- Set \`reply_expected: false\` if your message is informational or doesn't need a response
- This is a commitment: \`true\` means you will wait, \`false\` means you won't`
                  }
                }
              ]
            };
          }

          case 'list': {
            // Get all projects
            const projects = await this.storage.listProjects();

            if (projects.length === 0) {
              return {
                messages: [
                  {
                    role: 'user',
                    content: {
                      type: 'text',
                      text: `📋 **No Projects Yet**

No collaboration projects have been created yet. Be the first!

**To get started**:
- Use the **"create"** prompt to start a new project
- Example: Create a project called "API Redesign" with goal "Coordinate frontend and backend"`
                    }
                  }
                ]
              };
            }

            const projectList = projects.map(p => {
              return `### 📁 ${p.name} (\`${p.project_id}\`)
**Description**: ${p.description || '(No description)'}
**Created**: ${new Date(p.created_at).toLocaleString()}`;
            }).join('\n\n');

            return {
              messages: [
                {
                  role: 'user',
                  content: {
                    type: 'text',
                    text: `📋 **Available Projects** (${projects.length})

${projectList}

**Next steps**:
- Use **"join"** prompt with a project_id to join one of these projects
- Use **"create"** prompt to start a new project
- Use **"status"** prompt to see which projects you're already in`
                  }
                }
              ]
            };
          }

          case 'status': {
            // Instruct Claude to get working_directory from <env> and use the status tool
            return {
              messages: [
                {
                  role: 'user',
                  content: {
                    type: 'text',
                    text: `I want to see my Brainstorm project status for this working directory.

**Please**:
1. Read your working directory from the \`<env>\` context (look for "Working directory:")
2. Use the \`status\` tool with the working_directory parameter set to that value

The tool will show you all projects you've joined from this directory, including unread message counts.`
                  }
                }
              ]
            };
          }

          case 'leave': {
            // Check status to determine which project to leave
            return {
              messages: [
                {
                  role: 'user',
                  content: {
                    type: 'text',
                    text: `I want to leave a project gracefully.

**First, let me check your current status:**
1. Read your working directory from \`<env>\` (look for "Working directory:")
2. Use the \`status\` tool to see which projects you're currently in
3. Check your role in each project (coordinator vs contributor)

**Then:**
- If you're in exactly 1 project → I'll confirm which project and your agent name, then leave
- If you're in multiple projects → I'll ask which project you want to leave
- If you're in 0 projects → I'll let you know there are no projects to leave

**Please tell me:**
- Which project do you want to leave? (provide the project_id)
- What's your agent name in that project?

**CRITICAL - If You Are the Coordinator:**
⚠️ **You MUST hand over the coordinator role before leaving!**
1. First, use \`get_project_info\` to see all project members
2. Choose a member to become the new coordinator
3. Use \`handover_coordinator\` to transfer the role to them
4. Only AFTER the handover is complete, use \`leave_project\`

**Why this matters:**
- The coordinator role is essential for the human-in-the-loop approval workflow
- Without a coordinator, contributors cannot get human approval for their completed work
- The project will be left in a broken state if the coordinator leaves without handover

**I'll then:**
1. Check if you're the coordinator (via \`status\` tool role field)
2. If coordinator: REQUIRE handover first (abort leave if not done)
3. If contributor or after handover: Use \`leave_project\` with your project_id, agent_name, and working_directory
4. Your unread messages will be archived (preserved in an archive/ folder)
5. Your project membership will be removed from the client membership tracking
6. You'll receive a summary of how many messages were archived

**Note**: You can rejoin the project later using the same agent name (session persistence lets you reclaim it).`
                  }
                }
              ]
            };
          }

          case 'archive': {
            // Check which projects user created to determine what can be archived
            return {
              messages: [
                {
                  role: 'user',
                  content: {
                    type: 'text',
                    text: `I want to archive a completed project.

**First, let me check your current status:**
1. Read your working directory from \`<env>\` (look for "Working directory:")
2. Use the \`status\` tool to see your active projects

**Then, let me check which projects you created:**
3. Use \`list_projects\` to see all available projects

**Please tell me:**
- Which project do you want to archive? (provide the project_id)
- What's your agent name in that project?
- Why are you archiving it? (optional reason, e.g., "Project completed", "Goals achieved")

**Important notes:**
- Only the project creator can archive a project
- Archived projects remain readable but signal completion
- All data (messages, resources, members) is preserved
- The project's \`archived\` flag will be set to true

**I'll then:**
1. Verify you are the project creator
2. Use \`archive_project\` with your project_id, agent_name, and optional reason
3. Confirm the project has been archived successfully

**Note**: Archiving is different from leaving - it marks the entire project as inactive for all members.`
                  }
                }
              ]
            };
          }

          default:
            throw new Error(`Prompt implementation not found: ${promptName}`);
        }
      } catch (error: unknown) {
        // If error is from storage/validation, provide helpful context
        if (error instanceof Error) {
          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `❌ **Error**: ${error.message}\n\nPlease check your arguments and try again.`
                }
              }
            ]
          };
        }
        throw error;
      }
    });
  }

  /**
   * Set up process signal handlers for graceful shutdown and error handling.
   *
   * This method registers handlers for various process events to ensure the server
   * exits cleanly when Claude Code disconnects or the process is terminated.
   *
   * **Handlers Registered:**
   * - `stdin.end`: Claude Code disconnected (graceful exit)
   * - `stdin.close`: stdin stream closed (graceful exit)
   * - `SIGTERM`: Termination signal (graceful shutdown)
   * - `SIGINT`: Interrupt signal / Ctrl+C (graceful shutdown)
   * - `uncaughtException`: Unhandled synchronous errors (exit with error code)
   * - `unhandledRejection`: Unhandled promise rejections (exit with error code)
   *
   * **Rationale:**
   * - MCP servers communicate via stdin/stdout
   * - When Claude Code exits, stdin closes and server should exit too
   * - Prevents orphaned server processes
   * - Ensures proper cleanup on termination
   *
   * **Complexity:** O(1) - event listener registration
   *
   * @private
   */
  private setupProcessHandlers(): void {
    // Detect when Claude disconnects (stdin closes)
    process.stdin.on('end', () => {
      console.error('stdin closed - Claude disconnected, exiting...');
      process.exit(0);
    });

    process.stdin.on('close', () => {
      console.error('stdin stream closed - Claude disconnected, exiting...');
      process.exit(0);
    });

    // Handle process termination signals
    process.on('SIGTERM', () => {
      console.error('Received SIGTERM, shutting down gracefully...');
      process.exit(0);
    });

    process.on('SIGINT', () => {
      console.error('Received SIGINT, shutting down gracefully...');
      process.exit(0);
    });

    // Handle unexpected errors
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled rejection:', reason);
      process.exit(1);
    });
  }

  /**
   * Initialize storage and start the MCP server.
   *
   * This method performs the startup sequence:
   * 1. Initialize file system storage (create directories, load config)
   * 2. Connect MCP server to stdio transport
   * 3. Set up process handlers for graceful shutdown
   * 4. Log startup message to stderr
   *
   * **Transport:**
   * - Uses stdio transport (stdin for input, stdout for output)
   * - stderr used for logging (doesn't interfere with MCP protocol)
   *
   * **Startup Flow:**
   * ```
   * User runs: node dist/src/index.js
   * → run() called
   * → Storage initialized (~/.brainstorm/)
   * → MCP server connects to stdin/stdout
   * → Process handlers registered
   * → Server ready for MCP protocol messages
   * ```
   *
   * **Complexity:**
   * - Storage initialization: O(1) - creates directories if needed
   * - Server connection: O(1) - lightweight protocol setup
   * - Overall: O(1)
   *
   * @async
   * @throws {Error} If storage initialization fails or MCP connection fails
   *
   * @example
   * const server = new AgentCoopServer('/Users/alice/.brainstorm');
   * await server.run();
   * // Server now running, listening for MCP messages on stdin
   */
  async run(): Promise<void> {
    await this.storage.initialize();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    // Set up handlers to detect disconnection and exit gracefully
    this.setupProcessHandlers();

    console.error('Brainstorm MCP server running on stdio');
  }
}
