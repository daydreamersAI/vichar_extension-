// Updated background.js with improved authentication support
import { injectCaptureScript } from './scriptInjector.js';

// Initialize the background script
console.log("Background script initialized");

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
  console.log("Background received message:", request);
  
  if (request.action === "captureBoard") {
    console.log("Received captureBoard request for tab:", request.tabId);
    
    // Execute this in a separate async context to avoid message port issues
    (async () => {
      try {
        const result = await injectCaptureScript(request.tabId);
        console.log("Capture result:", result);
        
        // Check the FEN that was captured
        const storageResult = await chrome.storage.local.get(['capturedBoard']);
        console.log("Stored FEN:", storageResult.capturedBoard?.fen);
        
        sendResponse(result);
      } catch (error) {
        console.error("Error in capture process:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true; // Indicates we'll send a response asynchronously
  }
  
  // New action for capturing board for sidebar
  if (request.action === "captureBoardForSidebar") {
    console.log("Capture request for sidebar");
    
    // Execute this in a separate async context to avoid message port issues
    (async () => {
      try {
        // Get the current active tab
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (tabs.length === 0) {
          sendResponse({ success: false, error: "No active tab found" });
          return;
        }
        
        const tabId = tabs[0].id;
        console.log("Using active tab:", tabId);
        
        // Inject and execute the capture script
        const result = await injectCaptureScript(tabId);
        console.log("Capture result for sidebar:", result);
        
        // Check the FEN that was captured
        const storageResult = await chrome.storage.local.get(['capturedBoard']);
        console.log("Stored FEN for sidebar:", storageResult.capturedBoard?.fen);
        
        // If successful, notify the content script to update the sidebar
        if (result.success) {
          try {
            await chrome.tabs.sendMessage(tabId, { action: "updateSidebarImage" });
          } catch (msgError) {
            console.error("Error sending update message:", msgError);
            // Continue anyway, as the capture was successful
          }
        }
        
        sendResponse(result);
      } catch (error) {
        console.error("Error in sidebar capture:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true; // Indicates we'll send a response asynchronously
  }
  
  if (request.action === "processImage") {
    console.log("Processing image data of length:", request.imageData?.length || 0);
    
    (async () => {
      try {
        const result = await processChessboardImage(request.imageData);
        console.log("Image processing result:", result);
        
        // Check the FEN that was processed
        const storageResult = await chrome.storage.local.get(['capturedBoard']);
        console.log("Processed FEN:", storageResult.capturedBoard?.fen);
        
        sendResponse({ success: true });
      } catch (error) {
        console.error("Error processing image:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true; // Indicates we'll send a response asynchronously
  }
  
  // Handle showing the sidebar
  if (request.action === "showSidebar") {
    console.log("Show sidebar request received");
    
    (async () => {
      try {
        // Get the current active tab
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (tabs.length === 0) {
          sendResponse({ success: false, error: "No active tab found" });
          return;
        }
        
        const tabId = tabs[0].id;
        
        // Send a message to the content script to show the sidebar
        // Use a promise wrapper around sendMessage to handle errors properly
        try {
          await new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(tabId, { action: "showSidebar" }, (response) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
              }
              resolve(response);
            });
          });
          
          sendResponse({ success: true });
        } catch (error) {
          console.error("Error showing sidebar:", error);
          sendResponse({ success: false, error: error.message });
        }
      } catch (error) {
        console.error("Error in tab query:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true; // Indicates we'll send a response asynchronously
  }
  
  // Improved implementation for analyzing chess positions with authentication
  if (request.action === "analyzeChessPosition") {
    console.log("Analyze chess position request received");
    
    (async () => {
      try {
        const { question, capturedBoard, useVision, authToken } = request;
        
        console.log("Analysis request details:", {
          question,
          fen: capturedBoard.fen,
          pgn: capturedBoard.pgn ? "Present (length: " + capturedBoard.pgn.length + ")" : "Not included",
          useVision,
          authenticated: !!authToken
        });
        
        // Prepare chat history
        const chatHistory = [
          { text: question, sender: "user" }
        ];
        
        // Prepare the image data if vision is enabled
        let imageData = null;
        if (useVision && capturedBoard.imageData) {
          // Extract just the base64 part if it's a data URL
          if (capturedBoard.imageData.startsWith('data:image/')) {
            imageData = capturedBoard.imageData.split(',')[1];
          } else {
            imageData = capturedBoard.imageData;
          }
          console.log("Including image data for analysis, length:", imageData?.length || 0);
        }
        
        // Prepare the request payload
        const requestData = {
          message: question,
          fen: capturedBoard.fen,
          pgn: capturedBoard.pgn || "",
          image_data: imageData,
          chat_history: chatHistory
        };
        
        // Select the appropriate API endpoint based on authentication
        const apiEndpoint = authToken 
          ? `${API_URL}/analysis-with-credit` 
          : `${API_URL}/chess/analysis`;
          
        console.log("Calling API at:", apiEndpoint);
        
        // Prepare headers with authentication if available
        const headers = {
          'Content-Type': 'application/json',
        };
        
        if (authToken) {
          headers['Authorization'] = `Bearer ${authToken}`;
        }
        
        // Call the API
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(requestData)
        });
        
        console.log("API response status:", response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error("API error response:", errorText);
          
          // Handle specific error cases
          if (response.status === 401) {
            throw new Error("Authentication required. Please login to continue.");
          } else if (response.status === 402) {
            throw new Error("Insufficient credits. Please purchase more credits to continue.");
          } else {
            throw new Error(`API error: ${response.status} - ${errorText || response.statusText}`);
          }
        }
        
        const data = await response.json();
        console.log("API response received:", data);
        
        if (!data.response) {
          console.error("API response missing 'response' field:", data);
          throw new Error("Invalid API response format - missing 'response' field");
        }
        
        // Send the actual API response back
        sendResponse({
          success: true,
          data: data.response,
          // Include user info if provided by the server
          user: data.user || null
        });
        
      } catch (error) {
        console.error("Error analyzing position:", error);
        sendResponse({ 
          success: false, 
          error: error.message || "Failed to analyze the chess position"
        });
      }
    })();
    
    return true; // Indicates we'll send a response asynchronously
  }
  
  // Handle login request from popup
  if (request.action === "login") {
    (async () => {
      try {
        await initiateGoogleAuth();
        // Get the updated auth state to send back
        const data = await chrome.storage.local.get(['userData']);
        sendResponse({ 
          success: authState.isAuthenticated, 
          user: data.userData || null 
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

  // Handle logout request
  if (request.action === "logout") {
    (async () => {
      await logout();
      sendResponse({ success: true });
    })();
    return true;
  }

  // Handle get auth state request
  if (request.action === "getAuthState") {
    (async () => {
      // Refresh auth state check
      await checkAuthState();
      sendResponse({ 
        isAuthenticated: authState.isAuthenticated,
        user: authState.user
      });
    })();
    return true;
  }
  
  // Handle credits update
  if (request.action === "credits_updated") {
    console.log("Credits updated:", request.credits);
    
    // Update auth state
    if (authState.user) {
      authState.user.credits = request.credits;
    }
    
    // Notify any open extension pages
    chrome.runtime.sendMessage({
      action: 'auth_state_changed',
      isAuthenticated: true,
      user: authState.user
    });
    
    sendResponse({ success: true });
    return true;
  }
  
  // Add ping handler for extension health check
  if (request.action === "ping") {
    console.log("Ping received, responding immediately");
    sendResponse({ success: true });
    return true;
  }
  
  // Handle auth update from callback page
  if (request.action === "auth_updated") {
    console.log("Received auth update:", request.data);
    
    (async () => {
      if (request.data && request.data.token) {
        // Update auth state
        authState = {
          isAuthenticated: true,
          token: request.data.token,
          user: request.data.user
        };
        
        // Store token in secure storage
        await chrome.storage.local.set({
          'authToken': request.data.token,
          'userData': request.data.user
        });
        
        // Notify any open extension pages about the login
        chrome.runtime.sendMessage({
          action: 'auth_state_changed',
          isAuthenticated: true,
          user: request.data.user,
          token: request.data.token
        });
        
        console.log("Authentication updated successfully!");
        sendResponse({ success: true });
      } else {
        // Clear auth state (logout)
        authState = {
          isAuthenticated: false,
          token: null,
          user: null
        };
        
        // Clear storage
        await chrome.storage.local.remove(['authToken', 'userData']);
        
        // Notify any open extension pages
        chrome.runtime.sendMessage({
          action: 'auth_state_changed',
          isAuthenticated: false
        });
        
        console.log("Authentication cleared!");
        sendResponse({ success: true });
      }
    })();
    
    return true;
  }
});

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

// Direct approach to Google authentication with our backend
async function initiateGoogleAuth() {
  const API_URL = "https://api.beekayprecision.com";
  console.log("Initiating simplified Google Auth...");
  
  try {
    // 1. Get the auth URL from your backend
    const response = await fetch(`${API_URL}/auth/login/google`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    // 2. Parse the response
    const responseText = await response.text();
    let authUrl;
    
    try {
      // Try to parse as JSON
      const jsonData = JSON.parse(responseText);
      authUrl = jsonData.url;
    } catch (e) {
      // If it's not valid JSON, check if it's a URL itself
      if (responseText.startsWith('http')) {
        authUrl = responseText;
      } else {
        throw new Error('Invalid response format from server');
      }
    }
    
    if (!authUrl) {
      throw new Error('No auth URL found in response');
    }
    
    console.log("Opening auth URL:", authUrl);
    
    // 3. Simply open the auth URL in a new tab
    // This will redirect to your callback page after authentication
    chrome.tabs.create({ url: authUrl });
    
    // 4. Your callback page should handle storing the token
    // For this to work, make sure your callback page stores the token
    // in a way that your extension can access it later
    
    return { success: true, message: "Auth process started. Please complete login in the new tab." };
  } catch (error) {
    console.error("Auth error:", error);
    return { success: false, error: error.message };
  }
}

// Validate token with server
async function validateToken(token) {
  try {
    if (!token) return false;
    
    const response = await fetch(`${API_URL}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.ok) {
      // If the token is valid, also update the user data
      const userData = await response.json();
      
      // Update auth state with fresh user data
      if (authState.isAuthenticated) {
        authState.user = userData;
        // Also update in storage
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

// Refresh token if supported
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
      
      // Update the token in auth state
      authState.token = data.access_token;
      if (data.refresh_token) {
        authState.refreshToken = data.refresh_token;
      }
      
      // Update the token in storage
      await chrome.storage.local.set({
        'authToken': authState.token,
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

