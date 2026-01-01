/**
 * AI Bridge Content Script - Production v1.0.0
 * 
 * Injected into web pages to capture clicks and send prompts to AI Bridge server
 * 
 * Author: Yogesh Telange <yogesh.x.telange@gmail.com>
 * License: MIT
 * 
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
   * Validate that URL is localhost/local development only
   * SECURITY: Prevents accidental data leakage from public websites
   */
  static isLocalUrl(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();

      // Allow localhost variants
      const localhostNames = ['localhost', '127.0.0.1', '::1', '[::1]'];
      if (localhostNames.includes(hostname)) {
        return true;
      }

      // Allow common development TLDs
      const localTLDs = ['.local', '.localhost', '.test', '.example'];
      if (localTLDs.some(tld => hostname.endsWith(tld))) {
        return true;
      }

      // Allow private IP ranges (RFC 1918)
      if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
        return true;
      }

      return false;
    } catch (error) {
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
 * Listen for Alt+Click to trigger AI Bridge
 */
document.addEventListener('click', (e) => {
  // Only trigger if Alt key is pressed
  if (!e.altKey) return;

  e.preventDefault();
  e.stopPropagation();

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
    selectedElement = e.target;

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
 * Extract element context (tag, class, id, HTML) for logging and prompt enrichment
 */
function getElementContext(element) {
  if (!element) return '';

  try {
    const clone = element.cloneNode(true);
    let html = clone.outerHTML;

    // Limit HTML size
    if (html.length > 2000) {
      html = html.substring(0, 2000) + '...(truncated)';
    }

    return html;
  } catch (error) {
    Logger.warn('getElementContext failed', { error: error.message });
    return '';
  }
}

/**
 * Show the input dialog box with prompt textarea and options
 */
function showInputBox(x, y) {
  // Remove existing box
  if (inputBox) {
    inputBox.remove();
  }

  const elementHTML = getElementContext(selectedElement);
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
      ${elementHTML ? `<details class="ai-bridge-html"><summary>📄 View HTML</summary><pre><code>${SecurityValidator.escapeHtml(elementHTML)}</code></pre></details>` : ''}
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

/**
 * Get metadata for the currently selected element
 */
function getElementMetadata() {
  if (!selectedElement) return null;

  const elementHTML = selectedElement.outerHTML;
  return {
    tag: selectedElement.tagName.toLowerCase(),
    id: selectedElement.id || null,
    className: selectedElement.className || null,
    html: elementHTML.substring(0, 3000)
  };
}

/**
 * Construct a standardized, enriched prompt with context
 */
function constructEnrichedPrompt(userPrompt, includeSystemRole = true) {
  const elementContext = getElementMetadata();

  let enriched = '';

  if (includeSystemRole) {
    enriched += `SYSTEM ROLE
You are a senior AI developer assisting inside a browser + IDE workflow.
You receive webpage context and a user instruction. Use the context,
but do not assume access to the full codebase.

Primary goals (in order):
1) If the user asks for a CHANGE: produce the FINAL UPDATED CODE.
2) Prefer returning changes as a unified diff patch when possible.
3) Suggest the most likely file or folder based on URL + element.
4) If the user only asks a QUESTION: answer briefly.
5) If something is unclear: ask ONE short clarifying question.

Show the final result first. Be precise and minimal.

-----------------------------------------------------
`;
  }

  enriched += `BROWSER CONTEXT
Page URL: ${window.location.href}
Page Title: ${document.title}

ELEMENT
Tag: ${elementContext?.tag || 'none'}
ID: ${elementContext?.id || 'none'}
Class: ${elementContext?.className || 'none'}

HTML SNIPPET
${elementContext?.html || 'none'}

SELECTED TEXT
${selectedText || 'none'}
-----------------------------------------------------

USER INSTRUCTION
${userPrompt || (selectedText ? 'Please explain this selected text/code.' : 'Please provide help with this element.')}`;

  return enriched;
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