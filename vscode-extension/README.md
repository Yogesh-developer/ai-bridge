# AI Bridge - Web to VS Code

Connect your web browser directly to VS Code with Alt+Click.

## Overview

AI Bridge is a productivity tool designed to streamline the workflow between web research and AI-assisted coding. It eliminates the friction of manual copying and pasting by establishing a direct link between your browser and the VS Code AI chat interface.

## Highlights in v1.0.0

- **Embedded Bridge Server**: The server is now fully integrated into the extension and manages its own lifecycle. It starts and stops automatically with VS Code.
- **Improved Automation**: Optimized discovery of native VS Code AI extensions, including GitHub Copilot, for seamless prompt delivery.
- **Context Preservation**: Automatically captures HTML structure, selected text, and page URLs to provide high-quality context for AI prompts.
- **Security and Privacy**: All data processing is strictly local. No information is transmitted to external servers.

## Installation

1. Install this VS Code extension.
2. Install the companion browser extension from the Chrome Web Store or load it as an unpacked extension.
3. The server will start automatically upon extension activation.

## Usage

1. Open any webpage.
2. Hold the Alt key and click on any text or element.
3. Type your prompt in the dialog.
4. Send the content directly to your VS Code AI chat.

## Settings

Configuration options are available under `Preferences > Settings > AI Bridge`:

- `ai-bridge.logLevel`: Adjust the detail level of the internal logs.
- `ai-bridge.serverUrl`: The address for the local bridge server (managed automatically).
- `ai-bridge.wsUrl`: The address for the local WebSocket connection (managed automatically).

## Troubleshooting

- **Connection issues**: Verify the bridge status in the bottom right of the status bar. If it shows an error, check the "AI Bridge: Server" output channel.
- **Activation failures**: Ensure that ports 3000 and 3001 are not being used by other applications. Use the `kill-servers.sh` script if necessary.
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
