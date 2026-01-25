# AI Bridge - Web to VS Code

Connect your web browser directly to VS Code with Alt+Click.

## Overview

AI Bridge is a productivity tool designed to streamline the workflow between web research and AI-assisted coding. It eliminates the friction of manual copying and pasting by establishing a direct link between your browser and the VS Code AI chat interface.

## Highlights in v1.2.x

- **`$(rocket) AI Dev` Status Bar**: One-click activation to start your development server with AI Bridge enabled.
- **Universal Injector (FS Proxy)**: Automatically maps runtime elements to source files without any configuration changes to your project.
- **Multi-Terminal Flow**: Opens a dedicated terminal for your dev server, allowing you to run multiple instances without closing existing ones.
- **Embedded Bridge Server**: Managed automatically by the extension; no manual server setup required.

## Installation

1. Install the `ai-bridge-vscode-1.2.4.vsix` package.
2. Click the **AI Dev** rocket icon in the status bar to activate.

## Usage

1. Click the **AI Dev** button in your VS Code status bar.
2. A terminal will open; run your web server command (e.g., `npm run dev` or `vite`).
3. Hold **Alt** and click elements in your browser.
4. Prompt the AI, and it will receive the exact file and line number of the component you clicked.

## Settings

Configuration options are available under `Preferences > Settings > AI Bridge`:

- `ai-bridge.logLevel`: Adjust the detail level of the internal logs.
- `ai-bridge.serverUrl`: The address for the local bridge server (managed automatically).
- `ai-bridge.wsUrl`: The address for the local WebSocket connection (managed automatically).

## Troubleshooting

- **Connection issues**: Verify the bridge status in the bottom right of the status bar. If it shows an error, check the "AI Bridge: Server" output channel.
- **Activation failures**: Ensure that ports 54321 and 54322 are not being used by other applications. Use the `kill-servers.sh` script if necessary.
- **Alt+Click behavior**: If the dialog does not appear, refresh the webpage or check if the browser extension is enabled.

## Privacy

Data processing is strictly limited to the local machine. No information is transmitted over the internet or collected by the extension author.

## Lifecycle and Commands

- `AI Bridge: Test Connection`: Validate the current system state.
- `AI Bridge: Reconnect to Server`: Manually reset the bridge.
- `AI Bridge: Show Logs`: View detailed extension activity.

---

**Author**: Yogesh Telange  
**GitHub**: [AI Bridge](https://github.com/yogesh-developer/ai-bridge)  
**License**: MIT
