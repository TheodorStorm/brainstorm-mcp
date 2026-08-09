# Repository Guidelines

## Project Status

Brainstorm is a legacy proof of concept superseded by [Borg MCP](https://borgmcp.ai). Keep changes focused on maintenance, security, documentation, or preserving useful demos. Direct new coordination features to Borg unless requested otherwise.

## Project Structure & Module Organization

- `src/` contains the TypeScript implementation: `server.ts` exposes MCP tools, `storage.ts` handles persistence, and `types.ts` defines shared models.
- `tests/` contains Node test-runner suites compiled alongside the source.
- `scripts/` contains version generation, MCP configuration, and cleanup utilities.
- `demos/` holds standalone collaboration examples and their instructions.
- `dist/` is generated build output; do not edit it directly.

## Build, Test, and Development Commands

- `npm install` installs dependencies (Node.js 18+).
- `npm run build` generates version metadata and compiles TypeScript into `dist/`.
- `npm run dev` runs the TypeScript compiler in watch mode.
- `npm start` starts the compiled stdio MCP server.
- `npm test` builds and runs all compiled tests.
- `node --test dist/tests/security.test.js` runs one suite after a build.
- `npm run config` builds and updates the local Claude Code MCP configuration; use it only intentionally.

## Coding Style & Naming Conventions

Use strict TypeScript with two-space indentation, semicolons, and single-quoted strings. Use `PascalCase` for classes and types, `camelCase` for functions and variables, and `snake_case` for protocol fields and tool names. Avoid `any`; document public APIs with JSDoc. New source files need the existing BUSL-1.1 SPDX and copyright header. `npm run lint` exists, but no ESLint dependency or configuration is committed; preserve the established style manually.

## Testing Guidelines

Use `node:test` with `node:assert`. Name suites `*.test.ts` and place them in `tests/`. Add focused regression tests, especially for concurrency, authorization, path validation, and error sanitization. File-based tests must use unique temporary directories and clean them up. No coverage threshold is enforced.

## Commit & Pull Request Guidelines

This archived repository does not accept ordinary pull requests. For maintainer-requested archival fixes, use Conventional Commit forms such as `fix: prevent path traversal` or `docs: clarify setup`. Keep commits narrowly scoped and report `npm test` and `npm run build` results.

## Security & Licensing

Brainstorm is unsupported; do not use it in production or with untrusted agents. Preserve deny-by-default permissions and validate filesystem-derived input in any maintainer-requested fix. The code remains under BUSL-1.1 and converts to Apache-2.0 on October 29, 2029.
