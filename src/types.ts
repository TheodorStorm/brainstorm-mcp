// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2025 Theodor Storm

/**
 * Core type definitions for agent cooperation MCP server
 *
 * This module defines the data structures used throughout the Brainstorm system.
 * All types follow a project-centric model where projects are the primary organizing unit.
 *
 * **Design Principles:**
 * - Schema versioning for forward compatibility
 * - ISO 8601 timestamps for all temporal data
 * - Optional fields for flexible evolution
 * - Security-conscious separation of internal vs external types
 *
 * @module types
 */

/**
 * Project metadata defining a collaboration space.
 *
 * Projects are the top-level organizing unit where multiple agents can join,
 * exchange messages, and share resources. Each project has a unique identifier
 * and optional context for goal tracking, timelines, and documentation links.
 *
 * **Lifecycle:**
 * 1. Created via `create_project` tool
 * 2. Agents join via `join_project` tool
 * 3. Deleted via `delete_project` tool (creator-only)
 *
 * **Security:**
 * - Only the creator (if set) can delete the project
 * - Projects without a creator cannot be deleted (safety measure)
 *
 * @example
 * {
 *   project_id: "api-redesign",
 *   name: "API Redesign Sprint",
 *   description: "Modernize REST API to GraphQL",
 *   context: {
 *     goal: "Complete by Q2",
 *     docs_url: "https://wiki.example.com/api-redesign"
 *   },
 *   created_at: "2025-01-15T10:30:00Z",
 *   created_by: "architect-agent",
 *   schema_version: "1.0"
 * }
 */
export interface ProjectMetadata {
  /** Unique project identifier (alphanumeric, dash, underscore only) */
  project_id: string;

  /** Human-readable project name */
  name: string;

  /** Optional project description */
  description?: string;

  /** Optional context data (goals, timelines, documentation links, etc.) */
  context?: Record<string, unknown>;

  /** ISO 8601 timestamp when project was created */
  created_at: string;

  /** Agent name that created this project (required for deletion authorization) */
  created_by?: string;

  /** Whether this project is archived (inactive but recoverable) - v0.9.0+ */
  archived?: boolean;

  /** ISO 8601 timestamp when project was archived - v0.9.0+ */
  archived_at?: string;

  /** Agent name that archived this project - v0.9.0+ */
  archived_by?: string;

  /** Optional reason for archiving - v0.9.0+ */
  archive_reason?: string;

  /** Agent name serving as project coordinator (human-in-the-loop proxy) - v0.11.0+ */
  coordinator_agent?: string;

  /** Schema version for forward compatibility */
  schema_version: string;
}

/**
 * Project member representing an agent's participation in a project.
 *
 * Each agent joins a project with a friendly `agent_name` (e.g., "frontend", "backend")
 * and receives a globally unique `agent_id`. The agent can declare capabilities and labels
 * for discovery by other team members.
 *
 * **Identity System (v0.8.0+):**
 * - `agent_name`: Friendly name within the project scope
 * - `agent_id`: Globally unique UUID (auto-generated)
 * - `client_id`: Client identity for session persistence and name reclaiming
 *
 * **Smart Name Reclaiming:**
 * - Same client can reclaim their `agent_name` after reconnecting
 * - Legacy members (no `client_id`) can be claimed by new clients
 * - Different clients cannot steal each other's names
 *
 * **Status Tracking:**
 * - `online`: Current connection status
 * - `last_seen`: ISO timestamp of last heartbeat
 *
 * @example
 * {
 *   project_id: "api-redesign",
 *   agent_name: "frontend",
 *   agent_id: "550e8400-e29b-41d4-a716-446655440000",
 *   client_id: "client-abc123",
 *   capabilities: ["react", "typescript", "ui-design"],
 *   labels: { role: "frontend", team: "web" },
 *   joined_at: "2025-01-15T10:35:00Z",
 *   last_seen: "2025-01-15T11:20:00Z",
 *   online: true
 * }
 */
export interface ProjectMember {
  /** Project this member belongs to */
  project_id: string;

  /** Friendly name within project (e.g., "frontend", "backend") */
  agent_name: string;

  /** Globally unique agent ID (UUID, auto-generated) */
  agent_id: string;

  /** Client ID for session persistence and name reclaiming (v0.8.0+) */
  client_id?: string;

  /** Optional list of agent capabilities for discovery */
  capabilities?: string[];

  /** Optional key-value labels for filtering and organization */
  labels?: Record<string, string>;

  /** ISO 8601 timestamp when agent joined the project */
  joined_at: string;

  /** ISO 8601 timestamp of last heartbeat */
  last_seen: string;

  /** Current online status */
  online: boolean;
}

/**
 * Message for agent-to-agent communication within a project.
 *
 * Messages support both direct (agent-to-agent) and broadcast (agent-to-all) patterns.
 * The `reply_expected` flag signals whether the sender will wait for responses, enabling
 * request-response patterns.
 *
 * **Delivery Patterns:**
 * - **Direct**: Set `to_agent` to send to a specific project member
 * - **Broadcast**: Set `broadcast: true` to send to all project members (except sender)
 *
 * **Reply Protocol (v0.5.0+):**
 * - `reply_expected: true` means sender WILL call `receive_messages` with `wait: true`
 * - `reply_expected: false` means informational message, no response needed
 * - This prevents deadlocks where both sides wait indefinitely
 *
 * **Message Lifecycle:**
 * 1. Created via `send_message` tool
 * 2. Delivered to recipient inbox(es)
 * 3. Retrieved via `receive_messages` tool
 * 4. Acknowledged via `acknowledge_message` tool (removes from inbox)
 * 5. Expired after TTL (default: 24 hours)
 *
 * @example
 * // Direct message with reply expected
 * {
 *   message_id: "msg-123",
 *   project_id: "api-redesign",
 *   from_agent: "frontend",
 *   to_agent: "backend",
 *   reply_expected: true,
 *   payload: {
 *     type: "api-request",
 *     endpoint: "/users",
 *     question: "What's the expected response format?"
 *   },
 *   created_at: "2025-01-15T10:40:00Z",
 *   metadata: { priority: "high", trace_id: "trace-456" }
 * }
 *
 * @example
 * // Broadcast announcement (no reply expected)
 * {
 *   message_id: "msg-789",
 *   project_id: "api-redesign",
 *   from_agent: "architect",
 *   broadcast: true,
 *   reply_expected: false,
 *   payload: {
 *     type: "announcement",
 *     message: "API spec updated in shared resources"
 *   },
 *   created_at: "2025-01-15T10:45:00Z"
 * }
 */
export interface Message {
  /** Unique message identifier (UUID) */
  message_id: string;

  /** Project this message belongs to */
  project_id: string;

  /** Agent name of the sender */
  from_agent: string;

  /** Agent name of recipient (for direct messages) */
  to_agent?: string;

  /** If true, send to all project members except sender */
  broadcast?: boolean;

  /** If true, sender will wait for replies via receive_messages (v0.5.0+) */
  reply_expected: boolean;

  /** Message content (any JSON-serializable data) */
  payload: unknown;

  /** ISO 8601 timestamp when message was created */
  created_at: string;

  /** Optional time-to-live in seconds (default: 24 hours) */
  ttl?: number;

  /** Optional metadata for priority and tracing */
  metadata?: {
    /** Message priority for routing/filtering */
    priority?: 'low' | 'normal' | 'high';
    /** Distributed tracing ID for correlation */
    trace_id?: string;
  };
}

/**
 * Resource manifest for shared documents, files, and data within a project.
 *
 * Resources are the mechanism for agents to share structured data, documents, code,
 * and files. Each resource has explicit permissions and supports both inline content
 * (small data <50KB) and file references (large files via `source_path`).
 *
 * **External API Type**: This type is what agents see when interacting with resources.
 * The internal `creator_agent` field is stripped for security (prevents identity spoofing).
 *
 * **Storage Options:**
 * - **Inline content**: Use `content` parameter for small data (<50KB)
 * - **File reference**: Use `source_path` parameter for large files (>50KB, max 500KB)
 *
 * **Permission Model (v0.2.0 - Deny-by-Default):**
 * - Resources MUST have explicit permissions when created
 * - `read`: Array of agent names or '*' for public read
 * - `write`: Array of agent names (creator always included)
 * - Permissions are immutable after creation (automatically preserved on updates)
 *
 * **Optimistic Locking:**
 * - `etag` changes on every update
 * - Pass back the exact `etag` you received to update
 * - Mismatched `etag` returns ETAG_MISMATCH error
 *
 * @example
 * // API specification shared with public read
 * {
 *   resource_id: "api-spec-v2",
 *   project_id: "api-redesign",
 *   name: "API Specification v2.0",
 *   description: "GraphQL schema and endpoint documentation",
 *   created_at: "2025-01-15T10:50:00Z",
 *   updated_at: "2025-01-15T11:00:00Z",
 *   etag: "a3f2b8c1d4e5f6g7",
 *   mime_type: "application/json",
 *   size_bytes: 15420,
 *   permissions: {
 *     read: ["*"],  // Public read
 *     write: ["architect"]  // Only architect can modify
 *   }
 * }
 *
 * @example
 * // Large file reference (>50KB)
 * {
 *   resource_id: "design-mockups",
 *   project_id: "api-redesign",
 *   name: "UI Design Mockups",
 *   created_at: "2025-01-15T11:10:00Z",
 *   updated_at: "2025-01-15T11:10:00Z",
 *   etag: "h8i9j0k1l2m3n4o5",
 *   source_path: "/Users/alice/Documents/mockups.pdf",
 *   mime_type: "application/pdf",
 *   size_bytes: 250000,
 *   permissions: {
 *     read: ["frontend", "designer"],
 *     write: ["designer"]
 *   }
 * }
 */
export interface ResourceManifest {
  /** Unique resource identifier (alphanumeric, dash, underscore only) */
  resource_id: string;

  /** Project this resource belongs to */
  project_id: string;

  /** Human-readable resource name */
  name: string;

  /** Optional resource description */
  description?: string;

  /** ISO 8601 timestamp when resource was created */
  created_at: string;

  /** ISO 8601 timestamp when resource was last updated */
  updated_at: string;

  /** Optimistic locking tag - pass back exactly what you received */
  etag: string;

  /** MIME type of the resource content */
  mime_type?: string;

  /** Size of resource content in bytes */
  size_bytes?: number;

  /** Absolute path for large file references (v0.4.0+, >50KB) */
  source_path?: string;

  /** Access control permissions (required, deny-by-default) */
  permissions?: {
    /** Agent names with read access, or '*' for public read */
    read: string[];
    /** Agent names with write access (creator always included) */
    write: string[];
  };

  /** Optional custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Internal storage type for resources - includes creator tracking.
 *
 * This extends {@link ResourceManifest} with the `creator_agent` field which is
 * managed internally by the storage layer and NEVER exposed to agents (security:
 * prevents identity spoofing).
 *
 * **Security Design:**
 * - `creator_agent` field is stripped before returning resources to agents
 * - Creator identity is used for authorization checks (deletion, permission updates)
 * - Only the creator can delete resources or update permissions
 *
 * @internal
 */
export interface StoredResourceManifest extends ResourceManifest {
  /** Internal only - agent name that created this resource (never exposed to clients) */
  creator_agent: string;
}

/**
 * System configuration for the Brainstorm MCP server.
 *
 * These settings control storage behavior, cleanup policies, timeouts, and resource
 * limits. Configuration is stored at `<storage_root>/system/config.json` and can be
 * partially overridden via environment variables.
 *
 * **Configuration Hierarchy:**
 * 1. Environment variables (highest priority)
 * 2. config.json values
 * 3. Hardcoded defaults (fallback)
 *
 * **Environment Variables:**
 * - `BRAINSTORM_STORAGE`: Override `storage_root`
 * - `BRAINSTORM_MAX_PAYLOAD_SIZE`: Override `max_resource_size_bytes`
 *
 * @example
 * {
 *   storage_root: "/Users/alice/.brainstorm",
 *   cleanup_interval_seconds: 3600,
 *   message_ttl_seconds: 86400,
 *   heartbeat_timeout_seconds: 300,
 *   lock_stale_timeout_ms: 30000,
 *   max_resource_size_bytes: 512000,
 *   max_long_poll_timeout_seconds: 3600,
 *   default_long_poll_timeout_seconds: 90
 * }
 */
export interface SystemConfig {
  /** Absolute path to storage root directory */
  storage_root: string;

  /** Interval for cleanup operations (expired messages, stale locks) in seconds */
  cleanup_interval_seconds: number;

  /** Time-to-live for messages before automatic deletion (default: 24 hours) */
  message_ttl_seconds: number;

  /** Timeout for agent heartbeat before marking offline (default: 5 minutes) */
  heartbeat_timeout_seconds: number;

  /** Timeout for stale lock detection and removal (default: 30 seconds) */
  lock_stale_timeout_ms: number;

  /** Maximum resource payload size in bytes (default: 500KB, env: BRAINSTORM_MAX_PAYLOAD_SIZE) */
  max_resource_size_bytes: number;

  /** Maximum timeout for long-polling operations (default: 15 minutes) */
  max_long_poll_timeout_seconds: number;

  /** Default timeout for long-polling when not specified (default: 90 seconds) */
  default_long_poll_timeout_seconds: number;
}

/**
 * Client identity for session persistence (v0.8.0+).
 *
 * Each Claude Code instance is assigned a unique `client_id` based on its working
 * directory. This enables session persistence - the same client can reclaim its
 * agent names across restarts and reconnections.
 *
 * **Identity Mapping:**
 * - `client_id` is derived from: `sha256(working_directory).substring(0, 16)`
 * - Same working directory = same client_id = can reclaim agent names
 * - Different working directory = different client_id = new identity
 *
 * **Storage:**
 * - Identity stored at: `<storage_root>/clients/<client_id>/identity.json`
 * - Updated on every `join_project` or `status` call
 *
 * @example
 * {
 *   client_id: "a3f2b8c1d4e5f6g7",
 *   created_at: "2025-01-15T10:00:00Z",
 *   last_seen: "2025-01-15T11:30:00Z"
 * }
 */
export interface ClientIdentity {
  /** Unique client identifier (derived from working directory hash) */
  client_id: string;

  /** ISO 8601 timestamp when this client was first seen */
  created_at: string;

  /** ISO 8601 timestamp of last activity */
  last_seen: string;
}

/**
 * Client membership tracking for multi-project participation (v0.8.0+).
 *
 * Tracks which projects a client has joined and with what agent names. This enables
 * the `status` tool to show all active project memberships for a given working directory.
 *
 * **Use Case:**
 * - Client joins project "api-redesign" as "frontend"
 * - Later, client joins project "ui-components" as "designer"
 * - `status` tool shows both memberships
 *
 * **Storage:**
 * - Memberships stored at: `<storage_root>/clients/<client_id>/memberships.json`
 * - Array of all current project memberships for this client
 *
 * @example
 * {
 *   project_id: "api-redesign",
 *   agent_name: "frontend",
 *   project_name: "API Redesign Sprint",
 *   joined_at: "2025-01-15T10:35:00Z"
 * }
 */
export interface ClientMembership {
  /** Project the client is a member of */
  project_id: string;

  /** Agent name the client uses in this project */
  agent_name: string;

  /** Human-readable project name (for display) */
  project_name: string;

  /** ISO 8601 timestamp when client joined this project */
  joined_at: string;
}
