/**
 * Core type definitions for agent cooperation MCP server
 * Project-centric model: Projects are the primary organizing unit
 */

export interface ProjectMetadata {
  project_id: string;
  name: string;
  description?: string;
  context?: Record<string, unknown>; // goal, timeline, docs, etc.
  created_at: string;
  created_by?: string;
  schema_version: string;
}

export interface ProjectMember {
  project_id: string;
  agent_name: string; // friendly name within project (e.g., "frontend", "backend")
  agent_id: string; // globally unique ID (auto-generated)
  capabilities?: string[];
  labels?: Record<string, string>;
  joined_at: string;
  last_seen: string;
  online: boolean;
}

export interface Message {
  message_id: string;
  project_id: string;
  from_agent: string; // agent_name within project
  to_agent?: string; // agent_name within project (for direct messages)
  broadcast?: boolean; // if true, send to all project members
  type: 'request' | 'response' | 'event';
  payload: unknown;
  created_at: string;
  ttl?: number;
  metadata?: {
    priority?: 'low' | 'normal' | 'high';
    trace_id?: string;
  };
}

export interface ResourceManifest {
  resource_id: string;
  project_id: string;
  name: string;
  description?: string;
  creator_agent: string; // agent_name within project
  created_at: string;
  updated_at: string;
  version: number; // Incremented on every write for optimistic locking
  mime_type?: string;
  size_bytes?: number;
  permissions?: {
    read: string[]; // agent_names or '*'
    write: string[]; // agent_names
  };
  metadata?: Record<string, unknown>;
}

export interface SystemConfig {
  storage_root: string;
  cleanup_interval_seconds: number;
  message_ttl_seconds: number;
  heartbeat_timeout_seconds: number;
  lock_stale_timeout_ms: number;
  max_resource_size_bytes: number;
  max_long_poll_timeout_seconds: number;
  default_long_poll_timeout_seconds: number;
}
