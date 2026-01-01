#!/bin/bash

# AI Bridge - Production Packaging Script
# Author: Yogesh Telange
# Packages components for production deployment

set -e

echo "----------------------------------------------------------------"
echo "    AI Bridge - Production Packaging Script"
echo "----------------------------------------------------------------"

PROJECT_ROOT="/Users/yogesht/ai-bridge-server"
RELEASE_DIR="$PROJECT_ROOT/release/production"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed"
    exit 1
fi

# Check npm
if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed"
    exit 1
fi

# Check vsce
if ! command -v vsce &> /dev/null; then
    echo "Installing @vscode/vsce..."
    npm install -g @vscode/vsce
fi

echo ""
echo "Step 1: Packaging VS Code Extension"
echo "----------------------------------------------------------------"

cd "$PROJECT_ROOT/vscode-extension"
npm install --production
vsce package --out "$PROJECT_ROOT/vscode-extension/ai-bridge-vscode-1.0.1.vsix"

echo ""
echo "Step 2: Packaging Browser Extension"
echo "----------------------------------------------------------------"

cd "$PROJECT_ROOT/browser-extension"
zip -r "ai-bridge-browser-1.0.0.zip" \
    manifest.json \
    content.js \
    background.js \
    content.css \
    icons/ \
    -x "*.DS_Store" "*.git*" "node_modules/*"

echo ""
echo "Step 3: Creating Release Package"
echo "----------------------------------------------------------------"

mkdir -p "$RELEASE_DIR"
cp "$PROJECT_ROOT/vscode-extension/ai-bridge-vscode-1.0.1.vsix" "$RELEASE_DIR/"
cp "$PROJECT_ROOT/browser-extension/ai-bridge-browser-1.0.0.zip" "$RELEASE_DIR/"
cp "$PROJECT_ROOT/README.md" "$RELEASE_DIR/"
cp "$PROJECT_ROOT/LICENSE" "$RELEASE_DIR/"

echo "Packaging complete. Files available in: $RELEASE_DIR"
echo ""
echo "Distribution files spawned:"
echo "1. VS Code Extension: vscode-extension/ai-bridge-vscode-1.0.1.vsix"
echo "2. Browser Extension: browser-extension/ai-bridge-browser-1.0.0.zip"
