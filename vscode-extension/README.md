# AI Bridge - Web to IDE

**Connect your web browser directly to VS Code with Alt+Click!**

## 🚀 What's New in v2.0.0

✨ **Embedded Server** - No separate server installation needed! The bridge server now starts automatically with the extension.

## Features

- **Alt+Click Activation**: Click any element on a webpage while holding Alt
- **Instant Transfer**: Selected content appears in your AI chat immediately
- **Context Aware**: Captures text, element info, and page URL
- **Secure**: Localhost-only, no external servers
- **Multi-IDE**: Works with GitHub Copilot, Cursor, and Windsurf
- **Auto-Start Server**: Embedded server starts automatically - no manual setup!

## Requirements

1. **Browser Extension**: Install from Chrome Web Store
   - Search "AI Bridge" in Chrome Web Store
   - Click "Add to Chrome"

2. **Node.js**: The extension uses VS Code's built-in Node.js runtime

## Installation

1. Install this VS Code extension
2. Install the browser extension from Chrome Web Store
3. That's it! The server starts automatically.

## Usage

1. Open any webpage
2. Alt+Click on text or elements
3. Type your prompt
4. Send to AI - prompt appears in VS Code!

## How It Works

```
Browser (Alt+Click) → Bridge Server (auto-started) → VS Code Extension → AI Chat
```

The bridge server runs automatically in the background when VS Code starts. No manual server management needed!

## Configuration

Access settings via: `Preferences > Settings > AI Bridge`

- `ai-bridge.logLevel`: Logging verbosity (info/debug/warn/error)
- `ai-bridge.serverUrl`: Bridge server URL (auto-managed)
- `ai-bridge.wsUrl`: WebSocket URL (auto-managed)

## Troubleshooting

**Extension not connecting?**
- Check Output panel: View → Output → AI Bridge: Extension
- Check server logs: View → Output → AI Bridge: Server
- Try reloading VS Code: Cmd+Shift+P → "Developer: Reload Window"

**Alt+Click not working?**
- Ensure browser extension is installed and enabled
- Refresh the webpage
- Check browser console for errors

**Server won't start?**
- Check if port 3000 is already in use
- View server logs in Output panel
- Try reloading VS Code

## Privacy

All data processing happens locally on your machine. No information is sent to external servers.

## Commands

- `AI Bridge: Test Connection` - Test if everything is working
- `AI Bridge: Reconnect to Server` - Force reconnect
- `AI Bridge: Show Logs` - View extension logs

## Support

- GitHub: https://github.com/yogesh-telange/ai-bridge
- Email: yogesh.x.telange@gmail.com
- License: MIT

## Changelog

### 2.0.0 (Latest)
- ✨ Embedded bridge server - auto-starts with extension
- ✨ No separate server installation needed
- ✨ Simplified user experience
- ✨ Automatic server lifecycle management

### 1.0.0
- Initial release
- Separate bridge server required

---

**Made with ❤️ by Yogesh Telange**
