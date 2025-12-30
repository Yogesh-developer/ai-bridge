#!/bin/bash

# AI Bridge - Production Packaging Script
# Author: Yogesh Telange
# This script packages all components for production deployment

set -e  # Exit on error

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     AI Bridge - Production Packaging Script v1.0.0            ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

PROJECT_ROOT="/Users/yogesht/ai-bridge-server"
RELEASE_DIR="$PROJECT_ROOT/release/production"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check prerequisites
echo "Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed"
    exit 1
fi
print_status "Node.js: $(node --version)"

# Check npm
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed"
    exit 1
fi
print_status "npm: $(npm --version)"

# Check if vsce is installed
if ! command -v vsce &> /dev/null; then
    print_warning "vsce not installed. Installing..."
    npm install -g @vscode/vsce
fi
print_status "vsce: $(vsce --version)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 1: Packaging VS Code Extension"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$PROJECT_ROOT/vscode-extension"

# Install dependencies
print_status "Installing VS Code extension dependencies..."
npm install --production

# Package extension
print_status "Creating VSIX package..."
vsce package --out "$PROJECT_ROOT/vscode-extension/ai-bridge-vscode-1.0.0.vsix"

if [ -f "ai-bridge-vscode-1.0.0.vsix" ]; then
    print_status "VS Code extension packaged: ai-bridge-vscode-1.0.0.vsix"
    VSIX_SIZE=$(du -h "ai-bridge-vscode-1.0.0.vsix" | cut -f1)
    echo "   Size: $VSIX_SIZE"
else
    print_error "Failed to create VSIX package"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 2: Packaging Browser Extension"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$PROJECT_ROOT/browser-extension"

# Create ZIP for Chrome Web Store
print_status "Creating browser extension ZIP..."
zip -r "ai-bridge-browser-1.0.0.zip" \
    manifest.json \
    content.js \
    background.js \
    content.css \
    -x "*.DS_Store" "*.git*" "node_modules/*"

if [ -f "ai-bridge-browser-1.0.0.zip" ]; then
    print_status "Browser extension packaged: ai-bridge-browser-1.0.0.zip"
    ZIP_SIZE=$(du -h "ai-bridge-browser-1.0.0.zip" | cut -f1)
    echo "   Size: $ZIP_SIZE"
else
    print_error "Failed to create browser extension ZIP"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 3: Preparing Bridge Server"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$PROJECT_ROOT/bridge-server"

# Install production dependencies
print_status "Installing bridge server dependencies..."
npm install --production

print_status "Bridge server ready"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 4: Creating Release Package"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create release directory
mkdir -p "$RELEASE_DIR"
print_status "Created release directory: $RELEASE_DIR"

# Copy VS Code extension
cp "$PROJECT_ROOT/vscode-extension/ai-bridge-vscode-1.0.0.vsix" "$RELEASE_DIR/"
print_status "Copied VS Code extension"

# Copy browser extension
cp "$PROJECT_ROOT/browser-extension/ai-bridge-browser-1.0.0.zip" "$RELEASE_DIR/"
print_status "Copied browser extension"

# Copy bridge server
print_status "Copying bridge server..."
cp -r "$PROJECT_ROOT/bridge-server" "$RELEASE_DIR/"
print_status "Copied bridge server"

# Copy documentation
print_status "Copying documentation..."
cp "$PROJECT_ROOT/README.md" "$RELEASE_DIR/"
cp "$PROJECT_ROOT/LICENSE" "$RELEASE_DIR/"
print_status "Copied documentation"

# Create installation guide
cat > "$RELEASE_DIR/INSTALL.md" << 'EOF'
# AI Bridge - Installation Guide

## Quick Start

### 1. Install VS Code Extension
1. Open VS Code
2. Press `Cmd+Shift+X` (Mac) or `Ctrl+Shift+X` (Windows/Linux)
3. Click "..." menu → "Install from VSIX..."
4. Select `ai-bridge-vscode-1.0.0.vsix`
5. Restart VS Code

### 2. Install Browser Extension

#### Chrome
1. Go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Extract `ai-bridge-browser-1.0.0.zip` and select the folder

#### Edge
1. Go to `edge://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Extract `ai-bridge-browser-1.0.0.zip` and select the folder

### 3. Start Bridge Server
```bash
cd bridge-server
npm install
npm start
```

Server will run on:
- HTTP: http://localhost:3000
- WebSocket: ws://localhost:3001

### 4. Test It!
1. Open any webpage
2. Alt+Click on any element
3. Type your prompt
4. Send to VS Code
5. Prompt appears in AI chat!

## Troubleshooting

See DEPLOYMENT.md for detailed troubleshooting guide.

## Support

Email: yogesh.x.telange@gmail.com
EOF

print_status "Created INSTALL.md"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Step 5: Creating Final Distribution ZIP"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$PROJECT_ROOT/release"

# Create final ZIP
print_status "Creating ai-bridge-production-1.0.0.zip..."
zip -r "ai-bridge-production-1.0.0.zip" production/ -x "*.DS_Store" "*.git*"

if [ -f "ai-bridge-production-1.0.0.zip" ]; then
    FINAL_SIZE=$(du -h "ai-bridge-production-1.0.0.zip" | cut -f1)
    print_status "Production package created: ai-bridge-production-1.0.0.zip ($FINAL_SIZE)"
else
    print_error "Failed to create production ZIP"
    exit 1
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                  ✅ PACKAGING COMPLETE!                        ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "📦 Production Files Created:"
echo ""
echo "  For Chrome Web Store:"
echo "    → browser-extension/ai-bridge-browser-1.0.0.zip"
echo ""
echo "  For VS Code Marketplace:"
echo "    → vscode-extension/ai-bridge-vscode-1.0.0.vsix"
echo ""
echo "  For Distribution:"
echo "    → release/ai-bridge-production-1.0.0.zip"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Next Steps:"
echo ""
echo "  1. Chrome Web Store:"
echo "     - Go to: https://chrome.google.com/webstore/devconsole"
echo "     - Upload: browser-extension/ai-bridge-browser-1.0.0.zip"
echo ""
echo "  2. VS Code Marketplace:"
echo "     - Run: cd vscode-extension && vsce publish"
echo "     - Or upload VSIX manually to marketplace"
echo ""
echo "  3. Share with Users:"
echo "     - Send: release/ai-bridge-production-1.0.0.zip"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "For detailed deployment instructions, see:"
echo "  → production_deployment_plan.md"
echo ""
