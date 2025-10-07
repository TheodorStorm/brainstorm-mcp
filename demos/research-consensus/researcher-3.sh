#!/bin/bash
# Research Consensus Demo: Data Researcher
# Validates claims with data and mediates disputes

# Check dependencies
if ! command -v claude &> /dev/null; then
    echo "Error: 'claude' command not found. Please install Claude Code."
    exit 1
fi

echo "📊 Starting Data Researcher (researcher-3)"
echo "Role: Precise Fact-Checker and Mediator"
echo "Focus: Data accuracy and technical details"
echo ""
echo "Starting Claude Code..."
echo ""

claude "Read and follow the instructions in DATA_RESEARCHER.md. You are the Data Researcher in a collaborative research project. Join the project, validate claims with factual data, maintain the evidence base, and mediate disputes objectively. Use the zen:chat tool to research precise dates, numbers, and technical details." --allowedTools "mcp__brainstorm,mcp__zen,WebSearch"
