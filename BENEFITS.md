# Why AI Bridge?

AI Bridge is a high-performance developer productivity tool that creates a direct link between your browser's rendered UI and your IDE's source code.

## 🚀 Key Benefits

### 1. Zero-Friction Workflow
*   **Problem**: Manually finding the source file for a specific UI component in a large codebase is slow and error-prone.
*   **Solution**: **Alt+Click** any element in your browser to instantly open the exact file and line number in VS Code.

### 2. Radical Token Efficiency (Cost & Speed)
*   **Problem**: Passing entire files or large chunks of code to an AI (like Copilot Chat) consumes massive amounts of tokens, making responses slower and more expensive.
*   **Solution**: AI Bridge sends **precise context**. By providing the exact file:line and a minimal HTML snippet of the clicked element, the AI has exactly what it needs and nothing more.
    *   **90% Token Reduction**: Instead of a 2000-line file, the AI receives 50 lines of relevant context.
    *   **Faster Responses**: Smaller prompts lead to significantly faster AI generation times.

### 3. "Magic" Zero-Config Integration
*   **Universal Injector**: Unlike traditional tools that require you to modify `vite.config.js` or `webpack.config.js`, AI Bridge uses a low-level **FS Proxy**.
*   **Works with Anything**: It automatically detects and instruments your build process (Vite, Webpack, Turbopack, etc.) without you touching a single line of project configuration.

### 4. Multi-Framework Accuracy
*   Built-in intelligence for **React, Next.js, Angular, Vue, and Svelte**.
*   It understands component boundaries better than generic browsers, ensuring you get the component source, not just a generic `<div>`.

### 6. Accessibility (a11y) First
*   **Problem**: Debugging complex ARIA hierarchies or missing labels is tedious using only browser dev tools.
*   **Solution**: Alt+Click any element and ask the AI "Is this accessible?" or "Fix the ARIA attributes for this component." AI Bridge provides the exact HTML context the AI needs to give accurate audit results, and you're already at the correct line of code to apply the fix.

### 7. Rapid Code Understanding & Onboarding
*   **Onboarding**: New developers can explore a project visually. Instead of digging through folders, they can click a UI feature they see in the browser to instantly see the code that builds it.
*   **Legacy Code**: Quickly map complex, nested UI structures back to their logic files, making it much easier to understand how data flows into components.

---

## 📈 Developer Impact

| Feature | Without AI Bridge | With AI Bridge |
| :--- | :--- | :--- |
| **Finding Code** | Search by class/text (30s - 2m) | **Alt+Click (Instant)** |
| **Context Prep** | Copy-paste HTML/Code (1m) | **Automatic (Instant)** |
| **Token Usage** | High (Entire files) | **Low (Targeted Snippets)** |
| **AI Accuracy** | Medium (Lacks exact UI context) | **High (Direct UI Reference)** |
| **Accessibility Audits** | Manual inspection | **AI-powered (Click to fix)** |

## Use Cases
*   **UI Debugging & Styling**: Instantly jump to the code responsible for a misaligned element or broken layout.
*   **Accessibility Audits**: Click an element and ask for a11y improvements to get instant code suggestions.
*   **Onboarding**: Explore a new codebase by clicking on features in the running app.
*   **Refactoring**: Rapidly update component logic by jumping directly to the source from the UI.
*   **AI Pair Programming**: Provide the IDE's AI agent with specific UI context to get highly relevant, line-specific suggestions.
