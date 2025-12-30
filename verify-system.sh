#!/bin/bash

# AI Bridge System Verification Script
# This script checks if all components are running correctly

echo "AI Bridge System Verification"
echo "=================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counter for issues
issues=0

echo "Checking Bridge Server HTTP (port 3000)..."
if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
  response=$(curl -s http://localhost:3000/api/health)
  echo -e "${GREEN}HTTP Server: Running${NC}"
  echo "   Response: $response"
else
  echo -e "${RED}HTTP Server: NOT responding${NC}"
  echo "   Solution: cd bridge-server && npm start"
  ((issues++))
fi

echo ""
echo "Checking Bridge Server WebSocket (port 3001)..."
if lsof -i :3001 > /dev/null 2>&1; then
  echo -e "${GREEN}✅ WebSocket Server: Listening${NC}"
else
  echo -e "${RED}❌ WebSocket Server: NOT listening${NC}"
  echo "   Solution: Make sure bridge server is running (npm start)"
  ((issues++))
fi

echo ""
echo "Checking VS Code Extension..."
# Check if VS Code is running
if pgrep -l "Code" > /dev/null; then
  echo -e "${GREEN}✅ VS Code is running${NC}"
  
  # Check if AI Bridge extension is listed
  if grep -q "ai-bridge-vscode" ~/.vscode/extensions/*/package.json 2>/dev/null; then
    echo -e "${GREEN}✅ AI Bridge extension installed${NC}"
  else
    echo -e "${YELLOW}⚠️  AI Bridge extension not found${NC}"
    echo "   Solution: Install from VSIX file"
    ((issues++))
  fi
else
  echo -e "${YELLOW}⚠️  VS Code not running${NC}"
  echo "   Note: VS Code needs to be open for the full system to work"
fi

echo ""
echo "Checking Browser Extension..."
# Chrome extension check
if pgrep -l "Chrome" > /dev/null || pgrep -l "Google Chrome" > /dev/null; then
  echo -e "${GREEN}✅ Chrome/Brave is running${NC}"
  echo "   Verify in: chrome://extensions/"
else
  echo -e "${YELLOW}⚠️  Chrome/Brave not detected${NC}"
fi

echo ""
echo "=================================="
if [ $issues -eq 0 ]; then
  echo -e "${GREEN}✅ All systems ready!${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Open any webpage"
  echo "2. Alt + Click to open the AI Bridge prompt box"
  echo "3. Type your prompt and send"
  echo "4. Check VS Code for the prompt"
else
  echo -e "${RED}❌ $issues issue(s) detected${NC}"
  echo ""
  echo "Fix the issues above, then run this script again."
fi

echo ""
