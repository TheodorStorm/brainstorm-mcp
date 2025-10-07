# Research Consensus Demo

A collaborative research demo where three specialized agents investigate a topic, make evidence-based claims, challenge each other's statements, and converge on a set of agreed-upon facts.

## Overview

This demo showcases sophisticated multi-agent collaboration through a research and debate process:

1. **Lead Researcher** proposes claims based on research
2. **Skeptic Researcher** challenges claims and demands evidence
3. **Data Researcher** validates with facts and mediates disputes
4. Agents iterate until they reach consensus on key statements

## Quick Start

Open **three terminal windows** and run:

```bash
# Terminal 1: Lead Researcher
cd demos/research-consensus
./researcher-1.sh

# Terminal 2: Skeptic Researcher
cd demos/research-consensus
./researcher-2.sh

# Terminal 3: Data Researcher
cd demos/research-consensus
./researcher-3.sh
```

The agents will:
- Create/join the research project
- Take turns researching the topic
- Propose, challenge, and refine claims
- Build a consensus knowledge base
- Conclude with agreed-upon statements

## What This Demo Shows

- ✅ **Multi-agent turn-taking** - Coordinated research rounds
- ✅ **Shared resource collaboration** - Claims, evidence, and consensus tracking
- ✅ **Message-based debate** - Challenge, refine, and agree on statements
- ✅ **Versioned resource updates** - Optimistic locking for concurrent edits
- ✅ **Long-polling coordination** - Real-time responses between agents
- ✅ **Natural language reasoning** - Authentic debate dynamics
- ✅ **Autonomous decision-making** - Agents decide when consensus is reached
- ✅ **Graceful conclusion** - Summary of agreed facts

## Research Flow

### Phase 1: Initialization
- Lead Researcher creates project with research topic
- All agents join and acknowledge research protocol
- Shared resources initialized:
  - `research-scope`: Topic and research questions
  - `claims-pending`: Statements under review
  - `claims-agreed`: Consensus statements
  - `evidence-base`: Sources and citations

### Phase 2: Research Rounds (Iterative)
Each agent takes turns:
1. Research an aspect of the topic
2. Propose a claim with supporting evidence
3. Other agents review and respond:
   - **AGREE**: Add to consensus
   - **CHALLENGE**: Request more evidence or clarification
   - **REFINE**: Suggest modification to statement
4. Discussion continues until consensus or rejection

### Phase 3: Convergence
- After processing 5-10 claims
- Agents review agreed statements
- Identify any gaps in coverage
- Either continue with new round OR conclude
- Final output: Set of consensus statements with evidence

## Example Research Topics

Default topic: **"Alpacas: Biology, History, and Economic Impact"**

Other suggested topics:
- "The History and Impact of the Internet (1960-2000)"
- "Benefits and Risks of Artificial Intelligence"
- "Evolution of Programming Languages"
- "Climate Change Evidence and Impacts"
- "History of Space Exploration"

To change the topic, edit the research scope in [LEAD_RESEARCHER.md](LEAD_RESEARCHER.md).

## Agent Personalities

### Lead Researcher (researcher-1)
- **Role**: Facilitator and initial researcher
- **Traits**: Organized, balanced, consensus-building
- **Focus**: Broad overview, timeline, major events

### Skeptic Researcher (researcher-2)
- **Role**: Critical evaluator
- **Traits**: Questioning, evidence-demanding, rigorous
- **Focus**: Verification, counter-evidence, edge cases

### Data Researcher (researcher-3)
- **Role**: Fact-checker and mediator
- **Traits**: Data-driven, precise, neutral
- **Focus**: Statistics, dates, technical details

## Message Protocol

### Claim Proposed
```json
{
  "type": "event",
  "payload": {
    "action": "claim_proposed",
    "claim_id": "claim-1",
    "statement": "ARPANET was established in 1969",
    "evidence": ["Source: DARPA archives"],
    "proposed_by": "researcher-1"
  }
}
```

### Claim Challenged
```json
{
  "type": "event",
  "payload": {
    "action": "claim_challenged",
    "claim_id": "claim-1",
    "reason": "Need more specific date and location",
    "challenged_by": "researcher-2"
  }
}
```

### Claim Agreed
```json
{
  "type": "event",
  "payload": {
    "action": "claim_agreed",
    "claim_id": "claim-1",
    "statement": "ARPANET was established in September 1969 at UCLA",
    "agreed_by": ["researcher-1", "researcher-2", "researcher-3"]
  }
}
```

## Resource Structure

### claims-agreed
```json
{
  "claims": [
    {
      "id": "claim-1",
      "statement": "ARPANET was established in September 1969 at UCLA",
      "evidence": [
        "DARPA archives",
        "UCLA press release 1969"
      ],
      "agreed_by": ["researcher-1", "researcher-2", "researcher-3"],
      "timestamp": "2025-10-07T12:34:56Z"
    }
  ],
  "version": 1
}
```

### claims-pending
```json
{
  "claims": [
    {
      "id": "claim-2",
      "statement": "Email was invented in 1971",
      "evidence": ["RFC history"],
      "proposed_by": "researcher-3",
      "status": "under_review",
      "challenges": [
        {
          "by": "researcher-2",
          "reason": "Need clarification on 'email' vs 'messaging'"
        }
      ]
    }
  ],
  "version": 3
}
```

## Stopping the Demo

The agents will automatically conclude when:
- They've reached consensus on 7-10 major claims
- All agents agree coverage is sufficient
- Research questions are answered

To stop early:
- Press Ctrl+C in each terminal window
- Or tell an agent to send a "research_complete" message

## Tips for Observers

1. **Watch the debate**: Agents will naturally challenge and refine each other's claims
2. **Check the resources**: See consensus building in real-time
3. **Notice personalities**: Each agent has distinct research style
4. **Look for convergence**: Agents learn from each other and improve claims
5. **Enjoy the process**: The journey to consensus is as interesting as the result!

## Architecture

Built on the Brainstorm MCP server, this demo uses:
- **Project-based collaboration**: All agents in `research-consensus-project`
- **Shared resources**: Consensus tracking with optimistic locking
- **Message passing**: Turn coordination and debate
- **Long-polling**: Real-time responsiveness

See [RESEARCH_PROTOCOL.md](RESEARCH_PROTOCOL.md) for detailed protocol rules.

## Customization

Want to modify the demo?

1. **Change the topic**: Edit research scope in `LEAD_RESEARCHER.md`
2. **Add more agents**: Create `researcher-4.sh` with new personality
3. **Adjust consensus threshold**: Modify when agents conclude
4. **Change research style**: Edit agent instruction files

## Contributing

Ideas for improvements:
- Add visualization of consensus graph
- Include citation validation
- Add fact-checking against external sources
- Create different research methodologies
- Support longer research sessions

Pull requests welcome!
