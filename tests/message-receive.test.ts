/**
 * Message Auto-Archive Tests (v0.12.0)
 *
 * Tests for verifying that messages are automatically archived after being read
 * via receive_messages and don't reappear in subsequent calls.
 *
 * v0.12.0 Breaking Change: Removed explicit acknowledge_message tool.
 * Messages are now automatically moved to archive/ after being read.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { tmpdir } from 'node:os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { FileSystemStorage } from '../src/storage.js';
import type { ProjectMetadata, ProjectMember, Message } from '../src/types.js';

// Helper to create unique test directories
function createTestRoot(): string {
  return path.join(tmpdir(), `brainstorm-test-${Date.now()}-${randomUUID()}`);
}

describe('Message Auto-Archive (v0.12.0)', () => {
  it('should auto-archive message after reading from inbox', async () => {
    const testRoot = createTestRoot();
    const storage = new FileSystemStorage(testRoot);
    await storage.initialize();

    // Create project
    const project: ProjectMetadata = {
      project_id: 'test-project',
      name: 'Test Project',
      created_by: 'sender',
      created_at: new Date().toISOString(),
      schema_version: '1.0'
    };
    await storage.createProject(project);

    // Join two agents
    const sender: ProjectMember = {
      project_id: 'test-project',
      agent_name: 'sender',
      agent_id: randomUUID(),
      client_id: 'client-sender',
      joined_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      online: true
    };
    await storage.joinProject(sender);
    await storage.recordClientMembership('client-sender', 'test-project', 'sender', 'Test Project');

    const recipient: ProjectMember = {
      project_id: 'test-project',
      agent_name: 'recipient',
      agent_id: randomUUID(),
      client_id: 'client-recipient',
      joined_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      online: true
    };
    await storage.joinProject(recipient);
    await storage.recordClientMembership('client-recipient', 'test-project', 'recipient', 'Test Project');

    // Send a message
    const messageId = randomUUID();
    const message: Message = {
      message_id: messageId,
      project_id: 'test-project',
      from_agent: 'sender',
      to_agent: 'recipient',
      created_at: new Date().toISOString(),
      reply_expected: false,
      payload: { text: 'Test message' }
    };
    await storage.sendMessage(message);

    // Verify message is in inbox
    let inbox = await storage.getAgentInbox('test-project', 'recipient');
    assert.strictEqual(inbox.length, 1, 'Message should be in inbox');
    assert.strictEqual(inbox[0].message_id, messageId, 'Message ID should match');

    // Verify message is now archived (moved to archive/)
    const archiveDir = path.join(testRoot, 'projects', 'test-project', 'messages', 'recipient', 'archive');
    const archivedFiles = await fs.readdir(archiveDir);
    assert.strictEqual(archivedFiles.length, 1, 'One message should be in archive');

    // Verify message is removed from inbox on subsequent read
    inbox = await storage.getAgentInbox('test-project', 'recipient');
    assert.strictEqual(inbox.length, 0, 'Message should be auto-archived after first read');

    await fs.rm(testRoot, { recursive: true, force: true });
  });

  it('should not return archived messages on subsequent receives', async () => {
    const testRoot = createTestRoot();
    const storage = new FileSystemStorage(testRoot);
    await storage.initialize();

    // Create project and join agents
    const project: ProjectMetadata = {
      project_id: 'test-project',
      name: 'Test Project',
      created_by: 'sender',
      created_at: new Date().toISOString(),
      schema_version: '1.0'
    };
    await storage.createProject(project);

    const sender: ProjectMember = {
      project_id: 'test-project',
      agent_name: 'sender',
      agent_id: randomUUID(),
      client_id: 'client-sender',
      joined_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      online: true
    };
    await storage.joinProject(sender);
    await storage.recordClientMembership('client-sender', 'test-project', 'sender', 'Test Project');

    const recipient: ProjectMember = {
      project_id: 'test-project',
      agent_name: 'recipient',
      agent_id: randomUUID(),
      client_id: 'client-recipient',
      joined_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      online: true
    };
    await storage.joinProject(recipient);
    await storage.recordClientMembership('client-recipient', 'test-project', 'recipient', 'Test Project');

    // Send multiple messages
    const messageIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const messageId = randomUUID();
      messageIds.push(messageId);
      const message: Message = {
        message_id: messageId,
        project_id: 'test-project',
        from_agent: 'sender',
        to_agent: 'recipient',
        created_at: new Date().toISOString(),
        reply_expected: false,
        payload: { text: `Test message ${i + 1}` }
      };
      await storage.sendMessage(message);
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // First receive - should get all 3 messages and auto-archive them
    let inbox = await storage.getAgentInbox('test-project', 'recipient');
    assert.strictEqual(inbox.length, 3, 'Should have 3 messages on first read');

    // Second receive - should be empty (all auto-archived)
    inbox = await storage.getAgentInbox('test-project', 'recipient');
    assert.strictEqual(inbox.length, 0, 'Should have 0 messages on second read (all archived)');

    // Verify all 3 messages are in archive
    const archiveDir = path.join(testRoot, 'projects', 'test-project', 'messages', 'recipient', 'archive');
    const archivedFiles = await fs.readdir(archiveDir);
    assert.strictEqual(archivedFiles.length, 3, 'All 3 messages should be in archive');

    await fs.rm(testRoot, { recursive: true, force: true });
  });

  it('should handle archive directory existing before first read', async () => {
    const testRoot = createTestRoot();
    const storage = new FileSystemStorage(testRoot);
    await storage.initialize();

    // Create project and join agents
    const project: ProjectMetadata = {
      project_id: 'test-project',
      name: 'Test Project',
      created_by: 'sender',
      created_at: new Date().toISOString(),
      schema_version: '1.0'
    };
    await storage.createProject(project);

    const sender: ProjectMember = {
      project_id: 'test-project',
      agent_name: 'sender',
      agent_id: randomUUID(),
      client_id: 'client-sender',
      joined_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      online: true
    };
    await storage.joinProject(sender);
    await storage.recordClientMembership('client-sender', 'test-project', 'sender', 'Test Project');

    const recipient: ProjectMember = {
      project_id: 'test-project',
      agent_name: 'recipient',
      agent_id: randomUUID(),
      client_id: 'client-recipient',
      joined_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      online: true
    };
    await storage.joinProject(recipient);
    await storage.recordClientMembership('client-recipient', 'test-project', 'recipient', 'Test Project');

    // Manually create an archive directory in the inbox (like from leaveProject)
    const inboxDir = path.join(testRoot, 'projects', 'test-project', 'messages', 'recipient');
    const archiveDir = path.join(inboxDir, 'archive');
    await fs.mkdir(archiveDir, { recursive: true });

    // Send a message
    const messageId = randomUUID();
    const message: Message = {
      message_id: messageId,
      project_id: 'test-project',
      from_agent: 'sender',
      to_agent: 'recipient',
      created_at: new Date().toISOString(),
      reply_expected: false,
      payload: { text: 'Test message' }
    };
    await storage.sendMessage(message);

    // Verify message is in inbox and gets archived
    let inbox = await storage.getAgentInbox('test-project', 'recipient');
    assert.strictEqual(inbox.length, 1, 'Message should be in inbox');

    // Verify message is archived even with pre-existing archive directory
    inbox = await storage.getAgentInbox('test-project', 'recipient');
    assert.strictEqual(inbox.length, 0, 'Message should be archived even with pre-existing archive directory');

    await fs.rm(testRoot, { recursive: true, force: true });
  });

  it('should auto-archive broadcast messages independently per recipient', async () => {
    const testRoot = createTestRoot();
    const storage = new FileSystemStorage(testRoot);
    await storage.initialize();

    // Create project and join agents
    const project: ProjectMetadata = {
      project_id: 'test-project',
      name: 'Test Project',
      created_by: 'sender',
      created_at: new Date().toISOString(),
      schema_version: '1.0'
    };
    await storage.createProject(project);

    const sender: ProjectMember = {
      project_id: 'test-project',
      agent_name: 'sender',
      agent_id: randomUUID(),
      client_id: 'client-sender',
      joined_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      online: true
    };
    await storage.joinProject(sender);
    await storage.recordClientMembership('client-sender', 'test-project', 'sender', 'Test Project');

    const recipient1: ProjectMember = {
      project_id: 'test-project',
      agent_name: 'recipient1',
      agent_id: randomUUID(),
      client_id: 'client-recipient1',
      joined_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      online: true
    };
    await storage.joinProject(recipient1);
    await storage.recordClientMembership('client-recipient1', 'test-project', 'recipient1', 'Test Project');

    const recipient2: ProjectMember = {
      project_id: 'test-project',
      agent_name: 'recipient2',
      agent_id: randomUUID(),
      client_id: 'client-recipient2',
      joined_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      online: true
    };
    await storage.joinProject(recipient2);
    await storage.recordClientMembership('client-recipient2', 'test-project', 'recipient2', 'Test Project');

    // Send a broadcast message
    const messageId = randomUUID();
    const message: Message = {
      message_id: messageId,
      project_id: 'test-project',
      from_agent: 'sender',
      broadcast: true,
      created_at: new Date().toISOString(),
      reply_expected: false,
      payload: { text: 'Broadcast message' }
    };
    await storage.sendMessage(message);

    // Verify both recipients received the message
    let inbox1 = await storage.getAgentInbox('test-project', 'recipient1');
    let inbox2 = await storage.getAgentInbox('test-project', 'recipient2');
    assert.strictEqual(inbox1.length, 1, 'Recipient1 should have message');
    assert.strictEqual(inbox2.length, 1, 'Recipient2 should have message');

    // Recipient1 reads (auto-archives) - recipient2 should still have it
    inbox1 = await storage.getAgentInbox('test-project', 'recipient1');
    assert.strictEqual(inbox1.length, 0, 'Recipient1 inbox should be empty after read');

    inbox2 = await storage.getAgentInbox('test-project', 'recipient2');
    assert.strictEqual(inbox2.length, 0, 'Recipient2 inbox should be empty after read');

    // Verify both have their own archived copies
    const archive1 = path.join(testRoot, 'projects', 'test-project', 'messages', 'recipient1', 'archive');
    const archive2 = path.join(testRoot, 'projects', 'test-project', 'messages', 'recipient2', 'archive');

    const archived1 = await fs.readdir(archive1);
    const archived2 = await fs.readdir(archive2);

    assert.strictEqual(archived1.length, 1, 'Recipient1 should have archived copy');
    assert.strictEqual(archived2.length, 1, 'Recipient2 should have archived copy');

    await fs.rm(testRoot, { recursive: true, force: true });
  });

  it('should filter out archive directory when reading inbox', async () => {
    const testRoot = createTestRoot();
    const storage = new FileSystemStorage(testRoot);
    await storage.initialize();

    // Create project and join agents
    const project: ProjectMetadata = {
      project_id: 'test-project',
      name: 'Test Project',
      created_by: 'sender',
      created_at: new Date().toISOString(),
      schema_version: '1.0'
    };
    await storage.createProject(project);

    const sender: ProjectMember = {
      project_id: 'test-project',
      agent_name: 'sender',
      agent_id: randomUUID(),
      client_id: 'client-sender',
      joined_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      online: true
    };
    await storage.joinProject(sender);
    await storage.recordClientMembership('client-sender', 'test-project', 'sender', 'Test Project');

    const recipient: ProjectMember = {
      project_id: 'test-project',
      agent_name: 'recipient',
      agent_id: randomUUID(),
      client_id: 'client-recipient',
      joined_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      online: true
    };
    await storage.joinProject(recipient);
    await storage.recordClientMembership('client-recipient', 'test-project', 'recipient', 'Test Project');

    // Send and read a message (creates archive directory)
    const message1: Message = {
      message_id: randomUUID(),
      project_id: 'test-project',
      from_agent: 'sender',
      to_agent: 'recipient',
      created_at: new Date().toISOString(),
      reply_expected: false,
      payload: { text: 'First message' }
    };
    await storage.sendMessage(message1);
    await storage.getAgentInbox('test-project', 'recipient'); // Auto-archives

    // Send another message
    const message2: Message = {
      message_id: randomUUID(),
      project_id: 'test-project',
      from_agent: 'sender',
      to_agent: 'recipient',
      created_at: new Date().toISOString(),
      reply_expected: false,
      payload: { text: 'Second message' }
    };
    await storage.sendMessage(message2);

    // Read again - should only see new message, not archive directory
    const inbox = await storage.getAgentInbox('test-project', 'recipient');
    assert.strictEqual(inbox.length, 1, 'Should only see one new message (archive dir filtered out)');
    assert.strictEqual((inbox[0].payload as any).text, 'Second message', 'Should be the second message');

    await fs.rm(testRoot, { recursive: true, force: true });
  });

  it('should handle concurrent inbox reads without message loss (v0.12.0 defensive locking)', async () => {
    const testRoot = createTestRoot();
    const storage = new FileSystemStorage(testRoot);
    await storage.initialize();

    // Create project and join agents
    const project: ProjectMetadata = {
      project_id: 'test-project',
      name: 'Test Project',
      created_by: 'sender',
      created_at: new Date().toISOString(),
      schema_version: '1.0'
    };
    await storage.createProject(project);

    const sender: ProjectMember = {
      project_id: 'test-project',
      agent_name: 'sender',
      agent_id: randomUUID(),
      client_id: 'client-sender',
      joined_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      online: true
    };
    await storage.joinProject(sender);
    await storage.recordClientMembership('client-sender', 'test-project', 'sender', 'Test Project');

    const recipient: ProjectMember = {
      project_id: 'test-project',
      agent_name: 'recipient',
      agent_id: randomUUID(),
      client_id: 'client-recipient',
      joined_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      online: true
    };
    await storage.joinProject(recipient);
    await storage.recordClientMembership('client-recipient', 'test-project', 'recipient', 'Test Project');

    // Send a message
    const messageId = randomUUID();
    const message: Message = {
      message_id: messageId,
      project_id: 'test-project',
      from_agent: 'sender',
      to_agent: 'recipient',
      created_at: new Date().toISOString(),
      reply_expected: true,
      payload: { text: 'Test concurrent reads' }
    };
    await storage.sendMessage(message);

    // Simulate concurrent inbox reads (like multiple long-poll requests)
    const read1Promise = storage.getAgentInbox('test-project', 'recipient');
    const read2Promise = storage.getAgentInbox('test-project', 'recipient');

    const [inbox1, inbox2] = await Promise.all([read1Promise, read2Promise]);

    // With locking, exactly ONE read should get the message
    // The other should get an empty array (message already archived)
    const totalMessages = inbox1.length + inbox2.length;
    assert.strictEqual(totalMessages, 1, 'Exactly one read should receive the message (no duplication, no loss)');

    // Verify the message was received by one of the reads
    const receivedMessage = inbox1.length > 0 ? inbox1[0] : inbox2[0];
    assert.strictEqual(receivedMessage.message_id, messageId, 'Correct message should be received');
    assert.strictEqual((receivedMessage.payload as any).text, 'Test concurrent reads', 'Message content should be correct');

    // Verify message is now archived
    const archiveDir = path.join(testRoot, 'projects', 'test-project', 'messages', 'recipient', 'archive');
    const archivedFiles = await fs.readdir(archiveDir);
    assert.strictEqual(archivedFiles.length, 1, 'Message should be in archive');

    // Subsequent reads should return empty
    const inbox3 = await storage.getAgentInbox('test-project', 'recipient');
    assert.strictEqual(inbox3.length, 0, 'Subsequent read should be empty');

    await fs.rm(testRoot, { recursive: true, force: true });
  });
});
