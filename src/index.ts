#!/usr/bin/env node

/**
 * Brainstorm MCP Server
 * Entry point for multi-agent collaboration
 */

import { AgentCoopServer } from './server.js';
import * as path from 'path';
import * as os from 'os';

// Default storage path: ~/.brainstorm
const DEFAULT_STORAGE_PATH = path.join(os.homedir(), '.brainstorm');

const storagePath = process.env.BRAINSTORM_STORAGE || DEFAULT_STORAGE_PATH;

const server = new AgentCoopServer(storagePath);

server.run().catch((error: any) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
