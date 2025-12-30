# AI Bridge

Bridge the gap between your browser and VS Code.

AI Bridge allows you to instantly send webpage content, code snippets, and context to VS Code with a simple Alt + Click.

![AI Bridge Icon](vscode-extension/icon.png)

---

## v1.0.0 Highlights

- **Instant Context**: Alt+Click on any element to capture its HTML, selected text, and page information.
- **VS Code Automation**: Automatically opens the chat interface and pastes your prompt into VS Code.
- **Security and Privacy**: 
    - 100% Localhost-only communication.
    - No data leaves your local machine.
    - Embedded server that manages itself in the background.
- **Smart Singleton**: Multiple VS Code windows automatically share a single server instance to prevent resource conflicts.

---

## Quick Start

### 1. Install VS Code Extension
1. Download [ai-bridge-vscode-1.0.0.vsix](vscode-extension/ai-bridge-vscode-1.0.0.vsix).
2. Open VS Code.
3. Use the command `Extensions: Install from VSIX`.
4. Select the .vsix file and restart VS Code.
5. You should see "AI Bridge: Connected" in your status bar.

### 2. Install Browser Extension
1. Open chrome://extensions.
2. Enable "Developer mode" in the top right.
3. Click "Load unpacked".
4. Select the browser-extension folder.

---

## How to Use

1. **Alt + Click** anywhere on a webpage to open the AI Bridge popup.
2. The popup captures the element's HTML and any text you have highlighted.
3. Type your prompt.
4. **Send to VS Code**: This will open the AI chat in your active VS Code window.
5. **Copy (Header Icon)**: Copies formatted context to your clipboard for manual use.

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
