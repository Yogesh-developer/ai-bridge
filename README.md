# AI Bridge

Bridge the gap between your browser and VS Code.

AI Bridge allows you to instantly send webpage content, code snippets, and context to VS Code with a simple Alt + Click.

![AI Bridge Icon](vscode-extension/icon.png)

---

## v1.2.x Highlights

- **Universal Injector**: No manual configuration required. Automatically injects source location data using a zero-config FS proxy.
- **Status Bar Integration**: Single-click activation via the `$(rocket) AI Dev` button in VS Code.
- **Smart Tech Stack Detection**: Automatically identifies React, Angular, Vue, and Svelte components.
- **Multi-Terminal Support**: Run multiple dev servers concurrently; AI Bridge manages terminals intelligently.
- **Security & Privacy**: 100% local communication. No data ever leaves your machine.

---

## Quick Start

### 1. Install VS Code Extension
1. Download `ai-bridge-vscode-1.2.4.vsix`.
2. In VS Code, run command `Extensions: Install from VSIX...`
3. Restart or reload VS Code.
4. Click the **`$(rocket) AI Dev`** button in the bottom status bar to begin.

### 2. Install Browser Extension
1. Open `chrome://extensions`.
2. Enable "Developer mode".
3. Click "Load unpacked" and select the `browser-extension` folder.

---

## How to Use

1. Click the **AI Dev Rocket** in VS Code to open a terminal.
2. Run your dev command (e.g., `npm run dev`).
3. In your browser (localhost), hold **Alt** (or Option) and **Click** any UI element.
4. Type your prompt in the popup and send it back to VS Code!

---

## Architecture

AI Bridge uses a Smart Singleton architecture. The first VS Code window to start up launches an embedded Node.js server on ports 3000 and 3001. Subsequent windows detect the active server and connect to it automatically. The browser extension communicates with this local bridge via secure HTTP and WebSockets.

---

## Troubleshooting

### Port already in use
If the server fails to start because ports are occupied, you can clear them using the provided script:
```bash
./kill-servers.sh
```

### Resetting the Connection
- Use the VS Code command `Developer: Reload Window`.
- Monitor the "AI Bridge: Server" output channel for detailed logs.

---

## License
- **GitHub**: https://github.com/yogesh-developer/ai-bridge
- **Author**: Yogesh Telange
- **Email**: yogesh.x.telange@gmail.com
- **License**: MIT
