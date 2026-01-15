/**
 * AI Bridge - Browser Extension Content Script
 * Captures element context and sends to VS Code for AI-powered development
 * 
 * Security: Only works on localhost/development URLs
 * Trigger: Alt+Click or Cmd+Click on any element
 * 
 * @version 1.2.0
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Security Features:
 * - Input validation and length limits
 * - Localhost-only server communication
 * - Automatic retry with exponential backoff
 * - Sensitive data redaction in logging
 * - XSS prevention via escapeHtml
 * - Request timeout protection (5s)
 * - Rate limiting (prevent rapid sends)
 */

// ============================================================================
// SECURITY & VALIDATION CLASSES
// ============================================================================

/**
 * Input validation and security utilities
 */
class SecurityValidator {
  static validatePrompt(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Prompt must be a non-empty string');
    }
    if (text.length > 100000) {
      throw new Error('Prompt exceeds 100KB limit');
    }
    if (text.trim().length === 0) {
      throw new Error('Prompt cannot be empty or whitespace-only');
    }
    return true;
  }

  static validateClientId(id) {
    if (typeof id !== 'number' && typeof id !== 'string') {
      throw new Error('Invalid client ID');
    }
    const numId = typeof id === 'string' ? parseInt(id) : id;
    if (isNaN(numId) || numId < 1) {
      throw new Error('Client ID must be a positive number');
    }
    return numId;
  }

  static sanitizeLog(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const clone = { ...obj };
    const sensitiveKeys = [
      'password', 'token', 'key', 'secret', 'api', 'credential',
      'auth', 'access', 'private', 'apikey', 'sessionid'
    ];
    Object.keys(clone).forEach(key => {
      if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
        clone[key] = '[REDACTED]';
      }
    });
    return clone;
  }

  static escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  /**
   * World-class local environment detection algorithm
   * SECURITY: Prevents accidental data leakage from public websites
   * Returns: boolean (true if local development environment)
   * 
   * Detects:
   * - Localhost (IPv4, IPv6, all variants)
   * - Private IP ranges (RFC 1918, RFC 4193)
   * - Development domains (.local, .test, .dev, etc.)
   * - Development ports (common dev servers)
   * - Docker/container environments
   * - Tunneling services (ngrok, localtunnel, etc.)
   * - Special development patterns
   */
  static isLocalUrl(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      const port = urlObj.port;

      // === TIER 1: Localhost Variants (Absolute Certainty) ===
      const localhostVariants = [
        'localhost',
        '127.0.0.1',
        '::1',
        '[::1]',
        '0.0.0.0',
        '::',
        'ip6-localhost',
        'ip6-loopback'
      ];
      if (localhostVariants.includes(hostname)) {
        return true;
      }

      // === TIER 2: Loopback IP Ranges (IPv4 & IPv6) ===
      // IPv4: 127.0.0.0/8 (127.0.0.0 - 127.255.255.255)
      if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
        return true;
      }

      // IPv6 loopback variations
      if (hostname.startsWith('::ffff:127.') || // IPv4-mapped IPv6
        hostname === '::1' ||
        hostname === '[::1]') {
        return true;
      }

      // === TIER 3: Private IP Ranges (RFC 1918) ===
      // 10.0.0.0/8 (10.0.0.0 - 10.255.255.255)
      if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
        return true;
      }

      // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
      if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
        return true;
      }

      // 192.168.0.0/16 (192.168.0.0 - 192.168.255.255)
      if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
        return true;
      }

      // === TIER 4: Link-Local Addresses ===
      // 169.254.0.0/16 (Auto-configuration)
      if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
        return true;
      }

      // IPv6 link-local: fe80::/10
      if (hostname.startsWith('fe80:') || hostname.startsWith('[fe80:')) {
        return true;
      }

      // === TIER 5: IPv6 Unique Local Addresses (RFC 4193) ===
      // fc00::/7 (fc00:: - fdff::)
      if (hostname.startsWith('fc') || hostname.startsWith('fd') ||
        hostname.startsWith('[fc') || hostname.startsWith('[fd')) {
        return true;
      }

      // === TIER 6: Development Domain TLDs ===
      const devTLDs = [
        '.local',           // mDNS/Bonjour
        '.localhost',       // RFC 2606
        '.test',            // RFC 2606
        '.example',         // RFC 2606
        '.invalid',         // RFC 2606
        '.dev',             // Chrome forces HTTPS, but still local dev
        '.internal',        // Common enterprise pattern
        '.lan',             // Common router pattern
        '.home',            // Common home network pattern
        '.localdomain',     // Linux default
        '.localnet'         // Alternative pattern
      ];
      if (devTLDs.some(tld => hostname.endsWith(tld))) {
        return true;
      }

      // === TIER 7: Development Subdomain Patterns ===
      const devPrefixes = [
        'local.',
        'localhost.',
        'dev.',
        'development.',
        'test.',
        'testing.',
        'stage.',
        'staging.',
        'qa.',
        'uat.',
        'demo.',
        'preview.'
      ];
      if (devPrefixes.some(prefix => hostname.startsWith(prefix))) {
        return true;
      }

      // === TIER 8: Common Development Ports (High Confidence) ===
      // These ports are almost always local development
      const devPorts = [
        '3000', '3001', '3002', '3003', // Node.js, React, Express
        '4200', '4201',                  // Angular
        '5000', '5001', '5002',         // Flask, ASP.NET
        '8000', '8001', '8080', '8081', '8888', // Django, Java, Python
        '9000', '9001', '9002',                // PHP, Go
        '1313',                          // Hugo
        '4000',                          // Jekyll
        '5173', '5174',                  // Vite
        '8082', '8083', '8084',         // Alternative dev servers
        '3333', '4444', '5555',         // Common custom ports
        '7000', '7001',                  // Ember
        '9090', '9091',                  // Prometheus, webpack
        '35729',                         // LiveReload
        '1234', '12345',                 // Quick test servers
        '8787',                          // Cloudflare Workers
        '24678'                          // Browsersync
      ];
      if (port && devPorts.includes(port)) {
        return true;
      }

      // === TIER 9: Docker/Container Patterns ===
      // Docker internal hostnames
      if (hostname.includes('docker') ||
        hostname === 'host.docker.internal' ||
        hostname.endsWith('.docker.internal') ||
        hostname.startsWith('docker-')) {
        return true;
      }

      // === TIER 10: Special Development Hostnames ===
      const specialHosts = [
        'lvh.me',                // Resolves to 127.0.0.1
        'vcap.me',               // Cloud Foundry local
        'sslip.io',              // DNS service for local IPs
        'nip.io',                // DNS service for local IPs
        'xip.io',                // DNS service for local IPs (deprecated but still used)
        'traefik.me',            // Traefik local domain
        'localtest.me'           // Testing local domain
      ];
      if (specialHosts.some(host => hostname.includes(host))) {
        return true;
      }

      // === TIER 11: Tunneling Services (Development Tunnels) ===
      // These are tunnels to local development, count as local
      const tunnelServices = [
        'ngrok.io',
        'ngrok-free.app',
        'localhost.run',
        'localtunnel.me',
        'serveo.net',
        'expose.dev',
        'tailscale',
        'cloudflared'
      ];
      if (tunnelServices.some(service => hostname.includes(service))) {
        // Additional check: must have dev-like subdomain or port
        if (port && devPorts.includes(port)) {
          return true;
        }
        // Or subdomain pattern like: abc123.ngrok.io
        if (/^[a-z0-9-]+\.ngrok/.test(hostname)) {
          return true;
        }
      }

      // === TIER 12: IP Address Patterns (Catch remaining edge cases) ===
      // Check if it's an IP address format at all
      const isIPv4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
      const isIPv6 = hostname.includes(':') && !hostname.includes('.');

      if (isIPv4 || isIPv6) {
        // If it's an IP and on a dev port, likely local
        if (port && devPorts.includes(port)) {
          return true;
        }
      }

      // === TIER 13: Browser-specific local hostnames ===
      // Some browsers use these for local network discovery
      if (hostname.endsWith('.home.arpa') || // RFC 8375
        hostname.endsWith('.mshome.net')) { // Windows local network
        return true;
      }

      // === DEFAULT: Not a local environment ===
      return false;

    } catch (error) {
      // If URL parsing fails, assume not local for security
      return false;
    }
  }
}

/**
 * Structured logging for browser extension
 */
class Logger {
  static log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const sanitized = data ? SecurityValidator.sanitizeLog(data) : null;
    const logEntry = { timestamp, level: level.toUpperCase(), message };
    if (sanitized) logEntry.data = sanitized;
    console.log(JSON.stringify(logEntry));
  }

  static info(message, data = null) { this.log('info', message, data); }
  static warn(message, data = null) { this.log('warn', message, data); }
  static error(message, data = null) { this.log('error', message, data); }
  static debug(message, data = null) { this.log('debug', message, data); }
}

/**
 * Retry logic with exponential backoff
 */
class RetryHandler {
  constructor(maxAttempts = 3, baseDelay = 1000) {
    this.maxAttempts = maxAttempts;
    this.baseDelay = baseDelay;
  }

  async execute(fn, onRetry = null) {
    let lastError = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt < this.maxAttempts) {
          const delay = this.baseDelay * Math.pow(2, attempt - 1);
          const jitter = Math.random() * 500;

          if (onRetry) {
            onRetry(attempt, error, delay + jitter);
          }

          await new Promise(resolve => setTimeout(resolve, delay + jitter));
        }
      }
    }

    throw lastError;
  }
}

// ============================================================================
// GLOBAL STATE
// ============================================================================

let inputBox = null;
let selectedText = '';
let clickPosition = { x: 0, y: 0 };
let selectedElement = null;
let selectedClientId = null;
let availableClients = [];
let lastSendTime = 0;
const RATE_LIMIT_MS = 500; // Prevent rapid sends
const retryHandler = new RetryHandler(3, 1000);

// ============================================================================
// EVENT LISTENERS & INITIALIZATION
// ============================================================================

/**
 * Listen for Alt+Click (or Option+Click / Cmd+Click) to trigger AI Bridge
 * Uses capture:true to ensure we handle the event before React/frameworks
 */
document.addEventListener('click', (e) => {
  // Trigger on Alt (Option) OR Meta (Command/Windows) key
  if (!e.altKey && !e.metaKey) return;

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation(); // Ensure no other listeners fire

  try {
    // SECURITY: Only allow on localhost/local development sites
    const currentUrl = window.location.href;
    if (!SecurityValidator.isLocalUrl(currentUrl)) {
      Logger.warn('Security block: Not a localhost URL', { url: currentUrl });
      SecurityValidator.showSecurityAlert();
      return;
    }

    clickPosition = { x: e.pageX, y: e.pageY };
    selectedText = window.getSelection().toString();

    // Clear previous selection highlight
    if (selectedElement) {
      selectedElement.style.outline = '';
    }

    // Single select with border highlight
    selectedElement = e.target;
    selectedElement.style.outline = '2px solid #4ec9b0';

    Logger.debug('Click captured', {
      x: e.pageX,
      y: e.pageY,
      hasSelectedText: selectedText.length > 0,
      elementTag: selectedElement?.tagName
    });

    showInputBox(e.pageX, e.pageY);
  } catch (error) {
    Logger.error('Error handling click', { error: error.message });
  }
}, true);

/**
 * Initialization
 */
Logger.info('AI Bridge v1.0.0 loaded - Alt+Click to activate');

// ============================================================================
// UI FUNCTIONS
// ============================================================================

/**
 * Show the input dialog box with prompt textarea and options
 */
function showInputBox(x, y) {
  // Remove existing box
  if (inputBox) {
    inputBox.remove();
  }

  const elementInfo = selectedElement ?
    `<strong>Tag:</strong> &lt;${selectedElement.tagName.toLowerCase()}&gt; | <strong>ID:</strong> ${selectedElement.id || 'none'} | <strong>Class:</strong> ${selectedElement.className || 'none'}`
    : '';

  // Create container
  inputBox = document.createElement('div');
  inputBox.className = 'ai-bridge-input-container';
  inputBox.innerHTML = `
    <div class="ai-bridge-header">
      <span>AI Bridge v1.0.0</span>
      <div class="ai-bridge-header-actions">
        <button class="ai-bridge-copy" title="Copy to clipboard">
          <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/></svg>
        </button>
        <button class="ai-bridge-close">✕</button>
      </div>
    </div>
    <div class="ai-bridge-selector-section" style="display: none;">
      <div style="padding: 12px 16px; border-bottom: 1px solid #3e3e42;">
        <label style="font-size: 11px; color: #858585; text-transform: uppercase; letter-spacing: 0.5px;">Select VS Code Instance</label>
        <select class="ai-bridge-client-selector" style="
          width: 100%;
          margin-top: 8px;
          padding: 6px 8px;
          background: #252526;
          border: 1px solid #3e3e42;
          color: #e0e0e0;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
        ">
          <option value="">Loading instances...</option>
        </select>
      </div>
    </div>
    <div class="ai-bridge-messages">
      <div class="ai-bridge-message info">
        💡 <strong>Tip:</strong> Ask the AI to modify, explain, or generate code for this element.
      </div>
      ${selectedText ? `<div class="ai-bridge-context">📝 <strong>Selected:</strong> ${SecurityValidator.escapeHtml(selectedText.substring(0, 100))}${selectedText.length > 100 ? '...' : ''}</div>` : ''}
      ${elementInfo ? `<div class="ai-bridge-context">🔍 ${elementInfo}</div>` : ''}
    </div>
    <div class="ai-bridge-footer">
      <textarea 
        class="ai-bridge-input" 
        placeholder="Ask AI..."
        maxlength="100000"
      ></textarea>
      <button class="ai-bridge-send" title="Send to VS Code">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
      </button>
    </div>
    <div class="ai-bridge-status"></div>
  `;

  // Position box
  inputBox.style.left = `${Math.max(20, window.innerWidth / 2 - 250)}px`;
  inputBox.style.top = `${Math.max(20, window.innerHeight / 2 - 300)}px`;

  document.body.appendChild(inputBox);

  // Make draggable
  makeDraggable(inputBox);

  // Focus textarea
  const textarea = inputBox.querySelector('.ai-bridge-input');
  textarea.focus();

  // Load VS Code instances
  loadVSCodeInstances();

  // Event listeners
  inputBox.querySelector('.ai-bridge-close').addEventListener('click', closeInputBox);
  inputBox.querySelector('.ai-bridge-send').addEventListener('click', sendToAI);
  inputBox.querySelector('.ai-bridge-copy').addEventListener('click', copyToClipboard);

  // Keyboard shortcuts
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendToAI();
    }
    if (e.key === 'Escape') {
      closeInputBox();
    }
  });

  Logger.debug('Input box shown', { x, y });
}

/**
 * Make element draggable by header
 */
function makeDraggable(element) {
  const header = element.querySelector('.ai-bridge-header');
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('.ai-bridge-close')) return;

    isDragging = true;
    const rect = element.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    header.style.cursor = 'grabbing';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    element.style.left = `${e.clientX - offsetX}px`;
    element.style.top = `${e.clientY - offsetY}px`;
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    header.style.cursor = 'move';
  });
}

/**
 * Close input box and clean up
 */
function closeInputBox() {
  if (inputBox) {
    inputBox.remove();
    inputBox = null;
  }
  if (selectedElement) {
    selectedElement.style.outline = '';
  }
  selectedElement = null;
  selectedClientId = null;
  Logger.debug('Input box closed');
}

// ============================================================================
// SERVER COMMUNICATION
// ============================================================================

/**
 * Load available VS Code instances from bridge server with retry logic
 */
async function loadVSCodeInstances() {
  try {
    const selector = inputBox?.querySelector('.ai-bridge-client-selector');
    const sectionDiv = inputBox?.querySelector('.ai-bridge-selector-section');

    if (!selector || !sectionDiv) return;

    Logger.debug('Loading VS Code instances...');

    await retryHandler.execute(
      async () => {
        const response = await Promise.race([
          fetch('http://localhost:3000/api/clients'),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), 5000)
          )
        ]);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
      },
      (attempt, error, delay) => {
        Logger.warn(`Retry loading instances (attempt ${attempt})`, { error: error.message });
        selector.innerHTML = `<option value="">Retrying... (attempt ${attempt})</option>`;
      }
    ).then(data => {
      const clients = data.clients || [];
      availableClients = clients;

      Logger.info('VS Code instances loaded', { count: clients.length });

      if (clients.length === 0) {
        selector.innerHTML = '<option value="">No VS Code instances connected</option>';
        sectionDiv.style.display = 'none';
        return;
      }

      // Show selector for multiple clients
      if (clients.length > 1) {
        sectionDiv.style.display = 'block';
      }

      // Get saved preference
      const savedClientId = localStorage.getItem('ai-bridge-preferred-client');
      let defaultValue = clients[0].id;

      selector.innerHTML = '';

      clients.forEach(client => {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = `📂 ${client.workspace}${client.activeFile ? ` • 📄 ${client.activeFile.split('/').pop()}` : ''} (ID: ${client.id})`;
        selector.appendChild(option);

        if (savedClientId && parseInt(savedClientId) === client.id) {
          defaultValue = client.id;
        }
      });

      selector.value = defaultValue;
      selectedClientId = defaultValue;

      selector.addEventListener('change', (e) => {
        selectedClientId = parseInt(e.target.value);
        localStorage.setItem('ai-bridge-preferred-client', selectedClientId);
        Logger.debug('Client selection changed', { clientId: selectedClientId });
      });
    });

  } catch (error) {
    Logger.error('Failed to load VS Code instances', { error: error.message });
    const selector = inputBox?.querySelector('.ai-bridge-client-selector');
    if (selector) {
      selector.innerHTML = '<option value="">Error loading instances. Check server.</option>';
    }
  }
}

// ============================================================================
// SOURCE FILE DETECTION (React/Vue/Svelte)
// ============================================================================

/**
 * Detect which framework is being used on the page
 * @returns {'React'|'Vue'|'Svelte'|'Unknown'}
 */
function detectFramework() {
  if (frameworkCache) return frameworkCache;

  try {
    // React detection (check for React DevTools hook or React properties)
    if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__ ||
      window.React ||
      document.querySelector('[data-reactroot]') ||
      document.querySelector('[data-reactid]')) {
      frameworkCache = 'React';
      return 'React';
    }

    // Vue detection (check for Vue DevTools or Vue instance)
    if (window.__VUE__ ||
      window.Vue ||
      document.querySelector('[data-v-app]') ||
      document.querySelector('[data-v-]')) {
      frameworkCache = 'Vue';
      return 'Vue';
    }

    // Svelte detection (check for Svelte-specific attributes)
    if (document.querySelector('[class*="svelte-"]') ||
      document.querySelector('[data-svelte-h]')) {
      frameworkCache = 'Svelte';
      return 'Svelte';
    }

    // Angular detection (check for Angular global or elements)
    if (window.getAllAngularRootElements ||
      window.ng ||
      document.querySelector('[ng-version]') ||
      document.querySelector('app-root')) {
      frameworkCache = 'Angular';
      return 'Angular';
    }

    frameworkCache = 'Unknown';
    return 'Unknown';
  } catch (error) {
    console.debug('[AI Bridge] Framework detection error:', error);
    return 'Unknown';
  }
}
/**
 * Extract data-ai-loc from element or its children
 * Searches element first, then children (breadth-first)
 * @param {HTMLElement} element - Element to search
 * @returns {string|null} - File:line format (e.g., "src/App.js:42") or null
 */
function extractSourceLocation(element) {
  if (!element) return null;

  // Check the element itself first
  const loc = element.getAttribute('data-ai-loc');
  if (loc) return loc;

  // Search children (breadth-first to find closest match)
  const children = Array.from(element.querySelectorAll('[data-ai-loc]'));
  if (children.length > 0) {
    return children[0].getAttribute('data-ai-loc');
  }

  return null;
}

/**
 * Get metadata for a specific element
 */
function getElementMetadata(element = selectedElement) {
  if (!element) return null;

  // Extract source location from data-ai-loc attribute
  const sourceLocation = extractSourceLocation(element);

  return {
    sourceLocation: sourceLocation, // e.g., "src/App.js:42"
    route: window.location.pathname, // Current route
    stack: getTechStack() // Tech stack array
  };
}

/**
   * Detect the technology stack of the current page
   */
function getTechStack() {
  const stack = new Set(); // Use Set to avoid duplicates

  // React Detection (more reliable checks)
  if (
    document.querySelector('[data-reactroot]') ||
    document.querySelector('#root') ||
    document.querySelector('#__next') || // Next.js
    document.querySelector('[data-reactid]') ||
    window.React ||
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ ||
    document.querySelector('script[src*="react"]')
  ) {
    stack.add('React');

    // Next.js specific
    if (document.querySelector('#__next') || window.__NEXT_DATA__) {
      stack.add('Next.js');
    }
  }

  // Vue Detection
  if (
    document.querySelector('[data-v-]') ||
    document.querySelector('[data-v-app]') ||
    window.__VUE__ ||
    window.Vue ||
    document.querySelector('script[src*="vue"]')
  ) {
    stack.add('Vue');

    // Nuxt.js specific
    if (window.__NUXT__) {
      stack.add('Nuxt.js');
    }
  }

  // Angular Detection
  if (
    document.querySelector('app-root') ||
    document.querySelector('[ng-version]') ||
    window.ng ||
    document.querySelector('script[src*="angular"]')
  ) {
    stack.add('Angular');
  }

  // Svelte Detection
  if (
    document.querySelector('[class*="svelte-"]') ||
    document.querySelector('[data-svelte-h]') ||
    document.body.innerHTML.includes('svelte-')
  ) {
    stack.add('Svelte');

    // SvelteKit specific
    if (document.querySelector('[data-sveltekit-]')) {
      stack.add('SvelteKit');
    }
  }

  // Solid.js Detection
  if (
    document.querySelector('[data-solid-id]') ||
    window._$HY
  ) {
    stack.add('Solid.js');
  }

  // Styling Framework Detection

  // Tailwind (more specific check - avoid false positives)
  const allClasses = Array.from(document.querySelectorAll('[class]'))
    .map(el => el.className)
    .join(' ');

  const tailwindPatterns = /\b(flex|grid|p-\d|m-\d|text-(sm|lg|xl|center|left)|bg-(blue|red|gray|white|black)-\d{3}|rounded|shadow)\b/;
  if (tailwindPatterns.test(allClasses)) {
    stack.add('Tailwind CSS');
  }

  // Material UI
  if (
    document.querySelector('[class*="Mui"]') ||
    document.querySelector('[class*="MuiButton"]') ||
    document.querySelector('[class*="makeStyles"]')
  ) {
    stack.add('Material UI');
  }

  // Chakra UI
  if (
    document.querySelector('[class*="chakra"]') ||
    document.querySelector('[data-theme*="chakra"]')
  ) {
    stack.add('Chakra UI');
  }

  // Bootstrap (more specific check)
  if (
    document.querySelector('[class*="bootstrap"]') ||
    (document.querySelector('.btn') && document.querySelector('.container')) ||
    document.querySelector('link[href*="bootstrap"]')
  ) {
    stack.add('Bootstrap');
  }

  // Ant Design
  if (
    document.querySelector('[class*="ant-"]') ||
    document.querySelector('.ant-btn')
  ) {
    stack.add('Ant Design');
  }

  // Styled Components
  if (document.querySelector('[class*="sc-"]')) {
    stack.add('Styled Components');
  }

  // Emotion CSS
  if (document.querySelector('[class*="css-"]') && document.querySelector('[data-emotion]')) {
    stack.add('Emotion CSS');
  }

  // Backend/Full Stack Detection

  // WordPress
  if (
    document.querySelector('link[href*="wp-content"]') ||
    document.querySelector('body[class*="wordpress"]') ||
    document.querySelector('meta[name="generator"][content*="WordPress"]')
  ) {
    stack.add('WordPress');
  }

  // Webflow
  if (document.querySelector('html[data-wf-page]')) {
    stack.add('Webflow');
  }

  // Shopify
  if (
    document.querySelector('meta[name="shopify-checkout-api-token"]') ||
    window.Shopify
  ) {
    stack.add('Shopify');
  }

  // Django
  if (document.querySelector('[name="csrfmiddlewaretoken"]')) {
    stack.add('Django');
  }

  // jQuery (legacy but still common)
  if (window.jQuery || window.$) {
    stack.add('jQuery');
  }

  // TypeScript (check for .ts references in scripts)
  const scripts = Array.from(document.querySelectorAll('script[src]'));
  if (scripts.some(s => s.src.includes('.ts') || s.src.includes('typescript'))) {
    stack.add('TypeScript');
  }

  return stack.size > 0 ? Array.from(stack) : ['Vanilla JS/HTML'];
}

/**
 * Construct a standardized, enriched prompt with context
 */
function constructEnrichedPrompt(userPrompt, includeSystemRole = true) {
  const ctx = getElementMetadata();
  let prompt = '';

  if (includeSystemRole) {
    prompt = `Provide concise code/diffs only.\n`;
  }

  // Site info
  prompt += `Site: ${document.title || 'Web App'} (${window.location.hostname})\n`;
  prompt += `Route: ${ctx?.route || window.location.pathname}\n`;
  const stackDisplay = ctx?.stack ? (Array.isArray(ctx.stack) ? ctx.stack.join(', ') : ctx.stack) : 'Unknown';
  prompt += `Stack: ${stackDisplay}\n\n`;


  // Source location (file:line from data-ai-loc)
  if (ctx?.sourceLocation) {
    prompt += `Source: ${ctx.sourceLocation}\n\n`;
  }

  // Element info
  if (selectedElement) {
    prompt += `Element: <${selectedElement.tagName.toLowerCase()}`;
    if (selectedElement.id) prompt += ` id="${selectedElement.id}"`;
    if (selectedElement.className) prompt += ` class="${selectedElement.className.split(' ')[0]}"`;
    prompt += `>\n\n`;

    // If no source location found, show element HTML as fallback
    if (!ctx?.sourceLocation && selectedElement) {
      const elementHTML = selectedElement.outerHTML.substring(0, 500);
      prompt += `HTML:\n${elementHTML}${selectedElement.outerHTML.length > 500 ? '...' : ''}\n\n`;
    }
  }

  // Selected text or element context
  if (selectedText) {
    prompt += `Selected Text:\n"${selectedText.substring(0, 1000)}"\n\n`;
  }

  prompt += `Task: ${userPrompt || 'Refactor this code'}`;

  return prompt;
}

/**
 * Send prompt to VS Code via bridge server with retry logic
 */
async function sendToAI() {
  const textarea = inputBox.querySelector('.ai-bridge-input');
  const sendBtn = inputBox.querySelector('.ai-bridge-send');
  const statusDiv = inputBox.querySelector('.ai-bridge-status');
  const prompt = textarea.value.trim();

  // Rate limiting
  const now = Date.now();
  if (now - lastSendTime < RATE_LIMIT_MS) {
    statusDiv.textContent = 'Please wait before sending again';
    statusDiv.className = 'ai-bridge-status error';
    return;
  }
  lastSendTime = now;

  // Validation
  try {
    SecurityValidator.validatePrompt(prompt);
  } catch (error) {
    statusDiv.textContent = `Error: ${error.message}`;
    statusDiv.className = 'ai-bridge-status error';
    Logger.warn('Validation failed', { error: error.message });
    return;
  }

  if (!selectedClientId) {
    statusDiv.textContent = 'Please select a VS Code instance';
    statusDiv.className = 'ai-bridge-status error';
    return;
  }

  // Show loading
  sendBtn.disabled = true;
  statusDiv.textContent = 'Sending to VS Code...';
  statusDiv.className = 'ai-bridge-status loading';

  try {
    const elementContext = getElementMetadata();
    const enrichedPrompt = constructEnrichedPrompt(prompt, true);

    const pageContext = {
      url: window.location.href,
      title: document.title,
      selectedText: selectedText.substring(0, 5000),
      prompt: enrichedPrompt,
      originalPrompt: prompt,
      elementContext: elementContext, // Still send for internal logic if needed
      timestamp: new Date().toISOString(),
      targetClientId: selectedClientId
    };

    Logger.debug('Sending prompt to server', {
      promptLength: prompt.length,
      clientId: selectedClientId
    });

    // Send with retry
    await retryHandler.execute(
      async () => {
        const response = await Promise.race([
          fetch('http://localhost:3000/api/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pageContext)
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), 5000)
          )
        ]);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
      },
      (attempt, error, delay) => {
        Logger.warn(`Retry sending (attempt ${attempt})`, { error: error.message });
        statusDiv.textContent = `⏳ Retrying... (attempt ${attempt})`;
      }
    ).then(result => {
      if (result.success) {
        statusDiv.textContent = 'Sent to VS Code!';
        statusDiv.className = 'ai-bridge-status success';
        Logger.info('Prompt sent successfully', { clientId: selectedClientId });

        setTimeout(closeInputBox, 1000);
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    });

  } catch (error) {
    Logger.error('Send failed', { error: error.message });
    statusDiv.textContent = `Error: ${error.message}`;
    statusDiv.className = 'ai-bridge-status error';
    sendBtn.disabled = false;
  }
}



// ============================================================================
// MESSAGE HANDLING
// ============================================================================

/**
 * Listen for messages from background script
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (request.action === 'showNotification') {
      showNotification(request.message, request.type);
    }
  } catch (error) {
    Logger.error('Message handling error', { error: error.message });
  }
});

/**
 * Show notification overlay
 */
function showNotification(message, type = 'info') {
  try {
    const notification = document.createElement('div');
    notification.className = `ai-bridge-notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 3000);

    Logger.debug('Notification shown', { type, message: message.substring(0, 50) });
  } catch (error) {
    Logger.error('Notification error', { error: error.message });
  }
}

/**
 * Copy prompt text to clipboard
 */
async function copyToClipboard() {
  const textarea = inputBox?.querySelector('.ai-bridge-input');
  const statusDiv = inputBox?.querySelector('.ai-bridge-status');
  const copyBtn = inputBox?.querySelector('.ai-bridge-copy');
  const prompt = textarea?.value.trim() || '';

  try {
    const textToCopy = constructEnrichedPrompt(prompt, true);

    if (!textToCopy) {
      if (statusDiv) {
        statusDiv.textContent = 'Nothing to copy';
        statusDiv.className = 'ai-bridge-status error';
      }
      return;
    }

    await navigator.clipboard.writeText(textToCopy);

    if (statusDiv) {
      statusDiv.textContent = 'Copied with context!';
      statusDiv.className = 'ai-bridge-status success';
    }

    // Brief visual feedback on button
    if (copyBtn) {
      const originalColor = copyBtn.style.color;
      copyBtn.style.color = '#4ec9b0';
      setTimeout(() => {
        copyBtn.style.color = originalColor;
      }, 800);
    }

    Logger.info('Prompt with context copied to clipboard');
  } catch (err) {
    Logger.error('Copy failed', { error: err.message });
    if (statusDiv) {
      statusDiv.textContent = 'Failed to copy';
      statusDiv.className = 'ai-bridge-status error';
    }
  }
}