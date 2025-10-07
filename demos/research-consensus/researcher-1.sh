#!/bin/bash
# Research Consensus Demo: Lead Researcher
# Facilitates research process and proposes initial claims

# Check dependencies
if ! command -v claude &> /dev/null; then
    echo "Error: 'claude' command not found. Please install Claude Code."
    exit 1
fi

echo "🔬 Starting Lead Researcher (researcher-1)"
echo "Role: Organized Facilitator"
echo "Focus: Broad overview and consensus-building"
echo ""
echo "Starting Claude Code..."
echo ""

claude "Read and follow the instructions in LEAD_RESEARCHER.md. You are the Lead Researcher for a collaborative research project on Alpacas (biology, history, and economic impact). Create the project, initialize resources, and guide the team toward consensus." --allowedTools "mcp__brainstorm"
