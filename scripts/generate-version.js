#!/usr/bin/env node
/**
 * Generate version.json from package.json
 * This ensures version info is in a single source of truth
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Read package.json
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'));

// Extract version info
const versionInfo = {
  version: packageJson.version,
  name: packageJson.name,
  description: packageJson.description
};

// Ensure dist/src directory exists
mkdirSync(join(rootDir, 'dist', 'src'), { recursive: true });

// Write to dist/src/version.json (will be imported by compiled server.js)
const outputPath = join(rootDir, 'dist', 'src', 'version.json');
writeFileSync(outputPath, JSON.stringify(versionInfo, null, 2) + '\n');

console.log(`Generated ${outputPath}`);
