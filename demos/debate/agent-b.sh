#!/bin/bash
# Debate Demo: Agent B (CON)
# Argues AGAINST the statement in TOPIC.md

# Check dependencies
if ! command -v claude &> /dev/null; then
    echo "Error: 'claude' command not found. Please install Claude Code."
    exit 1
fi

echo "🗣️  Starting Agent B (CON Debater)"
echo "Stance: AGAINST the statement"
echo "Strategy: Find evidence and arguments that REFUTE the claim"
echo ""
echo "Starting Claude Code..."
echo ""

claude "Read and follow the instructions in AGENT_B.md. You are Agent B, arguing AGAINST the statement in TOPIC.md. Use web search to find counter-evidence and debate until consensus is reached." --allowedTools "mcp__brainstorm,WebSearch"
