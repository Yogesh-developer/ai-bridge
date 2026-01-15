/**
 * AI Bridge Build Injector v6.0 (Nuclear Option)
 * 
 * Strategy:
 * 1. FS Proxy: Intercepts fs.read to inject code at the IO layer. (Guaranteed to work)
 * 2. Vite Hook: Intercepts vite.createServer as backup.
 * 3. Module Hook: Intercepts Babel/SWC as backup.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const util = require('util');

// ANSI Colors
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const MAGENTA = '\x1b[35m';
const RESET = '\x1b[0m';

console.log(`${CYAN}🔌 [AI Bridge] Injector v6.0 Active! (FS Proxy Mode)${RESET}`);

// Force Env
if (process.env.NODE_ENV !== 'development') {
    process.env.NODE_ENV = 'development';
    process.env.BABEL_ENV = 'development';
}

let idCounter = 0;
function nextId() {
    return "ai-" + (++idCounter);
}

function getRelativePath(filename) {
    if (!filename) return "unknown";
    const cwd = process.cwd();
    if (filename.startsWith(cwd)) {
        return filename.substring(cwd.length + 1).replace(/\\/g, '/');
    }
    return filename;
}

// ----------------------------------------------------------------------------
// TRANSFORMER
// ----------------------------------------------------------------------------
function transformCode(code, id) {
    if (!code) return code;

    // Safety check: Don't transform if already transformed
    if (code.includes('data-ai-id=')) return code;

    // Fast check for JSX
    if (!code.includes('<')) return code;

    const relFile = getRelativePath(id);

    // Calculate line numbers
    const lineIndices = [0];
    for (let i = 0; i < code.length; i++) {
        if (code[i] === '\n') lineIndices.push(i + 1);
    }
    function getLine(index) {
        // Binary search for speed
        let low = 0, high = lineIndices.length - 1;
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (lineIndices[mid] > index) high = mid - 1;
            else low = mid + 1;
        }
        return high;
    }

    // Regex to find JSX opening tags
    return code.replace(/<([A-Z][a-zA-Z0-9$_.]*)/g, (match, tagName, offset) => {
        const line = getLine(offset) + 1; // 1-based
        const uid = nextId();
        // Add attributes
        return `${match} data-ai-id="${uid}" data-ai-file="${relFile}" data-ai-line="${line}" data-ai-loc="${relFile}:${line}"`;
    });
}

function shouldTransform(filepath) {
    if (!filepath || typeof filepath !== 'string') return false;
    // Only src files
    if (filepath.includes('node_modules')) return false;
    // Only JS/TS/JSX/TSX
    if (!/\.(jsx|tsx|js|ts)$/.test(filepath)) return false;
    // Must be absolute path in CWD
    if (!filepath.startsWith(process.cwd())) return false;
    return true;
}

// ----------------------------------------------------------------------------
// FS INTERCEPTION (The Nuclear Option)
// ----------------------------------------------------------------------------
const originalReadFileSync = fs.readFileSync;
const originalReadFile = fs.readFile;

// 1. Hook readFileSync
fs.readFileSync = function (path, options) {
    // Call original first to catch errors naturally
    const result = originalReadFileSync.apply(this, arguments);

    try {
        if (shouldTransform(path)) {
            // console.log(`${MAGENTA}📝 [AI Bridge] FS Hook: ${getRelativePath(path)}${RESET}`);
            const encoding = (typeof options === 'string') ? options : (options ? options.encoding : null);

            // If result is Buffer and we don't know encoding, try to detect or just parse as string if meaningful
            let contentStr = result.toString('utf8');
            let transformed = transformCode(contentStr, path);

            if (transformed !== contentStr) {
                // If original request wanted buffer, return buffer
                if (!encoding) {
                    return Buffer.from(transformed, 'utf8');
                }
                return transformed;
            }
        }
    } catch (e) {
        // ignore errors in hook, return original
    }
    return result;
};

// 2. Hook readFile (async / callback)
fs.readFile = function (path, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = null;
    }

    const encoding = (typeof options === 'string') ? options : (options ? options.encoding : null);

    // Call original
    originalReadFile.call(this, path, options, (err, data) => {
        if (err || !data) return callback(err, data);

        try {
            if (shouldTransform(path)) {
                // console.log(`${MAGENTA}📝 [AI Bridge] FS Async Hook: ${getRelativePath(path)}${RESET}`);
                let contentStr = data.toString('utf8');
                let transformed = transformCode(contentStr, path);

                if (transformed !== contentStr) {
                    if (!encoding) {
                        return callback(null, Buffer.from(transformed, 'utf8'));
                    }
                    return callback(null, transformed);
                }
            }
        } catch (e) {
            // ignore
        }
        return callback(null, data);
    });
};

// 3. Hook fs.promises.readFile (Vite often uses this)
if (fs.promises && fs.promises.readFile) {
    const originalPromisesReadFile = fs.promises.readFile;
    fs.promises.readFile = async function (path, options) {
        const result = await originalPromisesReadFile.apply(this, arguments);
        try {
            if (shouldTransform(path)) {
                const encoding = (typeof options === 'string') ? options : (options ? options.encoding : null);
                let contentStr = result.toString('utf8');
                let transformed = transformCode(contentStr, path);

                if (transformed !== contentStr) {
                    if (!encoding) return Buffer.from(transformed, 'utf8');
                    return transformed;
                }
            }
        } catch (e) { }
        return result;
    };
}


// ----------------------------------------------------------------------------
// MODULE INTERCEPTION (Backup)
// ----------------------------------------------------------------------------

const originalLoad = Module._load;

Module._load = function (request, parent, isMain) {
    // Keep Vite Hook just in case
    if (request === 'vite') {
        // console.log(`${GREEN}🔌 [AI Bridge] Also hooking 'vite' module...${RESET}`);
        const vite = originalLoad.apply(this, arguments);
        const originalCreateServer = vite.createServer;
        vite.createServer = async function (inlineConfig = {}) {
            // Disable hard cache if possible?
            if (!inlineConfig.server) inlineConfig.server = {};
            inlineConfig.server.force = true; // force optimizer?
            return originalCreateServer.apply(this, arguments);
        };
        return vite;
    }
    return originalLoad.apply(this, arguments);
};
