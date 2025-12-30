# 🌉 AI Bridge

**Bridge the gap between your browser and your IDE.** 

AI Bridge allows you to instantly send webpage content, code snippets, and context to your AI coding assistants (GitHub Copilot, Cursor, etc.) with a simple **Alt + Click**.

![AI Bridge Icon](vscode-extension/icon.png)

---

## ✨ Features

- **🚀 Instant Context**: Alt+Click on any element to capture its HTML, selected text, and page info.
- **💬 VS Code Automation**: Seamlessly opens chat and pastes your prompt into GitHub Copilot/Cursor.
- **📋 Universal Copy**: For other IDEs, a dedicated "Copy" button captures enriched context (HTML + Text) formatted for any AI.
- **🔒 Security First**: 
    - 100% Localhost-only communication.
    - No data leaves your machine.
    - Embedded server—no manual background processes needed.
- **⚡ Smart Singleton**: Multiple VS Code windows automatically share a single server instance.

---

## 🚀 Quick Start

### 1. Install VS Code Extension
1. Download [ai-bridge-vscode-2.0.0.vsix](vscode-extension/ai-bridge-vscode-2.0.0.vsix).
2. Open VS Code.
3. Press `Cmd+Shift+P` → **Extensions: Install from VSIX**.
4. Select the `.vsix` file and restart.
5. Check your status bar: `✓ AI Bridge: Connected`.

### 2. Install Browser Extension
1. Open **chrome://extensions**.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select the `browser-extension` folder.

---

## 🛠️ How to Use

1. **Alt + Click** anywhere on a webpage to open the AI Bridge popup.
2. The popup automatically captures the element's HTML and any text you've selected.
3. Type your prompt.
4. **Send to VS Code**: Instantly triggers your IDE's AI chat.
5. **Copy (Header Icon)**: Copies the full enriched prompt to your clipboard (perfect for Windsurf/Cursor).

---

## 🔧 Architecture

AI Bridge uses a **Smart Singleton** architecture:
- The first VS Code window starting up launches an embedded Node.js server (Ports 3000/3001).
- Subsequent windows detect the existing server and connect to it.
- The browser extension communicates with this local bridge via secure HTTP and WebSockets.

---

## 🚨 Troubleshooting

### "Error: Port already in use"
If the server fails to start, another process might be using ports 3000/3001.
```bash
# Kill any existing bridge servers
./kill-servers.sh
```

### Resetting the Extension
- Press `Cmd+Shift+P` → **Developer: Reload Window**.
- Check **View → Output → AI Bridge: Server** for detailed logs.

---

## 📄 License & Author
- **Author**: Yogesh Telange
- **Email**: yogesh.x.telange@gmail.com
- **License**: MIT
