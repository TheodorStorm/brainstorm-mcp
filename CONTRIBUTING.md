<!-- SPDX-License-Identifier: BUSL-1.1 -->
<!-- Copyright (c) 2025 Theodor Storm -->

# Contributing to Brainstorm MCP

Thank you for your interest in contributing to Brainstorm! This document provides guidelines for contributing to the project.

## License

Brainstorm is licensed under the **Business Source License 1.1 (BUSL-1.1)** with the following parameters:

- **Additional Use Grant**: Non-production use only (development, testing, research)
- **Change Date**: October 29, 2029
- **Change License**: Apache License 2.0

### What This Means for Contributors

By contributing to Brainstorm, you agree that:

1. **Your contributions will be licensed under BSL 1.1** with the same terms as the project
2. **On October 29, 2029**, your contributions will automatically become Apache 2.0 licensed
3. **Production use** of your contributions requires a separate commercial license until the Change Date
4. **Non-production use** (development, testing, research) is freely permitted

### Future Licensing

The licensor reserves the right to offer Brainstorm under additional licenses (dual licensing) for commercial use. By contributing, you grant permission for your contributions to be included in such licenses, while the public version remains BSL 1.1 until the Change Date.

If you are unable or unwilling to contribute under these terms, please reach out to discuss alternative arrangements.

## How to Contribute

### Reporting Issues

- Search existing issues before creating a new one
- Provide clear reproduction steps for bugs
- Include environment details (OS, Node version, etc.)
- Use the issue templates when available

### Submitting Code

1. **Fork the repository** and create a feature branch
2. **Write clear commit messages** following conventional commit format:
   - `feat: add new feature`
   - `fix: resolve bug in X`
   - `docs: update documentation`
   - `test: add tests for Y`
   - `refactor: improve Z`

3. **Add tests** for new features or bug fixes
4. **Update documentation** if you change behavior or add features
5. **Ensure all tests pass**: `npm test`
6. **Build successfully**: `npm run build`
7. **Submit a pull request** with a clear description

### Code Style

- Follow existing code style and patterns
- Use TypeScript types properly (no `any` unless necessary)
- Add JSDoc comments for public APIs
- Include SPDX license identifier in new files:
  ```typescript
  // SPDX-License-Identifier: BUSL-1.1
  // Copyright (c) 2025 Theodor Storm
  ```

### Security

If you discover a security vulnerability:

1. **Do NOT open a public issue**
2. **Contact the maintainer privately** via GitHub issues marked as security advisories, or reach out through the project's GitHub repository
3. **Provide details** including reproduction steps and impact assessment
4. **Allow time** for a fix before public disclosure

See `tests/security.test.ts` for examples of security considerations.

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/brainstorm-mcp.git
cd brainstorm-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Watch mode for development
npm run dev

# Configure for local testing
npm run config
```

## Testing

Brainstorm uses Node.js built-in test runner:

```bash
# Run all tests
npm test

# Run specific test file
node --test dist/tests/security.test.js
```

Test files are located in `tests/` and compiled to `dist/tests/` during build.

### Test Coverage Areas

- **Security**: Path traversal, authorization, error sanitization
- **Core functionality**: Projects, agents, messages, resources
- **Edge cases**: Concurrent operations, invalid input, race conditions

## Architecture Overview

Brainstorm follows a three-layer architecture:

1. **MCP Protocol Layer** (`src/server.ts`) - Exposes tools and handles client requests
2. **Storage Abstraction** (`src/storage.ts`) - File system operations with atomic writes
3. **Type System** (`src/types.ts`) - Core data models

See [CLAUDE.md](CLAUDE.md) for detailed architecture documentation.

## Questions?

- Open a GitHub issue for general questions
- Check existing issues and documentation first
- Be respectful and constructive in all interactions

## Code of Conduct

Be professional, respectful, and inclusive. We're all here to build something useful together.

---

**Note**: This project is maintained by Theodor Storm. Contributions are welcome, but the project direction and final decisions rest with the maintainer.
