/**
 * File System Storage Abstraction for Multi-Agent Collaboration
 *
 * This module provides a file-system-based storage layer for the Brainstorm MCP server.
 * It implements project-centric storage with support for projects, members, messages,
 * resources, and client session persistence.
 *
 * **Architecture Principles:**
 * - **Atomic Operations**: All writes use temp-file-then-rename pattern for crash safety
 * - **Explicit Locking**: File-based locks prevent race conditions with automatic stale detection
 * - **Security by Default**: All identifiers validated, deny-by-default permissions
 * - **Migration Ready**: All operations designed to map directly to SQL transactions
 *
 * **Storage Layout:**
 * ```
 * <root>/
 *   projects/<project-id>/
 *     metadata.json          - Project configuration
 *     members/               - Agent membership records
 *       <agent-name>.json
 *     messages/              - Per-agent inboxes
 *       <agent-name>/
 *         <timestamp>-<uuid>.json
 *     resources/             - Shared resources
 *       <resource-id>/
 *         manifest.json      - Metadata and permissions
 *         payload/data       - Actual content (optional)
 *   clients/<client-id>/
 *     identity.json          - Client identity (v0.8.0+)
 *     memberships.json       - Multi-project tracking
 *   locks/                   - Concurrency control
 *     <operation>.lock
 *   system/
 *     config.json            - Server configuration
 *     audit.log              - Operation audit trail
 * ```
 *
 * **Security Features:**
 * - Path traversal prevention via whitelist validation
 * - Deny-by-default permission model for resources
 * - Creator tracking for authorization (internal only)
 * - Stale lock detection and automatic cleanup
 *
 * @module storage
 * @see {@link AgentCoopServer} for MCP protocol layer
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { randomUUID, createHash } from 'crypto';
import type {
  ProjectMetadata,
  ProjectMember,
  Message,
  ResourceManifest,
  StoredResourceManifest,
  SystemConfig,
  ClientIdentity,
  ClientMembership
} from './types.js';
import {
  ValidationError,
  NotFoundError,
  PermissionError,
  ConflictError
} from './errors.js';

/**
 * File system storage implementation for Brainstorm MCP server.
 *
 * Provides atomic operations, explicit locking, and security-conscious storage
 * for projects, members, messages, resources, and client sessions. All operations
 * are designed to map directly to database transactions for future migration.
 *
 * **Key Features:**
 * - Atomic writes with fsync for crash safety
 * - File-based locking with stale detection
 * - Path traversal prevention (security)
 * - Optimistic locking via ETags
 * - Session persistence via deterministic client IDs
 *
 * **Thread Safety:**
 * Uses file-based locks acquired via `O_CREAT|O_EXCL` flag. Stale locks (>30s)
 * are automatically detected and removed. All mutations are protected by locks.
 *
 * @example
 * ```typescript
 * const storage = new FileSystemStorage('/Users/alice/.brainstorm');
 * await storage.initialize();
 *
 * // Create a project
 * await storage.createProject({
 *   project_id: 'api-redesign',
 *   name: 'API Redesign Sprint',
 *   created_at: new Date().toISOString(),
 *   created_by: 'architect',
 *   schema_version: '1.0'
 * });
 *
 * // Join as agent
 * await storage.joinProject({
 *   project_id: 'api-redesign',
 *   agent_name: 'frontend',
 *   agent_id: randomUUID(),
 *   client_id: 'client-abc123',
 *   joined_at: new Date().toISOString(),
 *   last_seen: new Date().toISOString(),
 *   online: true
 * });
 * ```
 */
export class FileSystemStorage {
  /** Absolute path to storage root directory */
  private root: string;

  /**
   * Creates a new file system storage instance.
   *
   * @param rootPath - Absolute path to storage root (typically ~/.brainstorm)
   *
   * @example
   * ```typescript
   * const storage = new FileSystemStorage(path.join(os.homedir(), '.brainstorm'));
   * await storage.initialize();
   * ```
   */
  constructor(rootPath: string) {
    this.root = rootPath;
  }

  /**
   * Initializes the storage directory structure and creates default configuration.
   *
   * Creates the root directory and subdirectories for projects, locks, system data,
   * and clients. If no configuration exists, writes default configuration to
   * `<root>/system/config.json`.
   *
   * **Directory Structure Created:**
   * - `<root>/projects/` - Project data
   * - `<root>/locks/` - Concurrency control
   * - `<root>/system/` - Configuration and audit logs
   *
   * **Idempotent:** Safe to call multiple times; existing directories and config are preserved.
   *
   * @returns Promise that resolves when initialization completes
   *
   * @example
   * ```typescript
   * const storage = new FileSystemStorage('/Users/alice/.brainstorm');
   * await storage.initialize();
   * // Storage is now ready for use
   * ```
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
    await fs.mkdir(path.join(this.root, 'projects'), { recursive: true });
    await fs.mkdir(path.join(this.root, 'locks'), { recursive: true });
    await fs.mkdir(path.join(this.root, 'system'), { recursive: true });

    const configPath = path.join(this.root, 'system', 'config.json');
    try {
      await fs.access(configPath);
    } catch {
      const defaultConfig: SystemConfig = {
        storage_root: this.root,
        cleanup_interval_seconds: 3600,
        message_ttl_seconds: 86400,
        heartbeat_timeout_seconds: 300,
        lock_stale_timeout_ms: 30000,
        max_resource_size_bytes: 500 * 1024, // 500KB - realistic for agent context windows
        max_long_poll_timeout_seconds: 3600,
        default_long_poll_timeout_seconds: 300
      };
      await this.atomicWrite(configPath, JSON.stringify(defaultConfig, null, 2));
    }
  }

  // ============================================================================
  // Security: ID validation
  // ============================================================================

  /**
   * Validates that an identifier is safe for use in file paths (security).
   *
   * Prevents path traversal attacks by enforcing whitelist validation:
   * - Only allows alphanumeric, dash, underscore characters
   * - Rejects dots, slashes, backslashes
   * - Length must be 1-256 characters
   *
   * **Security Rationale:**
   * User-controlled identifiers (project_id, agent_name, resource_id) are used to
   * construct file paths. Without validation, an attacker could inject "../" sequences
   * to escape the storage root and access arbitrary files.
   *
   * @param id - Identifier to validate (project_id, agent_name, etc.)
   * @param context - Human-readable field name for error messages
   *
   * @throws {ValidationError} If ID contains unsafe characters, path traversal sequences,
   *   or has invalid length
   *
   * @example
   * ```typescript
   * // Valid IDs
   * this.assertSafeId('api-redesign', 'project_id'); // OK
   * this.assertSafeId('frontend_agent', 'agent_name'); // OK
   *
   * // Invalid IDs (throw ValidationError)
   * this.assertSafeId('../etc/passwd', 'project_id'); // PATH_TRAVERSAL_DETECTED
   * this.assertSafeId('test.project', 'project_id'); // INVALID_ID_FORMAT (dots not allowed)
   * this.assertSafeId('', 'agent_name'); // INVALID_ID_LENGTH
   * ```
   */
  private assertSafeId(id: string, context: string): void {
    // Remove dots to prevent path traversal attacks
    if (!/^[A-Za-z0-9_-]+$/.test(id)) {
      throw new ValidationError(
        `Invalid ${context}: must contain only alphanumeric, dash, underscore`,
        'INVALID_ID_FORMAT',
        { field: context, provided: id }
      );
    }
    // Explicit check for path traversal sequences
    if (id.includes('..') || id.includes('/') || id.includes('\\')) {
      throw new ValidationError(
        `Invalid ${context}: contains path traversal characters`,
        'PATH_TRAVERSAL_DETECTED',
        { field: context, provided: id }
      );
    }
    if (id.length < 1 || id.length > 256) {
      throw new ValidationError(
        `Invalid ${context}: length must be 1-256 characters`,
        'INVALID_ID_LENGTH',
        { field: context, length: id.length, min: 1, max: 256 }
      );
    }
  }

  /**
   * Validates that a file path is safe for resource references (security).
   *
   * Prevents path traversal and ensures file references stay within the user's
   * home directory. Used when agents specify `source_path` for large file resources.
   *
   * **Security Checks:**
   * 1. Rejects path traversal sequences (`..`, `~`)
   * 2. Ensures resolved path is within home directory
   * 3. Verifies file exists and is readable
   * 4. Confirms path points to a regular file (not directory/socket)
   *
   * @param filePath - File path to validate (from agent's source_path parameter)
   * @param context - Human-readable field name for error messages
   *
   * @returns Promise that resolves if path is safe
   * @throws {ValidationError} If path contains unsafe characters, escapes home directory,
   *   file doesn't exist/isn't readable, or path isn't a regular file
   *
   * @example
   * ```typescript
   * // Valid paths
   * await this.assertSafePath('/Users/alice/docs/spec.pdf', 'source_path'); // OK
   *
   * // Invalid paths (throw ValidationError)
   * await this.assertSafePath('../../../etc/passwd', 'source_path'); // PATH_OUTSIDE_HOME
   * await this.assertSafePath('~/../../root/.ssh/id_rsa', 'source_path'); // UNSAFE_PATH
   * await this.assertSafePath('/etc/hosts', 'source_path'); // PATH_OUTSIDE_HOME
   * await this.assertSafePath('/Users/alice/missing.txt', 'source_path'); // FILE_NOT_ACCESSIBLE
   * ```
   */
  private async assertSafePath(filePath: string, context: string): Promise<void> {
    // Resolve to absolute path
    const resolvedPath = path.resolve(filePath);

    // Prevent path traversal sequences
    if (filePath.includes('..') || filePath.includes('~')) {
      throw new ValidationError(
        `Invalid ${context}: path contains unsafe characters`,
        'UNSAFE_PATH',
        { field: context, provided: filePath }
      );
    }

    // Ensure within home directory
    const homedir = os.homedir();
    const relative = path.relative(homedir, resolvedPath);
    // Check if path escapes home directory (starts with ..) or is absolute (different root)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new ValidationError(
        `Invalid ${context}: path must be within home directory`,
        'PATH_OUTSIDE_HOME',
        { field: context, provided: filePath }
      );
    }

    // Verify file exists and is readable
    try {
      await fs.access(resolvedPath, fs.constants.R_OK);
    } catch {
      throw new ValidationError(
        `Invalid ${context}: file does not exist or is not readable`,
        'FILE_NOT_ACCESSIBLE',
        { field: context, provided: filePath }
      );
    }

    // Check it's a regular file (not directory, socket, etc.)
    const stats = await fs.stat(resolvedPath);
    if (!stats.isFile()) {
      throw new ValidationError(
        `Invalid ${context}: path must point to a regular file`,
        'NOT_A_FILE',
        { field: context, provided: filePath }
      );
    }
  }

  // ============================================================================
  // Atomic file operations
  // ============================================================================

  /**
   * Atomically writes content to a file with crash safety guarantees.
   *
   * Uses the standard atomic write pattern:
   * 1. Write to temporary file with unique UUID name
   * 2. Call fsync() to flush to disk
   * 3. Atomically rename temp file to target path
   *
   * This ensures that a crash or power loss during write will never leave
   * a partially-written file. Either the write completes fully or not at all.
   *
   * **Complexity:** O(1) file operations, O(n) for content size
   *
   * @param filePath - Absolute path to target file
   * @param content - String content to write (UTF-8 encoded)
   *
   * @returns Promise that resolves when write completes
   * @throws {Error} If file system operations fail
   *
   * @example
   * ```typescript
   * await this.atomicWrite(
   *   '/Users/alice/.brainstorm/projects/api-redesign/metadata.json',
   *   JSON.stringify(projectMetadata, null, 2)
   * );
   * ```
   */
  private async atomicWrite(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    const tempPath = `${filePath}.${randomUUID()}.tmp`;
    await fs.writeFile(tempPath, content, 'utf-8');

    const handle = await fs.open(tempPath, 'r');
    await handle.sync();
    await handle.close();

    await fs.rename(tempPath, filePath);
  }

  // ============================================================================
  // Locking
  // ============================================================================

  /**
   * Acquires an exclusive file-based lock with automatic stale lock detection.
   *
   * Uses the `O_CREAT|O_EXCL` flag (`wx` mode) to atomically create lock files,
   * preventing race conditions. Supports automatic stale lock removal (locks older
   * than 30 seconds) and configurable timeout for lock acquisition.
   *
   * **Locking Strategy:**
   * - Lock files stored in `<root>/locks/<lockName>.lock`
   * - Contains metadata: acquired_at, pid, reason, lock_name
   * - Stale locks (>30s) automatically removed with warning log
   * - Returns unlock function for cleanup
   *
   * **When to Use:**
   * - Member status updates (prevent concurrent heartbeat conflicts)
   * - Message inbox modifications (mark as processed)
   * - Audit log appends (serialize writes)
   * - Project member joins (smart name reclaiming)
   *
   * **Complexity:** O(1) for successful acquisition, O(k) for k retries during contention
   *
   * @param lockName - Unique lock identifier (validated via assertSafeId)
   * @param options - Optional configuration
   * @param options.timeout_ms - Maximum wait time in milliseconds (default: 60000ms / 60s)
   * @param options.reason - Human-readable reason for debugging (included in lock metadata)
   *
   * @returns Promise resolving to unlock function (call to release lock)
   * @throws {ValidationError} If lock acquisition times out or lockName is invalid
   *
   * @example
   * ```typescript
   * const unlock = await this.acquireLock('member-api-redesign-frontend', {
   *   reason: 'heartbeat-update-online',
   *   timeout_ms: 5000
   * });
   *
   * try {
   *   // Perform critical section work
   *   const member = await this.getProjectMember(projectId, agentName);
   *   member.online = true;
   *   member.last_seen = new Date().toISOString();
   *   await this.atomicWrite(memberPath, JSON.stringify(member, null, 2));
   * } finally {
   *   await unlock(); // Always release lock
   * }
   * ```
   */
  async acquireLock(
    lockName: string,
    options?: {
      timeout_ms?: number;
      reason?: string;
    }
  ): Promise<() => Promise<void>> {
    this.assertSafeId(lockName, 'lock_name');
    const lockPath = path.join(this.root, 'locks', `${lockName}.lock`);
    const config = await this.getSystemConfig();
    const staleTimeout = config?.lock_stale_timeout_ms || 30000;
    const maxTimeout = options?.timeout_ms || 60000; // Default 60s max wait
    const startTime = Date.now();

    const lockMetadata = {
      acquired_at: new Date().toISOString(),
      pid: process.pid,
      reason: options?.reason || 'operation',
      lock_name: lockName
    };

    while (true) {
      // Check if we've exceeded max wait time
      if (Date.now() - startTime > maxTimeout) {
        throw new ValidationError(
          `Lock acquisition timeout after ${maxTimeout}ms for lock: ${lockName}`,
          'LOCK_TIMEOUT',
          { lock_name: lockName, timeout_ms: maxTimeout }
        );
      }

      try {
        await fs.mkdir(path.dirname(lockPath), { recursive: true });
        const handle = await fs.open(lockPath, 'wx');
        await handle.writeFile(JSON.stringify(lockMetadata, null, 2), 'utf-8');
        await handle.close();

        // Return unlock function with metadata cleanup
        return async () => {
          try {
            await fs.unlink(lockPath);
          } catch (err: any) {
            // Lock already released or stale - this is acceptable
            if (err.code !== 'ENOENT') {
              console.error(`Warning: Failed to release lock ${lockName}:`, err.message);
            }
          }
        };
      } catch (err: any) {
        if (err.code === 'EEXIST') {
          try {
            const stats = await fs.stat(lockPath);
            const age = Date.now() - stats.mtimeMs;

            // Check for stale lock
            if (age > staleTimeout) {
              // Log stale lock removal
              try {
                const staleContent = await fs.readFile(lockPath, 'utf-8');
                const staleData = JSON.parse(staleContent);
                console.warn(
                  `Removing stale lock: ${lockName} (age: ${age}ms, owner PID: ${staleData.pid})`
                );
              } catch {
                console.warn(`Removing stale lock: ${lockName} (age: ${age}ms)`);
              }

              await fs.unlink(lockPath);
              continue; // Retry immediately
            }
          } catch (statErr: any) {
            // Lock disappeared between EEXIST and stat - retry immediately
            if (statErr.code === 'ENOENT') {
              continue;
            }
            throw statErr;
          }

          // Lock is valid and held by another process - wait and retry
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          throw err;
        }
      }
    }
  }

  // ============================================================================
  // System operations
  // ============================================================================

  /**
   * Retrieves the system configuration from disk.
   *
   * Reads `<root>/system/config.json` containing server-wide settings like
   * message TTL, heartbeat timeout, lock timeouts, and resource size limits.
   *
   * @returns Promise resolving to SystemConfig or null if config doesn't exist
   *
   * @example
   * ```typescript
   * const config = await this.getSystemConfig();
   * const maxSize = config?.max_resource_size_bytes || 512000;
   * ```
   */
  async getSystemConfig(): Promise<SystemConfig | null> {
    try {
      const content = await fs.readFile(
        path.join(this.root, 'system', 'config.json'),
        'utf-8'
      );
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Appends an entry to the append-only audit log with lock serialization.
   *
   * All server operations (project creation, message sending, resource storage, etc.)
   * are logged to `<root>/system/audit.log` for accountability and debugging. The log
   * is append-only (never modified or deleted) and protected by a lock to prevent
   * concurrent write conflicts.
   *
   * **Log Format:** One JSON object per line (newline-delimited JSON)
   *
   * @param entry - Audit log entry
   * @param entry.timestamp - ISO 8601 timestamp of the operation
   * @param entry.actor - Agent performing the operation (or 'system')
   * @param entry.action - Operation name (e.g., 'create_project', 'send_message')
   * @param entry.target - Optional target identifier (project_id, resource_id, etc.)
   * @param entry.details - Optional additional context
   *
   * @returns Promise that resolves when log entry is written
   *
   * @example
   * ```typescript
   * await this.auditLog({
   *   timestamp: new Date().toISOString(),
   *   actor: 'frontend',
   *   action: 'store_resource',
   *   target: 'api-spec-v2',
   *   details: { project_id: 'api-redesign', size_bytes: 15420 }
   * });
   * ```
   */
  async auditLog(entry: {
    timestamp: string;
    actor: string;
    action: string;
    target?: string;
    details?: Record<string, unknown>;
  }): Promise<void> {
    const unlock = await this.acquireLock('audit-log', {
      reason: `audit-log-append-${entry.action}`,
      timeout_ms: 10000
    });
    try {
      const logPath = path.join(this.root, 'system', 'audit.log');
      const line = JSON.stringify(entry) + '\n';
      await fs.appendFile(logPath, line, 'utf-8');
    } finally {
      await unlock();
    }
  }

  // ============================================================================
  // Project operations
  // ============================================================================

  /**
   * Creates a new project with atomic check-and-create semantics.
   *
   * Uses `fs.mkdir(path, { recursive: false })` to atomically verify that the project
   * doesn't exist and create it. This prevents race conditions where two agents try to
   * create the same project simultaneously.
   *
   * **Directory Structure Created:**
   * ```
   * <root>/projects/<project_id>/
   *   metadata.json       - Project configuration
   *   members/            - Agent membership records
   *   messages/           - Per-agent inboxes
   *   resources/          - Shared resources
   * ```
   *
   * **Race Condition Safety:**
   * The `recursive: false` flag ensures mkdir fails with EEXIST if the directory already
   * exists, making this operation atomic. No TOCTOU (Time-of-Check-Time-of-Use) vulnerability.
   *
   * @param metadata - Project metadata (must include project_id, name, created_at, schema_version)
   *
   * @returns Promise that resolves when project is created
   * @throws {ValidationError} If project_id contains unsafe characters
   * @throws {ConflictError} If project already exists (PROJECT_EXISTS)
   *
   * @example
   * ```typescript
   * await this.createProject({
   *   project_id: 'api-redesign',
   *   name: 'API Redesign Sprint',
   *   description: 'Modernize REST API to GraphQL',
   *   created_at: new Date().toISOString(),
   *   created_by: 'architect',
   *   schema_version: '1.0'
   * });
   * ```
   */
  async createProject(metadata: ProjectMetadata): Promise<void> {
    this.assertSafeId(metadata.project_id, 'project_id');

    const projectDir = path.join(this.root, 'projects', metadata.project_id);

    // Atomic check-and-create: fails if project already exists
    try {
      await fs.mkdir(projectDir, { recursive: false });
    } catch (err: any) {
      if (err.code === 'EEXIST') {
        throw new ConflictError(
          'Project already exists',
          'PROJECT_EXISTS',
          { project_id: metadata.project_id }
        );
      }
      throw err;
    }

    // Create subdirectories
    await fs.mkdir(path.join(projectDir, 'members'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'messages'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'resources'), { recursive: true });

    const metadataPath = path.join(projectDir, 'metadata.json');
    await this.atomicWrite(metadataPath, JSON.stringify(metadata, null, 2));
  }

  async getProjectMetadata(projectId: string): Promise<ProjectMetadata | null> {
    this.assertSafeId(projectId, 'project_id');

    try {
      const content = await fs.readFile(
        path.join(this.root, 'projects', projectId, 'metadata.json'),
        'utf-8'
      );
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async listProjects(offset?: number, limit?: number, includeArchived?: boolean): Promise<ProjectMetadata[]> {
    const projectsDir = path.join(this.root, 'projects');

    try {
      const entries = await fs.readdir(projectsDir, { withFileTypes: true });
      const projects: ProjectMetadata[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const metadata = await this.getProjectMetadata(entry.name);
          if (metadata) {
            // Filter archived projects by default (v0.9.0+)
            if (includeArchived || !metadata.archived) {
              projects.push(metadata);
            }
          }
        }
      }

      // Apply pagination
      const start = offset || 0;
      const end = limit ? start + limit : undefined;
      return projects.slice(start, end);
    } catch {
      return [];
    }
  }

  async deleteProject(projectId: string, agentName: string): Promise<void> {
    this.assertSafeId(projectId, 'project_id');
    this.assertSafeId(agentName, 'agent_name');

    const metadata = await this.getProjectMetadata(projectId);
    if (!metadata) {
      throw new NotFoundError(
        'Project not found',
        'PROJECT_NOT_FOUND',
        { project_id: projectId }
      );
    }

    // Only the creator can delete the project
    if (metadata.created_by && metadata.created_by !== agentName) {
      throw new PermissionError(
        'Access denied: only the project creator can delete it',
        'DELETE_PERMISSION_DENIED',
        { project_id: projectId, creator: metadata.created_by, requester: agentName }
      );
    }

    // If no creator was set, prevent deletion (safety measure)
    if (!metadata.created_by) {
      throw new PermissionError(
        'Access denied: project has no creator',
        'NO_CREATOR_DEFINED',
        { project_id: projectId }
      );
    }

    const projectDir = path.join(this.root, 'projects', projectId);

    // Recursively delete the project directory
    try {
      await fs.rm(projectDir, { recursive: true, force: true });
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // Already deleted, that's okay
        return;
      }
      throw err;
    }
  }

  // ============================================================================
  // Project member operations
  // ============================================================================

  /**
   * Adds or updates a project member with smart name reclaiming (v0.8.0+).
   *
   * Handles agent membership with support for session persistence via client_id.
   * Implements sophisticated name reclaiming logic that allows the same client to
   * reclaim their agent name across reconnections while preventing name stealing
   * by different clients.
   *
   * **Smart Name Reclaiming Logic (v0.8.0):**
   * 1. **Same client_id**: Reclaim name, preserve agent_id and joined_at
   * 2. **Different client_id**: Reject (name truly taken)
   * 3. **Legacy member (no client_id)**: Allow claim, backfill client_id, preserve identity
   * 4. **Both lack client_id**: Reject (backward compatible)
   *
   * **Locking:**
   * Acquires lock `join_<project_id>_<agent_name>` to prevent race conditions where
   * two clients try to claim the same name simultaneously.
   *
   * **Complexity:** O(1) with lock acquisition overhead (see acquireLock)
   *
   * @param member - Project member record to create/update
   *
   * @returns Promise that resolves when member is successfully joined
   * @throws {ValidationError} If project_id or agent_name contains unsafe characters
   * @throws {NotFoundError} If project doesn't exist (PROJECT_NOT_FOUND)
   * @throws {ConflictError} If agent name is taken by another client (AGENT_NAME_TAKEN)
   *
   * @example
   * ```typescript
   * // First join
   * await this.joinProject({
   *   project_id: 'api-redesign',
   *   agent_name: 'frontend',
   *   agent_id: randomUUID(),
   *   client_id: 'client-abc123',
   *   joined_at: new Date().toISOString(),
   *   last_seen: new Date().toISOString(),
   *   online: true
   * });
   *
   * // Reconnect with same client_id - reclaims name
   * await this.joinProject({
   *   project_id: 'api-redesign',
   *   agent_name: 'frontend', // Same name
   *   agent_id: randomUUID(), // Different UUID
   *   client_id: 'client-abc123', // SAME client_id
   *   joined_at: new Date().toISOString(), // Will be overwritten with original
   *   last_seen: new Date().toISOString(),
   *   online: true
   * });
   * // Result: Original agent_id and joined_at are preserved
   * ```
   */
  async joinProject(member: ProjectMember): Promise<void> {
    this.assertSafeId(member.project_id, 'project_id');
    this.assertSafeId(member.agent_name, 'agent_name');
    if (member.client_id) {
      this.assertSafeId(member.client_id, 'client_id');
    }

    // Check if project exists
    const project = await this.getProjectMetadata(member.project_id);
    if (!project) {
      throw new NotFoundError(
        'Project not found',
        'PROJECT_NOT_FOUND',
        { project_id: member.project_id }
      );
    }

    // Lock for the entire check-and-claim operation to prevent race conditions
    const lockKey = `join_${member.project_id}_${member.agent_name}`;
    const unlock = await this.acquireLock(lockKey, {
      reason: `join-project-${member.agent_name}`,
      timeout_ms: 10000
    });

    try {
      // Check if this client is already a member under a different name
      if (member.client_id) {
        const allMembers = await this.listProjectMembers(member.project_id);
        const existingClientMembership = allMembers.find(
          m => m.client_id === member.client_id && m.agent_name !== member.agent_name
        );

        if (existingClientMembership) {
          throw new ConflictError(
            `This client is already a member of the project as '${existingClientMembership.agent_name}'. Please leave that membership before joining with a different name.`,
            'CLIENT_ALREADY_MEMBER',
            {
              project_id: member.project_id,
              existing_agent_name: existingClientMembership.agent_name,
              requested_agent_name: member.agent_name,
              client_id: member.client_id
            }
          );
        }
      }

      // Check if agent name is already taken
      const existing = await this.getProjectMember(member.project_id, member.agent_name);

    if (existing) {
      // Smart reclaim logic: allow same client to reclaim their name
      if (member.client_id && existing.client_id === member.client_id) {
        // Same client reclaiming their name - preserve identity
        member.joined_at = existing.joined_at; // Keep original join date
        member.agent_id = existing.agent_id;    // Keep same agent_id
        // Fall through to write updated member record
      } else if (existing.client_id && member.client_id && existing.client_id !== member.client_id) {
        // Different client - name truly taken
        throw new ConflictError(
          'Agent name already taken in this project by another client',
          'AGENT_NAME_TAKEN',
          { project_id: member.project_id, agent_name: member.agent_name }
        );
      } else if (!existing.client_id && !member.client_id) {
        // Legacy: Both lack client_id - reject (backward compatible)
        throw new ConflictError(
          'Agent name already taken in this project',
          'AGENT_NAME_TAKEN',
          { project_id: member.project_id, agent_name: member.agent_name }
        );
      } else if (!existing.client_id && member.client_id) {
        // Legacy member (no client_id) - FREE TO CLAIM
        // Preserve identity continuity from the legacy member
        member.joined_at = existing.joined_at; // Keep original join date
        member.agent_id = existing.agent_id;    // Keep same agent_id
        // Fall through to write updated member record with backfilled client_id
      } else {
        // Edge case: new member lacks client_id (shouldn't happen in v0.8.0+)
        throw new ConflictError(
          'Agent name already taken in this project',
          'AGENT_NAME_TAKEN',
          { project_id: member.project_id, agent_name: member.agent_name }
        );
      }
    }

    const memberPath = path.join(
      this.root,
      'projects',
      member.project_id,
      'members',
      `${member.agent_name}.json`
    );

      // Create member's inbox directory
      await fs.mkdir(
        path.join(this.root, 'projects', member.project_id, 'messages', member.agent_name),
        { recursive: true }
      );

      await this.atomicWrite(memberPath, JSON.stringify(member, null, 2));
    } finally {
      await unlock();
    }
  }

  async getProjectMember(projectId: string, agentName: string): Promise<ProjectMember | null> {
    this.assertSafeId(projectId, 'project_id');
    this.assertSafeId(agentName, 'agent_name');

    try {
      const content = await fs.readFile(
        path.join(this.root, 'projects', projectId, 'members', `${agentName}.json`),
        'utf-8'
      );
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async listProjectMembers(projectId: string, offset?: number, limit?: number): Promise<ProjectMember[]> {
    this.assertSafeId(projectId, 'project_id');

    const membersDir = path.join(this.root, 'projects', projectId, 'members');

    try {
      const files = await fs.readdir(membersDir);
      const members: ProjectMember[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const agentName = file.slice(0, -5);
          const member = await this.getProjectMember(projectId, agentName);
          if (member) {
            members.push(member);
          }
        }
      }

      // Apply pagination
      const start = offset || 0;
      const end = limit ? start + limit : undefined;
      return members.slice(start, end);
    } catch {
      return [];
    }
  }

  async updateMemberHeartbeat(projectId: string, agentName: string, online: boolean): Promise<void> {
    this.assertSafeId(projectId, 'project_id');
    this.assertSafeId(agentName, 'agent_name');

    // Acquire lock to prevent race condition with concurrent heartbeats
    const unlock = await this.acquireLock(`member-${projectId}-${agentName}`, {
      reason: `heartbeat-update-${online ? 'online' : 'offline'}`,
      timeout_ms: 5000
    });
    try {
      const member = await this.getProjectMember(projectId, agentName);
      if (!member) {
        throw new NotFoundError(
          'Member not found',
          'MEMBER_NOT_FOUND',
          { project_id: projectId, agent_name: agentName }
        );
      }

      member.last_seen = new Date().toISOString();
      member.online = online;

      const memberPath = path.join(
        this.root,
        'projects',
        projectId,
        'members',
        `${agentName}.json`
      );

      await this.atomicWrite(memberPath, JSON.stringify(member, null, 2));
    } finally {
      await unlock();
    }
  }

  /**
   * Transfers coordinator role from one agent to another atomically (v0.11.0).
   *
   * Allows the current coordinator to hand over their coordinator role to another
   * project member. The operation is atomic and uses locking to prevent race conditions.
   *
   * **Authorization:**
   * - Only the current coordinator can initiate a handover
   * - Target agent must already be a member of the project
   * - Target agent must not already be the coordinator
   *
   * **Atomic Operation:**
   * - Updates `metadata.coordinator_agent` from fromAgent to toAgent
   * - Single metadata file write under a project-wide lock
   *
   * @param projectId - Project containing both agents
   * @param fromAgent - Current coordinator agent name
   * @param toAgent - Target agent name to become new coordinator
   *
   * @returns Promise that resolves when role transfer is complete
   * @throws {ValidationError} If identifiers contain unsafe characters
   * @throws {NotFoundError} If project or either agent doesn't exist
   * @throws {PermissionError} If fromAgent is not the current coordinator
   * @throws {ConflictError} If toAgent is already a coordinator
   *
   * @example
   * ```typescript
   * await this.handoverCoordinator(
   *   'api-redesign',
   *   'architect',  // Current coordinator
   *   'frontend'    // New coordinator
   * );
   * ```
   */
  async handoverCoordinator(projectId: string, fromAgent: string, toAgent: string): Promise<void> {
    this.assertSafeId(projectId, 'project_id');
    this.assertSafeId(fromAgent, 'from_agent');
    this.assertSafeId(toAgent, 'to_agent');

    // Verify project exists and get metadata
    const metadata = await this.getProjectMetadata(projectId);
    if (!metadata) {
      throw new NotFoundError(
        'Project not found',
        'PROJECT_NOT_FOUND',
        { project_id: projectId }
      );
    }

    // Acquire project-wide lock for coordinator handover to ensure atomicity
    const lockKey = `coordinator-handover_${projectId}`;
    const unlock = await this.acquireLock(lockKey, {
      reason: `handover-coordinator-${fromAgent}-to-${toAgent}`,
      timeout_ms: 10000
    });

    try {
      // Verify both agents exist as project members
      const fromMember = await this.getProjectMember(projectId, fromAgent);
      if (!fromMember) {
        throw new NotFoundError(
          'Source agent not found in project',
          'FROM_AGENT_NOT_FOUND',
          { project_id: projectId, agent_name: fromAgent }
        );
      }

      const toMember = await this.getProjectMember(projectId, toAgent);
      if (!toMember) {
        throw new NotFoundError(
          'Target agent not found in project',
          'TO_AGENT_NOT_FOUND',
          { project_id: projectId, agent_name: toAgent }
        );
      }

      // Verify fromAgent is current coordinator (check metadata)
      if (metadata.coordinator_agent !== fromAgent) {
        throw new PermissionError(
          'Access denied: only the current coordinator can hand over the role',
          'NOT_COORDINATOR',
          { project_id: projectId, requester: fromAgent, current_coordinator: metadata.coordinator_agent || 'none' }
        );
      }

      // Verify toAgent is not already coordinator (safety check - should be redundant)
      if (metadata.coordinator_agent === toAgent) {
        throw new ConflictError(
          'Target agent is already the coordinator',
          'ALREADY_COORDINATOR',
          { project_id: projectId, agent_name: toAgent }
        );
      }

      // Transfer coordinator role in metadata
      metadata.coordinator_agent = toAgent;

      // Write updated metadata
      const metadataPath = path.join(this.root, 'projects', projectId, 'metadata.json');
      await this.atomicWrite(metadataPath, JSON.stringify(metadata, null, 2));
    } finally {
      await unlock();
    }
  }

  /**
   * Ensures project has a coordinator by backfilling to metadata if missing (v0.11.0 migration).
   *
   * This migration provides backward compatibility for projects created before v0.11.0,
   * where coordinators were not stored in project metadata. Safe to call repeatedly - the
   * operation is idempotent and only assigns coordinator if all conditions are met.
   *
   * **Migration Conditions:**
   * - Project has a created_by field (identifies creator)
   * - Project metadata.coordinator_agent is not yet set
   *
   * **When Called:**
   * Automatically invoked by these tool handlers on first project access:
   * - get_project_info (most common read operation)
   * - join_project (when any agent joins)
   * - send_message (when any agent sends messages)
   * - receive_messages (when any agent checks inbox)
   *
   * **Performance:**
   * - Fast existence check that short-circuits if coordinator exists
   * - No lock required (writes are idempotent)
   * - Minimal overhead for all projects (just metadata read + field check)
   *
   * @param projectId - Project to check and migrate
   *
   * @returns Promise that resolves when migration check completes (no return value)
   * @throws {ValidationError} If projectId contains unsafe characters
   *
   * @example
   * ```typescript
   * // Called automatically from tool handlers
   * await this.storage.ensureProjectHasCoordinator('api-redesign');
   *
   * // Migration scenarios:
   * // 1. Project has coordinator_agent in metadata → no-op (short circuit)
   * // 2. Project has no creator → no-op (safety - no action)
   * // 3. Project has creator but no coordinator_agent → backfill to metadata
   * ```
   */
  async ensureProjectHasCoordinator(projectId: string): Promise<void> {
    this.assertSafeId(projectId, 'project_id');

    const metadata = await this.getProjectMetadata(projectId);
    if (!metadata || !metadata.created_by) return; // No creator = nothing to migrate

    // Check if coordinator already set in metadata (fast path - most common case post-migration)
    if (metadata.coordinator_agent) return; // Already has coordinator - no migration needed

    // Backfill coordinator to metadata (set to creator)
    metadata.coordinator_agent = metadata.created_by;

    const metadataPath = path.join(this.root, 'projects', projectId, 'metadata.json');
    await this.atomicWrite(metadataPath, JSON.stringify(metadata, null, 2));
  }

  // ============================================================================
  // Messaging operations
  // ============================================================================

  async sendMessage(message: Message): Promise<void> {
    this.assertSafeId(message.project_id, 'project_id');
    this.assertSafeId(message.from_agent, 'from_agent');

    // Verify sender exists
    const sender = await this.getProjectMember(message.project_id, message.from_agent);
    if (!sender) {
      throw new NotFoundError(
        'Sender not found in project',
        'SENDER_NOT_FOUND',
        { project_id: message.project_id, agent_name: message.from_agent }
      );
    }

    if (message.broadcast) {
      // Send to all project members except sender
      const members = await this.listProjectMembers(message.project_id);
      const results = await Promise.allSettled(
        members
          .filter(m => m.agent_name !== message.from_agent)
          .map(m => this.deliverMessageToInbox(message, m.agent_name))
      );

      // Check if any deliveries failed
      const failures = results.filter(r => r.status === 'rejected');
      if (failures.length > 0) {
        const failedAgents = members
          .filter((_, i) => results[i].status === 'rejected')
          .map(m => m.agent_name);
        throw new ValidationError(
          `Failed to deliver broadcast to ${failures.length} recipient(s)`,
          'BROADCAST_PARTIAL_FAILURE',
          { failed_recipients: failedAgents, total_recipients: members.length - 1 }
        );
      }
    } else if (message.to_agent) {
      this.assertSafeId(message.to_agent, 'to_agent');

      // Verify recipient exists
      const recipient = await this.getProjectMember(message.project_id, message.to_agent);
      if (!recipient) {
        throw new NotFoundError(
          'Recipient not found in project',
          'RECIPIENT_NOT_FOUND',
          { project_id: message.project_id, agent_name: message.to_agent }
        );
      }

      await this.deliverMessageToInbox(message, message.to_agent);
    } else {
      throw new ValidationError(
        'Message must have either to_agent or broadcast=true',
        'INVALID_MESSAGE_TARGET',
        { project_id: message.project_id, from_agent: message.from_agent }
      );
    }
  }

  private async deliverMessageToInbox(message: Message, recipientName: string): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}-${message.message_id}.json`;
    const inboxPath = path.join(
      this.root,
      'projects',
      message.project_id,
      'messages',
      recipientName,
      filename
    );

    await this.atomicWrite(inboxPath, JSON.stringify(message, null, 2));
  }

  async getAgentInbox(projectId: string, agentName: string, offset?: number, limit?: number): Promise<Message[]> {
    this.assertSafeId(projectId, 'project_id');
    this.assertSafeId(agentName, 'agent_name');

    // Acquire lock to prevent race condition with concurrent inbox reads (v0.12.0 fix)
    const unlock = await this.acquireLock(`inbox-${projectId}-${agentName}`, {
      reason: `get-agent-inbox-read`,
      timeout_ms: 5000
    });

    try {
      const inboxDir = path.join(this.root, 'projects', projectId, 'messages', agentName);
      const archiveDir = path.join(inboxDir, 'archive');

      try {
        const files = await fs.readdir(inboxDir);
        // Filter out archive directory from file list
        const messageFiles = files.filter(f => f !== 'archive');
        messageFiles.sort(); // Lexicographic sort (timestamp-based filenames)

        // Apply pagination to file list before reading
        const start = offset || 0;
        const end = limit ? start + limit : undefined;
        const messagesToRead = messageFiles.slice(start, end);
        const messages: Message[] = [];

        const config = await this.getSystemConfig();
        const ttl = config?.message_ttl_seconds || 86400;
        const now = Date.now();

        // Ensure archive directory exists
        await fs.mkdir(archiveDir, { recursive: true });

        for (const file of messagesToRead) {
          try {
            const filePath = path.join(inboxDir, file);
            const content = await fs.readFile(filePath, 'utf-8');
            const message = JSON.parse(content) as Message;

            // Filter out expired messages
            const messageAge = now - new Date(message.created_at).getTime();
            if (messageAge < ttl * 1000) {
              messages.push(message);

              // Auto-acknowledge: move message to archive after successful read (v0.12.0)
              try {
                const archivePath = path.join(archiveDir, file);
                await fs.rename(filePath, archivePath);
              } catch (archiveErr: any) {
                // If move fails (e.g., already moved), continue - message was still read
                if (archiveErr.code !== 'ENOENT') {
                  console.error(`Warning: Failed to archive message ${file}:`, archiveErr.message);
                }
              }
            }
          } catch {
            // Skip malformed messages
          }
        }

        return messages;
      } catch {
        return [];
      }
    } finally {
      await unlock();
    }
  }

  async markMessageProcessed(projectId: string, agentName: string, messageId: string): Promise<void> {
    this.assertSafeId(projectId, 'project_id');
    this.assertSafeId(agentName, 'agent_name');
    this.assertSafeId(messageId, 'message_id');

    const unlock = await this.acquireLock(`agent-${projectId}-${agentName}-inbox`, {
      reason: `mark-message-processed-${messageId.slice(0, 8)}`,
      timeout_ms: 5000
    });
    try {
      const inboxDir = path.join(this.root, 'projects', projectId, 'messages', agentName);
      const files = await fs.readdir(inboxDir);

      // Diagnostic logging for debugging duplicate message issue
      console.error(`[markMessageProcessed] Looking for messageId: ${messageId}`);
      console.error(`[markMessageProcessed] Inbox directory: ${inboxDir}`);
      console.error(`[markMessageProcessed] Files in inbox (${files.length}):`, files);

      for (const file of files) {
        if (file.includes(messageId)) {
          const messagePath = path.join(inboxDir, file);
          console.error(`[markMessageProcessed] MATCH FOUND: ${file} - Deleting...`);
          try {
            await fs.unlink(messagePath);
            console.error(`[markMessageProcessed] Successfully deleted: ${file}`);
            return;
          } catch (err: any) {
            if (err.code === 'ENOENT') {
              console.error(`[markMessageProcessed] File already deleted: ${file}`);
              return; // Already deleted
            }
            console.error(`[markMessageProcessed] Error deleting file: ${err.message}`);
            throw err;
          }
        }
      }

      console.error(`[markMessageProcessed] WARNING: No matching file found for messageId: ${messageId}`);
    } finally {
      await unlock();
    }
  }

  // ============================================================================
  // Resource operations
  // ============================================================================

  private getJSONDepth(obj: any, current = 1, max = 100): number {
    if (current > max) return current;
    if (typeof obj !== 'object' || obj === null) return current;

    let maxDepth = current;
    for (const key in obj) {
      const depth = this.getJSONDepth(obj[key], current + 1, max);
      maxDepth = Math.max(maxDepth, depth);
    }
    return maxDepth;
  }

  private async getResourceManifestOnly(projectId: string, resourceId: string): Promise<StoredResourceManifest | null> {
    try {
      const manifestPath = path.join(
        this.root,
        'projects',
        projectId,
        'resources',
        resourceId,
        'manifest.json'
      );
      const content = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content) as StoredResourceManifest;

      // Backwards compatibility: migrate from version to etag
      if (!manifest.etag) {
        manifest.etag = createHash('sha256')
          .update(`${Date.now()}-${randomUUID()}`)
          .digest('hex')
          .substring(0, 16);
        // Remove old version field
        delete (manifest as any).version;
        // Save the updated manifest back to disk
        await this.atomicWrite(manifestPath, JSON.stringify(manifest, null, 2));
      }

      return manifest;
    } catch {
      return null;
    }
  }

  /**
   * Stores or updates a resource with permission checks, optimistic locking, and creator tracking.
   *
   * Handles the most complex storage operation in Brainstorm, implementing:
   * - Deny-by-default permissions (v0.2.0)
   * - Optimistic locking via ETags (prevents concurrent modification conflicts)
   * - Creator-only permission updates (security)
   * - Auto-granted creator write access (legacy backfill)
   * - File references for large files (v0.4.0, >50KB)
   *
   * **Storage Options:**
   * - **Inline content**: Pass `payload` parameter for small data (<50KB)
   * - **File reference**: Pass `localPath` parameter for large files (stored as source_path)
   *
   * **Permission Model (v0.2.0):**
   * - New resources: Default to public read ('*'), creator-only write
   * - Updates: Only agents with write permission can modify
   * - Creator: Auto-granted write access even if not in permissions array
   * - Permission updates: Only creator can change permissions
   *
   * **Optimistic Locking:**
   * - Pass back exact `etag` from getResource when updating
   * - If etag mismatch, throws ETAG_MISMATCH (resource was modified by another agent)
   *
   * **Creator Tracking:**
   * - `creator_agent` stored internally (NEVER exposed to agents for security)
   * - Used for authorization (only creator can update permissions)
   * - Legacy resources without creator: backfilled on first update
   *
   * @param manifest - Resource manifest (external type, creator_agent field forbidden)
   * @param agentName - Agent performing this operation (validated against permissions)
   * @param payload - Optional inline content (string or Buffer, <50KB limit)
   * @param localPath - Optional file path for large files (>50KB, validated via assertSafePath)
   *
   * @returns Promise that resolves when resource is stored
   * @throws {ValidationError} If resource_id unsafe, payload >50KB, JSON depth >100, or conflicting parameters
   * @throws {NotFoundError} If project or agent doesn't exist
   * @throws {PermissionError} If agent lacks write permission
   * @throws {ConflictError} If etag mismatch (resource modified by another agent)
   *
   * @example
   * ```typescript
   * // Store small inline resource
   * await this.storeResource(
   *   {
   *     project_id: 'api-redesign',
   *     resource_id: 'api-spec-v2',
   *     name: 'API Specification v2.0',
   *     created_at: new Date().toISOString(),
   *     updated_at: new Date().toISOString(),
   *     etag: '', // Empty for new resource
   *     permissions: {
   *       read: ['*'], // Public read
   *       write: ['architect'] // Creator only
   *     }
   *   },
   *   'architect', // Operating agent
   *   JSON.stringify({ endpoints: [...] }) // Inline content
   * );
   *
   * // Store large file reference
   * await this.storeResource(
   *   {
   *     project_id: 'api-redesign',
   *     resource_id: 'design-mockups',
   *     name: 'UI Design Mockups',
   *     created_at: new Date().toISOString(),
   *     updated_at: new Date().toISOString(),
   *     etag: '',
   *     permissions: { read: ['frontend', 'designer'], write: ['designer'] }
   *   },
   *   'designer',
   *   undefined, // No inline payload
   *   '/Users/alice/Documents/mockups.pdf' // File reference
   * );
   *
   * // Update existing resource (requires etag)
   * const existing = await this.getResource('api-redesign', 'api-spec-v2', 'architect');
   * await this.storeResource(
   *   {
   *     ...existing.manifest,
   *     etag: existing.manifest.etag, // MUST match current etag
   *     updated_at: new Date().toISOString()
   *   },
   *   'architect',
   *   JSON.stringify({ endpoints: [...] }) // Updated content
   * );
   * ```
   */
  async storeResource(manifest: ResourceManifest, agentName: string, payload?: string | Buffer, localPath?: string): Promise<void> {
    this.assertSafeId(manifest.project_id, 'project_id');
    this.assertSafeId(manifest.resource_id, 'resource_id');

    // Security: Agents must NEVER include creator_agent - it's internal only
    if ('creator_agent' in manifest) {
      throw new ValidationError(
        'Cannot include creator_agent field. This is an internal field managed by the storage layer.',
        'INVALID_PARAMETER',
        { field: 'creator_agent' }
      );
    }

    // Mutual exclusion: cannot specify both content and source_path
    if (payload && localPath) {
      throw new ValidationError(
        'Cannot specify both content and source_path. Use content for small data (<50KB) or source_path for file references.',
        'CONFLICTING_PARAMETERS',
        { has_content: true, has_source_path: true }
      );
    }

    // Verify project exists
    const project = await this.getProjectMetadata(manifest.project_id);
    if (!project) {
      throw new NotFoundError(
        'Project not found',
        'PROJECT_NOT_FOUND',
        { project_id: manifest.project_id }
      );
    }

    // Track who is performing this operation
    const operatingAgent = agentName;

    // Verify operating agent exists in project
    const agent = await this.getProjectMember(manifest.project_id, operatingAgent);
    if (!agent) {
      throw new NotFoundError(
        'Agent not found in project',
        'AGENT_NOT_FOUND',
        { project_id: manifest.project_id, agent_name: operatingAgent }
      );
    }

    // Check write permissions if updating existing resource
    const existing = await this.getResourceManifestOnly(manifest.project_id, manifest.resource_id);

    // Create internal manifest with creator_agent
    const storedManifest: StoredResourceManifest = {
      ...manifest,
      creator_agent: '' // Will be set below
    };

    if (existing) {
      // Backfill creator_agent EARLY for legacy resources (before permission checks)
      storedManifest.creator_agent = existing.creator_agent || operatingAgent;
      storedManifest.created_at = existing.created_at; // Creation time never changes

      // Get permissions and ensure creator has write access
      let permissions = existing.permissions;

      // Auto-grant write permission to backfilled creator for legacy resources
      if (storedManifest.creator_agent === operatingAgent && permissions?.write) {
        if (!permissions.write.includes('*') && !permissions.write.includes(operatingAgent)) {
          // Clone permissions to avoid mutating the existing object
          permissions = {
            ...permissions,
            write: [...permissions.write, operatingAgent]
          };
        }
      }

      // NOW check permissions (after auto-granting creator write access)
      if (!permissions || !permissions.write) {
        throw new PermissionError(
          'Access denied: no write permissions defined',
          'NO_WRITE_PERMISSIONS',
          { resource_id: storedManifest.resource_id }
        );
      }
      if (!permissions.write.includes('*') && !permissions.write.includes(operatingAgent)) {
        throw new PermissionError(
          'Access denied: insufficient write permissions',
          'WRITE_PERMISSION_DENIED',
          { resource_id: storedManifest.resource_id, agent_name: operatingAgent }
        );
      }

      // Optimistic locking: check etag matches
      if (storedManifest.etag !== undefined && storedManifest.etag !== existing.etag) {
        throw new ConflictError(
          'Resource has been modified by another agent. Re-read the resource to get the latest etag and data, then retry.',
          'ETAG_MISMATCH',
          {
            resource_id: storedManifest.resource_id
          }
        );
      }

      // Preserve storage-managed metadata fields when not being updated
      // These fields are set by storage layer based on content/source_path operations
      if (!payload && !localPath) {
        // No content update - preserve all storage-managed fields
        storedManifest.source_path = existing.source_path;
        storedManifest.size_bytes = existing.size_bytes;
        storedManifest.mime_type = existing.mime_type || storedManifest.mime_type;
      }

      // Allow creator to update permissions, otherwise preserve existing (with auto-granted creator write)
      if (storedManifest.creator_agent === operatingAgent) {
        // Creator can update permissions if provided in the manifest
        // Otherwise, use permissions variable (which includes auto-granted write)
        if (!storedManifest.permissions) {
          storedManifest.permissions = permissions;
        }
        // If creator provided permissions, we still need to merge in auto-granted write
        // This ensures creator always has write access even when updating permissions
        else if (storedManifest.permissions.write &&
                 !storedManifest.permissions.write.includes('*') &&
                 !storedManifest.permissions.write.includes(operatingAgent)) {
          storedManifest.permissions.write.push(operatingAgent);
        }
      } else {
        // Non-creator cannot change permissions - use permissions (with auto-granted creator write)
        storedManifest.permissions = permissions;
      }

      // Update timestamp and etag for modification
      storedManifest.updated_at = new Date().toISOString();
      storedManifest.etag = createHash('sha256')
        .update(`${Date.now()}-${randomUUID()}`)
        .digest('hex')
        .substring(0, 16);
    } else {
      // New resource: set creator and initial etag
      storedManifest.creator_agent = operatingAgent;
      storedManifest.etag = createHash('sha256')
        .update(`${Date.now()}-${randomUUID()}`)
        .digest('hex')
        .substring(0, 16);

      // Ensure creator always has write permission
      // Default to public read ('*') for easy collaboration while keeping write restricted to creator
      // This allows resources to be shared by default without requiring explicit read permissions
      if (!storedManifest.permissions) {
        storedManifest.permissions = { read: ['*'], write: [] };
      }
      if (!storedManifest.permissions.read) {
        storedManifest.permissions.read = ['*'];
      }
      if (!storedManifest.permissions.write) {
        storedManifest.permissions.write = [];
      }
      if (!storedManifest.permissions.write.includes(operatingAgent)) {
        storedManifest.permissions.write.push(operatingAgent);
      }
    }

    // Handle source_path (file reference)
    if (localPath) {
      await this.assertSafePath(localPath, 'source_path');

      // Store the absolute path in manifest
      storedManifest.source_path = path.resolve(localPath);

      // Get file size for metadata
      const stats = await fs.stat(storedManifest.source_path);
      storedManifest.size_bytes = stats.size;

      // Validate file size against max (Fix 2: HIGH priority)
      const config = await this.getSystemConfig();
      const maxSize = config?.max_resource_size_bytes ||
        parseInt(process.env.BRAINSTORM_MAX_PAYLOAD_SIZE || '512000', 10);
      if (storedManifest.size_bytes > maxSize) {
        throw new ValidationError(
          `File size (${(storedManifest.size_bytes / 1024).toFixed(0)}KB) exceeds maximum of ${(maxSize / 1024).toFixed(0)}KB`,
          'FILE_TOO_LARGE',
          { size: storedManifest.size_bytes, limit: maxSize }
        );
      }
    }

    // Validate payload
    if (payload) {
      // Check size limit
      const size = Buffer.isBuffer(payload) ? payload.length : Buffer.byteLength(payload);

      // Enforce 50KB limit for inline content (small data)
      const inlineLimit = 50 * 1024; // 50KB
      if (size > inlineLimit) {
        throw new ValidationError(
          `Content size (${(size / 1024).toFixed(1)}KB) exceeds 50KB limit for inline storage. Use 'source_path' parameter instead of 'content' for larger files.`,
          'CONTENT_TOO_LARGE',
          { size, limit: inlineLimit, suggestion: 'Use source_path parameter for files >50KB' }
        );
      }

      const config = await this.getSystemConfig();
      // Also check against configured max (defaults to 500KB)
      const maxSize = config?.max_resource_size_bytes ||
        parseInt(process.env.BRAINSTORM_MAX_PAYLOAD_SIZE || '512000', 10);
      if (size > maxSize) {
        throw new ValidationError(
          `Resource exceeds maximum size of ${maxSize} bytes (${(maxSize / 1024).toFixed(0)}KB). Use 'source_path' parameter instead.`,
          'RESOURCE_TOO_LARGE',
          { size, limit: maxSize }
        );
      }
      storedManifest.size_bytes = size;

      // Validate JSON structure if string payload looks like JSON
      if (typeof payload === 'string') {
        const trimmed = payload.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            const parsed = JSON.parse(payload);
            const depth = this.getJSONDepth(parsed);
            if (depth > 100) {
              throw new ValidationError(
                'JSON nesting exceeds maximum depth of 100',
                'JSON_TOO_DEEP',
                { depth }
              );
            }
          } catch (e: any) {
            if (e instanceof ValidationError) {
              throw e;
            }
            // If it looks like JSON but fails to parse, that's an error
            // Otherwise, it's just plain text, which is fine
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
              throw new ValidationError(
                'Invalid JSON payload',
                'INVALID_JSON',
                { error: e.message }
              );
            }
          }
        }
      }
    }

    const resourceDir = path.join(
      this.root,
      'projects',
      storedManifest.project_id,
      'resources',
      storedManifest.resource_id
    );

    await fs.mkdir(resourceDir, { recursive: true });

    const manifestPath = path.join(resourceDir, 'manifest.json');
    await this.atomicWrite(manifestPath, JSON.stringify(storedManifest, null, 2));

    if (payload) {
      const payloadDir = path.join(resourceDir, 'payload');
      await fs.mkdir(payloadDir, { recursive: true });
      const dataPath = path.join(payloadDir, 'data');

      if (Buffer.isBuffer(payload)) {
        await fs.writeFile(dataPath, payload);
      } else {
        await fs.writeFile(dataPath, payload, 'utf-8');
      }
    }
  }

  async getResource(projectId: string, resourceId: string, agentName: string): Promise<{
    manifest: ResourceManifest;
    payload?: Buffer;
  } | null> {
    this.assertSafeId(projectId, 'project_id');
    this.assertSafeId(resourceId, 'resource_id');
    this.assertSafeId(agentName, 'agent_name');

    try {
      const manifestPath = path.join(
        this.root,
        'projects',
        projectId,
        'resources',
        resourceId,
        'manifest.json'
      );

      const content = await fs.readFile(manifestPath, 'utf-8');
      const storedManifest = JSON.parse(content) as StoredResourceManifest;

      // Backwards compatibility: migrate from version to etag
      if (!storedManifest.etag) {
        storedManifest.etag = createHash('sha256')
          .update(`${Date.now()}-${randomUUID()}`)
          .digest('hex')
          .substring(0, 16);
        // Remove old version field
        delete (storedManifest as any).version;
        // Save the updated manifest back to disk
        await this.atomicWrite(manifestPath, JSON.stringify(storedManifest, null, 2));
      }

      // Check read permissions - default deny
      const permissions = storedManifest.permissions;
      if (!permissions || !permissions.read) {
        throw new PermissionError(
          'Access denied: no permissions defined',
          'NO_READ_PERMISSIONS',
          { resource_id: resourceId }
        );
      }

      const hasAccess =
        permissions.read.includes('*') ||
        permissions.read.includes(agentName);

      if (!hasAccess) {
        throw new PermissionError(
          'Access denied',
          'READ_PERMISSION_DENIED',
          { resource_id: resourceId, agent_name: agentName }
        );
      }

      // Try to load payload
      let payload: Buffer | undefined;
      try {
        const payloadPath = path.join(
          this.root,
          'projects',
          projectId,
          'resources',
          resourceId,
          'payload',
          'data'
        );
        payload = await fs.readFile(payloadPath);
      } catch {
        // No payload or payload not readable
      }

      // Strip creator_agent before returning to agents (security: prevent identity spoofing)
      const { creator_agent, ...manifest } = storedManifest;

      return { manifest, payload };
    } catch (err: any) {
      // Re-throw user errors (validation, permission, etc.)
      if (err instanceof ValidationError || err instanceof PermissionError) {
        throw err;
      }
      return null;
    }
  }

  async listResources(projectId: string, agentName: string, offset?: number, limit?: number): Promise<ResourceManifest[]> {
    this.assertSafeId(projectId, 'project_id');
    this.assertSafeId(agentName, 'agent_name');

    const resourcesDir = path.join(this.root, 'projects', projectId, 'resources');

    try {
      const entries = await fs.readdir(resourcesDir, { withFileTypes: true });
      const resources: ResourceManifest[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          try {
            // Optimize: use getResourceManifestOnly instead of getResource to avoid loading payloads (Fix 3: MEDIUM priority)
            const storedManifest = await this.getResourceManifestOnly(projectId, entry.name);
            if (!storedManifest) continue;

            // Check read permissions - default deny
            const permissions = storedManifest.permissions;
            if (!permissions || !permissions.read) {
              continue; // Skip resources without read permissions
            }

            const hasAccess =
              permissions.read.includes('*') ||
              permissions.read.includes(agentName);

            if (!hasAccess) {
              continue; // Skip resources the agent doesn't have access to
            }

            // Strip creator_agent before returning to agents (security: prevent identity spoofing)
            const { creator_agent, ...manifest } = storedManifest;
            resources.push(manifest);
          } catch (err) {
            // Skip resources that can't be read
            if (err instanceof PermissionError) continue;
            throw err; // Re-throw other errors
          }
        }
      }

      // Apply pagination
      const start = offset || 0;
      const end = limit ? start + limit : undefined;
      return resources.slice(start, end);
    } catch {
      return [];
    }
  }

  async deleteResource(projectId: string, resourceId: string, agentName: string): Promise<void> {
    this.assertSafeId(projectId, 'project_id');
    this.assertSafeId(resourceId, 'resource_id');
    this.assertSafeId(agentName, 'agent_name');

    // Get the manifest to check creator
    const storedManifest = await this.getResourceManifestOnly(projectId, resourceId);
    if (!storedManifest) {
      throw new NotFoundError(
        'Resource not found',
        'RESOURCE_NOT_FOUND',
        { project_id: projectId, resource_id: resourceId }
      );
    }

    // Only the creator can delete the resource
    // For legacy resources without creator_agent, fall back to write permission check
    if (!storedManifest.creator_agent) {
      // Legacy resource - check write permissions
      const hasWritePermission =
        storedManifest.permissions?.write?.includes('*') ||
        storedManifest.permissions?.write?.includes(agentName);

      if (!hasWritePermission) {
        throw new PermissionError(
          'Access denied: only agents with write permission can delete legacy resources',
          'DELETE_PERMISSION_DENIED',
          { resource_id: resourceId, requester: agentName, legacy: true }
        );
      }
    } else if (storedManifest.creator_agent !== agentName) {
      // Modern resource - only creator can delete
      throw new PermissionError(
        'Access denied: only the resource creator can delete it',
        'DELETE_PERMISSION_DENIED',
        { resource_id: resourceId, creator: storedManifest.creator_agent, requester: agentName }
      );
    }

    // Delete the resource directory
    const resourceDir = path.join(this.root, 'projects', projectId, 'resources', resourceId);

    try {
      await fs.rm(resourceDir, { recursive: true, force: true });
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // Already deleted, that's okay
        return;
      }
      throw err;
    }
  }

  // ============================================================================
  // Client identity and session persistence operations (v0.8.0+)
  // ============================================================================

  async storeClientIdentity(clientId: string): Promise<void> {
    this.assertSafeId(clientId, 'client_id');

    const clientDir = path.join(this.root, 'clients', clientId);
    await fs.mkdir(clientDir, { recursive: true });

    const identityPath = path.join(clientDir, 'identity.json');

    // Check if identity already exists
    let identity: ClientIdentity;
    try {
      const existing = await fs.readFile(identityPath, 'utf-8');
      identity = JSON.parse(existing);
      identity.last_seen = new Date().toISOString();
    } catch {
      // New identity
      identity = {
        client_id: clientId,
        created_at: new Date().toISOString(),
        last_seen: new Date().toISOString()
      };
    }

    await this.atomicWrite(identityPath, JSON.stringify(identity, null, 2));
  }

  async getClientIdentity(clientId: string): Promise<ClientIdentity | null> {
    this.assertSafeId(clientId, 'client_id');

    try {
      const identityPath = path.join(this.root, 'clients', clientId, 'identity.json');
      const content = await fs.readFile(identityPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async recordClientMembership(
    clientId: string,
    projectId: string,
    agentName: string,
    projectName: string
  ): Promise<void> {
    this.assertSafeId(clientId, 'client_id');
    this.assertSafeId(projectId, 'project_id');
    this.assertSafeId(agentName, 'agent_name');

    const clientDir = path.join(this.root, 'clients', clientId);
    await fs.mkdir(clientDir, { recursive: true });

    const membershipsPath = path.join(clientDir, 'memberships.json');

    // Load existing memberships
    let memberships: ClientMembership[] = [];
    try {
      const content = await fs.readFile(membershipsPath, 'utf-8');
      memberships = JSON.parse(content);
    } catch {
      // No existing memberships
    }

    // Check if membership already exists
    const existingIndex = memberships.findIndex(m => m.project_id === projectId);

    if (existingIndex >= 0) {
      // Update existing membership
      memberships[existingIndex] = {
        project_id: projectId,
        agent_name: agentName,
        project_name: projectName,
        joined_at: memberships[existingIndex].joined_at // Keep original join date
      };
    } else {
      // Add new membership
      memberships.push({
        project_id: projectId,
        agent_name: agentName,
        project_name: projectName,
        joined_at: new Date().toISOString()
      });
    }

    await this.atomicWrite(membershipsPath, JSON.stringify(memberships, null, 2));
  }

  async getClientMemberships(clientId: string): Promise<ClientMembership[]> {
    this.assertSafeId(clientId, 'client_id');

    try {
      const membershipsPath = path.join(this.root, 'clients', clientId, 'memberships.json');
      const content = await fs.readFile(membershipsPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  async removeClientMembership(clientId: string, projectId: string): Promise<void> {
    this.assertSafeId(clientId, 'client_id');
    this.assertSafeId(projectId, 'project_id');

    const membershipsPath = path.join(this.root, 'clients', clientId, 'memberships.json');

    try {
      const content = await fs.readFile(membershipsPath, 'utf-8');
      let memberships: ClientMembership[] = JSON.parse(content);

      // Filter out the membership
      memberships = memberships.filter(m => m.project_id !== projectId);

      await this.atomicWrite(membershipsPath, JSON.stringify(memberships, null, 2));
    } catch {
      // No memberships file - nothing to do
    }
  }

  async removeProjectFromAllClients(projectId: string): Promise<void> {
    this.assertSafeId(projectId, 'project_id');

    const clientsDir = path.join(this.root, 'clients');

    try {
      const clientDirs = await fs.readdir(clientsDir, { withFileTypes: true });

      for (const clientDir of clientDirs) {
        if (clientDir.isDirectory()) {
          await this.removeClientMembership(clientDir.name, projectId);
        }
      }
    } catch {
      // No clients directory - nothing to do
    }
  }

  // ============================================================================
  // Lifecycle management operations (v0.9.0+)
  // ============================================================================

  /**
   * Removes an agent from a project with clean membership cleanup (v0.9.0+).
   *
   * Performs a graceful departure that:
   * 1. Archives unread inbox messages (moved to archive/ folder, not deleted)
   * 2. Removes agent from project members
   * 3. Removes project from client's membership tracking
   *
   * **Message Archiving:**
   * Unread messages are moved to `projects/<project-id>/messages/<agent>/archive/`
   * instead of being deleted. This allows agents to rejoin later and review
   * archived messages if needed.
   *
   * **Re-joining:**
   * After leaving, the same client can rejoin with the same agent name (smart
   * name reclaiming will work). However, they'll get a new agent_id and joined_at
   * timestamp unless they're reclaiming a legacy member record.
   *
   * @param projectId - Project to leave
   * @param agentName - Agent leaving the project
   * @param clientId - Client ID for membership cleanup
   *
   * @returns Promise resolving to count of archived messages
   * @throws {ValidationError} If identifiers contain unsafe characters
   * @throws {NotFoundError} If project or agent doesn't exist
   *
   * @example
   * ```typescript
   * const archivedCount = await this.leaveProject(
   *   'api-redesign',
   *   'frontend',
   *   'client-abc123'
   * );
   * console.log(`Archived ${archivedCount} unread messages`);
   * ```
   */
  async leaveProject(projectId: string, agentName: string, clientId: string): Promise<number> {
    this.assertSafeId(projectId, 'project_id');
    this.assertSafeId(agentName, 'agent_name');
    this.assertSafeId(clientId, 'client_id');

    // Verify project exists
    const project = await this.getProjectMetadata(projectId);
    if (!project) {
      throw new NotFoundError(
        'Project not found',
        'PROJECT_NOT_FOUND',
        { project_id: projectId }
      );
    }

    // Verify agent is a member
    const member = await this.getProjectMember(projectId, agentName);
    if (!member) {
      throw new NotFoundError(
        'Agent is not a member of this project',
        'MEMBER_NOT_FOUND',
        { project_id: projectId, agent_name: agentName }
      );
    }

    // 1. Archive inbox messages
    const inboxDir = path.join(this.root, 'projects', projectId, 'messages', agentName);
    const archiveDir = path.join(inboxDir, 'archive');
    let archivedCount = 0;

    try {
      await fs.mkdir(archiveDir, { recursive: true });
      const files = await fs.readdir(inboxDir);

      for (const file of files) {
        if (file === 'archive') continue; // Skip archive directory itself
        if (file.endsWith('.json')) {
          const srcPath = path.join(inboxDir, file);
          const dstPath = path.join(archiveDir, file);
          await fs.rename(srcPath, dstPath);
          archivedCount++;
        }
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        // Inbox might not exist if agent never received messages - that's okay
        throw err;
      }
    }

    // 2. Remove agent from project members
    const memberPath = path.join(
      this.root,
      'projects',
      projectId,
      'members',
      `${agentName}.json`
    );

    try {
      await fs.unlink(memberPath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
      // Member file already deleted - that's okay
    }

    // 3. Remove project from client memberships
    await this.removeClientMembership(clientId, projectId);

    return archivedCount;
  }

  /**
   * Marks a project as archived (inactive but recoverable) - v0.9.0+.
   *
   * Archives preserve all project data while marking the project as inactive.
   * Unlike deletion, archived projects can be "unarchived" by updating the
   * metadata to clear the archived flag.
   *
   * **Authorization:**
   * Only the project creator (metadata.created_by) can archive a project.
   *
   * **Effect on list_projects:**
   * By default, archived projects are excluded from `listProjects()` results
   * unless explicitly requested with `includeArchived: true`.
   *
   * **Data Preservation:**
   * - All members remain
   * - All messages remain
   * - All resources remain
   * - Only metadata.archived flag changes
   *
   * @param projectId - Project to archive
   * @param agentName - Agent requesting archival (must be creator)
   * @param reason - Optional reason for archiving
   *
   * @returns Promise that resolves when project is archived
   * @throws {ValidationError} If identifiers contain unsafe characters
   * @throws {NotFoundError} If project doesn't exist
   * @throws {PermissionError} If agent is not the project creator
   *
   * @example
   * ```typescript
   * await this.archiveProject(
   *   'completed-migration',
   *   'architect',
   *   'Migration completed successfully on 2025-10-13'
   * );
   * ```
   */
  async archiveProject(projectId: string, agentName: string, reason?: string): Promise<void> {
    this.assertSafeId(projectId, 'project_id');
    this.assertSafeId(agentName, 'agent_name');

    // Get existing metadata
    const metadata = await this.getProjectMetadata(projectId);
    if (!metadata) {
      throw new NotFoundError(
        'Project not found',
        'PROJECT_NOT_FOUND',
        { project_id: projectId }
      );
    }

    // Only the creator can archive the project
    if (metadata.created_by && metadata.created_by !== agentName) {
      throw new PermissionError(
        'Access denied: only the project creator can archive it',
        'ARCHIVE_PERMISSION_DENIED',
        { project_id: projectId, creator: metadata.created_by, requester: agentName }
      );
    }

    // If no creator was set, prevent archival (safety measure)
    if (!metadata.created_by) {
      throw new PermissionError(
        'Access denied: project has no creator',
        'NO_CREATOR_DEFINED',
        { project_id: projectId }
      );
    }

    // Update metadata with archive fields
    metadata.archived = true;
    metadata.archived_at = new Date().toISOString();
    metadata.archived_by = agentName;
    if (reason) {
      metadata.archive_reason = reason;
    }

    // Write updated metadata
    const metadataPath = path.join(this.root, 'projects', projectId, 'metadata.json');
    await this.atomicWrite(metadataPath, JSON.stringify(metadata, null, 2));
  }
}
