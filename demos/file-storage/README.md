# 📁 File Storage Demo

This demo showcases Brainstorm's efficient file storage capabilities introduced in v0.4.0:

- **Small files (<10KB)**: Stored inline using the `content` parameter
- **Large files (>10KB)**: Stored by reference using the `local_path` parameter

## What This Demonstrates

✅ **Inline content storage** - JSON, text, and small data files
✅ **File reference storage** - Images, documents, and larger files
✅ **Permission model** - Public read, restricted write access
✅ **Resource retrieval** - Accessing stored resources
✅ **Payload validation** - Automatic routing based on size

## Quick Start

```bash
# Terminal 1: Storage Manager (creates and manages resources)
cd demos/file-storage
./storage-manager.sh

# Terminal 2: Reader Agent (reads and verifies resources)
cd demos/file-storage
./reader-agent.sh
```

## How It Works

### Storage Manager Agent

1. **Creates project** `file-storage-demo`
2. **Stores small resources** using inline `content`:
   - JSON configuration (<1KB)
   - Text document (~5KB)
   - Small CSV dataset (~8KB)
3. **Stores large resources** using `local_path`:
   - Medium text file (~50KB)
   - Large data file (~200KB)
4. **Sets permissions** for each resource

### Reader Agent

1. **Joins project** `file-storage-demo`
2. **Lists all resources** to discover what's available
3. **Retrieves each resource** and verifies content
4. **Reports statistics** on storage efficiency

## Technical Details

### Inline Storage (`content` parameter)

- **When to use**: Files <10KB
- **Advantage**: Simple, immediate storage
- **Format**: JSON string
- **Example**:
```javascript
store_resource({
  resource_id: "config",
  content: '{"version": "1.0", "settings": {...}}',
  permissions: { read: ["*"], write: ["manager"] }
})
```

### File Reference (`local_path` parameter)

- **When to use**: Files >10KB and <500KB (configurable)
- **Advantage**: No duplication, efficient for large files
- **Requirement**: Path must be within home directory
- **Example**:
```javascript
store_resource({
  resource_id: "large-data",
  local_path: "/absolute/path/to/file.json",
  permissions: { read: ["*"], write: ["manager"] }
})
```

## Sample Files

The demo includes sample files in various sizes:

- `config.json` (819 bytes) - Configuration data
- `document.txt` (~5KB) - Sample text document
- `dataset.csv` (~8KB) - CSV data with headers
- `medium-file.txt` (~50KB) - Generated lorem ipsum
- `large-data.json` (~200KB) - Generated JSON array

## Key Observations

1. **Automatic validation**: Brainstorm validates all paths for security
2. **Permission enforcement**: Only agents with write permission can update
3. **Size limits**: 10KB inline, 500KB file reference (configurable)
4. **Atomic operations**: Resources are stored atomically with fsync

## Security Features

- ✅ Path traversal prevention (no `..`, `/`, `\`)
- ✅ Home directory restriction
- ✅ Deny-by-default permissions
- ✅ Payload size limits
- ✅ JSON nesting depth validation

## Next Steps

Try modifying the demo to:

1. Store your own files
2. Implement different permission models
3. Create a file versioning system
4. Build a shared document repository

See the [main README](../../README.md) for more information on resource storage.
