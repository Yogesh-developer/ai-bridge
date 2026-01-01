---
description: How to publish the AI Bridge VS Code extension to the Marketplace
---

# Publishing to VS Code Marketplace

Follow these steps to publish `ai-bridge-vscode` to the official Visual Studio Marketplace.

## Prerequisites

1. **Install VSCE**: The Visual Studio Code Extension Manager.
   ```bash
   npm install -g @vscode/vsce
   ```
2. **Create a Publisher**: 
   - Go to the [Manage Publishers](https://marketplace.visualstudio.com/manage) page.
   - Create a publisher with the ID `yogesh-telange` (to match your `package.json`).

3. **Get a Personal Access Token (PAT)**:
   - Go to [Azure DevOps](https://dev.azure.com/).
   - Create a PAT with **Full Access** or at least **Marketplace (Publish)** scope.
   - Copy the token immediately; you won't see it again.

## Steps to Publish

### 1. Login to VSCE
Run the following command and enter your PAT when prompted:
```bash
vsce login yogesh-telange
```

### 2. Verify Manifest
Ensure your `package.json` has the correct version and repository details. 
> [!TIP]
> You can run `vsce ls` to see which files will be included in the package.

### 3. Publish
// turbo
```bash
vsce publish
```

## Maintenance

### Updating the Version
To publish a new version, use the `npm version` command before publishing:
```bash
npm version patch # 1.0.0 -> 1.0.1
vsce publish
```

### Troubleshooting
- **401 Unauthorized**: Your PAT might be expired or lack the correct permissions.
- **Publisher Mismatch**: Ensure `publisher` in `package.json` exactly matches your Marketplace publisher ID.
