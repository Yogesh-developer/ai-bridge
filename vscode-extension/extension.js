// AI Bridge VS Code Extension - Production Ready v1.0.0
// Author: Yogesh Telange (yogesh.x.telange@gmail.com)
// License: MIT
// Repository: https://github.com/yogesh-telange/ai-bridge-vscode
// Security: Enterprise-grade with full validation and logging
//
// Lifecycle management for the embedded bridge server
//
// Security and validation layers

'use strict';

const vscode = require('vscode');
const WebSocket = require('ws');
const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

// Load keyboard automation
const { keyboard, Key } = require('@nut-tree-fork/nut-js');

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const VERSION = '1.0.1';
const AUTHOR = 'Yogesh Telange';
const AUTHOR_EMAIL = 'yogesh.x.telange@gmail.com';
const MAX_CONNECTION_ATTEMPTS = 3;
const RECONNECT_DELAY = 2000;
const MAX_PROMPT_LENGTH = 50000;
const SERVER_STARTUP_TIMEOUT = 10000; // 10 seconds
const DEFAULT_HTTP_PORT = 54321;
const DEFAULT_WS_PORT = 54322;

// ============================================================================
// EXTENSION STATE
// ============================================================================

let extensionContext = null;
let ws = null;
let statusBarItem = null;
let isActivated = false;
let connectionAttempts = 0;
let serverProcess = null;
let serverLogger = null;

// ============================================================================
// RATE LIMITER - Prevent abuse and excessive API calls
// ============================================================================

class RateLimiter {
  constructor(maxRequests = 10, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
  }

  canMakeRequest() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    return this.requests.length < this.maxRequests;
  }

  recordRequest() {
    this.requests.push(Date.now());
  }

  getRemainingRequests() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    return Math.max(0, this.maxRequests - this.requests.length);
  }

  getResetTime() {
    if (this.requests.length === 0) return 0;
    const oldestRequest = Math.min(...this.requests);
    const resetTime = oldestRequest + this.windowMs;
    return Math.max(0, resetTime - Date.now());
  }
}

// Create rate limiter instance (10 prompts per minute)
const promptRateLimiter = new RateLimiter(10, 60000);

// ============================================================================
// AI CHAT PROVIDER DETECTION & COMMAND DISCOVERY
// ============================================================================

/**
 * Known AI chat extensions and their properties
 */
const AI_CHAT_PROVIDERS = {
  // GitHub Copilot
  'github.copilot-chat': {
    name: 'GitHub Copilot Chat',
    chatCommand: 'workbench.action.chat.open',
    supportsQuery: true,
    priority: 1
  },
  'github.copilot': {
    name: 'GitHub Copilot',
    chatCommand: 'workbench.action.chat.open',
    supportsQuery: true,
    priority: 2
  }
};

// Detected AI chat provider info (populated at activation)
let detectedChatProvider = null;

/**
 * Detect which AI extensions are installed and their capabilities
 */
async function detectAIChatProvider() {
  const logger = serverLogger || { info: console.log, debug: console.log, warn: console.warn };

  logger.info('Detecting AI chat providers...');

  // Check known AI extensions
  for (const [extensionId, providerInfo] of Object.entries(AI_CHAT_PROVIDERS)) {
    const ext = vscode.extensions.getExtension(extensionId);
    if (ext) {
      logger.info(`Found AI extension: ${providerInfo.name} (${extensionId})`);
      detectedChatProvider = { extensionId, ...providerInfo };
      break;
    }
  }


  return detectedChatProvider;
}
// SECURITY VALIDATOR - Prevent unauthorized access
// ============================================================================

class SecurityValidator {
  static validateUrl(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();

      // Default allowed hosts
      const allowedHosts = ['localhost', '127.0.0.1', '::1'];
      if (allowedHosts.includes(hostname)) {
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

      // Check additional allowed hosts from configuration
      const config = vscode.workspace.getConfiguration('ai-bridge');
      const additionalHosts = config.get('additionalAllowedHosts', []);
      if (Array.isArray(additionalHosts) && additionalHosts.includes(hostname)) {
        return true;
      }

      throw new Error(
        `SECURITY BLOCKED: Host '${hostname}' is not authorized. ` +
        `Only localhost and local development domains are allowed. ` +
        `You can whitelist this host in VS Code settings under 'AI Bridge: Additional Allowed Hosts'.`
      );
    } catch (error) {
      throw new Error(`Invalid URL format: ${error.message}`);
    }
  }

  static validatePrompt(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid prompt: expected object');
    }
    if (!data.prompt || typeof data.prompt !== 'string') {
      throw new Error('Invalid prompt: missing or invalid prompt field');
    }
    if (data.prompt.length === 0) {
      throw new Error('Invalid prompt: prompt cannot be empty');
    }
    if (data.prompt.length > MAX_PROMPT_LENGTH) {
      throw new Error(`Invalid prompt: exceeds ${MAX_PROMPT_LENGTH} character limit`);
    }
    return true;
  }

  static sanitizeLog(data) {
    // SECURITY: Don't log sensitive information
    if (!data || typeof data !== 'object') return data;

    const filtered = { ...data };
    const sensitivePatterns = [
      'password', 'token', 'key', 'secret', 'api', 'credential',
      'auth', 'access', 'private', 'apikey'
    ];

    Object.keys(filtered).forEach(key => {
      if (sensitivePatterns.some(pattern => key.toLowerCase().includes(pattern))) {
        filtered[key] = '[REDACTED]';
      }
    });

    return filtered;
  }
}

// ============================================================================
// LOGGER - Production-grade structured logging
// ============================================================================

class Logger {
  constructor(name) {
    this.name = name;
    this.channel = vscode.window.createOutputChannel(`AI Bridge: ${name}`);
    this.logLevel = this.getLogLevel();
  }

  getLogLevel() {
    const config = vscode.workspace.getConfiguration('ai-bridge');
    const level = config.get('logLevel', 'info');
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level] || 1;
  }

  formatMessage(levelName, message, data = {}) {
    const timestamp = new Date().toISOString();
    const dataStr = Object.keys(data).length > 0
      ? ' | ' + JSON.stringify(SecurityValidator.sanitizeLog(data))
      : '';
    return `[${timestamp}] [${levelName.padEnd(5)}] ${message}${dataStr}`;
  }

  log(level, message, data = {}) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const levelNum = levels[level] || 1;

    if (levelNum < this.logLevel) return;

    const levelName = level.toUpperCase();
    const formatted = this.formatMessage(levelName, message, data);

    this.channel.appendLine(formatted);
    if (levelNum >= 2) console.log(formatted);
  }

  debug(message, data = {}) { this.log('debug', message, data); }
  info(message, data = {}) { this.log('info', message, data); }
  warn(message, data = {}) { this.log('warn', message, data); }
  error(message, data = {}) { this.log('error', message, data); }
  show() { this.channel.show(); }

  dispose() {
    if (this.channel) {
      this.channel.dispose();
      this.channel = null;
    }
  }
}

const logger = new Logger('Extension');

// ============================================================================
// SERVER MANAGEMENT - SMART SINGLETON PATTERN
// ============================================================================

/**
 * Check if server is already running on the port
 */
async function isServerRunning(port) {
  return new Promise((resolve) => {
    const net = require('net');
    const socket = new net.Socket();

    socket.setTimeout(1000);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      resolve(false);
    });

    socket.connect(port, 'localhost');
  });
}

/**
 * Check if server is healthy and responding
 */
async function isServerHealthy(healthUrl) {
  try {
    const response = await new Promise((resolve, reject) => {
      const request = http.get(healthUrl, (res) => {
        resolve(res);
      });
      request.on('error', reject);
      request.setTimeout(2000, () => {
        request.destroy();
        reject(new Error('Timeout'));
      });
    });

    return response.statusCode === 200;
  } catch (error) {
    return false;
  }
}

/**
 * Ensure server is running - start if needed, connect if exists
 * This implements the Smart Singleton pattern
 */
async function ensureServerRunning(context) {
  const healthUrl = `http://localhost:${DEFAULT_HTTP_PORT}/api/health`;

  logger.info('Checking for existing server...');

  // Check if server is already running and healthy
  const serverRunning = await isServerRunning(DEFAULT_HTTP_PORT);

  if (serverRunning) {
    logger.info('Server port is in use, checking health...');
    const healthy = await isServerHealthy(healthUrl);

    if (healthy) {
      logger.info('Existing server is healthy, connecting to it');
      return; // Server already running, just connect
    } else {
      logger.warn('Server port in use but not responding, may need cleanup');
      // Try to connect anyway, might recover
      await new Promise(resolve => setTimeout(resolve, 1000));
      const retryHealthy = await isServerHealthy(healthUrl);
      if (retryHealthy) {
        logger.info('Server recovered, connecting to it');
        return;
      }
      // If still not healthy, we'll try to start our own
      logger.warn('Server not healthy after retry, will attempt to start new instance');
    }
  }

  // No server running, start it
  logger.info('No healthy server found, starting new instance...');
  await startBridgeServer(context);
}

async function startBridgeServer(context) {
  return new Promise(async (resolve, reject) => {
    try {
      serverLogger = new Logger('Server');
      const healthUrl = `http://localhost:${DEFAULT_HTTP_PORT}/api/health`;

      // Check if server is already running (e.g., from another VS Code window)
      try {
        logger.info('Checking if bridge server is already running...');
        await checkServerHealth(healthUrl);
        logger.info('Existing bridge server detected and healthy. Proceeding...');
        resolve(); // Server already running, no need to spawn
        return;
      } catch (error) {
        logger.info('No existing healthy server detected, starting new instance');
      }

      const serverPath = context.asAbsolutePath(path.join('server', 'server.js'));
      const serverDir = path.dirname(serverPath);

      logger.info('Starting embedded bridge server', {
        serverPath,
        httpPort: DEFAULT_HTTP_PORT,
        wsPort: DEFAULT_WS_PORT
      });

      // Spawn Node.js process for server
      serverProcess = spawn('node', [serverPath], {
        cwd: serverDir,
        env: {
          ...process.env,
          PORT: DEFAULT_HTTP_PORT.toString(),
          WS_PORT: DEFAULT_WS_PORT.toString()
        },
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Capture server output
      serverProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          serverLogger.info(output);
        }
      });

      serverProcess.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          serverLogger.error(output);
        }
      });

      serverProcess.on('error', (error) => {
        logger.error('Server process error', { error: error.message });
        reject(new Error(`Failed to start server: ${error.message}`));
      });

      serverProcess.on('exit', (code, signal) => {
        logger.warn('Server process exited', { code, signal });
        if (code !== 0 && code !== null) {
          vscode.window.showWarningMessage(
            `Bridge server stopped unexpectedly (code: ${code}). Extension may not work correctly.`
          );
        }
      });

      // Wait for server to be ready
      logger.info('Waiting for server to start...');
      waitForServerReady(`http://localhost:${DEFAULT_HTTP_PORT}/api/health`, SERVER_STARTUP_TIMEOUT)
        .then(() => {
          logger.info('Bridge server started successfully');
          resolve();
        })
        .catch((error) => {
          logger.error('Server failed to start', { error: error.message });
          if (serverProcess) {
            serverProcess.kill();
          }
          reject(error);
        });

    } catch (error) {
      logger.error('Failed to spawn server process', { error: error.message });
      reject(error);
    }
  });
}

async function waitForServerReady(healthUrl, timeout) {
  const startTime = Date.now();
  const checkInterval = 500; // Check every 500ms

  while (Date.now() - startTime < timeout) {
    try {
      await checkServerHealth(healthUrl);
      return; // Server is ready
    } catch (error) {
      // Server not ready yet, wait and retry
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
  }

  throw new Error(`Server failed to start within ${timeout}ms`);
}

function checkServerHealth(healthUrl) {
  return new Promise((resolve, reject) => {
    http.get(healthUrl, (res) => {
      if (res.statusCode === 200) {
        resolve();
      } else {
        reject(new Error(`Health check failed: ${res.statusCode}`));
      }
    }).on('error', reject);
  });
}

function stopBridgeServer() {
  if (serverProcess) {
    logger.info('Stopping bridge server...');
    try {
      serverProcess.kill('SIGTERM');
      serverProcess = null;
      logger.info('Bridge server stopped');
    } catch (error) {
      logger.error('Error stopping server', { error: error.message });
    }
  }
}


// ============================================================================
// ACTIVATION - Initialize extension
// ============================================================================

async function activate(context) {
  // 1. Setup Status Bar (Immediate Feedback)
  // Moved here to ensure it appears even if other activation steps fail
  const startDevStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  startDevStatusBar.command = 'ai-bridge.startDev';
  startDevStatusBar.text = '$(rocket) AI Dev';
  startDevStatusBar.tooltip = 'Start Dev Server with AI Bridge Injection';
  startDevStatusBar.show();
  context.subscriptions.push(startDevStatusBar);

  logger.info('╔════════════════════════════════════════╗');
  logger.info('║   AI BRIDGE EXTENSION ACTIVATING      ║');
  logger.info('╚════════════════════════════════════════╝');
  logger.info('Extension details', {
    version: VERSION,
    author: AUTHOR,
    email: AUTHOR_EMAIL,
    security: 'enterprise-grade',
    embeddedServer: true
  });

  try {
    extensionContext = context;
    isActivated = true;

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    statusBarItem.text = '$(sync~spin) AI Bridge: Starting...';
    statusBarItem.tooltip = 'AI Bridge v1.0.0: Starting embedded server';
    statusBarItem.command = 'ai-bridge.reconnect';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    // Detect AI chat providers (for smart prompt routing)
    await detectAIChatProvider();


    // Register commands
    const testCommand = vscode.commands.registerCommand(
      'ai-bridge.test',
      () => {
        if (!isActivated) return;
        testConnection();
      }
    );

    const connectCommand = vscode.commands.registerCommand(
      'ai-bridge.connect',
      () => {
        if (!isActivated) return;
        logger.info('Connect command triggered');
        connectToServer();
      }
    );

    const reconnectCommand = vscode.commands.registerCommand(
      'ai-bridge.reconnect',
      () => {
        if (!isActivated) return;
        logger.info('Reconnect command triggered');
        if (ws) {
          ws.close();
        }
        connectionAttempts = 0;
        connectToServer();
      }
    );

    const showLogsDisposable = vscode.commands.registerCommand('ai-bridge.showLogs', () => {
      if (serverLogger) {
        serverLogger.show();
      }
    });
    context.subscriptions.push(showLogsDisposable);

    // -----------------------------------------------------------------------------------------
    // START DEV COMMAND (UNIVERSAL FS PROXY)
    // -----------------------------------------------------------------------------------------
    const startDevDisposable = vscode.commands.registerCommand('ai-bridge.startDev', async () => {
      if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('AI Bridge: No workspace open.');
        return;
      }

      const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
      const scriptPath = path.join(context.extensionPath, 'scripts', 'universal-injector.js');

      if (!fs.existsSync(scriptPath)) {
        vscode.window.showErrorMessage(`AI Bridge Error: Injector script not found at ${scriptPath}`);
        return;
      }

      // DIRECT MODE: No popup. Just open the terminal with the environment set.
      // The user will type the command themselves.

      const terminalName = 'AI Bridge Terminal'; // Simple name since we don't know the command yet
      const terminal = vscode.window.createTerminal({
        name: terminalName,
        env: {
          // THE KEY: Preload universal-injector.js
          NODE_OPTIONS: `--require "${scriptPath}"`,
          NODE_ENV: 'development',
          // Force color output if possible
          FORCE_COLOR: '1'
        }
      });

      terminal.show();
      // terminal.sendText(buildCommand); // Removed: User types it manually

      vscode.window.showInformationMessage(
        '✅ AI Bridge Terminal Ready!\n' +
        'Type your run command here (e.g. "npm run dev")'
      );
    });
    context.subscriptions.push(startDevDisposable);



    context.subscriptions.push(testCommand, connectCommand, reconnectCommand);

    // Start embedded bridge server
    updateStatusBar('$(sync~spin) AI Bridge: Starting server...', 'Starting embedded bridge server');

    try {
      await startBridgeServer(context);
      logger.info('Server started, initiating WebSocket connection');

      // Connect to server after it's ready
      setTimeout(() => {
        if (isActivated) {
          connectToServer();
        }
      }, 1000);

    } catch (error) {
      logger.error('Failed to start embedded server', { error: error.message });
      updateStatusBar('$(error) AI Bridge: Server Error', 'Failed to start server - see logs');
      vscode.window.showErrorMessage(
        `AI Bridge: Failed to start embedded server. ${error.message}. Check Output -> AI Bridge: Server`
      );
      return;
    }

    logger.info('AI Bridge extension activated successfully', {
      version: VERSION,
      status: 'active',
      serverEmbedded: true
    });

  } catch (error) {
    logger.error('CRITICAL: Extension activation failed', {
      error: error.message,
      stack: error.stack
    });
    isActivated = false;
    vscode.window.showErrorMessage(
      `AI Bridge activation failed: ${error.message}. Check Output -> AI Bridge: Extension`
    );
  }
}

// ============================================================================
// TEST CONNECTION
// ============================================================================

function testConnection() {
  try {
    const wsUrl = vscode.workspace.getConfiguration('ai-bridge').get('wsUrl');
    SecurityValidator.validateUrl(wsUrl);

    logger.info('Connection test passed');
    vscode.window.showInformationMessage(
      'AI Bridge is active and properly configured! v' + VERSION
    );
  } catch (error) {
    logger.error('Connection test failed', { error: error.message });
    vscode.window.showErrorMessage(
      `Test failed: ${error.message}. Check Settings -> AI Bridge`
    );
  }
}

// ============================================================================
// CONNECTION MANAGEMENT
// ============================================================================

function connectToServer() {
  if (!isActivated) return;

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    logger.debug('WebSocket already connected or connecting');
    return;
  }

  try {
    const config = vscode.workspace.getConfiguration('ai-bridge');
    const wsUrl = config.get('wsUrl', 'ws://localhost:3001');
    const enableSecurity = config.get('enableSecurity', true);

    // SECURITY: Validate URL before connection
    if (enableSecurity) {
      SecurityValidator.validateUrl(wsUrl);
    }

    logger.info('WebSocket connection attempt', {
      url: wsUrl,
      attempt: connectionAttempts + 1,
      maxAttempts: MAX_CONNECTION_ATTEMPTS,
      security: enableSecurity ? 'enabled' : 'disabled'
    });

    ws = new WebSocket(wsUrl);

    ws.on('open', () => {
      if (!isActivated) return;

      connectionAttempts = 0;
      logger.info('WebSocket connection established successfully');
      updateStatusBar('$(check) AI Bridge: Connected', 'Connected to embedded bridge server');

      // Send client info securely
      try {
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        const folderNames = workspaceFolders.map(f => f.name).join(', ') || 'Untitled';
        const activeFile = vscode.window.activeTextEditor?.document?.fileName;

        const clientInfo = {
          type: 'client-info',
          timestamp: new Date().toISOString(),
          version: VERSION,
          data: {
            workspace: folderNames,
            workspacePath: workspaceFolders[0]?.uri.fsPath || null,
            activeFile: activeFile || null,
            security: 'enabled',
            embeddedServer: true
          }
        };

        logger.debug('Sending client info', {
          workspace: folderNames,
          hasActiveFile: !!activeFile
        });

        ws.send(JSON.stringify(clientInfo));
      } catch (error) {
        logger.error('Failed to send client info', { error: error.message });
      }
    });

    ws.on('message', (data) => {
      if (!isActivated) return;

      try {
        const message = JSON.parse(data);
        logger.debug('Message received', { type: message.type });

        if (message.type === 'prompt') {
          SecurityValidator.validatePrompt(message.data);
          handlePrompt(message.data);
        } else if (message.type === 'connection') {
          logger.info('Server connection message received', { clientId: message.clientId });
        } else {
          logger.warn('Unknown message type received', { type: message.type });
        }
      } catch (error) {
        logger.error('Failed to process message', { error: error.message });
      }
    });

    ws.on('close', () => {
      if (!isActivated) return;

      logger.warn('WebSocket connection closed');
      updateStatusBar('$(alert) AI Bridge: Disconnected', 'Click to reconnect');

      connectionAttempts++;
      if (connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
        logger.info(`Scheduling reconnection`, {
          attempt: connectionAttempts,
          maxAttempts: MAX_CONNECTION_ATTEMPTS,
          delayMs: RECONNECT_DELAY
        });
        setTimeout(() => connectToServer(), RECONNECT_DELAY);
      } else {
        logger.error('Max connection attempts exceeded. Attempting server recovery...');
        // Try to restart the server - maybe the previous owner (window) was closed
        startBridgeServer(extensionContext)
          .then(() => {
            connectionAttempts = 0;
            connectToServer();
          })
          .catch((error) => {
            logger.error('Server recovery failed', { error: error.message });
            vscode.window.showErrorMessage(
              `AI Bridge failed to connect and recovery failed. ` +
              `The server may be blocked or occupied by another process.`
            );
          });
      }
    });

    ws.on('error', (error) => {
      if (!isActivated) return;

      logger.error('WebSocket error', {
        error: error.message,
        code: error.code
      });
      updateStatusBar('$(error) AI Bridge: Error', 'Connection error - click to retry');
    });

  } catch (error) {
    logger.error('Failed to create WebSocket connection', {
      error: error.message,
      stack: error.stack
    });
    updateStatusBar('$(error) AI Bridge: Error', 'See logs for details');
  }
}

// ============================================================================
// PROMPT HANDLING
// ============================================================================

async function handlePrompt(data) {
  try {
    // Check rate limit first
    if (!promptRateLimiter.canMakeRequest()) {
      const resetInSeconds = Math.ceil(promptRateLimiter.getResetTime() / 1000);
      const message =
        `Rate limit exceeded. Please wait ${resetInSeconds} seconds before sending another prompt. ` +
        `This protects against accidental spam.`;

      logger.warn('Rate limit exceeded', {
        resetInSeconds,
        maxRequests: promptRateLimiter.maxRequests,
        windowMs: promptRateLimiter.windowMs
      });

      vscode.window.showWarningMessage(message);
      return;
    }

    // Record the request
    promptRateLimiter.recordRequest();
    const remaining = promptRateLimiter.getRemainingRequests();

    if (!data || !data.prompt) {
      logger.warn('Invalid prompt data received');
      return;
    }

    logger.info('Processing prompt from browser', {
      promptLength: data.prompt.length,
      hasContext: !!data.elementContext,
      sourceUrl: data.url ? 'yes' : 'no',
      remainingQuota: remaining
    });

    // Feature: Auto-open source file if context is present
    if (data.elementContext && data.elementContext.source && data.elementContext.source.component) {
      logger.info('Found source context, attempting to open file...');
      handleOpenSource(data.elementContext.source.component).catch(err => {
        logger.warn('Failed to auto-open source file', { error: err.message });
      });
    }

    const prompt = data.prompt;

    if (data.type === 'insert-code') {
      await handleInsert(data);
      return;
    }

    // Step 1: Try to open AI chat and send prompt directly
    logger.info('About to call tryOpenAIChat...');
    const success = await tryOpenAIChat(prompt);
    logger.info('tryOpenAIChat returned', { success });

    if (success) {
      vscode.window.showInformationMessage(
        `AI Bridge: Prompt sent! (${remaining - 1} requests remaining this minute)`
      );
    } else {
      // Fallback: Show MODAL dialog - very visible, stays on screen
      const preview = prompt.substring(0, 150);
      vscode.window.showInformationMessage(
        `AI Bridge: Prompt copied to clipboard!\n\n` +
        `Open your AI chat panel and paste (Cmd+V / Ctrl+V) to provide the context.\n\n` +
        `Preview: "${preview}..."`,
        { modal: true },
        'Got it!'
      );
    }

  } catch (error) {
    logger.error('Error handling prompt', {
      error: error.message,
      stack: error.stack
    });
    vscode.window.showErrorMessage(
      `Failed to process prompt: ${error.message}`
    );
  }
}

/**
 * Handle direct code insertion into the active editor
 */
async function handleInsert(data) {
  try {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('AI Bridge: No active text editor found to insert code.');
      return;
    }

    // Use originalPrompt if available (raw text), otherwise fallback to prompt
    const textToInsert = data.originalPrompt || data.prompt;
    if (!textToInsert) {
      logger.warn('No text provided for insertion');
      return;
    }

    await editor.edit(editBuilder => {
      // Replace the entire selection or insert at cursor
      const selection = editor.selection;
      if (selection.isEmpty) {
        editBuilder.insert(selection.active, textToInsert);
      } else {
        editBuilder.replace(selection, textToInsert);
      }
    });

    updateStatusBar('$(check) AI Bridge: Inserted', 'Text inserted into editor');
    vscode.window.showInformationMessage('AI Bridge: Code inserted successfully.');

  } catch (error) {
    logger.error('Error inserting code', { error: error.message });
    vscode.window.showErrorMessage(`AI Bridge: Insertion failed. ${error.message}`);
  }
}

/**
 * Smart AI Chat Integration - uses detected provider and discovered commands
 * Prioritizes: 1) Detected provider, 2) Discovered commands, 3) Universal fallback
 */
async function tryOpenAIChat(prompt) {
  const appName = vscode.env.appName || '';
  const isVSCode = appName.toLowerCase().includes('visual studio code');

  logger.info('🎯 tryOpenAIChat called', {
    appName,
    isVSCode,
    promptLength: prompt.length,
    hasDetectedProvider: !!detectedChatProvider
  });

  // Step 1: Always copy to clipboard (Fallback)
  try {
    await vscode.env.clipboard.writeText(prompt);
  } catch (e) {
    logger.warn('Failed to copy to clipboard', { error: e.message });
  }

  // If not VS Code, just return false so the user gets the "Copied to clipboard" notification
  if (!isVSCode) {
    logger.info('Non-VS Code IDE detected. Skipping automation, relying on clipboard fallback.');
    return false;
  }

  // Step 2: Try to use native provider command if possible (Most reliable)
  if (detectedChatProvider && detectedChatProvider.chatCommand) {
    try {
      if (detectedChatProvider.supportsQuery) {
        logger.info(`Sending prompt directly via ${detectedChatProvider.name}`);
        await vscode.commands.executeCommand(detectedChatProvider.chatCommand, {
          query: prompt,
          isPartialQuery: false
        });
        return true;
      } else {
        logger.info(`Opening ${detectedChatProvider.name} panel via command`);
        await vscode.commands.executeCommand(detectedChatProvider.chatCommand);
        // Continue to keyboard automation to paste and send
      }
    } catch (e) {
      logger.warn(`Native command failed: ${e.message}`);
    }
  }

  // Step 3: Keyboard Automation for VS Code
  try {
    const isMac = process.platform === 'darwin';
    const modifierKey = isMac ? Key.LeftSuper : Key.LeftControl;

    // Focus window first
    await vscode.commands.executeCommand('workbench.action.focusWindow');
    await new Promise(r => setTimeout(r, 500));

    // Open Chat if not already opened via command
    logger.info('Simulating shortcuts...');
    await keyboard.pressKey(modifierKey, Key.L);
    await keyboard.releaseKey(modifierKey, Key.L);
    await new Promise(r => setTimeout(r, 1000));

    // Paste
    await keyboard.pressKey(modifierKey, Key.V);
    await keyboard.releaseKey(modifierKey, Key.V);
    await new Promise(r => setTimeout(r, 500));

    // Send
    await keyboard.pressKey(Key.Enter);
    await keyboard.releaseKey(Key.Enter);

    logger.info('Prompt sent via VS Code automation');
    return true;

  } catch (error) {
    logger.error('Automation failed', { error: error.message });
    return false;
  }
}

// ============================================================================
// UI UPDATES
// ============================================================================

function updateStatusBar(text, tooltip) {
  if (statusBarItem) {
    try {
      statusBarItem.text = text;
      statusBarItem.tooltip = tooltip;
      statusBarItem.command = 'ai-bridge.reconnect';
    } catch (error) {
      logger.error('Failed to update status bar', { error: error.message });
    }
  }
}

// ============================================================================
// DEACTIVATION
// ============================================================================

function deactivate() {
  logger.info('AI Bridge extension deactivating');

  isActivated = false;

  // Kill the server process if it was started by this instance
  if (serverProcess) {
    try {
      logger.info('Shutting down bridge server process');
      serverProcess.kill('SIGTERM');
      serverProcess = null;
    } catch (error) {
      logger.error('Error killing server process', { error: error.message });
    }
  } else {
    logger.info('No server process to kill (extension was likely using shared server)');
  }

  if (ws) {
    try {
      ws.close();
      ws = null;
    } catch (error) {
      logger.error('Error closing WebSocket', { error: error.message });
    }
  }

  if (statusBarItem) {
    try {
      statusBarItem.dispose();
      statusBarItem = null;
    } catch (error) {
      logger.error('Error disposing status bar', { error: error.message });
    }
  }

  // Dispose of loggers to prevent multiple output channels
  if (serverLogger) {
    try {
      serverLogger.dispose();
      serverLogger = null;
    } catch (error) {
      console.error('Error disposing server logger:', error);
    }
  }

  extensionContext = null;
  logger.info('AI Bridge extension deactivated');

  // Dispose main logger last
  if (logger) {
    try {
      logger.dispose();
    } catch (error) {
      console.error('Error disposing main logger:', error);
    }
  }
}

// ============================================================================
// SOURCE FILE OPENING
// ============================================================================

async function handleOpenSource(component) {
  if (!component) return;
  // If we have a file, try that first. If not, fallback to name search.
  if (!component.file && !component.name) return;

  const { file, line, column, name } = component;
  let doc = null;

  try {
    if (file) {
      // Strategy 1: Try exact path (Absolute or Relative to Workspace Root)
      const fileUri = vscode.Uri.file(file);
      doc = await vscode.workspace.openTextDocument(fileUri);
    }
  } catch (e) {
    logger.debug('Exact path open failed, trying smart resolution', { file });
  }

  // Strategy 2: Smart Resolution (Find by filename or component name)
  if (!doc) {
    let searchTerm = '';

    if (file) {
      // Extract filename from path (e.g. /path/to/App.js -> App.js)
      searchTerm = path.basename(file);
    } else if (name) {
      // Use component name (e.g. Header -> Header)
      // We will fuzzy match this
      searchTerm = name;
    }

    if (searchTerm) {
      logger.info('Smart resolution searching workspace...', { searchTerm });

      // Try exact filename match first (Header.tsx)
      let files = await vscode.workspace.findFiles(`**/${searchTerm}.{tsx,jsx,ts,js}`, '**/node_modules/**', 1);

      // If no exact extension match, try generic partial match
      if (files.length === 0) {
        files = await vscode.workspace.findFiles(`**/${searchTerm}`, '**/node_modules/**', 1);
      }

      if (files.length > 0) {
        logger.info('Smart resolution found file', { searchTerm, found: files[0].fsPath });
        doc = await vscode.workspace.openTextDocument(files[0]);
      }
    }
  }

  if (doc) {
    // Show document
    const editor = await vscode.window.showTextDocument(doc, {
      preview: true,
      viewColumn: vscode.ViewColumn.One
    });

    // Reveal line
    if (line) {
      // VS Code lines are 0-indexed, source maps usually 1-indexed
      const lineNum = Math.max(0, parseInt(line) - 1);
      const colNum = column ? Math.max(0, parseInt(column)) : 0;

      const range = new vscode.Range(lineNum, colNum, lineNum, colNum);
      const selection = new vscode.Selection(lineNum, colNum, lineNum, colNum);

      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      editor.selection = selection;
    }
  } else {
    logger.warn('Could not find file in workspace', { file });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  activate,
  deactivate
};

// ============================================================================
// METADATA
// ============================================================================
// Version: 1.0.0
// Author: Yogesh Telange (yogesh.x.telange@gmail.com)
// License: MIT
// Repository: https://github.com/yogesh-telange/ai-bridge-vscode
//
// Production Security Features
// ============================================================================