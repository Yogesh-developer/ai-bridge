#!/bin/bash

# AI Bridge - Kill Existing Servers Script
# Use this to stop any running bridge servers before testing the new extension

echo "🔍 Checking for processes on ports 3000 and 3001..."

# Find processes on port 3000
PIDS_3000=$(lsof -ti:3000 2>/dev/null)
# Find processes on port 3001  
PIDS_3001=$(lsof -ti:3001 2>/dev/null)

if [ -z "$PIDS_3000" ] && [ -z "$PIDS_3001" ]; then
    echo "✅ No processes found on ports 3000 or 3001"
    exit 0
fi

if [ -n "$PIDS_3000" ]; then
    echo "⚠️  Found processes on port 3000: $PIDS_3000"
    kill -9 $PIDS_3000 2>/dev/null
    echo "✅ Killed processes on port 3000"
fi

if [ -n "$PIDS_3001" ]; then
    echo "⚠️  Found processes on port 3001: $PIDS_3001"
    kill -9 $PIDS_3001 2>/dev/null
    echo "✅ Killed processes on port 3001"
fi

echo ""
echo "✅ Ports 3000 and 3001 are now free"
echo "You can now reload VS Code to start the embedded server"
