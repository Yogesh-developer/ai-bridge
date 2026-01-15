/**
 * Babel Plugin: AI Bridge Source Injection
 * Adds data-ai-id, data-ai-file, data-ai-line to all JSX elements
 */

module.exports = function ({ types: t }) {
    return {
        name: 'babel-plugin-ai-bridge',
        visitor: {
            JSXOpeningElement(path, state) {
                const { node } = path;
                const filename = state.file.opts.filename || 'unknown';

                // Skip if already has data-ai-id
                const hasAiId = node.attributes.some(
                    attr => t.isJSXAttribute(attr) && attr.name.name === 'data-ai-id'
                );
                if (hasAiId) return;

                // Skip node_modules
                if (filename.includes('node_modules')) return;

                // Generate unique ID
                const id = `ai-${Math.random().toString(36).substr(2, 9)}`;

                // Get relative path
                const cwd = process.cwd();
                let relPath = filename;
                if (filename.startsWith(cwd)) {
                    relPath = filename.substring(cwd.length + 1);
                }
                // Fix for Windows paths in attributes
                relPath = relPath.replace(/\\/g, '/');

                // Get line number
                const line = node.loc ? node.loc.start.line : 0;
                const column = node.loc ? node.loc.start.column : 0;

                // Add attributes
                node.attributes.push(
                    t.jsxAttribute(
                        t.jsxIdentifier('data-ai-id'),
                        t.stringLiteral(id)
                    ),
                    t.jsxAttribute(
                        t.jsxIdentifier('data-ai-file'),
                        t.stringLiteral(relPath)
                    ),
                    t.jsxAttribute(
                        t.jsxIdentifier('data-ai-line'),
                        t.stringLiteral(String(line))
                    ),
                    t.jsxAttribute(
                        t.jsxIdentifier('data-ai-loc'),
                        t.stringLiteral(`${relPath}:${line}:${column}`)
                    )
                );
            }
        }
    };
};
