# Concurrency Handling in Brainstorm MCP

This document describes the concurrency control mechanisms implemented in the Brainstorm MCP server.

## Overview

Brainstorm uses **optimistic locking with ETags** to prevent lost updates and race conditions when multiple agents update shared resources concurrently.

## ETag-Based Optimistic Locking

### Design

Every resource has an `etag` field that:
- Is a random 16-character hex string (hash of timestamp + UUID)
- Changes on every successful write
- Must be provided when updating an existing resource

### How It Works

1. **Agent reads resource**: Gets current content and etag string
2. **Agent modifies**: Makes changes in memory
3. **Agent writes back**: Provides the exact etag string it read (unchanged)
4. **Server validates**:
   - If `provided_etag == current_etag` → Accept write, generate new etag
   - If `provided_etag != current_etag` → Reject with `ETAG_MISMATCH`
5. **On conflict**: Agent re-reads resource, gets latest etag, and retries

### Implementation

**Types** (`src/types.ts:51`):
```typescript
export interface ResourceManifest {
  resource_id: string;
  project_id: string;
  name: string;
  // ...
  etag: string; // Random hash that changes on every write for optimistic locking
  // ...
}
```

**Storage Layer** (`src/storage.ts:685-703`):
```typescript
// Check write permissions and etag if updating existing resource
const existing = await this.getResourceManifestOnly(manifest.project_id, manifest.resource_id);
if (existing) {
  // ... permission checks ...

  // Optimistic locking: check etag matches
  if (manifest.etag !== undefined && manifest.etag !== existing.etag) {
    throw new ConflictError(
      'Resource has been modified by another agent. Read the latest etag and retry.',
      'ETAG_MISMATCH',
      {
        resource_id: manifest.resource_id,
        expected_etag: manifest.etag,
        current_etag: existing.etag
      }
    );
  }

  // Generate new etag for update
  manifest.etag = createHash('sha256')
    .update(`${Date.now()}-${randomUUID()}`)
    .digest('hex')
    .substring(0, 16);
} else {
  // New resource gets initial etag
  manifest.etag = createHash('sha256')
    .update(`${Date.now()}-${randomUUID()}`)
    .digest('hex')
    .substring(0, 16);
}
```

**MCP Tool** (`src/server.ts:302-305`):
```typescript
etag: {
  type: 'string',
  description: 'ETag from when you read the resource (required when updating). Pass back exactly what you received. Omit for new resources.'
}
```

## Example: Shared Counter

**Problem**: Multiple agents try to increment a counter simultaneously.

**Without ETags**:
```
Agent A: Reads counter = 5
Agent B: Reads counter = 5
Agent A: Writes counter = 6
Agent B: Writes counter = 6 (LOST UPDATE! Should be 7)
```

**With ETags**:
```
Agent A: Reads counter = 5, etag = "a1b2c3d4e5f67890"
Agent B: Reads counter = 5, etag = "a1b2c3d4e5f67890"
Agent A: Writes counter = 6, etag = "a1b2c3d4e5f67890" → succeeds, new etag = "f9e8d7c6b5a43210"
Agent B: Writes counter = 6, etag = "a1b2c3d4e5f67890" → ETAG_MISMATCH!
Agent B: Re-reads counter = 6, etag = "f9e8d7c6b5a43210"
Agent B: Writes counter = 7, etag = "f9e8d7c6b5a43210" → succeeds, new etag = "0123456789abcdef"
```

## Benefits

✅ **Prevents lost updates**: Changes are never silently overwritten
✅ **No locks required**: Optimistic approach avoids deadlocks and lock management
✅ **Scalable**: Agents can read concurrently without blocking
✅ **Simple retry logic**: Agents just re-read and retry on conflict
✅ **Atomic file operations**: Combined with existing atomic writes (temp + rename)

## Error Handling

When an agent receives a `ETAG_MISMATCH` error:

1. **Re-read the resource** to get the latest etag and data (the error does not include the current etag - you must re-read)
2. **Check if the change is still needed** based on the latest data
3. **Re-apply modifications** to the fresh data
4. **Retry the write** with the new etag (pass back exactly what you read)

## Alternatives Considered

### 1. Advisory Locks
**Approach**: Add `acquire_lock()` / `release_lock()` MCP tools

**Rejected because**:
- Requires new MCP tools
- Lock management complexity (TTL, stale locks, cleanup)
- Deadlock potential
- Doesn't fit file-system storage model well

### 2. Last-Write-Wins
**Approach**: No ETag checking, latest write overwrites

**Rejected because**:
- Lost updates are unacceptable for coordination use cases
- Silent data loss is dangerous

## Future Enhancements

### CRDTs (Conflict-Free Replicated Data Types)
For resources that can be merged automatically (e.g., append-only logs), implement CRDT support to avoid conflicts entirely.

### Conditional Updates
Support additional ETag features:
- `If-Match: "abc123"` header-style semantics
- Content-based ETags (hash of actual content) for cache validation

### Automatic Retry
Provide a higher-level MCP tool that automatically retries on `ETAG_MISMATCH` with exponential backoff.

## Testing

See `tests/security.test.ts` for ETag field validation in all resource manifests.

## References

- **Optimistic Locking**: https://en.wikipedia.org/wiki/Optimistic_concurrency_control
- **ETags (HTTP)**: Similar pattern used in RESTful APIs
- **Event Sourcing**: ETags support audit trails and change tracking
