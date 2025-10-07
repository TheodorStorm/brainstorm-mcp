#!/usr/bin/env node

/**
 * Direct project cleanup utility (bypasses authorization)
 * Use this for testing, development cleanup, or emergency recovery
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';

const DEFAULT_STORAGE = path.join(homedir(), '.brainstorm', 'data');

async function cleanupProject() {
  const projectId = process.argv[2];
  const storagePath = process.env.BRAINSTORM_STORAGE || DEFAULT_STORAGE;

  if (!projectId) {
    console.error('❌ Error: project_id is required');
    console.error('');
    console.error('Usage: npm run cleanup -- <project_id>');
    console.error('');
    console.error('Environment Variables:');
    console.error('  BRAINSTORM_STORAGE  Custom storage path (default: ~/.brainstorm)');
    console.error('');
    console.error('Examples:');
    console.error('  npm run cleanup -- my-test-project');
    console.error('  BRAINSTORM_STORAGE=/tmp/test npm run cleanup -- my-project');
    process.exit(1);
  }

  // Validate project_id format (same validation as storage layer)
  if (!/^[A-Za-z0-9_-]+$/.test(projectId)) {
    console.error('❌ Error: Invalid project_id');
    console.error('   Project IDs must contain only alphanumeric characters, dashes, and underscores');
    process.exit(1);
  }

  if (projectId.includes('..') || projectId.includes('/') || projectId.includes('\\')) {
    console.error('❌ Error: Invalid project_id (contains path traversal characters)');
    process.exit(1);
  }

  const projectDir = path.join(storagePath, 'projects', projectId);

  try {
    // Check if project exists
    try {
      await fs.access(projectDir);
    } catch {
      console.error(`❌ Error: Project "${projectId}" not found at ${projectDir}`);
      process.exit(1);
    }

    // Display project info before deletion
    try {
      const metadataPath = path.join(projectDir, 'metadata.json');
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
      console.log('📋 Project Information:');
      console.log(`   ID: ${metadata.project_id}`);
      console.log(`   Name: ${metadata.name}`);
      console.log(`   Creator: ${metadata.created_by || '(none)'}`);
      console.log(`   Created: ${metadata.created_at}`);
      console.log('');
    } catch {
      console.log('⚠️  Warning: Could not read project metadata');
      console.log('');
    }

    // Confirm deletion
    console.log(`🗑️  Deleting project directory: ${projectDir}`);
    console.log('   This action cannot be undone.');
    console.log('');

    // Delete the project
    await fs.rm(projectDir, { recursive: true, force: true });

    console.log('✅ Successfully deleted project');
    console.log(`   Project ID: ${projectId}`);
    console.log(`   Storage: ${storagePath}`);

  } catch (error) {
    console.error('❌ Failed to delete project:', error.message);
    process.exit(1);
  }
}

cleanupProject();
