/**
 * File system storage abstraction for project-centric agent cooperation
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
  SystemConfig
} from './types.js';
import {
  ValidationError,
  NotFoundError,
  PermissionError,
  ConflictError
} from './errors.js';

export class FileSystemStorage {
  private root: string;

  constructor(rootPath: string) {
    this.root = rootPath;
  }

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
        max_long_poll_timeout_seconds: 900,
        default_long_poll_timeout_seconds: 90
      };
      await this.atomicWrite(configPath, JSON.stringify(defaultConfig, null, 2));
    }
  }

  // ============================================================================
  // Security: ID validation
  // ============================================================================

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
    if (!resolvedPath.startsWith(homedir)) {
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

  async listProjects(): Promise<ProjectMetadata[]> {
    const projectsDir = path.join(this.root, 'projects');

    try {
      const entries = await fs.readdir(projectsDir, { withFileTypes: true });
      const projects: ProjectMetadata[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const metadata = await this.getProjectMetadata(entry.name);
          if (metadata) {
            projects.push(metadata);
          }
        }
      }

      return projects;
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

  async joinProject(member: ProjectMember): Promise<void> {
    this.assertSafeId(member.project_id, 'project_id');
    this.assertSafeId(member.agent_name, 'agent_name');

    // Check if project exists
    const project = await this.getProjectMetadata(member.project_id);
    if (!project) {
      throw new NotFoundError(
        'Project not found',
        'PROJECT_NOT_FOUND',
        { project_id: member.project_id }
      );
    }

    // Check if agent name is already taken
    const existing = await this.getProjectMember(member.project_id, member.agent_name);
    if (existing) {
      throw new ConflictError(
        'Agent name already taken in this project',
        'AGENT_NAME_TAKEN',
        { project_id: member.project_id, agent_name: member.agent_name }
      );
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

  async listProjectMembers(projectId: string): Promise<ProjectMember[]> {
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

      return members;
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

  async getAgentInbox(projectId: string, agentName: string, limit?: number): Promise<Message[]> {
    this.assertSafeId(projectId, 'project_id');
    this.assertSafeId(agentName, 'agent_name');

    const inboxDir = path.join(this.root, 'projects', projectId, 'messages', agentName);

    try {
      const files = await fs.readdir(inboxDir);
      files.sort(); // Lexicographic sort (timestamp-based filenames)

      const messagesToRead = limit ? files.slice(0, limit) : files;
      const messages: Message[] = [];

      const config = await this.getSystemConfig();
      const ttl = config?.message_ttl_seconds || 86400;
      const now = Date.now();

      for (const file of messagesToRead) {
        try {
          const content = await fs.readFile(path.join(inboxDir, file), 'utf-8');
          const message = JSON.parse(content) as Message;

          // Filter out expired messages
          const messageAge = now - new Date(message.created_at).getTime();
          if (messageAge < ttl * 1000) {
            messages.push(message);
          }
        } catch {
          // Skip malformed messages
        }
      }

      return messages;
    } catch {
      return [];
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

      for (const file of files) {
        if (file.includes(messageId)) {
          const messagePath = path.join(inboxDir, file);
          try {
            await fs.unlink(messagePath);
            return;
          } catch (err: any) {
            if (err.code === 'ENOENT') {
              return; // Already deleted
            }
            throw err;
          }
        }
      }
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

  private async getResourceManifestOnly(projectId: string, resourceId: string): Promise<ResourceManifest | null> {
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
      const manifest = JSON.parse(content) as ResourceManifest;

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

  async storeResource(manifest: ResourceManifest, payload?: string | Buffer, localPath?: string): Promise<void> {
    this.assertSafeId(manifest.project_id, 'project_id');
    this.assertSafeId(manifest.resource_id, 'resource_id');

    // Mutual exclusion: cannot specify both content and local_path
    if (payload && localPath) {
      throw new ValidationError(
        'Cannot specify both content and local_path. Use content for small data (<100KB) or local_path for file references.',
        'CONFLICTING_PARAMETERS',
        { has_content: true, has_local_path: true }
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

    // Verify creator exists
    const creator = await this.getProjectMember(manifest.project_id, manifest.creator_agent);
    if (!creator) {
      throw new NotFoundError(
        'Creator not found in project',
        'CREATOR_NOT_FOUND',
        { project_id: manifest.project_id, agent_name: manifest.creator_agent }
      );
    }

    // Check write permissions and version if updating existing resource
    const existing = await this.getResourceManifestOnly(manifest.project_id, manifest.resource_id);
    if (existing) {
      const permissions = existing.permissions;
      if (!permissions || !permissions.write) {
        throw new PermissionError(
          'Access denied: no write permissions defined',
          'NO_WRITE_PERMISSIONS',
          { resource_id: manifest.resource_id }
        );
      }
      if (!permissions.write.includes('*') && !permissions.write.includes(manifest.creator_agent)) {
        throw new PermissionError(
          'Access denied: insufficient write permissions',
          'WRITE_PERMISSION_DENIED',
          { resource_id: manifest.resource_id, agent_name: manifest.creator_agent }
        );
      }

      // Optimistic locking: check etag matches
      if (manifest.etag !== undefined && manifest.etag !== existing.etag) {
        throw new ConflictError(
          'Resource has been modified by another agent. Re-read the resource to get the latest etag and data, then retry.',
          'ETAG_MISMATCH',
          {
            resource_id: manifest.resource_id
          }
        );
      }

      // Preserve existing fields on updates
      manifest.permissions = existing.permissions;
      manifest.created_at = existing.created_at; // Don't change creation time

      // Update timestamp and etag for modification
      manifest.updated_at = new Date().toISOString();
      manifest.etag = createHash('sha256')
        .update(`${Date.now()}-${randomUUID()}`)
        .digest('hex')
        .substring(0, 16);
    } else {
      // New resource gets initial etag
      manifest.etag = createHash('sha256')
        .update(`${Date.now()}-${randomUUID()}`)
        .digest('hex')
        .substring(0, 16);
    }

    // Handle local_path (file reference)
    if (localPath) {
      await this.assertSafePath(localPath, 'local_path');

      // Store the absolute path in manifest
      manifest.source_path = path.resolve(localPath);

      // Get file size for metadata
      const stats = await fs.stat(manifest.source_path);
      manifest.size_bytes = stats.size;
    }

    // Validate payload
    if (payload) {
      // Check size limit
      const size = Buffer.isBuffer(payload) ? payload.length : Buffer.byteLength(payload);

      // Enforce 10KB limit for inline content (small data)
      const inlineLimit = 10 * 1024; // 10KB
      if (size > inlineLimit) {
        throw new ValidationError(
          `Content size (${(size / 1024).toFixed(1)}KB) exceeds 10KB limit for inline storage. Use 'local_path' parameter instead of 'content' for larger files.`,
          'CONTENT_TOO_LARGE',
          { size, limit: inlineLimit, suggestion: 'Use local_path parameter for files >10KB' }
        );
      }

      const config = await this.getSystemConfig();
      // Also check against configured max (defaults to 500KB)
      const maxSize = config?.max_resource_size_bytes ||
        parseInt(process.env.BRAINSTORM_MAX_PAYLOAD_SIZE || '512000', 10);
      if (size > maxSize) {
        throw new ValidationError(
          `Resource exceeds maximum size of ${maxSize} bytes (${(maxSize / 1024).toFixed(0)}KB). Use 'local_path' parameter instead.`,
          'RESOURCE_TOO_LARGE',
          { size, limit: maxSize }
        );
      }
      manifest.size_bytes = size;

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
      manifest.project_id,
      'resources',
      manifest.resource_id
    );

    await fs.mkdir(resourceDir, { recursive: true });

    const manifestPath = path.join(resourceDir, 'manifest.json');
    await this.atomicWrite(manifestPath, JSON.stringify(manifest, null, 2));

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
      const manifest = JSON.parse(content) as ResourceManifest;

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

      // Check read permissions - default deny
      const permissions = manifest.permissions;
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

      return { manifest, payload };
    } catch (err: any) {
      // Re-throw user errors (validation, permission, etc.)
      if (err instanceof ValidationError || err instanceof PermissionError) {
        throw err;
      }
      return null;
    }
  }

  async listResources(projectId: string, agentName: string): Promise<ResourceManifest[]> {
    this.assertSafeId(projectId, 'project_id');
    this.assertSafeId(agentName, 'agent_name');

    const resourcesDir = path.join(this.root, 'projects', projectId, 'resources');

    try {
      const entries = await fs.readdir(resourcesDir, { withFileTypes: true });
      const resources: ResourceManifest[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          try {
            const result = await this.getResource(projectId, entry.name, agentName);
            if (result) {
              resources.push(result.manifest);
            }
          } catch (err) {
            // Skip resources the agent doesn't have access to
            if (err instanceof PermissionError) continue;
            throw err; // Re-throw other errors
          }
        }
      }

      return resources;
    } catch {
      return [];
    }
  }
}
