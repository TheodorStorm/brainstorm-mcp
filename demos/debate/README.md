# 🗣️ Debate Demo

Two Claude Code agents debate opposite stances on a statement until they reach consensus through evidence-based discussion.

## Overview

- **Agent A (PRO)** - Argues IN FAVOR of the statement in `TOPIC.md`
- **Agent B (CON)** - Argues AGAINST the statement in `TOPIC.md`

Both agents use web search to find evidence, challenge each other's arguments, and debate until they reach an agreed position.

## Quick Start

```bash
# Terminal 1: Start Agent A (PRO)
cd demos/debate
./agent-a.sh

# Terminal 2: Start Agent B (CON)
cd demos/debate
./agent-b.sh
```

## How It Works

1. **Agent A** creates the project and stores the topic as a shared resource
2. **Agent B** joins the project and reads the topic
3. **Agent A** makes an opening argument FOR the statement (with evidence from web search)
4. **Agent B** makes a counter-argument AGAINST the statement (with counter-evidence)
5. Agents exchange arguments, challenging each other's logic and evidence
6. When compelling evidence emerges, agents refine their positions
7. Debate continues until both reach consensus on a nuanced position
8. **Agent A** presents the final consensus summary

## Customizing the Topic

Edit `TOPIC.md` to change what the agents debate:

```markdown
# Debate Topic

[Your statement here]
```

**Example topics:**
- "Artificial intelligence will replace most human jobs by 2050"
- "Space exploration should be a top priority for humanity"
- "Remote work is more productive than office work"
- "Nuclear energy is the best solution to climate change"

## What This Demo Shows

- ✅ Project creation and joining
- ✅ Shared resource storage and retrieval
- ✅ Direct messaging between agents
- ✅ Long-polling for real-time coordination
- ✅ Web search for evidence gathering
- ✅ Iterative refinement of positions
- ✅ Consensus building through honest discourse

## Expected Behavior

### Successful Debate Flow

1. Both agents start with clear opposing stances
2. Each presents evidence from credible sources
3. Arguments are challenged with logic and counter-evidence
4. Positions are refined based on compelling evidence
5. Nuance emerges through rigorous discussion
6. Consensus is reached on a more accurate statement

### Example Outcome

**Original:** "The earth is round"

**Agent A (PRO):** Argues it's round with astronomical evidence
**Agent B (CON):** Challenges precision - "round" is imprecise, earth is oblate spheroid
**Consensus:** "The earth is approximately spherical in shape, with slight flattening at the poles"

## Tips for Good Debates

- **Pick debatable topics** - Avoid obviously true/false statements
- **Encourage web search** - Agents should find real evidence
- **Value nuance** - The goal is precision, not victory
- **Watch the process** - See how evidence shapes positions
- **Expect refinement** - Final consensus should be more accurate than initial stances

## File Structure

```
demos/debate/
├── README.md          # This file
├── TOPIC.md          # The statement being debated
├── AGENT_A.md        # Instructions for PRO debater
├── AGENT_B.md        # Instructions for CON debater
├── RULES.md          # Debate rules and guidelines
├── agent-a.sh        # Launcher script for Agent A
└── agent-b.sh        # Launcher script for Agent B
```

## Troubleshooting

**Agents won't start:**
- Make sure `claude` command is installed
- Check that you're in the `demos/debate` directory
- Verify scripts are executable: `chmod +x *.sh`

**Debate stalls:**
- Agents should use web search to find evidence
- Check that topic is debatable (not obviously true/false)
- Ensure agents have access to web search

**No consensus reached:**
- Some topics may not have clear consensus
- Agents should recognize when to compromise
- Consider refining the topic to be more specific

## Learn More

See other demos in the `demos/` directory:
- **Tic-Tac-Toe** - Turn-based game coordination
- **Pathfinding** - Multi-agent maze navigation with visualization
- **Research Consensus** - Three agents collaborate on research with evidence

---

**Project:** `debate-demo`
**Agents:** `agent-a` (PRO), `agent-b` (CON)
**Resources:** `topic` (shared, read-only)
