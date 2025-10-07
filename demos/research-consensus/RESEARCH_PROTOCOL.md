# Research Protocol

This document defines the shared protocol that all research agents must follow when collaborating on research and building consensus.

**Timestamp Format:** All timestamps must use ISO 8601 format in UTC (e.g., `2025-10-07T12:34:56Z`).

## Core Principles

1. **Evidence-Based Claims**: Every statement must be supported by evidence or sources
2. **Collaborative Skepticism**: Challenge claims constructively to improve accuracy
3. **Convergence Over Speed**: Consensus quality matters more than quantity
4. **Respectful Debate**: Critique ideas, not agents
5. **Transparent Process**: All reasoning and sources must be visible

## Project Structure

### Project ID
`research-consensus-project`

### Shared Resources

All resources use permissions: `{ read: ["*"], write: ["researcher-1", "researcher-2", "researcher-3"] }`

#### 1. research-scope
Defines what is being researched.

```json
{
  "topic": "Alpacas: Biology, History, and Economic Impact",
  "research_questions": [
    "What are the biological characteristics and origin of alpacas?",
    "How do alpacas differ from llamas and other camelids?",
    "What is the history of alpaca domestication and use?",
    "What is the economic significance of alpaca fiber and farming today?"
  ],
  "scope_notes": "Focus on factual information about alpaca biology, domestication history, and modern economic importance",
  "created_by": "researcher-1"
}
```

#### 2. claims-pending
Statements currently under review.

```json
{
  "claims": [
    {
      "id": "claim-2",
      "statement": "The term 'Internet' was first used in 1974",
      "evidence": ["Cerf & Kahn TCP/IP paper 1974"],
      "proposed_by": "researcher-1",
      "proposed_at": "2025-10-07T12:00:00Z",
      "status": "under_review",
      "challenges": [
        {
          "by": "researcher-2",
          "reason": "Need verification of exact terminology used",
          "timestamp": "2025-10-07T12:05:00Z"
        }
      ],
      "refinements": []
    }
  ]
}
```

**Note:** Version is tracked by MCP in the resource manifest, not in the content. When you read a resource, note the version number returned, and pass it when updating.

#### 3. claims-agreed
Consensus statements - the final knowledge base.

```json
{
  "claims": [
    {
      "id": "claim-1",
      "statement": "ARPANET, the precursor to the Internet, was established in September 1969 at UCLA",
      "evidence": [
        "DARPA archives - Contract awarded April 1969",
        "UCLA press release - First node installed Sept 2, 1969",
        "RFC 1000 - Historical document"
      ],
      "agreed_by": ["researcher-1", "researcher-2", "researcher-3"],
      "finalized_at": "2025-10-07T12:15:00Z",
      "confidence": "high"
    }
  ],
  "total_claims": 1
}
```

#### 4. evidence-base
All sources and citations.

```json
{
  "sources": [
    {
      "id": "source-1",
      "title": "DARPA ARPANET archives",
      "type": "primary",
      "year": 1969,
      "reliability": "high",
      "added_by": "researcher-1"
    },
    {
      "id": "source-2",
      "title": "RFC 1000 - Request for Comments reference guide",
      "type": "primary",
      "year": 1987,
      "url": "https://tools.ietf.org/html/rfc1000",
      "reliability": "high",
      "added_by": "researcher-3"
    }
  ]
}
```

## Research Workflow

### Turn-Based Coordination

**CRITICAL:** After a claim reaches consensus (all three agents agree), the NEXT agent in the rotation proposes the new claim.

**Turn Rotation:**
1. **researcher-1** (Lead) → Proposes claim
2. **researcher-2** (Skeptic) → Reviews, then proposes next claim after consensus
3. **researcher-3** (Data) → Reviews, then proposes next claim after consensus
4. **Back to researcher-1** → Proposes next claim after consensus

**When it's YOUR turn to propose:**
- Send `research_turn` announcement message
- Propose your claim within 2 minutes
- Wait for reviews from other agents

**When it's NOT your turn:**
- Review the current claim (challenge/refine/agree)
- Wait for consensus before the next agent proposes
- Use long-polling to receive the next claim

**Example Flow:**
1. researcher-1 proposes claim-1 → All review → All agree → **researcher-2's turn**
2. researcher-2 proposes claim-2 → All review → All agree → **researcher-3's turn**
3. researcher-3 proposes claim-3 → All review → All agree → **researcher-1's turn**
4. (Cycle continues...)

### Claim Lifecycle

```
PROPOSED → UNDER_REVIEW → [CHALLENGED] → [REFINED] → AGREED
                                ↓
                          REJECTED (removed from pending)
```

## Message Types and Actions

### 1. claim_proposed

**When**: Agent proposes a new research finding

**Payload**:
```json
{
  "action": "claim_proposed",
  "claim_id": "claim-5",
  "statement": "Tim Berners-Lee invented the World Wide Web in 1989",
  "evidence": ["CERN archives", "Berners-Lee's proposal document"],
  "proposed_by": "researcher-1",
  "confidence": "high"
}
```

**Response Required**: All other agents must review within 2 messages

### 2. claim_challenged

**When**: Agent identifies issue with a claim

**Payload**:
```json
{
  "action": "claim_challenged",
  "claim_id": "claim-5",
  "reason": "Need clarification: World Wide Web vs Internet - these are different",
  "challenged_by": "researcher-2",
  "severity": "major"
}
```

**Response Required**: Proposing agent must respond

### 3. claim_refined

**When**: Agent suggests improvement to a claim

**Payload**:
```json
{
  "action": "claim_refined",
  "claim_id": "claim-5",
  "original_statement": "Tim Berners-Lee invented the World Wide Web in 1989",
  "refined_statement": "Tim Berners-Lee invented the World Wide Web in 1989 at CERN, creating HTTP, HTML, and the first web browser",
  "refined_by": "researcher-3",
  "additional_evidence": ["CERN historical archive", "First website still hosted"]
}
```

**Response Required**: All agents review refinement

### 4. claim_agreed

**When**: All agents accept a claim (unanimity required)

**Payload**:
```json
{
  "action": "claim_agreed",
  "claim_id": "claim-5",
  "final_statement": "Tim Berners-Lee invented the World Wide Web in 1989 at CERN, creating HTTP, HTML, and the first web browser",
  "agreed_by": ["researcher-1", "researcher-2", "researcher-3"],
  "confidence": "high"
}
```

**Action**: Move claim from `claims-pending` to `claims-agreed`

**IMPORTANT - Resource Update Ownership:**
Upon receiving three `claim_agreed` messages for a claim, **ONLY researcher-1 (Lead)** performs the move:
1. Read both `claims-pending` and `claims-agreed` resources
2. Transfer the claim object (with all resolved challenges/refinements)
3. Remove from `claims-pending`
4. Append to `claims-agreed` with `agreed_by` array and `finalized_at` timestamp
5. Broadcast `claim_finalized` message

**Other agents (researcher-2, researcher-3) should NOT update resources after sending `claim_agreed`** - wait for the finalization message from researcher-1.

### 5. claim_rejected

**When**: Consensus is that claim is inaccurate or unsupported

**Payload**:
```json
{
  "action": "claim_rejected",
  "claim_id": "claim-7",
  "reason": "Insufficient evidence - could not verify with reliable sources",
  "rejected_by": ["researcher-2", "researcher-3"]
}
```

**Action**: Remove claim from `claims-pending`

### 6. research_turn

**When**: Agent indicates they're starting their research turn

**Payload**:
```json
{
  "action": "research_turn",
  "agent": "researcher-2",
  "focus_area": "Technical protocols and standards"
}
```

**Action**: Other agents wait for this agent to propose claim

### 7. research_complete

**When**: All agents agree sufficient consensus is reached

**Payload**:
```json
{
  "action": "research_complete",
  "proposed_by": "researcher-1",
  "total_claims_agreed": 8,
  "coverage_assessment": "Major milestones covered adequately"
}
```

**Action**: All agents vote, if unanimous → conclude and summarize

## Consensus Rules

### Unanimity Requirement
All three agents must AGREE for a claim to enter `claims-agreed`

### Challenge Resolution
1. Proposer responds to challenge within 2 turns
2. If challenge is valid, either REFINE or REJECT claim
3. If challenge is disputed, Data Researcher mediates with facts

### Evidence Standards

**High Confidence** (required for agreement):
- Primary sources (archives, original documents)
- Multiple independent verifications
- Specific dates, names, locations

**Medium Confidence** (requires more evidence):
- Secondary sources only
- Single source
- General timeframes ("early 1970s")

**Low Confidence** (challenge immediately):
- No sources cited
- Contradictory evidence exists
- Vague statements

### Version Management

**IMPORTANT:** Brainstorm MCP uses built-in optimistic locking. Version is stored in the resource **manifest** (metadata), NOT in the content JSON.

**Permissions:** When creating a resource, you MUST specify permissions. When updating a resource, permissions are automatically preserved from the existing resource - you don't need to (and can't) change them.

When updating shared resources:

1. **Read the resource** and note the version from the response:
   ```
   Response from get_resource:
   {
     "manifest": { "version": 5, ... },
     "content": { "claims": [...] }
   }
   ```

2. **Make changes to the content** (don't modify version - it's not in content)

3. **Store with the version parameter**:
   ```
   store_resource(
     resource_id: "claims-pending",
     content: { "claims": [...] },  // No version field here
     version: 5  // Pass the version you read earlier
   )
   ```

4. **If version conflict occurs** (error: "Resource has been modified by another agent"):

   **⚠️ CRITICAL: DO NOT IGNORE VERSION CONFLICTS!**

   When you receive a VERSION_CONFLICT error:
   - **STOP** what you're doing
   - **DO NOT** proceed to wait for messages or continue with other tasks
   - **IMMEDIATELY** handle the conflict with these steps:

   a. **Re-read the resource** to get the latest state and version:
      ```
      get_resource(resource_id: "claims-pending")
      → Note the NEW version number from the response
      ```

   b. **Check if your change is still needed:**
      - For `evidence-base`: Check if another agent already added the same source
      - For `claims-pending`: Check if someone already added your challenge/refinement
      - If your change is already there, skip to next task

   c. **Merge your changes non-destructively:**
      - For `claims-pending`: Append your challenge/refinement to existing arrays (don't overwrite)
      - For `evidence-base`: Add your source to the sources array (check for duplicates first)
      - For `claims-agreed`: Only researcher-1 should update (see ownership rules above)

   d. **Store again with the NEW version number** from step (a)

   e. **If conflict happens again:**
      - Retry up to 2 times following steps (a-d)
      - After 2 retries, send a message asking for coordination:
        ```json
        {
          "action": "conflict_resolution_needed",
          "resource_id": "[resource-id]",
          "agent": "[your-name]",
          "message": "Experiencing persistent version conflicts on [resource]. Requesting coordination."
        }
        ```

5. **If destructive change needed** (e.g., removing claim):
   - Broadcast `conflict_resolution_needed` message
   - Wait for coordination via messages before retrying

**Merge Example:**
```
Step 1: Read claims-pending (version: 5)
Step 2: You want to add challenge to claim-5
Step 3: Try to store with version: 5
Step 4: ERROR - version conflict! (someone else updated to version 6)
Step 5: Re-read claims-pending (version: 6)
        - claim-5 now has a refinement from researcher-3
Step 6: Merge - add your challenge to challenges array alongside their refinement
Step 7: Store with version: 6
Step 8: SUCCESS - resource is now version 7
```

**DO NOT put version in the content JSON** - it's tracked automatically by MCP in the manifest.

## Agent Responsibilities

### All Agents Must
- ✅ Read and acknowledge this protocol before starting
- ✅ Use long-polling (`wait: true`) to receive messages promptly
- ✅ Acknowledge all received messages after processing
- ✅ Update shared resources using version numbers
- ✅ Provide evidence for all claims
- ✅ Review all proposed claims before agreeing
- ✅ Be respectful in challenges and refinements

### researcher-1 (Lead) Must
- Create initial `research-scope` with clear topic and questions
- Propose first 2-3 claims to start the process
- Track overall progress and propose conclusion when ready
- Ensure balanced coverage of research questions

### researcher-2 (Skeptic) Must
- Challenge at least 30% of claims to ensure rigor
- **Use WebSearch to verify claims** and find counter-evidence
- Request specific evidence, not vague improvement
- Validate sources when possible
- Accept claims when evidence is strong (don't be obstinate)
- Cite URLs from web searches in challenges and refinements

### researcher-3 (Data) Must
- Focus on factual accuracy (dates, numbers, technical details)
- **Use zen:chat (mcp__zen__chat) to research precise data** and technical details
- Mediate when researcher-1 and researcher-2 disagree
- Maintain `evidence-base` with source quality ratings
- Propose data-driven refinements
- Cross-reference findings from zen:chat with WebSearch results from researcher-2

## Completion Criteria

Research concludes when ALL of the following are true:
1. **Minimum Claims**: At least 7 agreed claims
2. **Coverage**: All research questions addressed
3. **Quality**: All claims have "high" or "medium" confidence
4. **Unanimity**: All agents vote for `research_complete`

## Example Research Session

1. **researcher-1** proposes: "ARPANET launched in 1969"
2. **researcher-2** challenges: "Need specific month and location"
3. **researcher-1** refines: "ARPANET's first node installed at UCLA in September 1969"
4. **researcher-3** validates: "Confirmed - September 2, 1969, UCLA"
5. **All agree** → Move to `claims-agreed`
6. **researcher-2** takes turn → Proposes new claim about TCP/IP
7. ... process continues ...
8. After 8 claims agreed, **researcher-1** proposes `research_complete`
9. All agents vote yes → Session concludes with summary

## Error Handling

### Resource Conflicts
If version mismatch on store:
1. Re-read resource
2. Merge changes if possible
3. If conflict, send message to other agents to coordinate

### Stalled Claims
If claim in `claims-pending` for more than 5 turns:
1. Any agent can propose to reject
2. Vote on rejection
3. If majority yes → Remove claim

### Disagreement Deadlock
If researcher-1 and researcher-2 can't agree:
1. researcher-3 makes final decision based on evidence
2. All agents accept researcher-3's judgment
3. Move forward (consensus requires pragmatism)

## Tips for Success

1. **Be specific**: "1969" → "September 1969" → "September 2, 1969"
2. **Cite sources**: Don't just say "according to DARPA" - specify document
3. **Welcome challenges**: They improve claim quality
4. **Stay on topic**: Follow the research questions in `research-scope`
5. **Build incrementally**: Simple claims first, then complex connections
6. **Track progress**: Regularly check how many research questions are answered

---

**Remember**: The goal is not to win debates, but to collaboratively build a reliable knowledge base!
