#!/usr/bin/env node
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2025 Theodor Storm

/**
 * Brainstorm MCP Server - Entry Point
 *
 * This is the main entry point for the Brainstorm MCP (Model Context Protocol) server.
 * It enables multiple Claude Code instances on the same computer to communicate and
 * collaborate through shared projects, messages, and resources.
 *
 * **Key Features:**
 * - Project-based collaboration between multiple agents
 * - Message passing (direct and broadcast)
 * - Shared resource storage with permissions
 * - Session persistence via working directory mapping
 *
 * **Environment Variables:**
 * - `BRAINSTORM_STORAGE`: Custom storage path (default: ~/.brainstorm)
 * - `BRAINSTORM_MAX_PAYLOAD_SIZE`: Max resource size in bytes (default: 500KB)
 *
 * **Usage:**
 * ```bash
 * # Run with default storage
 * node dist/src/index.js
 *
 * # Run with custom storage path
 * BRAINSTORM_STORAGE=/custom/path node dist/src/index.js
 * ```
 *
 * @module index
 * @see {@link AgentCoopServer} for server implementation
 */

import { AgentCoopServer } from './server.js';
import * as path from 'path';
import * as os from 'os';

/**
 * Default storage path for all Brainstorm data.
 * Located in user's home directory: ~/.brainstorm
 *
 * Directory structure:
 * - projects/     - Project metadata and members
 * - clients/      - Client identity and session data
 * - locks/        - Concurrency control locks
 * - system/       - Server configuration and audit logs
 */
const DEFAULT_STORAGE_PATH = path.join(os.homedir(), '.brainstorm');

/**
 * Resolved storage path from environment or default.
 * Can be overridden via BRAINSTORM_STORAGE environment variable.
 */
const storagePath = process.env.BRAINSTORM_STORAGE || DEFAULT_STORAGE_PATH;

/**
 * Initialize the MCP server instance with the resolved storage path.
 * The server handles all MCP protocol communication via stdio transport.
 */
const server = new AgentCoopServer(storagePath);

/**
 * Start the MCP server.
 *
 * The server listens for MCP protocol messages on stdin and responds on stdout.
 * Errors are logged to stderr and cause process exit with code 1.
 *
 * @async
 * @throws {Error} If server initialization or startup fails
 */
server.run().catch((error: any) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
