(function () {
    try {
        const element = document.querySelector('[data-ai-bridge-id]');
        if (!element) return;
        const uniqueId = element.getAttribute('data-ai-bridge-id');

        // ============================================================================
        // FRAMEWORK DETECTION UTILITIES
        // ============================================================================

        function detectFramework() {
            // Check for Next.js (multiple signals)
            if (window.__NEXT_DATA__ || window.next || document.getElementById('__next') ||
                document.querySelector('[id^="__next"]') || document.querySelector('.next-route-announcer')) {
                return 'Next.js';
            }

            // Check for Vue
            if (window.Vue || window.__VUE__ || document.querySelector('[data-v-]')) {
                return 'Vue';
            }

            // Check for Angular
            if (window.ng || window.getAllAngularRootElements || document.querySelector('[ng-version]')) {
                return 'Angular';
            }

            // Check for React (but not Next.js)
            if (window.React || window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
                return 'React';
            }

            return null;
        }

        function isNextJsFile(fileName) {
            if (!fileName) return false;
            return fileName.includes('/app/') ||
                fileName.includes('/pages/') ||
                fileName.includes('/_app') ||
                fileName.includes('/_document') ||
                fileName.includes('/src/app/') ||
                fileName.includes('/src/pages/');
        }

        function getNextJsRoute() {
            if (window.__NEXT_DATA__?.page) {
                return window.__NEXT_DATA__.page;
            }
            if (window.next?.router?.pathname) {
                return window.next.router.pathname;
            }
            return window.location.pathname;
        }

        // ============================================================================
        // REACT / NEXT.JS DETECTION
        // ============================================================================

        // Pattern-based filtering for Next.js internal components
        function isInternalComponent(compName) {
            if (!compName || compName === 'Unknown') return true;

            // Skip components with these patterns
            const internalPatterns = [
                'Boundary',           // ErrorBoundary, RedirectBoundary, etc.
                'Provider',           // Context providers
                'Context',            // React contexts
                'Router',             // All router components
                'Layout',             // Layout wrappers
                'Handler',            // ScrollAndFocusHandler, etc.
                'Internal',           // Any internal component
                'Segment',            // SegmentViewNode, etc.
                'Template',           // RenderFromTemplateContext
                'ServerRoot',         // Server components root
                'ClientPageRoot',     // Client page root
                'AppContainer',       // App container
                'Bailout'             // StaticGenerationSearchParamsBailoutProvider
            ];

            // Check if component name contains any internal pattern
            if (internalPatterns.some(pattern => compName.includes(pattern))) {
                return true;
            }

            // Skip components starting with underscore or lowercase
            if (compName.startsWith('_') || /^[a-z]/.test(compName)) {
                return true;
            }

            return false;
        }

        function findReactSource(el) {
            const allKeys = Object.getOwnPropertyNames(el);
            const fiberKey = allKeys.find(key => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance'));

            if (!fiberKey) return null;

            let fiber = el[fiberKey];
            let depth = 0;
            const maxDepth = 50; // Search deep to find user components
            let bestCandidate = null;
            const detectedFramework = detectFramework();
            const isNextJs = detectedFramework === 'Next.js';

            while (fiber && depth < maxDepth) {
                let source = fiber._debugSource;
                let owner = fiber._debugOwner;

                let compName = 'Unknown';
                if (fiber.type) {
                    if (typeof fiber.type === 'string') {
                        compName = fiber.type;
                    } else if (typeof fiber.type === 'function') {
                        compName = fiber.type.displayName || fiber.type.name;
                    }
                }

                // Try to get source from owner if not available
                if (!source && owner) {
                    source = owner._debugSource;
                    if (source) fiber = owner;
                }

                // PRIORITY 1: Exact source with file path (skip node_modules)
                if (source && source.fileName && !source.fileName.includes('node_modules')) {
                    // For Next.js, verify the file is actually a Next.js file
                    const framework = (isNextJs && isNextJsFile(source.fileName)) ? 'Next.js' : detectedFramework || 'React';

                    return {
                        framework,
                        component: {
                            name: compName || 'Anonymous',
                            file: source.fileName,
                            line: source.lineNumber,
                            column: source.columnNumber
                        }
                    };
                }

                // PRIORITY 2: Named component (for fallback) - but SKIP internal components
                if (typeof fiber.type === 'function' && !isInternalComponent(compName)) {
                    // Only set as best candidate if we don't have one yet
                    if (!bestCandidate) {
                        bestCandidate = {
                            framework: isNextJs ? 'Next.js' : (detectedFramework || 'React'),
                            component: {
                                name: compName,
                                file: null,
                                line: null,
                                column: null
                            }
                        };
                    }
                }

                fiber = fiber.return;
                depth++;
            }

            // FALLBACK: Use route information for Next.js
            if (bestCandidate && isNextJs) {
                const route = getNextJsRoute();
                bestCandidate.component.file = `Route: ${route}`;
            }

            return bestCandidate;
        }

        // ============================================================================
        // VUE DETECTION
        // ============================================================================

        function findVueSource(el) {
            let vue = el.__vueParentComponent || el.__vue__;
            if (!vue) {
                // Try to find Vue instance in parent elements
                let current = el.parentElement;
                let depth = 0;
                while (current && depth < 10) {
                    vue = current.__vueParentComponent || current.__vue__;
                    if (vue) break;
                    current = current.parentElement;
                    depth++;
                }
            }

            if (!vue) return null;

            let componentName = 'Unknown';
            let fileName = null;

            if (vue.type) { // Vue 3
                componentName = vue.type.name || vue.type.__name || 'Anonymous';
                fileName = vue.type.__file || null;
            } else if (vue.$options) { // Vue 2
                componentName = vue.$options.name || vue.$options._componentTag || 'Anonymous';
                fileName = vue.$options.__file || null;
            }

            return {
                framework: 'Vue',
                component: {
                    name: componentName,
                    file: fileName,
                    line: null,
                    column: null
                }
            };
        }

        // ============================================================================
        // ANGULAR DETECTION
        // ============================================================================

        function findAngularSource(el) {
            let current = el;
            let depth = 0;
            const maxDepth = 15;

            while (current && depth < maxDepth) {
                // Method 1: Global ng API
                if (window.ng && window.ng.getComponent) {
                    try {
                        const component = window.ng.getComponent(current);
                        if (component) {
                            return {
                                framework: 'Angular',
                                component: {
                                    name: component.constructor.name,
                                    file: null,
                                    line: null,
                                    column: null
                                }
                            };
                        }
                    } catch (e) { }
                }

                // Method 2: Ivy Context
                if (current.__ngContext__) {
                    let componentName = 'AngularComponent';
                    try {
                        const context = current.__ngContext__;
                        const isValidComponent = (obj) => {
                            return obj && typeof obj === 'object' &&
                                obj.constructor && obj.constructor.name &&
                                obj.constructor.name !== 'Object' &&
                                obj.constructor.name !== 'Array' &&
                                !obj.nodeType;
                        };

                        if (isValidComponent(context[8])) {
                            componentName = context[8].constructor.name;
                        } else if (Array.isArray(context)) {
                            const found = context.find(item => isValidComponent(item));
                            if (found) componentName = found.constructor.name;
                        }
                    } catch (e) { }

                    if (componentName !== 'AngularComponent' || current.tagName.includes('-')) {
                        return {
                            framework: 'Angular',
                            component: {
                                name: componentName,
                                file: null,
                                line: null,
                                column: null
                            }
                        };
                    }
                }

                current = current.parentElement;
                depth++;
            }
            return null;
        }

        // ============================================================================
        // MAIN DETECTION LOGIC
        // ============================================================================

        let result = findReactSource(element) || findVueSource(element) || findAngularSource(element);

        if (result) {
            window.postMessage({
                type: 'AI_BRIDGE_SOURCE_RESULT',
                detail: result,
                id: uniqueId
            }, '*');
        } else {
            // Fallback: Detect framework even without component details
            const framework = detectFramework();
            if (framework) {
                const detail = {
                    detected: true,
                    framework,
                    component: framework === 'Next.js' ? {
                        name: 'Page',
                        file: `Route: ${getNextJsRoute()}`,
                        line: null,
                        column: null
                    } : null
                };
                window.postMessage({
                    type: 'AI_BRIDGE_SOURCE_RESULT',
                    detail,
                    id: uniqueId
                }, '*');
            } else {
                window.postMessage({
                    type: 'AI_BRIDGE_SOURCE_RESULT',
                    detail: { detected: false, framework: 'Unknown' },
                    id: uniqueId
                }, '*');
            }
        }
    } catch (err) {
        // Silent fail
    }
})();
