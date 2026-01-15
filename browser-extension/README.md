# AI Bridge - Browser Extension

The companion browser extension for AI Bridge. It intercepts Alt+Clicks on localhost development sites and sends the element context (file path, line number, HTML) to VS Code.

## Installation (Unpacked)

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select this directory (`browser-extension`).

## Features

- **Alt+Click Interception**: Hold Alt (or Option) and click any element to open the AI Bridge dialog.
- **Localhost Security**: Only activates on localhost or private IP addresses to protect your privacy.
- **Source Mapping**: Reads `data-ai-loc` attributes injected by the VS Code companion to identify exact source file lines.
- **Framework Detection**: Detects if the page is running React, Angular, Vue, or Svelte.

## Troubleshooting

- **No dialog on Alt+Click?** Refresh the page after installing the extension. Ensure your dev server was started using the "AI Dev" button in VS Code.
- **Cmd+Click downloading files?** Update to v1.3.x+ where Meta key interception is disabled to allow standard "New Tab" behavior.
