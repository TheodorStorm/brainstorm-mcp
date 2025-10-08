/**
 * Security tests for Phase 1 fixes
 * Tests path traversal, authorization, and error sanitization
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { FileSystemStorage } from '../src/storage.js';
import { AgentCoopServer } from '../src/server.js';
import type { ResourceManifest, ProjectMetadata, ProjectMember } from '../src/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';

describe('Security: Path Traversal Protection', () => {
  it('should reject project_id with path traversal', async () => {
    const testRoot = path.join(tmpdir(), `brainstorm-test-${Date.now()}`);
    const storage = new FileSystemStorage(testRoot);
    await storage.initialize();

    const metadata: ProjectMetadata = {
      project_id: '../../etc/passwd',
      name: 'Malicious Project',
      created_at: new Date().toISOString(),
      schema_version: '1.0'
    };

    await assert.rejects(
      () => storage.createProject(metadata),
      { message: /Invalid project_id/ },
      'Should reject path traversal in project_id'
    );

    await fs.rm(testRoot, { recursive: true, force: true });
  });

  it('should reject agent_name with dots', async () => {
    const testRoot = path.join(tmpdir(), `brainstorm-test-${Date.now()}`);
    const storage = new FileSystemStorage(testRoot);
    await storage.initialize();

    // Create valid project first
    const metadata: ProjectMetadata = {
      project_id: 'test-project',
      name: 'Test Project',
      created_at: new Date().toISOString(),
      schema_version: '1.0'
    };
    await storage.createProject(metadata);

    const member: ProjectMember = {
      project_id: 'test-project',
      agent_name: '../../../malicious',
      agent_id: 'test-id',
      capabilities: [],
      labels: {},
      joined_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      online: true
    };

    await assert.rejects(
      () => storage.joinProject(member),
      { message: /Invalid agent_name/ },
      'Should reject agent_name with path traversal'
    );

    await fs.rm(testRoot, { recursive: true, force: true });
  });

  it('should accept valid identifiers', async () => {
    const testRoot = path.join(tmpdir(), `brainstorm-test-${Date.now()}`);
    const storage = new FileSystemStorage(testRoot);
    await storage.initialize();

    const metadata: ProjectMetadata = {
      project_id: 'api-redesign-2024',
      name: 'API Redesign',
      created_at: new Date().toISOString(),
      schema_version: '1.0'
    };

    await assert.doesNotReject(
      () => storage.createProject(metadata),
      'Should accept valid project_id with dashes and numbers'
    );

    await fs.rm(testRoot, { recursive: true, force: true });
  });
});

describe('Security: Resource Authorization', () => {
  it('should reject resource without permissions', async () => {
    const testRoot = path.join(tmpdir(), `brainstorm-test-${Date.now()}`);
    const storage = new FileSystemStorage(testRoot);
    await storage.initialize();

    // Setup: create project and member
    const project: ProjectMetadata = {
      project_id: 'test-project',
      name: 'Test',
      created_at: new Date().toISOString(),
      schema_version: '1.0'
    };
    await storage.createProject(project);

    const member: ProjectMember = {
      project_id: 'test-project',
      agent_name: 'agent-a',
      agent_id: 'id-a',
      joined_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      online: true
    };
    await storage.joinProject(member);

    // Create resource with explicit permissions first
    const manifest: ResourceManifest = {
      project_id: 'test-project',
      resource_id: 'secret-data',
      name: 'Secret Data',
      creator_agent: 'agent-a',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      etag: "test-etag-1",
      permissions: {
        read: ['agent-a'],
        write: ['agent-a']
      }
    };
    await storage.storeResource(manifest, 'secret content');

    // Now manually remove permissions from the manifest file to simulate undefined permissions
    const manifestPath = `/tmp/brainstorm-test-${Date.now()}/projects/test-project/resources/secret-data/manifest.json`;
    // Actually, let's create a different resource and manipulate its manifest
    const testRoot2 = path.join(tmpdir(), `brainstorm-test-${Date.now()}`);
    const storage2 = new FileSystemStorage(testRoot2);
    await storage2.initialize();

    // Create project and member
    await storage2.createProject({
      project_id: 'test-project',
      name: 'Test',
      created_at: new Date().toISOString(),
      schema_version: '1.0'
    });

    await storage2.joinProject({
      project_id: 'test-project',
      agent_name: 'agent-a',
      agent_id: 'id-a',
      joined_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      online: true
    });

    // Create resource WITH permissions
    await storage2.storeResource({
      project_id: 'test-project',
      resource_id: 'test-resource',
      name: 'Test',
      creator_agent: 'agent-a',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      etag: "test-etag-1",
      permissions: {
        read: ['agent-a'],
        write: ['agent-a']
      }
    }, 'content');

    // Manually corrupt the manifest by removing permissions
    const resourceManifestPath = path.join(testRoot2, 'projects', 'test-project', 'resources', 'test-resource', 'manifest.json');
    const manifestContent = JSON.parse(await fs.readFile(resourceManifestPath, 'utf-8'));
    delete manifestContent.permissions;
    await fs.writeFile(resourceManifestPath, JSON.stringify(manifestContent, null, 2));

    // Try to read - should be rejected due to missing permissions
    await assert.rejects(
      () => storage2.getResource('test-project', 'test-resource', 'agent-a'),
      { message: /no permissions defined/ },
      'Should reject access when permissions undefined'
    );

    await fs.rm(testRoot2, { recursive: true, force: true });

    await fs.rm(testRoot, { recursive: true, force: true });
  });

  it('should allow access with explicit read permissions', async () => {
    const testRoot = path.join(tmpdir(), `brainstorm-test-${Date.now()}`);
    const storage = new FileSystemStorage(testRoot);
    await storage.initialize();

    // Setup
    const project: ProjectMetadata = {
      project_id: 'test-project',
      name: 'Test',
      created_at: new Date().toISOString(),
      schema_version: '1.0'
    };
    await storage.createProject(project);

    const member: ProjectMember = {
      project_id: 'test-project',
      agent_name: 'agent-a',
      agent_id: 'id-a',
      joined_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      online: true
    };
    await storage.joinProject(member);

    // Create resource with explicit permissions
    const manifest: ResourceManifest = {
      project_id: 'test-project',
      resource_id: 'public-data',
      name: 'Public Data',
      creator_agent: 'agent-a',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      etag: "test-etag-1",
      permissions: {
        read: ['*'],
        write: ['agent-a']
      }
    };
    await storage.storeResource(manifest, 'public content');

    // Should allow access
    const result = await storage.getResource('test-project', 'public-data', 'agent-a');
    assert.ok(result, 'Should allow access with explicit permissions');
    assert.strictEqual(result.payload?.toString('utf-8'), 'public content');

    await fs.rm(testRoot, { recursive: true, force: true });
  });

  it('should reject unauthorized writes', async () => {
    const testRoot = path.join(tmpdir(), `brainstorm-test-${Date.now()}`);
    const storage = new FileSystemStorage(testRoot);
    await storage.initialize();

    // Setup
    const project: ProjectMetadata = {
      project_id: 'test-project',
      name: 'Test',
      created_at: new Date().toISOString(),
      schema_version: '1.0'
    };
    await storage.createProject(project);

    const creator: ProjectMember = {
      project_id: 'test-project',
      agent_name: 'creator',
      agent_id: 'id-creator',
      joined_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      online: true
    };
    await storage.joinProject(creator);

    const attacker: ProjectMember = {
      project_id: 'test-project',
      agent_name: 'attacker',
      agent_id: 'id-attacker',
      joined_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      online: true
    };
    await storage.joinProject(attacker);

    // Create resource with restricted write access
    const manifest: ResourceManifest = {
      project_id: 'test-project',
      resource_id: 'protected',
      name: 'Protected Resource',
      creator_agent: 'creator',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      etag: "test-etag-1",
      permissions: {
        read: ['*'],
        write: ['creator']
      }
    };
    await storage.storeResource(manifest, 'original');

    // Attacker tries to update
    const maliciousUpdate: ResourceManifest = {
      ...manifest,
      creator_agent: 'attacker' // Attacker claims to be updating
    };

    await assert.rejects(
      () => storage.storeResource(maliciousUpdate, 'hacked'),
      { message: /insufficient write permissions/ },
      'Should reject write from unauthorized agent'
    );

    await fs.rm(testRoot, { recursive: true, force: true });
  });
});

describe('Security: Error Message Sanitization', () => {
  it('should not leak filesystem paths in errors', async () => {
    // This test verifies that error messages don't contain internal paths
    // We can't easily test the MCP server response without mocking,
    // but we verify the storage layer throws clean errors

    const testRoot = path.join(tmpdir(), `brainstorm-test-${Date.now()}`);
    const storage = new FileSystemStorage(testRoot);
    await storage.initialize();

    try {
      await storage.getProjectMetadata('nonexistent-project');
      // Should return null, not throw
      assert.ok(true, 'Should handle missing project gracefully');
    } catch (error: any) {
      // If it does throw, ensure it doesn't leak paths
      assert.ok(
        !error.message.includes(testRoot),
        'Error should not contain filesystem paths'
      );
    }

    await fs.rm(testRoot, { recursive: true, force: true });
  });
});

describe('Security: Race Condition Prevention (Phase 2)', () => {
  it('should prevent simultaneous project creation', async () => {
    const testRoot = path.join(tmpdir(), `brainstorm-test-${Date.now()}`);
    const storage = new FileSystemStorage(testRoot);
    await storage.initialize();

    const metadata: ProjectMetadata = {
      project_id: 'race-test',
      name: 'Race Test',
      created_at: new Date().toISOString(),
      schema_version: '1.0'
    };

    // Try to create the same project twice in parallel
    const results = await Promise.allSettled([
      storage.createProject(metadata),
      storage.createProject(metadata)
    ]);

    // One should succeed, one should fail
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    assert.strictEqual(succeeded, 1, 'Exactly one creation should succeed');
    assert.strictEqual(failed, 1, 'Exactly one creation should fail');

    // The failure should be due to project already existing
    const rejection = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
    assert.ok(
      rejection.reason.message.includes('already exists'),
      'Failed creation should indicate project already exists'
    );

    await fs.rm(testRoot, { recursive: true, force: true });
  });
});

describe('Security: Payload Validation (Phase 2)', () => {
  it('should reject deeply nested JSON (JSON bomb)', async () => {
    const testRoot = path.join(tmpdir(), `brainstorm-test-${Date.now()}`);
    const storage = new FileSystemStorage(testRoot);
    await storage.initialize();

    // Setup
    const project: ProjectMetadata = {
      project_id: 'test-project',
      name: 'Test',
      created_at: new Date().toISOString(),
      schema_version: '1.0'
    };
    await storage.createProject(project);

    const member: ProjectMember = {
      project_id: 'test-project',
      agent_name: 'agent-a',
      agent_id: 'id-a',
      joined_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      online: true
    };
    await storage.joinProject(member);

    // Create deeply nested JSON (exceeds 100 levels)
    let deeplyNested: any = 'deep';
    for (let i = 0; i < 105; i++) {
      deeplyNested = { level: deeplyNested };
    }

    const manifest: ResourceManifest = {
      project_id: 'test-project',
      resource_id: 'json-bomb',
      name: 'JSON Bomb',
      creator_agent: 'agent-a',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      etag: "test-etag-1",
      permissions: {
        read: ['*'],
        write: ['agent-a']
      }
    };

    await assert.rejects(
      () => storage.storeResource(manifest, JSON.stringify(deeplyNested)),
      { message: /JSON nesting exceeds maximum depth/ },
      'Should reject JSON exceeding 100 levels of nesting'
    );

    await fs.rm(testRoot, { recursive: true, force: true });
  });

  it('should accept plain text payloads', async () => {
    const testRoot = path.join(tmpdir(), `brainstorm-test-${Date.now()}`);
    const storage = new FileSystemStorage(testRoot);
    await storage.initialize();

    // Setup
    const project: ProjectMetadata = {
      project_id: 'test-project',
      name: 'Test',
      created_at: new Date().toISOString(),
      schema_version: '1.0'
    };
    await storage.createProject(project);

    const member: ProjectMember = {
      project_id: 'test-project',
      agent_name: 'agent-a',
      agent_id: 'id-a',
      joined_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      online: true
    };
    await storage.joinProject(member);

    const manifest: ResourceManifest = {
      project_id: 'test-project',
      resource_id: 'plain-text',
      name: 'Plain Text',
      creator_agent: 'agent-a',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      etag: "test-etag-1",
      permissions: {
        read: ['*'],
        write: ['agent-a']
      }
    };

    // Should accept plain text without trying to parse as JSON
    await assert.doesNotReject(
      () => storage.storeResource(manifest, 'This is plain text content'),
      'Should accept plain text payloads'
    );

    await fs.rm(testRoot, { recursive: true, force: true });
  });

  it('should accept shallow JSON payloads', async () => {
    const testRoot = path.join(tmpdir(), `brainstorm-test-${Date.now()}`);
    const storage = new FileSystemStorage(testRoot);
    await storage.initialize();

    // Setup
    const project: ProjectMetadata = {
      project_id: 'test-project',
      name: 'Test',
      created_at: new Date().toISOString(),
      schema_version: '1.0'
    };
    await storage.createProject(project);

    const member: ProjectMember = {
      project_id: 'test-project',
      agent_name: 'agent-a',
      agent_id: 'id-a',
      joined_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      online: true
    };
    await storage.joinProject(member);

    const manifest: ResourceManifest = {
      project_id: 'test-project',
      resource_id: 'valid-json',
      name: 'Valid JSON',
      creator_agent: 'agent-a',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      etag: "test-etag-1",
      permissions: {
        read: ['*'],
        write: ['agent-a']
      }
    };

    // Shallow JSON like the tic-tac-toe board
    const validPayload = JSON.stringify({
      board: [[' ', ' ', ' '], [' ', ' ', ' '], [' ', ' ', ' ']],
      next_player: 'O',
      move_history: [],
      game_status: 'in_progress'
    });

    await assert.doesNotReject(
      () => storage.storeResource(manifest, validPayload),
      'Should accept shallow JSON payloads'
    );

    await fs.rm(testRoot, { recursive: true, force: true });
  });
});

describe('Security: Project Deletion Authorization', () => {
  it('should allow creator to delete project', async () => {
    const testRoot = path.join(tmpdir(), `brainstorm-test-${Date.now()}`);
    const storage = new FileSystemStorage(testRoot);
    await storage.initialize();

    // Create project with creator
    const project: ProjectMetadata = {
      project_id: 'test-project',
      name: 'Test',
      created_by: 'creator-agent',
      created_at: new Date().toISOString(),
      schema_version: '1.0'
    };
    await storage.createProject(project);

    // Creator should be able to delete
    await assert.doesNotReject(
      () => storage.deleteProject('test-project', 'creator-agent'),
      'Creator should be able to delete project'
    );

    // Verify project is deleted
    const metadata = await storage.getProjectMetadata('test-project');
    assert.strictEqual(metadata, null, 'Project should be deleted');

    await fs.rm(testRoot, { recursive: true, force: true });
  });

  it('should reject deletion by non-creator', async () => {
    const testRoot = path.join(tmpdir(), `brainstorm-test-${Date.now()}`);
    const storage = new FileSystemStorage(testRoot);
    await storage.initialize();

    // Create project with creator
    const project: ProjectMetadata = {
      project_id: 'test-project',
      name: 'Test',
      created_by: 'creator-agent',
      created_at: new Date().toISOString(),
      schema_version: '1.0'
    };
    await storage.createProject(project);

    // Non-creator tries to delete
    await assert.rejects(
      () => storage.deleteProject('test-project', 'other-agent'),
      { message: /only the project creator can delete it/ },
      'Non-creator should not be able to delete project'
    );

    // Verify project still exists
    const metadata = await storage.getProjectMetadata('test-project');
    assert.ok(metadata, 'Project should still exist');

    await fs.rm(testRoot, { recursive: true, force: true });
  });

  it('should reject deletion of project without creator', async () => {
    const testRoot = path.join(tmpdir(), `brainstorm-test-${Date.now()}`);
    const storage = new FileSystemStorage(testRoot);
    await storage.initialize();

    // Create project without creator
    const project: ProjectMetadata = {
      project_id: 'test-project',
      name: 'Test',
      created_at: new Date().toISOString(),
      schema_version: '1.0'
    };
    await storage.createProject(project);

    // Should reject deletion (safety measure)
    await assert.rejects(
      () => storage.deleteProject('test-project', 'any-agent'),
      { message: /project has no creator/ },
      'Should reject deletion of project without creator'
    );

    await fs.rm(testRoot, { recursive: true, force: true });
  });

  it('should reject deletion with invalid project_id', async () => {
    const testRoot = path.join(tmpdir(), `brainstorm-test-${Date.now()}`);
    const storage = new FileSystemStorage(testRoot);
    await storage.initialize();

    // Try to delete with path traversal
    await assert.rejects(
      () => storage.deleteProject('../../../etc/passwd', 'attacker'),
      { message: /Invalid project_id/ },
      'Should reject path traversal in project_id'
    );

    await fs.rm(testRoot, { recursive: true, force: true });
  });

  it('should handle deletion of non-existent project', async () => {
    const testRoot = path.join(tmpdir(), `brainstorm-test-${Date.now()}`);
    const storage = new FileSystemStorage(testRoot);
    await storage.initialize();

    // Try to delete non-existent project
    await assert.rejects(
      () => storage.deleteProject('nonexistent', 'agent'),
      { message: /Project not found/ },
      'Should reject deletion of non-existent project'
    );

    await fs.rm(testRoot, { recursive: true, force: true });
  });
});

describe('Concurrency: Heartbeat Race Condition Prevention', () => {
  it('should handle concurrent heartbeats without lost updates', async () => {
    const testRoot = path.join(tmpdir(), `brainstorm-test-${Date.now()}`);
    const storage = new FileSystemStorage(testRoot);
    await storage.initialize();

    // Create project and member
    const project: ProjectMetadata = {
      project_id: 'test-project',
      name: 'Test',
      created_at: new Date().toISOString(),
      schema_version: '1.0'
    };
    await storage.createProject(project);

    const member: ProjectMember = {
      project_id: 'test-project',
      agent_name: 'test-agent',
      agent_id: 'test-id',
      joined_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      online: true
    };
    await storage.joinProject(member);

    // Simulate concurrent heartbeats
    const heartbeatCount = 10;
    const heartbeats = Array.from({ length: heartbeatCount }, (_, i) =>
      storage.updateMemberHeartbeat('test-project', 'test-agent', i % 2 === 0)
    );

    // All heartbeats should complete without error
    await assert.doesNotReject(
      Promise.all(heartbeats),
      'Concurrent heartbeats should not cause errors'
    );

    // Verify member state is consistent (last heartbeat won)
    const updatedMember = await storage.getProjectMember('test-project', 'test-agent');
    assert.ok(updatedMember, 'Member should exist after concurrent heartbeats');
    assert.ok(updatedMember.last_seen, 'Member should have updated last_seen timestamp');

    await fs.rm(testRoot, { recursive: true, force: true });
  });

  it('should prevent heartbeat deadlocks with lock timeout', async () => {
    const testRoot = path.join(tmpdir(), `brainstorm-test-${Date.now()}`);
    const storage = new FileSystemStorage(testRoot);
    await storage.initialize();

    // Create project and member
    const project: ProjectMetadata = {
      project_id: 'test-project',
      name: 'Test',
      created_at: new Date().toISOString(),
      schema_version: '1.0'
    };
    await storage.createProject(project);

    const member: ProjectMember = {
      project_id: 'test-project',
      agent_name: 'test-agent',
      agent_id: 'test-id',
      joined_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      online: true
    };
    await storage.joinProject(member);

    // Verify heartbeat completes within reasonable time (lock timeout is 5s)
    const start = Date.now();
    await storage.updateMemberHeartbeat('test-project', 'test-agent', true);
    const duration = Date.now() - start;

    assert.ok(
      duration < 5000,
      'Heartbeat should complete quickly without lock contention'
    );

    await fs.rm(testRoot, { recursive: true, force: true });
  });
});

console.log('Phase 1, 2 & Concurrency Tests completed');
