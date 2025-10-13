/**
 * Message Acknowledgment Tests (v0.9.0)
 *
 * Tests for verifying that acknowledged messages are properly removed from inbox
 * and don't reappear in subsequent receive_messages calls.
 *
 * Bug Report: Users experiencing duplicate messages that reappear even after
 * multiple acknowledgments.
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

describe('Message Acknowledgment', () => {
  it('should remove message from inbox after acknowledgment', async () => {
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

    // Acknowledge the message
    await storage.markMessageProcessed('test-project', 'recipient', messageId);

    // Verify message is removed from inbox
    inbox = await storage.getAgentInbox('test-project', 'recipient');
    assert.strictEqual(inbox.length, 0, 'Message should be removed from inbox after acknowledgment');

    await fs.rm(testRoot, { recursive: true, force: true });
  });

  it('should not return acknowledged messages on subsequent receives', async () => {
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

    // Receive all messages
    let inbox = await storage.getAgentInbox('test-project', 'recipient');
    assert.strictEqual(inbox.length, 3, 'Should have 3 messages');

    // Acknowledge first message
    await storage.markMessageProcessed('test-project', 'recipient', messageIds[0]);

    // Receive again - should only have 2 messages
    inbox = await storage.getAgentInbox('test-project', 'recipient');
    assert.strictEqual(inbox.length, 2, 'Should have 2 messages after acknowledging one');
    assert.ok(!inbox.find(m => m.message_id === messageIds[0]), 'Acknowledged message should not be present');
    assert.ok(inbox.find(m => m.message_id === messageIds[1]), 'Second message should be present');
    assert.ok(inbox.find(m => m.message_id === messageIds[2]), 'Third message should be present');

    // Acknowledge second message
    await storage.markMessageProcessed('test-project', 'recipient', messageIds[1]);

    // Receive again - should only have 1 message
    inbox = await storage.getAgentInbox('test-project', 'recipient');
    assert.strictEqual(inbox.length, 1, 'Should have 1 message after acknowledging two');
    assert.ok(!inbox.find(m => m.message_id === messageIds[0]), 'First message should not reappear');
    assert.ok(!inbox.find(m => m.message_id === messageIds[1]), 'Second message should not reappear');
    assert.ok(inbox.find(m => m.message_id === messageIds[2]), 'Third message should be present');

    await fs.rm(testRoot, { recursive: true, force: true });
  });

  it('should handle acknowledging the same message multiple times', async () => {
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
      reply_expected: false,
      payload: { text: 'Test message' }
    };
    await storage.sendMessage(message);

    // Acknowledge the message multiple times - should not throw error
    await storage.markMessageProcessed('test-project', 'recipient', messageId);
    await storage.markMessageProcessed('test-project', 'recipient', messageId);
    await storage.markMessageProcessed('test-project', 'recipient', messageId);

    // Verify message is removed
    const inbox = await storage.getAgentInbox('test-project', 'recipient');
    assert.strictEqual(inbox.length, 0, 'Message should be removed');

    await fs.rm(testRoot, { recursive: true, force: true });
  });

  it('should handle acknowledging message when archive directory exists', async () => {
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

    // Manually create an archive directory in the inbox
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

    // Verify message is in inbox
    let inbox = await storage.getAgentInbox('test-project', 'recipient');
    assert.strictEqual(inbox.length, 1, 'Message should be in inbox');

    // Acknowledge the message - should work even with archive directory present
    await storage.markMessageProcessed('test-project', 'recipient', messageId);

    // Verify message is removed
    inbox = await storage.getAgentInbox('test-project', 'recipient');
    assert.strictEqual(inbox.length, 0, 'Message should be removed even with archive directory present');

    await fs.rm(testRoot, { recursive: true, force: true });
  });

  it('should handle acknowledging broadcast messages', async () => {
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

    // Recipient1 acknowledges
    await storage.markMessageProcessed('test-project', 'recipient1', messageId);

    // Verify recipient1's inbox is cleared but recipient2 still has message
    inbox1 = await storage.getAgentInbox('test-project', 'recipient1');
    inbox2 = await storage.getAgentInbox('test-project', 'recipient2');
    assert.strictEqual(inbox1.length, 0, 'Recipient1 inbox should be empty');
    assert.strictEqual(inbox2.length, 1, 'Recipient2 should still have message');

    // Recipient2 acknowledges
    await storage.markMessageProcessed('test-project', 'recipient2', messageId);

    // Verify both inboxes are cleared
    inbox1 = await storage.getAgentInbox('test-project', 'recipient1');
    inbox2 = await storage.getAgentInbox('test-project', 'recipient2');
    assert.strictEqual(inbox1.length, 0, 'Recipient1 inbox should be empty');
    assert.strictEqual(inbox2.length, 0, 'Recipient2 inbox should be empty');

    await fs.rm(testRoot, { recursive: true, force: true });
  });

  it('should reproduce user-reported bug: duplicate messages after acknowledgment', async () => {
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

    // Send messages with UUIDs similar to user's report
    const messageId1 = 'ef8e9a10-c4bd-4931-8c0c-96323b73e5c0';
    const messageId2 = '2767bbd1-464d-4e66-a29f-e76d60c480ac';

    const message1: Message = {
      message_id: messageId1,
      project_id: 'test-project',
      from_agent: 'sender',
      to_agent: 'recipient',
      created_at: new Date().toISOString(),
      reply_expected: false,
      payload: { text: 'isExternal resolved' }
    };
    await storage.sendMessage(message1);

    await new Promise(resolve => setTimeout(resolve, 10));

    const message2: Message = {
      message_id: messageId2,
      project_id: 'test-project',
      from_agent: 'sender',
      to_agent: 'recipient',
      created_at: new Date().toISOString(),
      reply_expected: false,
      payload: { text: 'Real-Time Sync architecture discussion' }
    };
    await storage.sendMessage(message2);

    // Receive messages
    let inbox = await storage.getAgentInbox('test-project', 'recipient');
    assert.strictEqual(inbox.length, 2, 'Should have 2 messages initially');

    // Acknowledge first message multiple times (as user reported)
    await storage.markMessageProcessed('test-project', 'recipient', messageId1);
    await storage.markMessageProcessed('test-project', 'recipient', messageId1);
    await storage.markMessageProcessed('test-project', 'recipient', messageId1);

    // Receive messages again - first message should NOT reappear
    inbox = await storage.getAgentInbox('test-project', 'recipient');
    assert.strictEqual(inbox.length, 1, 'Should have only 1 message after acknowledging first');
    assert.ok(!inbox.find(m => m.message_id === messageId1), 'First message should NOT reappear');
    assert.ok(inbox.find(m => m.message_id === messageId2), 'Second message should still be present');

    // Acknowledge second message multiple times
    await storage.markMessageProcessed('test-project', 'recipient', messageId2);
    await storage.markMessageProcessed('test-project', 'recipient', messageId2);

    // Receive messages again - both should be gone
    inbox = await storage.getAgentInbox('test-project', 'recipient');
    assert.strictEqual(inbox.length, 0, 'All messages should be removed');

    await fs.rm(testRoot, { recursive: true, force: true });
  });
});
