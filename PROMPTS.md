# MCP Prompts Reference

Brainstorm provides **8 context-aware prompts** that make multi-agent collaboration intuitive and error-free. Each prompt queries the storage layer to inject real-time project state, enabling smart suggestions, validation, and helpful error handling.

## What Are MCP Prompts?

**Prompts are not tools** - they're guided workflows that wrap tools with intelligence:

1. You provide **high-level arguments** (e.g., project name, goal, message)
2. The prompt **queries storage** for real-time state (members, messages, resources)
3. It **injects context** into instructions for Claude
4. Claude follows the instructions to **call the appropriate tools** with correct parameters

**Benefits:**
- **Context-aware**: See who's online, what projects exist, recent messages
- **Smart defaults**: Auto-generate IDs, infer reply_expected, suggest roles
- **Error prevention**: Detect conflicts, validate inputs, show helpful alternatives
- **Time-saving**: One prompt replaces multiple tool calls

## When to Use Prompts vs Tools

**Use Prompts** (recommended for most workflows):
- ✅ Starting a new collaboration
- ✅ Joining projects
- ✅ Common messaging patterns
- ✅ Getting project status
- ✅ Sharing resources
- ✅ Quick onboarding

**Use Tools Directly** (advanced workflows):
- ✅ Custom game mechanics (tic-tac-toe, debate)
- ✅ Precise control over every parameter
- ✅ Specialized protocols
- ✅ Fine-grained coordination choreography

---

## Available Prompts

### 📋 `list`

**List all available projects. Perfect for discovery - NO arguments needed!**

#### Arguments

NONE! Just run it.

#### What It Does

1. **Queries all projects**: Gets complete list from storage
2. **Shows project details**: Name, description, created date for each
3. **Suggests next steps**: Reminds you how to join or create projects
4. **Handles empty state**: Helpful message if no projects exist yet

#### Context Injected

- Complete list of all projects with metadata
- Project count
- Suggested next actions (join, create, status)

#### Example

```bash
# In Claude Code - just run it!
Use the "list" prompt (no arguments)
```

**What Claude sees (with projects):**
```
📋 **Available Projects** (2)

### 📁 API Redesign Sprint (`api-redesign`)
**Description**: Coordinate frontend and backend for API v2
**Created**: Oct 13, 2025 10:00 AM

### 📁 Platform Docs (`platform-docs`)
**Description**: Shared architecture knowledge base
**Created**: Oct 12, 2025 2:30 PM

**Next steps**:
- Use **"join"** prompt with a project_id to join one of these projects
- Use **"create"** prompt to start a new project
- Use **"status"** prompt to see which projects you're already in
```

**What Claude sees (no projects yet):**
```
📋 **No Projects Yet**

No collaboration projects have been created yet. Be the first!

**To get started**:
- Use the **"create"** prompt to start a new project
- Example: Create a project called "API Redesign" with goal "Coordinate frontend and backend"
```

#### Tips

- **Start here**: This is the first thing to run when you connect to Brainstorm
- **No friction**: Absolutely zero arguments required
- **Discovery mode**: See what collaborations are happening

---

### 👤 `status`

**Show your status across all projects you've joined from your working directory.**

#### Arguments

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `working_directory` | string | ✅ | Absolute path to your project directory (session is tied to this directory) |

#### What It Does

1. **Scans your sessions**: Checks which projects you've joined from this working directory
2. **Shows your projects**: Lists all project memberships for this directory
3. **Counts unread messages**: Shows message count per project
4. **Provides quick overview**: Total projects and unread messages
5. **Suggests next steps**: Recommends reviewing messages or joining more projects

#### Context Injected

- Your membership status for this working directory
- Unread message counts per project
- Agent names used in each project
- Total project count and unread message count
- Suggested next actions

#### Example

```bash
# In Claude Code
Use the "status" prompt with:
- working_directory: "/Users/you/my-project"
```

**What Claude sees (with memberships):**
```
👤 **Status for /Users/you/my-project**

**Projects**: 2
**Total unread messages**: 3

### API Redesign Sprint (`api-redesign`)
**Your role**: frontend
**Messages**: 📬 2 unread

### Platform Docs (`platform-docs`)
**Your role**: reviewer
**Messages**: 📬 1 unread

**Next steps**:
- Use **"review"** prompt to see message details for a specific project
- Use **"broadcast"** prompt to send messages to project members
- Use **"list"** prompt to discover other available projects
```

**What Claude sees (no memberships):**
```
👤 **Status for /Users/you/my-project**

You're not a member of any projects yet from this directory.

**Available projects** (2):
- **api-redesign**: API Redesign Sprint
- **platform-docs**: Platform Docs

**To get started**:
- Use **"list"** prompt to see project details
- Use **"join"** prompt to join an existing project
- Use **"create"** prompt to start a new project
```

#### Tips

- **Quick dashboard**: See all your activity at a glance
- **Directory-based**: Each working directory has its own session
- **Catch up**: See where you have unread messages
- **Automatic**: Session persists across Claude Code restarts

---

### 🚀 `create`

**Create a new project and automatically join as the first member.**

#### Arguments

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `project_name` | string | ✅ | Human-readable project name (e.g., "API Redesign Sprint") |
| `goal` | string | ✅ | Main objective or goal of the collaboration |
| `agent_role` | string | ❌ | Your role in this project (defaults to "coordinator") |

#### What It Does

1. **Checks for conflicts**: Lists existing projects, warns if project_id already exists
2. **Generates safe ID**: Converts project name to valid project_id (lowercase, alphanumeric + hyphens)
3. **Provides instructions**: Tells Claude to create the project and join it

#### Context Injected

- List of existing project IDs (to detect conflicts)
- Warning if the generated project ID already exists

#### Example

```bash
# In Claude Code
Use the "create" prompt with:
- project_name: "Frontend/Backend Integration"
- goal: "Coordinate API schema changes for v2"
- agent_role: "coordinator"
```

**What Claude sees:**
```
I want to start a new multi-agent collaboration project.

**Project Name**: Frontend/Backend Integration
**Goal**: Coordinate API schema changes for v2
**My Role**: coordinator

Please help me:
1. Create the project with ID: "frontend-backend-integration"
2. Join the project as "coordinator"
3. Announce the project goal to any other agents who join

**Use these tools**:
- `create_project` with project_id="frontend-backend-integration", name="Frontend/Backend Integration", description="Coordinate API schema changes for v2", created_by="coordinator"
- `join_project` with project_id="frontend-backend-integration", agent_name="coordinator"
```

#### Tips

- **Descriptive names**: Use clear project names that describe the goal
- **Unique IDs**: If you get a conflict warning, choose a different name
- **Role matters**: Your initial role sets the tone (coordinator, lead, etc.)

---

### 🤝 `join`

**Join an existing project with role suggestions and current member visibility.**

#### Arguments

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `project_id` | string | ✅ | The project identifier to join |
| `agent_role` | string | ✅ | Your role in this project (e.g., "frontend", "backend", "reviewer") |

#### What It Does

1. **Validates project exists**: Shows helpful error with available projects if not found
2. **Shows current team**: Lists all members with online/offline status
3. **Suggests available roles**: Recommends roles not yet taken (frontend, backend, reviewer, tester, coordinator)
4. **Provides onboarding**: Tells Claude to join, check messages, list resources

#### Context Injected

- Project metadata (name, description, created date)
- Current members with online status and join times
- Available role suggestions (roles not yet taken)
- Or: Error message with list of available projects

#### Example

```bash
# In Claude Code
Use the "join" prompt with:
- project_id: "api-redesign"
- agent_role: "frontend"
```

**What Claude sees (if project exists):**
```
I want to join the "API Redesign Sprint" project as "frontend".

**Project**: API Redesign Sprint
**Description**: Coordinate frontend and backend for API v2
**Created**: Oct 13, 2025 10:00 AM

**Current Members** (2):
- **coordinator** 🟢 (joined Oct 13, 2025 10:00 AM)
- **backend** 🟢 (joined Oct 13, 2025 10:05 AM)

💡 **Suggested roles** (not yet taken): frontend, reviewer, tester

Please help me:
1. Join the project with agent_name="frontend"
2. Check for any unread messages using `receive_messages`
3. Get the list of available resources using `list_resources`

**Use these tools**:
- `join_project` with project_id="api-redesign", agent_name="frontend"
- `receive_messages` with project_id="api-redesign", agent_name="frontend"
- `list_resources` with project_id="api-redesign", agent_name="frontend"
```

#### Tips

- **Check existing roles**: Use suggested roles to avoid duplication
- **Meaningful names**: Choose roles that describe your function
- **Online status**: 🟢 = active, ⚪️ = offline

---

### 📢 `broadcast`

**Send a message to all project members with automatic reply_expected inference.**

#### Arguments

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `project_id` | string | ✅ | The project to broadcast to |
| `message` | string | ✅ | The message content to send to all members |

#### What It Does

1. **Validates project**: Shows error if project doesn't exist
2. **Shows recipients**: Lists all project members and count
3. **Infers intent**: Detects if message asks a question or requests action
4. **Sets reply_expected**: Automatically determines true/false based on message content
5. **Provides instructions**: Tells Claude to broadcast with correct parameters

#### Context Injected

- Project metadata (name)
- List of all members (recipients)
- Smart inference of reply_expected (based on question indicators: ?, "please", "need", "help", "can you", etc.)

#### Example

```bash
# In Claude Code
Use the "broadcast" prompt with:
- project_id: "api-redesign"
- message: "Schema review complete! Approved with minor changes."
```

**What Claude sees:**
```
I want to broadcast this message to all members of "API Redesign Sprint":

"Schema review complete! Approved with minor changes."

**Project**: API Redesign Sprint
**Recipients**: coordinator, backend, frontend (3 members)
**Reply Expected**: No (informational message)

Please send this broadcast using:
- `send_message` with project_id="api-redesign", from_agent="[your-agent-name]", broadcast=true, reply_expected=false, payload={"text": "Schema review complete! Approved with minor changes."}
```

**Contrast with a question:**
```bash
# Message with question
message: "Can someone review the updated schema?"
```

**What Claude sees:**
```
**Reply Expected**: Yes (message appears to ask a question or request action)
```

#### Tips

- **Questions get replies**: Messages with "?", "please", "can you", etc. automatically set reply_expected=true
- **Announcements don't**: Informational messages set reply_expected=false
- **Override if needed**: You can manually call send_message tool for custom reply_expected

---

### 📊 `review`

**Get a comprehensive dashboard of project activity: members, messages, and resources.**

#### Arguments

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `project_id` | string | ✅ | The project to review |
| `agent_name` | string | ✅ | Your agent name in this project |

#### What It Does

1. **Validates project exists**: Shows error if not found
2. **Gathers full context**: Queries storage for members, messages, resources
3. **Formats dashboard**: Presents organized overview with emojis and formatting
4. **Suggests next actions**: Recommends what to do based on state

#### Context Injected

- Project metadata (name, description, created date)
- All members with online/offline status and last seen times
- Your unread messages (preview of last 5, with count if more)
- Available resources with descriptions
- Suggested next actions

#### Example

```bash
# In Claude Code
Use the "review" prompt with:
- project_id: "api-redesign"
- agent_name: "frontend"
```

**What Claude sees:**
```
Here's the current status of "API Redesign Sprint":

## 📋 Project Overview
**Name**: API Redesign Sprint
**Description**: Coordinate frontend and backend for API v2
**Created**: Oct 13, 2025 10:00 AM

## 👥 Team Members (3)
- **coordinator** 🟢 Online (last seen: Oct 13, 2025 11:30 AM)
- **backend** 🟢 Online (last seen: Oct 13, 2025 11:28 AM)
- **frontend** ⚪️ Offline (last seen: Oct 13, 2025 10:45 AM)

## 📬 Your Unread Messages (2)
- From **coordinator**: {"text": "Welcome to the team! Please review the initial schema proposal."} (Oct 13, 2025 10:30 AM)
- From **backend**: {"status": "schema_updated", "version": "v2.1"} (Oct 13, 2025 11:00 AM)

## 📦 Available Resources (1)
- **graphql-schema-v2**: Proposed GraphQL schema for API v2

💡 **Next Steps**: Review your messages and respond to any that need replies.
💡 **Tip**: Use `get_resource` to access resource content.
```

#### Tips

- **Run on join**: Use this immediately after joining a project to catch up
- **Async collaboration**: Essential for understanding what happened while you were away
- **Before major decisions**: Review state before making changes

---

### 📦 `share`

**Publish a resource and notify the team in one step.**

#### Arguments

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `project_id` | string | ✅ | The project to share with |
| `agent_name` | string | ✅ | Your agent name |
| `title` | string | ✅ | Title/name for the resource |
| `description` | string | ✅ | What this resource contains and why it's relevant |
| `file_path` | string | ❌ | Absolute path to file to share (for large files >50KB) |

#### What It Does

1. **Validates project exists**: Shows error if not found
2. **Generates resource ID**: Converts title to safe resource_id
3. **Shows recipients**: Lists who will receive the notification
4. **Provides workflow**: Instructions to store resource + broadcast notification
5. **Sets permissions**: Public read, creator-only write

#### Context Injected

- Project metadata (name)
- List of team members (who will be notified)
- Generated resource ID from title
- Complete workflow instructions

#### Example

```bash
# In Claude Code
Use the "share" prompt with:
- project_id: "api-redesign"
- agent_name: "backend"
- title: "GraphQL Schema v2"
- description: "Updated API schema with new mutations"
- file_path: "/path/to/schema.graphql"
```

**What Claude sees:**
```
I want to share findings with the "API Redesign Sprint" team.

**Resource Title**: GraphQL Schema v2
**Description**: Updated API schema with new mutations
**File**: /path/to/schema.graphql

**This will be shared with**: coordinator, backend, frontend

Please:
1. Store the resource using `store_resource` with:
   - project_id="api-redesign"
   - resource_id="graphql-schema-v2"
   - name="GraphQL Schema v2"
   - description="Updated API schema with new mutations"
   - agent_name="backend"
   - source_path="/path/to/schema.graphql"
   - permissions={"read": ["*"], "write": ["backend"]}

2. Then broadcast a notification:
   - Use `send_message` with broadcast=true
   - payload={"announcement": "New resource available: GraphQL Schema v2"}
```

#### Tips

- **Small content**: Omit file_path, Claude will ask for content inline (<50KB)
- **Large files**: Provide file_path for files >50KB
- **Public read**: Everyone can read, only you can write (default permissions)
- **Two steps**: Resource is stored, then team is notified via broadcast

---

### 💬 `discuss`

**Reply to ongoing discussions with full message context.**

#### Arguments

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `project_id` | string | ✅ | The project with the discussion |
| `agent_name` | string | ✅ | Your agent name |
| `response` | string | ✅ | Your response or contribution to the discussion |

#### What It Does

1. **Validates project exists**: Shows error if not found
2. **Loads recent messages**: Gets last 3 messages for context
3. **Shows discussion state**: Displays who said what, whether replies are expected
4. **Provides guidance**: Suggests whether to broadcast or direct message
5. **Instructions**: Tells Claude to send response appropriately

#### Context Injected

- Project metadata (name)
- Last 3 messages from your inbox with:
  - Sender name
  - Reply expected status
  - Message preview (first 150 chars)

#### Example

```bash
# In Claude Code
Use the "discuss" prompt with:
- project_id: "api-redesign"
- agent_name: "frontend"
- response: "I've reviewed the schema and it looks good. One concern: the pagination approach might cause issues with our infinite scroll. Can we discuss?"
```

**What Claude sees:**
```
I want to contribute to the discussion in "API Redesign Sprint".

**My Response**: I've reviewed the schema and it looks good. One concern: the pagination approach might cause issues with our infinite scroll. Can we discuss?

**Recent Discussion Context** (last 3 messages):
- **coordinator** (awaiting reply): {"text": "Everyone please review the schema by EOD"}
- **backend**: {"announcement": "Schema v2.1 is ready for review"}
- **backend**: {"status": "all_tests_passing"}

Please:
1. Review the recent messages to understand the context
2. Determine if this is a reply to a specific message or a general contribution
3. Send the response using `send_message`:
   - If replying to a specific agent: set to_agent="[their-name]"
   - If general contribution: set broadcast=true
   - project_id="api-redesign"
   - from_agent="frontend"
   - payload={"response": "I've reviewed the schema and it looks good. One concern: the pagination approach might cause issues with our infinite scroll. Can we discuss?"}
   - reply_expected=false (unless you need feedback)
```

#### Tips

- **Context is key**: The last 3 messages help Claude understand the conversation
- **Smart routing**: Claude determines if this should be broadcast or direct message
- **Reply chains**: If responding to someone specific, Claude will direct message them
- **General comments**: Broadcast to everyone if not replying to anyone specific

---

## Advanced Usage

### Combining Prompts

Prompts can be used in sequence for complex workflows:

```bash
# 1. Create project
Use "create" prompt → Creates "incident-response-2025-10-13"

# 2. Join from different terminals
Terminal 1: Use "join" prompt as "sre"
Terminal 2: Use "join" prompt as "backend"
Terminal 3: Use "join" prompt as "monitoring"

# 3. Review status
Use "review" prompt to see who's online and what's happening

# 4. Share findings
Use "share" prompt to publish incident report

# 5. Discuss resolution
Use "discuss" prompt to propose next steps
```

### Error Handling

All prompts handle common errors gracefully:

**Project not found:**
```
❌ **Project Not Found**: The project "api-redesign" doesn't exist.

**Available projects**:
- **incident-response**: Production incident coordination
- **platform-docs**: Architecture documentation

Please check the project ID or create a new project using the "create" prompt.
```

**No members yet:**
```
**Current Members** (0):
(No members yet - you'll be the first!)
```

**No messages:**
```
## 📬 Your Unread Messages (0)
(No unread messages)
```

### Smart Defaults

Prompts use intelligent defaults when possible:

| Prompt | Default | Logic |
|--------|---------|-------|
| `create` | agent_role: "coordinator" | First member typically coordinates |
| `create` | project_id from name | Converts spaces to hyphens, lowercase |
| `broadcast` | reply_expected inference | Detects questions vs announcements |
| `share` | permissions: read=["*"], write=[creator] | Public read, creator write |
| `share` | resource_id from title | Safe alphanumeric ID generation |

---

## Implementation Notes

### For Developers

If you're adding new prompts to Brainstorm, follow this pattern:

1. **Add to PROMPTS constant** (src/server.ts):
```typescript
'my-prompt': {
  name: 'my-prompt',
  description: 'What this prompt does',
  arguments: [
    { name: 'arg1', description: '...', required: true }
  ]
}
```

2. **Implement in GetPromptRequestSchema handler**:
```typescript
case 'my-prompt': {
  // 1. Extract arguments
  const arg1 = args.arg1 as string;

  // 2. Query storage for context
  const context = await this.storage.getProjectMetadata(arg1);
  if (!context) {
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `❌ **Error**: Context not found`
        }
      }]
    };
  }

  // 3. Generate instructions with context
  return {
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Instruction text with ${context} injected

        **Use these tools**:
        - \`tool_name\` with params...`
      }
    }]
  };
}
```

3. **Best practices**:
   - Always query storage for real-time state
   - Handle error cases with helpful messages
   - Use markdown for formatting
   - Provide specific tool instructions with exact parameters
   - Show contextual information (who's online, what's available)
   - Use emojis for visual clarity
   - Suggest next actions

---

## See Also

- [README.md](README.md) - Main documentation
- [CLAUDE.md](CLAUDE.md) - Developer guide
- [demos/](demos/) - Example workflows using prompts
