// Background service worker - Handles communication with bridge server

const BRIDGE_SERVER_URL = 'http://localhost:3000';
let serverStatus = 'unknown'; // unknown, connected, disconnected

// Check server status on startup
chrome.runtime.onStartup.addListener(checkServerStatus);
chrome.runtime.onInstalled.addListener(checkServerStatus);

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'sendToAI') {
    handleSendToAI(request.data)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'checkServerStatus') {
    checkServerStatus()
      .then(status => sendResponse({ status }))
      .catch(() => sendResponse({ status: 'disconnected' }));
    return true;
  }
});

async function handleSendToAI(data) {
  try {
    // Validate data
    if (!data || !data.prompt) {
      throw new Error('Invalid prompt data');
    }
    
    // Check if server is running with timeout
    const response = await Promise.race([
      fetch(`${BRIDGE_SERVER_URL}/api/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Server request timeout')), 5000)
      )
    ]);
    
    if (!response.ok) {
      // Handle specific error codes
      if (response.status === 503) {
        throw new Error('VS Code extension not connected. Please install the AI Bridge VS Code extension and make sure it shows "Connected" in the status bar.');
      } else if (response.status === 400) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Bad request');
      } else {
        throw new Error(`Server error: ${response.status}`);
      }
    }
    
    const result = await response.json();
    serverStatus = 'connected';
    updateBadge('✓', '#4caf50');
    
    return {
      success: true,
      data: result
    };
    
  } catch (error) {
    console.error('Failed to send to AI:', error);
    serverStatus = 'disconnected';
    updateBadge('✗', '#f44336');
    
    // Provide helpful error messages
    let errorMsg = error.message;
    
    if (error.message.includes('Failed to fetch')) {
      errorMsg = 'Bridge server not running. Start it: cd bridge-server && npm start';
    } else if (error.message.includes('timeout')) {
      errorMsg = 'Server timeout. Make sure the bridge server is running.';
    } else if (error.message.includes('VS Code extension')) {
      // Already formatted message
      errorMsg = error.message;
    }
    
    return {
      success: false,
      error: errorMsg
    };
  }
}

async function checkServerStatus() {
  try {
    const response = await fetch(`${BRIDGE_SERVER_URL}/api/health`, {
      method: 'GET',
    });
    
    if (response.ok) {
      serverStatus = 'connected';
      updateBadge('✓', '#4caf50');
      return 'connected';
    } else {
      throw new Error('Server not healthy');
    }
  } catch (error) {
    serverStatus = 'disconnected';
    updateBadge('✗', '#f44336');
    return 'disconnected';
  }
}

function updateBadge(text, color) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

// Periodic health check (every 30 seconds)
setInterval(checkServerStatus, 30000);

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // Check server status and show notification
  checkServerStatus().then(status => {
    if (status === 'connected') {
      chrome.tabs.sendMessage(tab.id, {
        action: 'showNotification',
        message: '✅ AI Bridge is connected and ready!',
        type: 'success'
      });
    } else {
      chrome.tabs.sendMessage(tab.id, {
        action: 'showNotification',
        message: '❌ Bridge server not running. Please start it first.',
        type: 'error'
      });
    }
  });
});

console.log('🚀 AI Bridge background service started');