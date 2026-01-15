/**
 * Universal AI Bridge Injector v2.0
 * 
 * Strategy: FS Proxy (The "Nuclear" Option)
 * 
 * Works with:
 * - Vite
 * - Webpack (Next.js, CRA)
 * - Rollup
 * - Angular CLI
 * - Any Node.js based build tool
 */

const fs = require('fs');
const path = require('path');
const util = require('util');

// ANSI Colors
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

console.log(`${CYAN}🔌 [AI Bridge] Universal Injector v2.0 Active!${RESET}`);

// Force Env to Development to ensure dev tools/identifiers are often preserved
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';

let idCounter = 0;
function nextId() {
    return "ai-" + (++idCounter) + "-" + Math.random().toString(36).substr(2, 5);
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
// UNIVERSAL TRANSFORMER (REGEX BASED)
// ----------------------------------------------------------------------------
function transformCode(code, filepath) {
    if (!code) return code;

    // Safety check: Don't transform if already transformed
    if (code.includes('data-ai-id=')) return code;

    // Fast check for Tags
    if (!code.includes('<')) return code;

    const relFile = getRelativePath(filepath);

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
        return high + 1; // 1-based
    }

    // Regex to find Tags
    // Matches: <div, <MyComponent, <span, etc.
    // IMPROVEMENT: Use lookahead (?=...) to ensure it ends with space, /, or > to avoid matching "i < limit"
    const regex = /<([a-zA-Z][a-zA-Z0-9$_.:-]*)(?=\s|\/|>)/g;

    // NOTE: Angular inline templates in .ts files are NOT supported
    // Use external .html template files instead to avoid TypeScript corruption
    // The regex can mistake TypeScript generics (<T>) for HTML tags

    // Safety: Skip if file contains CSS-in-JS patterns
    // styled-components, emotion, etc. use template literals with < operators
    if (code.includes('styled.') || code.includes('css`') || code.includes('@emotion')) {
        // Still transform, but be more careful
        // Only match tags that are clearly HTML (followed by space, /, or >)
        // The lookahead already handles this, but we can add extra validation
    }

    return code.replace(regex, (match, tagName, offset) => {
        const line = getLine(offset);

        // ========================================================================
        // SAFETY CHECKS: Skip patterns that look like tags but aren't
        // ========================================================================

        const charBefore = code[offset - 1];
        const charAfter = code[offset + match.length];

        // 1. TypeScript Generics: Array<T>, Promise<string>, Map<K,V>
        // Pattern: identifier followed by <
        const beforeContext = code.substring(Math.max(0, offset - 30), offset);
        if (/[a-zA-Z0-9_$]\s*$/.test(beforeContext)) {
            // Likely a generic type parameter
            return match;
        }

        // 2. Comparison operators: if (x < y), while (a < b)
        // Pattern: variable/number followed by space and <
        if (/[\w\d\)]\s+$/.test(beforeContext)) {
            const afterContext = code.substring(offset + match.length, offset + match.length + 20);
            // If followed by space and number/variable, it's likely a comparison
            if (/^\s+[\w\d]/.test(afterContext)) {
                return match;
            }
        }

        // 3. Shift operators: <<, >>
        if (charBefore === '<' || charAfter === '>') {
            return match;
        }

        // 4. CSS pseudo-selectors: &:hover, :before
        if (charBefore === '&' || charBefore === ':') {
            return match;
        }

        // 5. Template literal expressions: ${...}
        const context = code.substring(Math.max(0, offset - 20), offset + 20);
        if (context.includes('${') || context.includes('calc(')) {
            return match;
        }

        // 6. Type assertions: value as <Type>, <Type>value
        if (beforeContext.endsWith(' as ') || beforeContext.endsWith('as ')) {
            return match;
        }

        // 7. Arrow function generics: <T>(param: T) => {}
        const afterContext = code.substring(offset + match.length, offset + match.length + 30);
        if (/^[A-Z][a-zA-Z0-9]*\s*[,>]/.test(afterContext)) {
            // Likely a generic type parameter in arrow function
            return match;
        }

        // ========================================================================
        // PASSED ALL CHECKS: This is likely a real HTML tag
        // ========================================================================
        return `${match} data-ai-loc="${relFile}:${line}"`;
    });
}

function shouldTransform(filepath) {
    if (!filepath || typeof filepath !== 'string') return false;

    // 1. Exclude node_modules (Standard)
    if (filepath.includes('node_modules')) return false;

    // 2. Exclude Build/Generated Directories (CRITICAL for Next.js/Turbopack/Angular)
    // .next, .angular, .nuxt, dist, build, out, .cache, .output
    if (filepath.match(/(\/\.next\/|\/\.angular\/|\/\.nuxt\/|\/dist\/|\/build\/|\/out\/|\/\.cache\/|\/\.output\/)/)) {
        return false;
    }

    // 3. Check extensions
    // Supported: React, Vue, Svelte, Angular (html templates)
    // EXCLUDE .ts because it contains generics <T> which regex mistakes for tags.
    // React TS uses .tsx so that is fine.

    // SAFE EXTENSIONS: Always safe to transform
    if (/\.(jsx|tsx|vue|svelte|html)$/.test(filepath)) return true;

    // DANGEROUS EXTENSION: .js
    // Only transform .js if it is inside 'src/' folder
    if (/\.js$/.test(filepath)) {
        if (filepath.includes('/src/') || filepath.includes('\\src\\')) return true;
    }

    // ANGULAR SPECIAL CASE: .ts files with inline templates
    // VERY CONSERVATIVE: Only allow if we can verify it's an Angular component
    // This is checked in the transform function, so we return false here by default
    // to prevent accidental transformation of regular .ts files
    if (/\.ts$/.test(filepath)) {
        // DO NOT transform .ts files by default
        // The transform function will handle Angular inline templates specifically
        return false;
    }

    return false;
}

// ----------------------------------------------------------------------------
// FS INTERCEPTION
// ----------------------------------------------------------------------------
const originalReadFileSync = fs.readFileSync;
const originalReadFile = fs.readFile;

// 1. Hook readFileSync
fs.readFileSync = function (path, options) {
    // Call original first
    const result = originalReadFileSync.apply(this, arguments);

    try {
        if (shouldTransform(path)) {
            const encoding = (typeof options === 'string') ? options : (options ? options.encoding : null);

            // If result is Buffer and we don't know encoding, try to detect or just parse as string if meaningful
            let contentStr = result.toString('utf8');

            // Optimization: checking specific signatures before transform?
            // transformCode already does fast check.

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
        // console.error('[AI Bridge] FS Hook Error:', e);
    }
    return result;
};

// 2. Hook fs.promises.readFile (Used by Vite, Webpack sometimes)
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

// 3. Hook async fs.readFile (Legacy callback style)
fs.readFile = function (path, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = null;
    }

    const encoding = (typeof options === 'string') ? options : (options ? options.encoding : null);

    originalReadFile.call(this, path, options, (err, data) => {
        if (err || !data) return callback(err, data);

        try {
            if (shouldTransform(path)) {
                let contentStr = data.toString('utf8');
                let transformed = transformCode(contentStr, path);

                if (transformed !== contentStr) {
                    if (!encoding) {
                        return callback(null, Buffer.from(transformed, 'utf8'));
                    }
                    return callback(null, transformed);
                }
            }
        } catch (e) { }
        return callback(null, data);
    });
};
