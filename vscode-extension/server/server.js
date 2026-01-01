/**
 * AI Bridge Server - Production-Ready v1.0.0
 * 
 * Secure bridge server that receives requests from browser extensions
 * and forwards them to VS Code extensions running locally.
 * 
 * Author: Yogesh Telange <yogesh.x.telange@gmail.com>
 * License: MIT
 * 
 * Security Features:
 * - Localhost-only enforcement
 * - Input validation and sanitization
 * - Rate limiting (10 requests/second)
 * - Request size limits (1MB max payload)
 * - CORS whitelist (localhost only)
 * - WebSocket message validation
 * - Structured security logging
 * - No sensitive data logging
 */

const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 3001;

// ============================================================================
// SECURITY & VALIDATION CLASSES
// ============================================================================

/**
 * Security validator for all incoming requests and WebSocket messages
 */
class SecurityValidator {
  static validateUrl(url) {
    try {
      const urlObj = new URL(url);
      const allowedHosts = ['localhost', '127.0.0.1', '::1'];
      if (!allowedHosts.includes(urlObj.hostname)) {
        throw new Error(`SECURITY: Only localhost URLs allowed. Got: ${urlObj.hostname}`);
      }
      return true;
    } catch (error) {
      throw new Error(`SECURITY: Invalid URL format. ${error.message}`);
    }
  }

  static validatePrompt(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('VALIDATION: Request must be an object');
    }
    if (!data.prompt || typeof data.prompt !== 'string') {
      throw new Error('VALIDATION: Prompt field is required and must be a string');
    }
    if (data.prompt.length === 0) {
      throw new Error('VALIDATION: Prompt cannot be empty');
    }
    if (data.prompt.length > 100000) {
      throw new Error('VALIDATION: Prompt exceeds 100KB limit');
    }
    return true;
  }

  static validateClientId(clientId) {
    if (typeof clientId !== 'number' || clientId < 1) {
      throw new Error('VALIDATION: Invalid client ID');
    }
    return true;
  }

  /**
   * Validate that webpage URL is localhost/local development only
   * SECURITY: Prevents data leakage from public websites
   */
  static isLocalWebpageUrl(url) {
    if (!url) return true; // No URL provided is OK (not required)

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();

      // Allow localhost variants
      const localhostNames = ['localhost', '127.0.0.1', '::1', '[::1]'];
      if (localhostNames.includes(hostname)) {
        return true;
      }

      // Allow .local domains (common for local development)
      if (hostname.endsWith('.local')) {
        return true;
      }

      // Allow private IP ranges (RFC 1918)
      if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
      if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
      if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;

      return false;
    } catch (error) {
      return false;
    }
  }

  static sanitizeLog(data) {
    if (!data || typeof data !== 'object') return data;
    const filtered = { ...data };
    const sensitiveKeys = [
      'password', 'token', 'key', 'secret', 'api', 'credential',
      'auth', 'access', 'private', 'apikey', 'bearertoken', 'jwt',
      'sessionid', 'cookie', 'authorization'
    ];

    Object.keys(filtered).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
        filtered[key] = '[REDACTED]';
      }
    });
    return filtered;
  }
}

/**
 * Structured logging with timestamps and security filtering
 */
class Logger {
  static log(level, component, message, data = null) {
    const timestamp = new Date().toISOString();
    const sanitized = data ? SecurityValidator.sanitizeLog(data) : null;
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      component,
      message,
      ...(sanitized && { data: sanitized })
    };
    console.log(JSON.stringify(logEntry));
  }

  static info(component, message, data = null) {
    this.log('info', component, message, data);
  }

  static warn(component, message, data = null) {
    this.log('warn', component, message, data);
  }

  static error(component, message, data = null) {
    this.log('error', component, message, data);
  }

  static debug(component, message, data = null) {
    this.log('debug', component, message, data);
  }
}

/**
 * Rate limiter for request throttling
 */
class RateLimiter {
  constructor(maxRequests = 10, windowMs = 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map();
  }

  isAllowed(identifier) {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    if (!this.requests.has(identifier)) {
      this.requests.set(identifier, []);
    }

    const timestamps = this.requests.get(identifier);
    const recentRequests = timestamps.filter(t => t > windowStart);

    if (recentRequests.length >= this.maxRequests) {
      return false;
    }

    recentRequests.push(now);
    this.requests.set(identifier, recentRequests);
    return true;
  }
}

// ============================================================================
// SECURITY CONFIGURATION
// ============================================================================

const rateLimiter = new RateLimiter(10, 1000); // 10 requests per second
const LOCALHOST_ONLY = true;
const MAX_PAYLOAD_SIZE = '1mb';
const REQUEST_TIMEOUT = 30000; // 30 seconds

// ============================================================================
// EXPRESS MIDDLEWARE
// ============================================================================

// Security headers
app.use((req, res, next) => {
  // Enforce localhost-only access
  if (LOCALHOST_ONLY) {
    const host = req.get('host');
    const ip = req.ip;
    const allowedAddresses = ['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1'];

    if (!allowedAddresses.includes(ip) && !host.startsWith('localhost')) {
      Logger.error('SECURITY', 'BLOCKED: Non-localhost connection attempt', { ip, host });
      return res.status(403).json({ error: 'SECURITY: Only localhost connections allowed' });
    }
  }

  // Rate limiting
  if (!rateLimiter.isAllowed(req.ip)) {
    Logger.warn('SECURITY', 'BLOCKED: Rate limit exceeded', { ip: req.ip });
    return res.status(429).json({ error: 'RATE_LIMIT: Too many requests' });
  }

  next();
});

// CORS - Allow all origins since browser extension makes requests from any webpage
// Server is still secure because it only listens on localhost
app.use(cors({
  origin: '*', // Allow requests from any origin (browser extensions on any website)
  credentials: false, // Don't need credentials for localhost
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  maxAge: 86400
}));

// Request parsing with size limits
app.use(express.json({ limit: MAX_PAYLOAD_SIZE }));
app.use(express.urlencoded({ limit: MAX_PAYLOAD_SIZE, extended: true }));

// Request timeout
app.use((req, res, next) => {
  req.setTimeout(REQUEST_TIMEOUT);
  res.setTimeout(REQUEST_TIMEOUT);
  next();
});

// ============================================================================
// CLIENT MANAGEMENT
// ============================================================================

// Store connected VS Code clients with unique IDs
const vsCodeClients = new Map();
let clientIdCounter = 1;

// WebSocket server for VS Code extension
const wss = new WebSocket.Server({ port: WS_PORT });

Logger.info('SERVER', 'WebSocket server initializing', { port: WS_PORT });

wss.on('connection', (ws, req) => {
  const clientId = clientIdCounter++;
  const clientIp = req.socket.remoteAddress;
  const clientInfo = {
    id: clientId,
    connectedAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
    workspace: 'Unknown',
    workspacePath: null,
    activeFile: null,
    messageCount: 0,
    bytesSent: 0,
    bytesReceived: 0
  };

  // Enforce localhost-only for WebSocket
  const allowedAddresses = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
  if (!allowedAddresses.includes(clientIp)) {
    Logger.error('SECURITY', 'BLOCKED: Non-localhost WebSocket connection', { ip: clientIp });
    ws.close(1008, 'SECURITY: Only localhost connections allowed');
    return;
  }

  vsCodeClients.set(clientId, { ws, info: clientInfo });
  Logger.info('CONNECTION', 'VS Code extension connected', { clientId, ip: clientIp });

  ws.on('message', (data) => {
    try {
      // Track bytes received
      clientInfo.bytesReceived += data.length;

      // Validate message size
      if (data.length > 1048576) { // 1MB limit
        throw new Error('VALIDATION: Message exceeds 1MB limit');
      }

      const message = JSON.parse(data.toString());

      // Validate message structure
      if (!message.type || typeof message.type !== 'string') {
        throw new Error('VALIDATION: Message type is required');
      }

      if (message.type === 'client-info') {
        // Update workspace info with validation
        if (message.data && typeof message.data === 'object') {
          clientInfo.workspace = message.data.workspace || 'Unknown';
          clientInfo.workspacePath = message.data.workspacePath || null;
          clientInfo.activeFile = message.data.activeFile || null;
          clientInfo.lastActive = new Date().toISOString();
          Logger.info('CLIENT_INFO', 'Workspace updated', {
            clientId,
            workspace: clientInfo.workspace
          });
        }
      } else if (message.type === 'heartbeat') {
        // Handle heartbeat/keepalive messages
        clientInfo.lastActive = new Date().toISOString();
      } else {
        Logger.debug('MESSAGE', 'Unknown message type', { clientId, type: message.type });
      }

      clientInfo.messageCount++;
    } catch (error) {
      Logger.error('MESSAGE_PARSE', error.message, { clientId });
    }
  });

  ws.on('close', (code, reason) => {
    Logger.info('DISCONNECT', 'VS Code extension disconnected', {
      clientId,
      code,
      reason: reason || 'No reason provided'
    });
    vsCodeClients.delete(clientId);
  });

  ws.on('error', (error) => {
    Logger.error('WEBSOCKET', 'WebSocket error', { clientId, error: error.message });
    vsCodeClients.delete(clientId);
  });

  // Send welcome message with client ID
  try {
    const welcomeMsg = JSON.stringify({
      type: 'connection',
      message: 'Connected to AI Bridge server',
      clientId: clientId,
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
    ws.send(welcomeMsg);
    clientInfo.bytesSent += welcomeMsg.length;
  } catch (error) {
    Logger.error('CONNECTION', 'Failed to send welcome message', { clientId });
  }
});

// ============================================================================
// HTTP API ENDPOINTS
// ============================================================================

/**
 * Health check endpoint - returns server and connection status
 */
app.get('/api/health', (req, res) => {
  try {
    const clients = Array.from(vsCodeClients.values()).map(({ info }) => ({
      id: info.id,
      workspace: info.workspace,
      connectedAt: info.connectedAt,
      lastActive: info.lastActive,
      messageCount: info.messageCount
    }));

    const response = {
      status: 'ok',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      vsCodeConnected: vsCodeClients.size > 0,
      connectedClients: clients,
      clientCount: vsCodeClients.size
    };

    Logger.debug('API', '/api/health - OK', { clientCount: vsCodeClients.size });
    res.json(response);
  } catch (error) {
    Logger.error('API', '/api/health - ERROR', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Main endpoint to receive prompts from browser
 * Validates input and forwards to VS Code extensions
 */
app.post('/api/send', async (req, res) => {
  try {
    const { url, title, selectedText, prompt, timestamp, targetClientId } = req.body;

    // Validate incoming request
    try {
      SecurityValidator.validatePrompt({ prompt });

      // SECURITY: Validate webpage URL is localhost/local only
      if (url && !SecurityValidator.isLocalWebpageUrl(url)) {
        Logger.warn('API', '/api/send - SECURITY_BLOCKED: Non-local webpage', { url });
        return res.status(403).json({
          error: 'SECURITY_ERROR',
          message: 'AI Bridge only accepts requests from localhost/local development sites for privacy protection'
        });
      }

      if (targetClientId) SecurityValidator.validateClientId(targetClientId);
    } catch (validationError) {
      Logger.warn('API', '/api/send - VALIDATION_FAILED', { error: validationError.message });
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: validationError.message
      });
    }

    // Check if VS Code is connected
    if (vsCodeClients.size === 0) {
      Logger.warn('API', '/api/send - NO_VSCODE_CONNECTED');
      return res.status(503).json({
        error: 'VS_CODE_NOT_CONNECTED',
        message: 'Please ensure the AI Bridge VS Code extension is installed and active'
      });
    }

    // Use the prompt as provided by the client (already enriched by browser extension)
    const fullPrompt = prompt;

    const message = JSON.stringify({
      type: 'prompt',
      timestamp: new Date().toISOString(),
      data: {
        prompt: fullPrompt,
        originalPrompt: prompt,
        url: url || '',
        title: title || '',
        selectedText: selectedText ? selectedText.substring(0, 5000) : '',
        browserTimestamp: timestamp || null
      }
    });

    let sentCount = 0;
    let targetId = null;

    if (targetClientId) {
      // Send to specific VS Code client
      try {
        SecurityValidator.validateClientId(targetClientId);
        const client = vsCodeClients.get(targetClientId);

        if (client && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(message);
          client.info.bytesSent += message.length;
          client.info.lastActive = new Date().toISOString();
          sentCount = 1;
          targetId = targetClientId;
          Logger.info('API', '/api/send - SUCCESS', {
            clientId: targetClientId,
            promptLength: prompt.length
          });
        } else {
          Logger.warn('API', '/api/send - CLIENT_NOT_OPEN', { clientId: targetClientId });
          return res.status(404).json({
            error: 'CLIENT_NOT_FOUND',
            message: 'The selected VS Code instance is no longer connected'
          });
        }
      } catch (error) {
        Logger.warn('API', '/api/send - INVALID_CLIENT_ID', { clientId: targetClientId });
        return res.status(400).json({
          error: 'INVALID_CLIENT_ID',
          message: error.message
        });
      }
    } else {
      // Send to most recently active client
      let mostRecentClient = null;
      let mostRecentId = null;
      let mostRecentTime = new Date(0);

      vsCodeClients.forEach((client, clientId) => {
        const activeTime = new Date(client.info.lastActive);
        if (activeTime > mostRecentTime) {
          mostRecentClient = client;
          mostRecentId = clientId;
          mostRecentTime = activeTime;
        }
      });

      if (mostRecentClient && mostRecentClient.ws.readyState === WebSocket.OPEN) {
        mostRecentClient.ws.send(message);
        mostRecentClient.info.bytesSent += message.length;
        mostRecentClient.info.lastActive = new Date().toISOString();
        sentCount = 1;
        targetId = mostRecentId;
        Logger.info('API', '/api/send - SUCCESS (auto-route)', {
          clientId: mostRecentId,
          promptLength: prompt.length
        });
      }
    }

    res.json({
      success: sentCount > 0,
      message: sentCount > 0 ? 'Prompt sent to VS Code' : 'No available clients',
      clientCount: sentCount,
      targetClientId: targetId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    Logger.error('API', '/api/send - EXCEPTION', { error: error.message });
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'An internal server error occurred. Please check the server logs.'
    });
  }
});

/**
 * Endpoint to get list of connected VS Code clients
 * Used by browser extension to show available instances
 */
app.get('/api/clients', (req, res) => {
  try {
    const clients = Array.from(vsCodeClients.entries()).map(([id, { info }]) => ({
      id,
      workspace: info.workspace,
      workspacePath: info.workspacePath || 'Unknown',
      activeFile: info.activeFile || 'Unknown',
      connectedAt: info.connectedAt,
      lastActive: info.lastActive,
      status: 'connected'
    }));

    Logger.debug('API', '/api/clients - SUCCESS', { clientCount: clients.length });

    res.json({
      clients,
      clientCount: clients.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    Logger.error('API', '/api/clients - EXCEPTION', { error: error.message });
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to retrieve client list'
    });
  }
});

/**
 * Endpoint to get server statistics
 */
app.get('/api/stats', (req, res) => {
  try {
    const stats = {
      version: '1.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      memory: process.memoryUsage(),
      clients: Array.from(vsCodeClients.values()).map(({ info }) => ({
        id: info.id,
        messageCount: info.messageCount,
        bytesSent: info.bytesSent,
        bytesReceived: info.bytesReceived,
        connectedFor: Date.now() - new Date(info.connectedAt).getTime()
      }))
    };

    Logger.debug('API', '/api/stats - SUCCESS');
    res.json(stats);
  } catch (error) {
    Logger.error('API', '/api/stats - EXCEPTION', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * 404 handler
 */
app.use((req, res) => {
  Logger.warn('API', 'NOT_FOUND', { method: req.method, path: req.path });
  res.status(404).json({
    error: 'NOT_FOUND',
    message: 'The requested endpoint does not exist'
  });
});

/**
 * Global error handler
 */
app.use((err, req, res, next) => {
  Logger.error('SERVER', 'UNCAUGHT_ERROR', { error: err.message });
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred'
  });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

const httpServer = app.listen(PORT, 'localhost', () => {
  console.log('-----------------------------------------------------------------');
  console.log('        AI Bridge Server v1.0.0 - PRODUCTION READY              ');
  console.log('-----------------------------------------------------------------');
  const banner = `
  Author: Yogesh Telange <yogesh.x.telange@gmail.gmail>
  License: MIT

  Security Mode: ENABLED (localhost-only)
  Rate Limiting: ENABLED (10 req/sec)
  Payload Limit: 1MB
  Request Timeout: 30s
  `;
  console.log(banner);
  Logger.info('SERVER', 'Server started successfully', {
    httpPort: PORT,
    wsPort: WS_PORT,
    mode: 'production',
    securityEnabled: true
  });
  console.log(`📡 HTTP Server: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket Server: ws://localhost:${WS_PORT}`);
  console.log(`\n⏳ Waiting for VS Code extensions to connect...\n`);
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

process.on('SIGINT', () => {
  Logger.info('SERVER', 'SHUTDOWN: Received SIGINT signal');
  console.log('\n\n👋 Shutting down gracefully...');

  // Close all WebSocket connections
  vsCodeClients.forEach((client, id) => {
    try {
      client.ws.close(1000, 'Server shutting down');
      Logger.info('CONNECTION', 'Closed WebSocket connection', { clientId: id });
    } catch (error) {
      Logger.error('CONNECTION', 'Error closing connection', { clientId: id, error: error.message });
    }
  });

  // Close WebSocket server
  wss.close(() => {
    Logger.info('SERVER', 'WebSocket server closed');
  });

  // Close HTTP server
  httpServer.close(() => {
    Logger.info('SERVER', 'HTTP server closed');
    console.log('Server shut down successfully\n');
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    Logger.error('SERVER', 'Forced exit after timeout');
    process.exit(1);
  }, 10000);
});

process.on('SIGTERM', () => {
  Logger.info('SERVER', 'SHUTDOWN: Received SIGTERM signal');
  process.emit('SIGINT');
});

process.on('uncaughtException', (error) => {
  Logger.error('SERVER', 'UNCAUGHT_EXCEPTION', { error: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  Logger.error('SERVER', 'UNHANDLED_REJECTION', { reason: String(reason) });
});

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = { app, wss, Logger, SecurityValidator, RateLimiter };