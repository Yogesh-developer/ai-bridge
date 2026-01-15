/**
 * Vite Plugin: AI Bridge Source Injection (ESM Version - Zero Dependency)
 * Add this to your vite.config.mjs or vite.config.ts
 */

export default function aiBridgePlugin() {
    let idCounter = 0;
    function nextId() {
        return "ai-" + (++idCounter) + "-" + Math.random().toString(36).substr(2, 5);
    }

    function transformCode(code, id) {
        // 1. Calculate line numbers map
        const lineIndices = [0];
        for (let i = 0; i < code.length; i++) {
            if (code[i] === '\n') lineIndices.push(i + 1);
        }
        function getLine(index) {
            // Binary search
            let low = 0, high = lineIndices.length - 1;
            while (low <= high) {
                const mid = Math.floor((low + high) / 2);
                if (lineIndices[mid] > index) high = mid - 1;
                else low = mid + 1;
            }
            return high + 1; // 1-based
        }

        // 2. Prepare relative path
        const cwd = process.cwd();
        let relPath = id;
        if (id.startsWith(cwd)) {
            relPath = id.substring(cwd.length + 1);
        }
        relPath = relPath.replace(/\\/g, '/'); // fix windows

        // 3. Regex Transform
        // Match ALL tags: <div, <Button, <my-component
        const regex = /<([a-zA-Z][a-zA-Z0-9$_.:-]*)/g;

        let modified = false;
        const result = code.replace(regex, (match, tagName, offset) => {
            const line = getLine(offset);
            const uid = nextId();
            modified = true;
            return `${match} data-ai-id="${uid}" data-ai-file="${relPath}" data-ai-line="${line}" data-ai-loc="${relPath}:${line}"`;
        });

        if (modified) {
            // console.log(`  Values injected into: ${relPath}`);
        }
        return result;
    }

    return {
        name: 'vite-plugin-ai-bridge',
        enforce: 'pre',
        transform(code, id) {
            if (!/\.[jt]sx$/.test(id)) return null;
            if (id.includes('node_modules')) return null;

            try {
                const transformed = transformCode(code, id);
                return {
                    code: transformed,
                    map: null // Fast transform, no map for now (Vite handles this mostly ok)
                };
            } catch (error) {
                console.error(`❌ [AI Bridge] Transform error in ${id}:`, error.message);
                return null;
            }
        }
    };
}
