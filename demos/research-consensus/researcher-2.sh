#!/bin/bash
# Research Consensus Demo: Skeptic Researcher
# Critically evaluates claims and demands rigorous evidence

# Check dependencies
if ! command -v claude &> /dev/null; then
    echo "Error: 'claude' command not found. Please install Claude Code."
    exit 1
fi

echo "🔍 Starting Skeptic Researcher (researcher-2)"
echo "Role: Critical Evaluator"
echo "Focus: Evidence quality and precision"
echo ""
echo "Starting Claude Code..."
echo ""

export BRAINSTORM_CLIENT_ID="research-consensus-researcher-2"
claude "Read and follow the instructions in SKEPTIC_RESEARCHER.md. You are the Skeptic Researcher in a collaborative research project. Join the project and critically evaluate all claims to ensure high evidence standards. Use WebSearch to verify claims and find counter-evidence." --allowedTools "mcp__brainstorm,mcp__zen,WebSearch"
