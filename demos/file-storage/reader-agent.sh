#!/bin/bash
# File Storage Demo: Reader Agent

export BRAINSTORM_CLIENT_ID="file-storage-reader"
claude "Read and follow the instructions in READER_AGENT.md" --allowedTools "mcp__brainstorm"
