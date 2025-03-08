// Updated background.js with improved authentication support
import { injectCaptureScript } from './scriptInjector.js';

// Add these at the top of your background.js file
let isBackgroundInitialized = false;
const pendingMessages = [];

// Initialize the background script
function initializeBackground() {
  if (isBackgroundInitialized) return;
  
  console.log("Initializing background script");
  isBackgroundInitialized = true;
  
  // Process any pending messages
  while (pendingMessages.length > 0) {
    const { message, sender, sendResponse } = pendingMessages.shift();
    handleMessage(message, sender, sendResponse);
  }
}

// Handle messages in a centralized way
function handleMessage(message, sender, sendResponse) {
  console.log("Background received message:", message.action);
  
  // Handle login request from popup or content script
  if (message.action === "login") {
    (async () => {
      try {
        const result = await initiateGoogleAuth();
        sendResponse({ 
          success: true, 
          message: "Auth window opened" 
        });
      } catch (error) {
        console.error("Login error:", error);
        sendResponse({ 
          success: false, 
          error: error.message || "Authentication failed" 
        });
      }
    })();
    return true;
  }
  
  // Handle other message types...
  // (Keep your existing message handlers)
  
  return false; // No async response
}

// Replace your existing onMessage listener with this
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isBackgroundInitialized) {
    // Queue the message for processing after initialization
    pendingMessages.push({ message, sender, sendResponse });
    initializeBackground();
    return true;
  }
  
  return handleMessage(message, sender, sendResponse);
});

// Initialize on startup
initializeBackground();

// API_URL for authenticated endpoints
const API_URL = "https://api.beekayprecision.com";

// Storage keys
const AUTH_STORAGE_KEY = 'chess_assistant_auth';
const TOKEN_STORAGE_KEY = 'chess_assistant_token';

// Auth state management
let authState = {
  isAuthenticated: false,
  token: null,
  user: null
};

// Interval for token validation
let tokenValidationInterval = null;

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background script received message:", request);
  
  // Add ping handler for extension health check
  if (request.action === "ping") {
    console.log("Ping received, responding immediately");
    sendResponse({ success: true });
    return true;
  }
  
  // Handle token validation
  if (request.action === "validateToken") {
    console.log("Token validation request received");
    
    // Use fetch to validate the token with the API
    fetch(`${API_URL}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${request.token}`
      }
    })
    .then(response => {
      sendResponse({ isValid: response.ok });
    })
    .catch(error => {
      console.error("Token validation error:", error);
      sendResponse({ isValid: false, error: error.message });
    });
    
    return true; // Indicates async response
  }
  
  // Handle user data fetch
  if (request.action === "fetchUserData") {
    console.log("User data fetch request received");
    
    fetch(`${API_URL}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${request.token}`
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to fetch user data: ${response.status}`);
      }
      return response.json();
    })
    .then(userData => {
      sendResponse({ success: true, userData: userData });
    })
    .catch(error => {
      console.error("User data fetch error:", error);
      sendResponse({ success: false, error: error.message });
    });
    
    return true; // Indicates async response
  }
  
  // Handle credit packages fetch
  if (request.action === "getCreditPackages") {
    console.log("Credit packages fetch request received");
    
    fetch(`${API_URL}/payments/credits/packages`, {
      headers: {
        'Authorization': `Bearer ${request.token}`
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to fetch packages: ${response.status}`);
      }
      return response.json();
    })
    .then(packages => {
      sendResponse({ success: true, packages: packages });
    })
    .catch(error => {
      console.error("Packages fetch error:", error);
      sendResponse({ success: false, error: error.message });
    });
    
    return true; // Indicates async response
  }
  
  // Handle capture request
  if (request.action === "captureBoardForSidebar") {
    console.log("Capture request received");
    
    // Add implementation here or call existing function
    // For now, just send a success response
    sendResponse({ 
      success: true, 
      capturedBoard: {
        imageData: "data:image/png;base64,iVBORw0KGgoA...", // Replace with actual image
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", // Replace with actual FEN
        pgn: "" // Replace with actual PGN
      }
    });
    
    return true;
  }
  
  // Handle analysis request
  if (request.action === "analyzeChessPosition") {
    console.log("Analysis request received");
    
    // Add implementation here or call existing function
    // For now, just send a success response
    sendResponse({ 
      success: true, 
      data: "This is a sample analysis response. The position looks balanced."
    });
    
    return true;
  }
  
  // Default response for unhandled messages
  sendResponse({ success: false, error: "Unhandled message type" });
  return true;
});

// Log when the background script loads
console.log("Chess Analyzer background script loaded at:", new Date().toISOString());

// Process the captured chessboard image
async function processChessboardImage(captureResult) {
  if (!captureResult) {
    throw new Error("No capture result received");
  }
  
  // Extract data from the capture result
  const { imageData, pgn, fen, orientation, site } = captureResult;
  
  if (!imageData) {
    throw new Error("No image data received");
  }
  
  try {
    console.log("Storing captured board data");
    console.log("PGN data:", pgn ? "Found" : "Not found");
    console.log("FEN data:", fen ? fen : "Not found");
    
    // Store the image data and game information for use in the analysis page
    await chrome.storage.local.set({ 
      capturedBoard: {
        imageData: imageData,
        pgn: pgn || "",
        fen: fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", // Default if not found
        orientation: orientation || "white",
        site: site || "unknown",
        timestamp: Date.now()
      }
    });
    
    console.log("Board data stored successfully");
    return { success: true };
  } catch (error) {
    console.error("Error storing chess position:", error);
    throw error;
  }
}

// Update the initiateGoogleAuth function to handle errors better
async function initiateGoogleAuth() {
  const API_URL = "https://api.beekayprecision.com";
  console.log("Initiating Google Auth with improved error handling");
  
  try {
    // Use a timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const response = await fetch(`${API_URL}/auth/login/google`, {
      signal: controller.signal,
      headers: {
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.url) {
      throw new Error('No authentication URL found in the response');
    }
    
    console.log('Opening auth URL in new tab');
    
    // Open the auth URL in a new tab
    await chrome.tabs.create({ url: data.url });
    
    return { success: true };
  } catch (error) {
    console.error('Google Auth error:', error);
    
    if (error.name === 'AbortError') {
      throw new Error('Connection timed out. Please check your internet connection.');
    } else if (error.message.includes('Failed to fetch')) {
      throw new Error('Network error. Please check your internet connection.');
    } else {
      throw error;
    }
  }
}

// Enhance token validation with proper error handling
async function validateToken(token) {
  try {
    if (!token) return false;
    
    const response = await fetch(`${API_URL}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Cache-Control': 'no-cache'  // Prevent caching of auth requests
      }
    });
    
    if (response.status === 401) {
      // Token is invalid or expired, try to refresh
      const refreshed = await refreshToken();
      return refreshed;
    }
    
    if (response.ok) {
      const userData = await response.json();
      // Update auth state with fresh user data
      if (authState.isAuthenticated) {
        authState.user = userData;
        await chrome.storage.local.set({ 'userData': userData });
      }
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Token validation error:', error);
    return false;
  }
}

// Add more robust token refresh logic
async function refreshToken() {
  if (!authState.token) return false;
  
  try {
    const response = await fetch(`${API_URL}/auth/refresh-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authState.token}`
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      
      // Update auth state and storage
      authState.token = data.access_token;
      if (data.refresh_token) {
        authState.refreshToken = data.refresh_token;
      }
      
      await chrome.storage.local.set({
        'authToken': authState.token,
        'refreshToken': authState.refreshToken
      });
      
      // Notify about token refresh
      chrome.runtime.sendMessage({
        action: 'auth_state_changed',
        isAuthenticated: true,
        token: authState.token
      });
      
      return true;
    }
    return false;
  } catch (error) {
    console.error('Token refresh error:', error);
    return false;
  }
}

// Logout function
async function logout() {
  // Remove the Google auth token
  chrome.identity.clearAllCachedAuthTokens(() => {
    console.log('Cleared all cached auth tokens');
  });
  
  // Clear local storage
  await chrome.storage.local.remove(['authToken', 'userData']);
  
  // Also clear localStorage in all extension pages
  const extensionPages = chrome.extension.getViews({ type: 'popup' });
  extensionPages.forEach(page => {
    if (page.localStorage) {
      page.localStorage.removeItem('chess_assistant_auth');
      page.localStorage.removeItem('chess_assistant_token');
    }
  });
  
  // Reset auth state
  authState = {
    isAuthenticated: false,
    token: null,
    user: null
  };
  
  // Notify any open extension pages
  chrome.runtime.sendMessage({
    action: 'auth_state_changed',
    isAuthenticated: false
  });
  
  console.log('Logged out successfully');
}

// Check if user is authenticated on startup
async function checkAuthState() {
  try {
    const data = await chrome.storage.local.get(['authToken', 'userData']);
    
    if (data.authToken) {
      console.log('Found stored auth token, validating...');
      // Validate token with server
      const isValid = await validateToken(data.authToken);
      
      if (isValid) {
        console.log('Stored token is valid');
        authState = {
          isAuthenticated: true,
          token: data.authToken,
          user: data.userData
        };
        
        // Set up periodic token validation
        setupTokenValidation();
        
        return true;
      } else {
        console.log('Stored token is invalid, trying to refresh...');
        
        // Try to refresh the token
        authState.token = data.authToken;
        const refreshed = await refreshToken();
        
        if (refreshed) {
          console.log('Token refreshed successfully');
          authState.isAuthenticated = true;
          authState.user = data.userData;
          
          // Set up periodic token validation
          setupTokenValidation();
          
          return true;
        } else {
          // Token invalid and couldn't refresh, clear storage
          console.log('Token refresh failed, clearing auth data');
          await chrome.storage.local.remove(['authToken', 'userData']);
          
          authState = {
            isAuthenticated: false,
            token: null,
            user: null
          };
          
          return false;
        }
      }
    } else {
      console.log('No stored auth token found');
      return false;
    }
  } catch (error) {
    console.error('Error checking auth state:', error);
    return false;
  }
}

// Set up periodic token validation
function setupTokenValidation() {
  // Clear any existing interval
  if (tokenValidationInterval) {
    clearInterval(tokenValidationInterval);
  }
  
  // Set up a new interval to validate the token every 15 minutes
  tokenValidationInterval = setInterval(async () => {
    console.log('Running periodic token validation...');
    
    if (authState.isAuthenticated && authState.token) {
      const isValid = await validateToken(authState.token);
      
      if (!isValid) {
        console.log('Token expired during periodic check, attempting refresh...');
        
        const refreshed = await refreshToken();
        if (!refreshed) {
          console.log('Token refresh failed, logging out...');
          await logout();
        } else {
          console.log('Token refreshed successfully during periodic check');
        }
      } else {
        console.log('Token still valid during periodic check');
      }
    }
  }, 15 * 60 * 1000); // 15 minutes
}

// Test API connectivity at startup with auth support
function testApiConnection() {
  console.log("Testing API connection...");
  
  fetch(`${API_URL}/`)
    .then(response => {
      console.log("API test response status:", response.status);
      return response.text();
    })
    .then(text => {
      console.log("API test response:", text);
      console.log("API connection successful!");
    })
    .catch(error => {
      console.error("API connection test failed:", error);
    });
}

// Add this to your background.js to enhance the auth handling

// Listen for navigation events to detect auth callback
chrome.webNavigation.onCompleted.addListener(async (details) => {
  // Check if this is our auth callback URL
  if (details.url.includes('api.beekayprecision.com/auth/google/callback') || 
      details.url.includes('auth/callback')) {
    
    console.log('Auth callback page detected, checking for token...');
    
    // Execute script in the callback page to extract token
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: details.tabId },
        function: extractAuthDataFromPage,
      });
      
      if (results && results[0] && results[0].result) {
        const authData = results[0].result;
        console.log('Auth data extracted from callback page:', authData);
        
        if (authData.token || authData.access_token) {
          // Store the token in chrome.storage for persistence
          await chrome.storage.local.set({
            'authToken': authData.token || authData.access_token,
            'userData': authData.user,
            'authTimestamp': Date.now()
          });
          
          // Update auth state
          authState = {
            isAuthenticated: true,
            token: authData.token || authData.access_token,
            user: authData.user
          };
          
          // Notify any open extension pages
          chrome.runtime.sendMessage({
            action: 'auth_state_changed',
            isAuthenticated: true,
            user: authData.user,
            token: authData.token || authData.access_token
          });
          
          console.log('Auth data stored in extension storage');
          
          // Close the tab after a short delay
          setTimeout(() => {
            chrome.tabs.remove(details.tabId);
          }, 2000);
        }
      }
    } catch (error) {
      console.error('Error extracting auth data from callback page:', error);
    }
  }
}, { url: [{ urlContains: 'beekayprecision.com' }] });

// Function that runs in the context of the callback page to extract auth data
function extractAuthDataFromPage() {
  console.log('Extracting auth data from page');
  
  // Try to find auth data in multiple places
  
  // 1. Check for token data in localStorage
  try {
    const tokenData = localStorage.getItem('chess_assistant_token');
    if (tokenData) {
      console.log('Found token in localStorage');
      return JSON.parse(tokenData);
    }
  } catch (e) {
    console.error('Error checking localStorage:', e);
  }
  
  // 2. Look for a specific token element
  const tokenElement = document.getElementById('token-data');
  if (tokenElement) {
    try {
      const tokenData = JSON.parse(tokenElement.textContent);
      console.log('Found token in element');
      return tokenData;
    } catch (e) {
      console.error('Error parsing token element:', e);
    }
  }
  
  // 3. Look for script with token data
  const scripts = document.querySelectorAll('script');
  for (const script of scripts) {
    const content = script.textContent;
    if (content && (content.includes('tokenData') || content.includes('access_token'))) {
      try {
        // Risky but might work
        const match = content.match(/({[\s\S]*token[\s\S]*})/);
        if (match) {
          const tokenData = JSON.parse(match[0]);
          console.log('Found token in script');
          return tokenData;
        }
      } catch (e) {
        console.error('Error parsing script content:', e);
      }
    }
  }
  
  // 4. Text extraction as last resort
  const body = document.body.textContent;
  if (body) {
    const accessTokenMatch = body.match(/"access_token"\s*:\s*"([^"]+)"/);
    const userMatch = body.match(/"user"\s*:\s*({[^}]+})/);
    
    if (accessTokenMatch && userMatch) {
      try {
        return {
          access_token: accessTokenMatch[1],
          user: JSON.parse(userMatch[1])
        };
      } catch (e) {
        console.error('Error extracting from body text:', e);
      }
    }
  }
  
  return null;
}

// Run connectivity test at startup
testApiConnection();

// Check auth state on startup
checkAuthState().then(isAuthenticated => {
  console.log('Initial auth check complete, authenticated:', isAuthenticated);
});

// Complete replacement for safelySendMessage
function safelySendMessage(message) {
  console.log("Safely sending message:", message.action);
  
  // Send to tabs
  chrome.tabs.query({}, tabs => {
    if (!tabs || !tabs.length) return;
    
    tabs.forEach(tab => {
      // First check if the tab is ready to receive messages
      chrome.tabs.sendMessage(tab.id, { action: "ping" }, response => {
        // Only send the actual message if we get a response to the ping
        if (!chrome.runtime.lastError && response && response.success) {
          chrome.tabs.sendMessage(tab.id, message, () => {
            // Ignore any errors
            chrome.runtime.lastError; // Access to clear the error
          });
        }
      });
    });
  });
  
  // Also try to send to extension pages
  try {
    chrome.runtime.sendMessage(message, () => {
      // Ignore any errors
      chrome.runtime.lastError; // Access to clear the error
    });
  } catch (e) {
    // Ignore errors
  }
}

// Replace the auth storage approach to be safer
async function syncAuthState(data) {
  console.log("Syncing auth state:", data);
  
  // Update internal state first
  const oldState = {...authState};
  
  // Update with new data
  authState = {
    isAuthenticated: !!data && !!data.token,
    token: data ? data.token : null,
    user: data ? data.user : null
  };
  
  // Only proceed with storage and messaging if there's a change
  const stateChanged = 
    oldState.isAuthenticated !== authState.isAuthenticated ||
    oldState.token !== authState.token ||
    JSON.stringify(oldState.user) !== JSON.stringify(authState.user);
  
  if (stateChanged) {
    // Store in chrome.storage for persistence
    try {
      if (data && data.token) {
        await chrome.storage.local.set({
          'authToken': data.token,
          'userData': data.user
        });
      } else {
        await chrome.storage.local.remove(['authToken', 'userData']);
      }
    } catch (storageError) {
      console.warn("Error updating chrome storage:", storageError);
    }
    
    // Try to update localStorage for content scripts
    try {
      if (data && data.token) {
        const authData = JSON.stringify({
          isAuthenticated: true,
          token: data.token,
          user: data.user
        });
        
        // Use a more direct approach to update storage
        chrome.tabs.query({active: true}, (tabs) => {
          if (tabs && tabs.length) {
            chrome.scripting.executeScript({
              target: {tabId: tabs[0].id},
              func: (authData) => {
                try { localStorage.setItem('chess_assistant_auth', authData); } catch(e) {}
              },
              args: [authData]
            }).catch(() => {});
          }
        });
      }
    } catch (e) {
      // Ignore storage errors
    }
    
    // Use the completely redesigned safe message sender
    safelySendMessage({
      action: 'auth_state_changed',
      isAuthenticated: authState.isAuthenticated,
      user: authState.user
    });
  }
}

