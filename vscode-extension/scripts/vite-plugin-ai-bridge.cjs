/**
 * Vite Plugin: AI Bridge Source Injection (CJS Version - Zero Dependency)
 * Add this to your vite.config.js or vite.config.cjs
 */

module.exports = function aiBridgePlugin() {
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
        const regex = /<([a-zA-Z][a-zA-Z0-9$_.:-]*)/g;

        return code.replace(regex, (match, tagName, offset) => {
            const line = getLine(offset);
            const uid = nextId();
            return `${match} data-ai-id="${uid}" data-ai-file="${relPath}" data-ai-line="${line}" data-ai-loc="${relPath}:${line}"`;
        });
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
                    map: null
                };
            } catch (error) {
                console.error(`❌ [AI Bridge] Transform error in ${id}:`, error.message);
                return null;
            }
        }
    };
};
