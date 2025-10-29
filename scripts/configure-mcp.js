#!/usr/bin/env node

/**
 * Configures Brainstorm MCP server in Claude Code using the official CLI
 */

import { execSync } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SERVER_PATH = path.join(PROJECT_ROOT, 'dist', 'src', 'index.js');

async function configureBrainstorm() {
  try {
    // Check if dist/src/index.js exists
    try {
      await fs.access(SERVER_PATH);
    } catch {
      console.error('❌ Error: dist/src/index.js not found. Run "npm run build" first.');
      process.exit(1);
    }

    console.log('📦 Installing Brainstorm MCP server...');
    console.log(`   Server path: ${SERVER_PATH}`);
    console.log('');

    // Remove existing server if it exists (to update the path)
    try {
      execSync('claude mcp remove --scope user brainstorm', { stdio: 'pipe' });
      console.log('   Removed existing brainstorm server');
    } catch {
      // Server doesn't exist, that's fine
    }

    // Use Claude Code's official MCP command to add the server
    // --scope user: Install globally for this user (available to all projects)
    try {
      execSync(
        `claude mcp add --scope user brainstorm node "${SERVER_PATH}"`,
        { stdio: 'inherit' }
      );
    } catch (error) {
      console.error('');
      console.error('❌ Failed to install MCP server using claude mcp command');
      console.error('   Make sure Claude Code is properly installed');
      console.error('   Error:', error.message);
      process.exit(1);
    }

    console.log('');
    console.log('✅ Successfully configured Brainstorm MCP server');
    console.log('   Server name: brainstorm');
    console.log('   Command: node ' + SERVER_PATH);
    console.log('   Scope: user (available to all projects globally)');
    console.log('');
    console.log('ℹ️  The server is now available. Use /mcp to verify.');
    console.log('   You can also run: claude mcp list');

  } catch (error) {
    console.error('❌ Failed to configure MCP server:', error.message);
    process.exit(1);
  }
}

configureBrainstorm();
