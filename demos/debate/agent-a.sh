#!/bin/bash
# Debate Demo: Agent A (PRO)
# Argues IN FAVOR of the statement in TOPIC.md

# Check dependencies
if ! command -v claude &> /dev/null; then
    echo "Error: 'claude' command not found. Please install Claude Code."
    exit 1
fi

echo "🗣️  Starting Agent A (PRO Debater)"
echo "Stance: IN FAVOR of the statement"
echo "Strategy: Find evidence and arguments that SUPPORT the claim"
echo ""
echo "Starting Claude Code..."
echo ""

claude "Read and follow the instructions in AGENT_A.md. You are Agent A, arguing IN FAVOR of the statement in TOPIC.md. Use web search to find supporting evidence and debate until consensus is reached." --allowedTools "mcp__brainstorm,WebSearch"
