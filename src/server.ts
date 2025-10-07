/**
 * MCP server for project-centric agent cooperation
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import { FileSystemStorage } from './storage.js';
import { isUserError } from './errors.js';
import type {
  ProjectMetadata,
  ProjectMember,
  Message,
  ResourceManifest
} from './types.js';

export class AgentCoopServer {
  private server: Server;
  private storage: FileSystemStorage;
  private activeLongPolls = new Map<string, number>();
  private readonly MAX_CONCURRENT_POLLS = 100;

  constructor(storagePath: string) {
    this.storage = new FileSystemStorage(storagePath);

    this.server = new Server(
      {
        name: 'brainstorm',
        version: '0.2.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupHandlers();
  }

  /**
   * Centralized error handler that preserves UserError metadata
   * and sanitizes system errors
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
          description: 'Join a project with a friendly agent name. This is how agents register themselves within a project.',
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
            required: ['project_id', 'agent_name']
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
                description: 'Maximum seconds to wait when wait=true (default: 90, max: 900)',
                minimum: 1,
                maximum: 900
              }
            },
            required: ['project_id']
          }
        },
        {
          name: 'list_projects',
          description: 'List all available projects',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'send_message',
          description: 'Send a message to another agent in the project or broadcast to all members',
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
              type: {
                type: 'string',
                enum: ['request', 'response', 'event'],
                description: 'Message type'
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
            required: ['project_id', 'from_agent', 'type', 'payload']
          }
        },
        {
          name: 'receive_messages',
          description: 'Get messages from your inbox. Supports long-polling to wait for new messages.',
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
              limit: {
                type: 'number',
                description: 'Maximum number of messages to retrieve'
              },
              wait: {
                type: 'boolean',
                description: 'If true, wait for messages to arrive instead of returning empty immediately (long-polling)'
              },
              timeout_seconds: {
                type: 'number',
                description: 'Maximum seconds to wait for messages when wait=true (default: 90, max: 900)',
                minimum: 1,
                maximum: 900
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
          description: 'Store a shared resource or document in the project. For updates, include the current version to prevent conflicts.',
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
              creator_agent: {
                type: 'string',
                description: 'Your agent name'
              },
              content: {
                type: 'string',
                description: 'Resource content (text or base64)'
              },
              mime_type: {
                type: 'string',
                description: 'Content MIME type'
              },
              version: {
                type: 'number',
                description: 'Current version for optimistic locking (required when updating existing resource). Omit for new resources.'
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
            required: ['project_id', 'resource_id', 'name', 'creator_agent']
          }
        },
        {
          name: 'get_resource',
          description: 'Retrieve a shared resource from the project. Supports waiting for resource creation.',
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
                description: 'Maximum seconds to wait when wait=true (default: 90, max: 900)',
                minimum: 1,
                maximum: 900
              }
            },
            required: ['project_id', 'resource_id', 'agent_name']
          }
        },
        {
          name: 'list_resources',
          description: 'List all resources in the project you have access to',
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
              }
            },
            required: ['project_id', 'agent_name']
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
            const member: ProjectMember = {
              project_id: args.project_id as string,
              agent_name: args.agent_name as string,
              agent_id: randomUUID(),
              capabilities: (args.capabilities as string[]) || [],
              labels: (args.labels as Record<string, string>) || {},
              joined_at: new Date().toISOString(),
              last_seen: new Date().toISOString(),
              online: true
            };

            await this.storage.joinProject(member);

            await this.storage.auditLog({
              timestamp: new Date().toISOString(),
              actor: member.agent_name,
              action: 'join_project',
              target: member.project_id,
              details: { agent_id: member.agent_id }
            });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  agent_name: member.agent_name,
                  agent_id: member.agent_id,
                  message: 'Joined project successfully. You can now send and receive messages.'
                }, null, 2)
              }]
            };
          }

          case 'get_project_info': {
            const projectId = args.project_id as string;
            const wait = args.wait as boolean || false;

            // Get timeout settings from system config
            const config = await this.storage.getSystemConfig();
            const defaultTimeout = config?.default_long_poll_timeout_seconds || 90;
            const maxTimeout = config?.max_long_poll_timeout_seconds || 900;
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
                const pollIntervalMs = 1000; // Check every second

                while (Date.now() - startTime < timeoutMs) {
                  const metadata = await this.storage.getProjectMetadata(projectId);
                  if (metadata) {
                    const members = await this.storage.listProjectMembers(projectId);
                    return {
                      content: [{
                        type: 'text',
                        text: JSON.stringify({
                          project: metadata,
                          members: members,
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
                      timeout: true
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

            const members = await this.storage.listProjectMembers(projectId);

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  project: metadata,
                  members: members
                }, null, 2)
              }]
            };
          }

          case 'list_projects': {
            const projects = await this.storage.listProjects();

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  projects: projects,
                  count: projects.length
                }, null, 2)
              }]
            };
          }

          case 'send_message': {
            const projectId = args.project_id as string;
            const fromAgent = args.from_agent as string;
            const toAgent = args.to_agent as string | undefined;
            const broadcast = args.broadcast as boolean || false;

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

            // Validate message type
            const validMessageTypes = ['request', 'response', 'event'] as const;
            if (!validMessageTypes.includes(args.type as any)) {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    error: 'Invalid message type',
                    code: 'INVALID_MESSAGE_TYPE',
                    details: { provided: args.type, allowed: validMessageTypes }
                  })
                }],
                isError: true
              };
            }

            const message: Message = {
              message_id: randomUUID(),
              project_id: projectId,
              from_agent: fromAgent,
              to_agent: toAgent,
              broadcast: broadcast,
              type: args.type as 'request' | 'response' | 'event',
              payload: args.payload,
              created_at: new Date().toISOString(),
              metadata: args.metadata as Message['metadata']
            };

            await this.storage.sendMessage(message);

            await this.storage.auditLog({
              timestamp: new Date().toISOString(),
              actor: fromAgent,
              action: 'send_message',
              target: toAgent || 'broadcast',
              details: { project_id: projectId, message_id: message.message_id }
            });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message_id: message.message_id
                }, null, 2)
              }]
            };
          }

          case 'receive_messages': {
            const projectId = args.project_id as string;
            const agentName = args.agent_name as string;
            const limit = args.limit as number | undefined;
            const wait = args.wait as boolean || false;

            // Get timeout settings from system config
            const config = await this.storage.getSystemConfig();
            const defaultTimeout = config?.default_long_poll_timeout_seconds || 90;
            const maxTimeout = config?.max_long_poll_timeout_seconds || 900;
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
                const pollIntervalMs = 1000; // Check every second

                while (Date.now() - startTime < timeoutMs) {
                  const messages = await this.storage.getAgentInbox(projectId, agentName, limit);
                  if (messages.length > 0) {
                    return {
                      content: [{
                        type: 'text',
                        text: JSON.stringify({
                          messages,
                          count: messages.length,
                          waited_ms: Date.now() - startTime
                        }, null, 2)
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
                      timeout: true
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
            const messages = await this.storage.getAgentInbox(projectId, agentName, limit);

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  messages,
                  count: messages.length
                }, null, 2)
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
            const manifest: ResourceManifest = {
              resource_id: args.resource_id as string,
              project_id: args.project_id as string,
              name: args.name as string,
              description: args.description as string | undefined,
              creator_agent: args.creator_agent as string,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              version: args.version as number | undefined || 0, // Will be set by storage layer
              mime_type: args.mime_type as string | undefined,
              permissions: args.permissions as ResourceManifest['permissions'] | undefined,
              metadata: args.metadata as Record<string, unknown> | undefined
            };

            const content = args.content as string | undefined;

            await this.storage.storeResource(manifest, content);

            await this.storage.auditLog({
              timestamp: new Date().toISOString(),
              actor: manifest.creator_agent,
              action: 'store_resource',
              target: manifest.resource_id,
              details: { project_id: manifest.project_id }
            });

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  resource_id: manifest.resource_id
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
            const defaultTimeout = config?.default_long_poll_timeout_seconds || 90;
            const maxTimeout = config?.max_long_poll_timeout_seconds || 900;
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
                const pollIntervalMs = 1000; // Check every second

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
                      timeout: true
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

            const resources = await this.storage.listResources(projectId, agentName);

            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  resources,
                  count: resources.length
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

          case 'delete_project': {
            const projectId = args.project_id as string;
            const agentName = args.agent_name as string;

            await this.storage.deleteProject(projectId, agentName);

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
                  message: 'Project deleted successfully'
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
  }

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

  async run(): Promise<void> {
    await this.storage.initialize();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    // Set up handlers to detect disconnection and exit gracefully
    this.setupProcessHandlers();

    console.error('Brainstorm MCP server running on stdio');
  }
}
