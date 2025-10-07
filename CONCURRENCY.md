# Concurrency Handling in Brainstorm MCP

This document describes the concurrency control mechanisms implemented in the Brainstorm MCP server.

## Overview

Brainstorm uses **optimistic locking with versioning** to prevent lost updates and race conditions when multiple agents update shared resources concurrently.

## Version-Based Optimistic Locking

### Design

Every resource has a `version` field that:
- Starts at `1` when the resource is created
- Increments by `1` on every successful write
- Must be provided when updating an existing resource

### How It Works

1. **Agent reads resource**: Gets current content and version number
2. **Agent modifies**: Makes changes in memory
3. **Agent writes back**: Provides the version number it read
4. **Server validates**:
   - If `provided_version == current_version` → Accept write, increment version
   - If `provided_version != current_version` → Reject with `VERSION_CONFLICT`
5. **On conflict**: Agent re-reads resource, gets latest version, and retries

### Implementation

**Types** (`src/types.ts:51`):
```typescript
export interface ResourceManifest {
  resource_id: string;
  project_id: string;
  name: string;
  // ...
  version: number; // Incremented on every write for optimistic locking
  // ...
}
```

**Storage Layer** (`src/storage.ts:685-703`):
```typescript
// Check write permissions and version if updating existing resource
const existing = await this.getResourceManifestOnly(manifest.project_id, manifest.resource_id);
if (existing) {
  // ... permission checks ...

  // Optimistic locking: check version matches
  if (manifest.version !== undefined && manifest.version !== existing.version) {
    throw new ConflictError(
      'Resource has been modified by another agent. Read the latest version and retry.',
      'VERSION_CONFLICT',
      {
        resource_id: manifest.resource_id,
        expected_version: manifest.version,
        current_version: existing.version
      }
    );
  }

  // Increment version for update
  manifest.version = existing.version + 1;
} else {
  // New resource starts at version 1
  manifest.version = 1;
}
```

**MCP Tool** (`src/server.ts:302-305`):
```typescript
version: {
  type: 'number',
  description: 'Current version for optimistic locking (required when updating existing resource). Omit for new resources.'
}
```

## Example: Shared Counter

**Problem**: Multiple agents try to increment a counter simultaneously.

**Without versioning**:
```
Agent A: Reads counter = 5
Agent B: Reads counter = 5
Agent A: Writes counter = 6
Agent B: Writes counter = 6 (LOST UPDATE! Should be 7)
```

**With versioning**:
```
Agent A: Reads counter = 5, version = 3
Agent B: Reads counter = 5, version = 3
Agent A: Writes counter = 6, version = 3 → succeeds, version becomes 4
Agent B: Writes counter = 6, version = 3 → VERSION_CONFLICT!
Agent B: Re-reads counter = 6, version = 4
Agent B: Writes counter = 7, version = 4 → succeeds, version becomes 5
```

## Benefits

✅ **Prevents lost updates**: Changes are never silently overwritten
✅ **No locks required**: Optimistic approach avoids deadlocks and lock management
✅ **Scalable**: Agents can read concurrently without blocking
✅ **Simple retry logic**: Agents just re-read and retry on conflict
✅ **Atomic file operations**: Combined with existing atomic writes (temp + rename)

## Error Handling

When an agent receives a `VERSION_CONFLICT` error:

1. **Re-read the resource** to get the latest version
2. **Check if the change is still needed**
3. **Re-apply modifications** to the fresh data
4. **Retry the write** with the new version number

## Alternatives Considered

### 1. Advisory Locks
**Approach**: Add `acquire_lock()` / `release_lock()` MCP tools

**Rejected because**:
- Requires new MCP tools
- Lock management complexity (TTL, stale locks, cleanup)
- Deadlock potential
- Doesn't fit file-system storage model well

### 2. Last-Write-Wins
**Approach**: No version checking, latest write overwrites

**Rejected because**:
- Lost updates are unacceptable for coordination use cases
- Silent data loss is dangerous

## Future Enhancements

### CRDTs (Conflict-Free Replicated Data Types)
For resources that can be merged automatically (e.g., append-only logs), implement CRDT support to avoid conflicts entirely.

### Conditional Updates
Support ETag-style conditional updates in addition to version numbers:
- `If-Match: "abc123"` header-style semantics
- Hash-based versioning instead of sequential numbers

### Automatic Retry
Provide a higher-level MCP tool that automatically retries on `VERSION_CONFLICT` with exponential backoff.

## Testing

See `tests/security.test.ts` for version field validation in all resource manifests.

## References

- **Optimistic Locking**: https://en.wikipedia.org/wiki/Optimistic_concurrency_control
- **ETags (HTTP)**: Similar pattern used in RESTful APIs
- **Event Sourcing**: Version numbers support audit trails and event replay
