# Moving to Borg MCP

Brainstorm is no longer maintained. [Borg MCP](https://borgmcp.ai) is its successor for coordinating Claude Code, Codex, and OpenCode sessions on local repositories.

## Before Switching

Brainstorm and Borg use different data models, and there is no automatic importer. Preserve any Brainstorm messages, shared resources, or decisions you still need before removing the old setup. Brainstorm data is stored in `~/.brainstorm` by default.

## Install Borg

Follow the current [Borg MCP documentation](https://borgmcp.ai/docs/). The basic flow is:

```bash
npm install -g borgmcp
borg setup
borg server start
```

From each Git repository you want Borg to coordinate, run:

```bash
borg assimilate
```

Once Borg is working, remove the old `brainstorm` MCP registration from your agent configuration. Brainstorm data is not deleted automatically.
