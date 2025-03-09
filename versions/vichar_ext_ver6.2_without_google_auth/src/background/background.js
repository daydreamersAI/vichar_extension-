// Updated background.js with improved authentication support
import { injectCaptureScript } from './scriptInjector.js';

// Add these at the top of your background.js file
let isBackgroundInitialized = false;
const pendingMessages = [];

// Add a central auth state object to track authentication state
let authState = {
  isAuthenticated: false,
  token: null,
  user: null,
  lastValidated: 0
};

// Define the API URL at the top level
const API_URL = "https://api.beekayprecision.com";

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
  
  // Set up message listener
  chrome.runtime.onMessage.addListener(handleMessage);
  
  // Listen for tab navigation to detect auth callback
  chrome.webNavigation.onCompleted.addListener((details) => {
    // Check if this is an auth callback URL
    if (details.url.includes('auth/callback') || 
        details.url.includes('auth-callback.html') || 
        details.url.includes('google/callback')) {
      
      console.log('Detected auth callback page navigation:', details.url);
      
      // Process the callback page - a small delay ensures the page has time to process
      setTimeout(() => {
        try {
          processAuthCallback(details.tabId);
        } catch (error) {
          console.error('Error processing auth callback:', error);
        }
      }, 1000);
    }
  });
  
  // Check authentication state on startup
  checkAuthState()
    .then(isAuthenticated => {
      console.log('Initial auth check:', isAuthenticated ? 'Authenticated' : 'Not authenticated');
      
      // Set up periodic token validation if authenticated
      if (isAuthenticated) {
        setupTokenValidation();
      }
      
      // Test API connection
      testApiConnection();
    })
    .catch(error => {
      console.error('Error in initial auth check:', error);
    });
}

// Handle messages in a centralized way
function handleMessage(message, sender, sendResponse) {
  try {
    console.log('Background received message:', message);
    
    // Handle authentication related messages
    if (message.action === 'login_with_credentials') {
      // Handle username/password login
      console.log("Processing login request with credentials");
      loginWithCredentials(message.username, message.password)
        .then(result => {
          console.log('Login result:', result);
          sendResponse(result);
        })
        .catch(error => {
          console.error('Login error:', error);
          sendResponse({ success: false, error: error.message });
        });
      
      return true; // Indicate async response
    }
    else if (message.action === 'signup_with_credentials') {
      // Handle user signup
      console.log("Processing signup request with credentials");
      signupWithCredentials(message.email, message.password, message.fullName)
        .then(result => {
          console.log('Signup result:', result);
          sendResponse(result);
        })
        .catch(error => {
          console.error('Signup error:', error);
          sendResponse({ success: false, error: error.message });
        });
      
      return true; // Indicate async response
    }
    else if (message.action === 'logout') {
      // Handle logout
      console.log("Processing logout request");
      logout()
        .then(() => {
          sendResponse({ success: true });
        })
        .catch(error => {
          console.error('Logout error:', error);
          sendResponse({ error: error.message });
        });
      
      return true; // Indicate async response
    }
    else if (message.action === 'check_auth') {
      // Check if user is authenticated
      console.log("Processing auth check request");
      checkAuthState()
        .then(isAuthenticated => {
          sendResponse({ 
            isAuthenticated, 
            user: authState.user 
          });
        })
        .catch(error => {
          console.error('Auth check error:', error);
          sendResponse({ 
            isAuthenticated: false, 
            error: error.message 
          });
        });
      
      return true; // Indicate async response
    }
    else if (message.action === 'get_auth_state') {
      // Return the current auth state
      console.log("Returning current auth state");
      sendResponse({
        isAuthenticated: authState.isAuthenticated,
        user: authState.user
      });
      
      return false; // Synchronous response
    }
    else if (message.action === 'auth_updated') {
      // Handle auth state update from content script or auth callback page
      console.log('Auth update received from content or callback');
      
      syncAuthState(message.data)
        .then(result => {
          sendResponse(result);
        })
        .catch(error => {
          console.error('Error syncing auth state:', error);
          sendResponse({ error: error.message });
        });
      
      return true; // Indicate async response
    }
    else if (message.action === 'validateToken') {
      // Validate token
      validateToken(message.token)
        .then(isValid => {
          sendResponse({ isValid });
        })
        .catch(error => {
          console.error('Token validation error:', error);
          sendResponse({ isValid: false, error: error.message });
        });
      
      return true; // Indicate async response
    }
    else if (message.action === 'open_popup') {
      // Open the extension popup
      console.log("Opening extension popup for login");
      
      try {
        chrome.action.openPopup()
          .then(() => {
            console.log("Popup opened successfully");
            sendResponse({ success: true });
          })
          .catch(error => {
            console.error("Error opening popup:", error);
            sendResponse({ success: false, error: error.message });
          });
      } catch (error) {
        // Fallback for older Chrome versions
        console.warn("chrome.action.openPopup failed, trying alternative method");
        
        // Try to get the current active tab
        chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
          if (chrome.runtime.lastError) {
            console.error("Error querying tabs:", chrome.runtime.lastError);
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          
          if (tabs && tabs.length > 0) {
            const tabId = tabs[0].id;
            
            // Create a notification to prompt the user to click the extension icon
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icons/icon128.png',
              title: 'Chess Position Analyzer',
              message: 'Please click the extension icon to login',
              priority: 2
            });
            
            sendResponse({ success: true, message: "Please click the extension icon to login" });
          } else {
            sendResponse({ success: false, error: "No active tab found" });
          }
        });
      }
      
      return true; // Indicate async response
    }
    
    // Handle other messages
    // ... existing code for handling other messages ...
  }
  catch (error) {
    console.error('Error handling message:', error);
    sendResponse({ error: error.message });
    return false;
  }
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

// Storage keys
const AUTH_STORAGE_KEY = 'chess_assistant_auth';
const TOKEN_STORAGE_KEY = 'chess_assistant_token';

// Replace window.tokenValidationInterval with a global variable
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

// Update the login credentials function with a debug bypass
async function loginWithCredentials(username, password) {
  console.log("Attempting to log in with username/password");
  
  try {
    if (!username || !password) {
      throw new Error('Username and password are required');
    }
    
    console.log(`Sending login request for user: ${username}`);
    
    // DEBUG MODE: Bypass server authentication for testing
    const DEBUG_MODE = true; // Set to false to use real server authentication
    
    if (DEBUG_MODE) {
      console.log("DEBUG MODE: Bypassing server authentication");
      
      // Create a mock successful login response
      const mockUser = {
        id: "debug-user-id",
        email: username,
        full_name: username,
        is_active: true,
        credits: 10
      };
      
      const mockToken = "debug-token-" + Date.now();
      
      // Update auth state
      authState = {
        isAuthenticated: true,
        token: mockToken,
        user: mockUser,
        lastValidated: Date.now()
      };
      
      // Save to chrome.storage
      await chrome.storage.local.set({
        'authToken': mockToken,
        'userData': mockUser,
        'authTimestamp': Date.now()
      });
      
      console.log("DEBUG: Mock auth data saved to chrome.storage");
      
      return { 
        success: true, 
        user: mockUser 
      };
    }
    
    // NORMAL AUTHENTICATION CODE FOLLOWS
    // Log the API URL being used
    console.log(`API URL: ${API_URL}/auth/login`);
    
    // Call the API directly
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        username: username,
        password: password
      })
    });
    
    console.log(`Login API response status: ${response.status}`);
    
    if (!response.ok) {
      // Clone the response so we can both read the text and try to parse as JSON
      const clonedResponse = response.clone();
      
      // First, try to read the response as text to capture any non-JSON error messages
      try {
        const errorText = await response.text();
        console.error('Server error text:', errorText);
        
        // Then try to parse it as JSON if it looks like JSON
        if (errorText.trim().startsWith('{')) {
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.detail) {
              throw new Error(errorData.detail);
            }
          } catch (parseError) {
            console.error('Error parsing error response as JSON:', parseError);
          }
        }
        
        // If we get here, it wasn't valid JSON or didn't have a detail field
        // So use the text directly if it's not empty
        if (errorText && errorText.trim()) {
          throw new Error(errorText.trim());
        }
      } catch (textError) {
        console.error('Error reading response as text:', textError);
        // Continue to default error messages
      }
      
      // Default error messages based on status codes
      if (response.status === 401) {
        throw new Error('Invalid username or password');
      } else if (response.status === 500) {
        throw new Error('Server error. Please try again later or contact support.');
      } else {
        throw new Error(`Login failed with status: ${response.status}`);
      }
    }
    
    // Try to parse the success response
    let authData;
    try {
      authData = await response.json();
      console.log("Login API response parsed successfully");
    } catch (parseError) {
      console.error('Error parsing login response:', parseError);
      
      // Try to read as text if JSON parsing fails
      try {
        const responseText = await response.text();
        console.error('Non-JSON response:', responseText);
      } catch (e) {}
      
      throw new Error('Invalid response from server: could not parse response');
    }
    
    if (!authData.access_token) {
      console.error('Invalid auth data received:', authData);
      throw new Error('Invalid response from server: no token provided');
    }
    
    // Update auth state
    authState = {
      isAuthenticated: true,
      token: authData.access_token,
      user: authData.user || {},
      lastValidated: Date.now()
    };
    
    // Save to chrome.storage
    await chrome.storage.local.set({
      'authToken': authData.access_token,
      'userData': authData.user,
      'authTimestamp': Date.now()
    });
    
    console.log("Auth data saved to chrome.storage");
    
    // Set up token validation
    setupTokenValidation();
    
    // Return success
    return { 
      success: true, 
      user: authData.user 
    };
  } catch (error) {
    console.error('Login error:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

// Enhanced token validation with more logging and debug support
async function validateToken(token) {
  try {
    if (!token) {
      console.log('No token provided for validation');
      return false;
    }
    
    console.log('Validating token...');
    
    // Handle debug tokens
    if (token.startsWith('debug-token-')) {
      console.log('DEBUG MODE: Debug token detected, considering valid');
      return true;
    }
    
    const response = await fetch(`${API_URL}/auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.log(`Token validation failed: ${response.status}`);
      return false;
    }
    
    // Get user data from the response
    const userData = await response.json();
    
    // Update the auth state with the validated user data
    authState.user = userData;
    authState.lastValidated = Date.now();
    
    console.log('Token validated successfully');
    return true;
  } catch (error) {
    console.error('Error validating token:', error);
    return false;
  }
}

// Improved token refresh function
async function refreshToken() {
  try {
    if (!authState.token) {
      console.log('No token to refresh');
      return false;
    }
    
    console.log('Attempting to refresh token...');
    
    // Check if the current token is still valid
    const isValid = await validateToken(authState.token);
    
    if (isValid) {
      console.log('Current token is still valid, no need to refresh');
      return true;
    }
    
    // If token validation failed, try to refresh it
    console.log('Token invalid, trying to refresh...');
    
    // For now we don't have a refresh token endpoint, so we'll just return false
    // In a real implementation, you would call a refresh token endpoint here
    console.log('No refresh token functionality available');
    return false;
  } catch (error) {
    console.error('Error refreshing token:', error);
    return false;
  }
}

// Improved logout function
async function logout() {
  try {
    console.log('Logging out...');
    
    // Clear auth state
    authState = {
      isAuthenticated: false,
      token: null,
      user: null,
      lastValidated: 0
    };
    
    // Clear from chrome.storage
    await chrome.storage.local.remove(['authToken', 'userData', 'authTimestamp']);
    
    // Notify content scripts about logout
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        try {
          chrome.tabs.sendMessage(tab.id, {
            action: 'auth_state_changed',
            isAuthenticated: false
          });
        } catch (error) {
          // Ignore errors - some tabs may not have content scripts
        }
      });
    });
    
    console.log('Logged out successfully');
    return true;
  } catch (error) {
    console.error('Error during logout:', error);
    throw error;
  }
}

// Improved auth state check
async function checkAuthState() {
  try {
    // First check chrome.storage
    const data = await chrome.storage.local.get(['authToken', 'userData', 'authTimestamp']);
    
    if (data.authToken) {
      console.log('Found stored auth token, validating...');
      
      // Validate token with server
      const isValid = await validateToken(data.authToken);
      
      if (isValid) {
        console.log('Stored token is valid');
        
        // Update auth state
        authState = {
          isAuthenticated: true,
          token: data.authToken,
          user: data.userData || authState.user, // Use existing user data if available
          lastValidated: Date.now()
        };
        
        return true;
      } else {
        console.log('Stored token is invalid, clearing auth data');
        
        // Clear invalid auth data
        await logout();
        return false;
      }
    } else {
      // No token in chrome.storage, check localStorage via content script
      console.log('No token in chrome.storage, checking via content script...');
      
      // This is tricky since we need an active tab to execute content script
      // For now, we'll just return false if no token in chrome.storage
      console.log('Cannot check localStorage from background script, assuming not authenticated');
      
      return false;
    }
  } catch (error) {
    console.error('Error checking auth state:', error);
    return false;
  }
}

// Set up periodic token validation
function setupTokenValidation() {
  console.log('Setting up periodic token validation');
  
  // Clear any existing interval
  if (tokenValidationInterval) {
    clearInterval(tokenValidationInterval);
  }
  
  // Set up interval to validate token every 15 minutes
  tokenValidationInterval = setInterval(async () => {
    if (authState.isAuthenticated && authState.token) {
      console.log('Performing periodic token validation');
      
      const isValid = await validateToken(authState.token);
      
      if (!isValid) {
        console.log('Token validation failed, logging out');
        await logout();
      } else {
        console.log('Token still valid');
      }
    } else {
      // If not authenticated, clear the interval
      clearInterval(tokenValidationInterval);
      tokenValidationInterval = null;
    }
  }, 15 * 60 * 1000); // 15 minutes
}

// Process auth callback page
async function processAuthCallback(tabId) {
  try {
    console.log('Processing auth callback page in tab:', tabId);
    
    // Execute a script to extract auth data from the page
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      function: extractAuthDataFromPage
    });
    
    if (!results || results.length === 0 || !results[0].result) {
      console.log('No auth data extracted from callback page');
      return;
    }
    
    const authData = results[0].result;
    console.log('Extracted auth data:', authData ? 'Found' : 'None');
    
    if (authData && authData.token) {
      // Validate the token
      const isValid = await validateToken(authData.token);
      
      if (isValid) {
        console.log('Token from callback is valid, updating auth state');
        
        // Update auth state
        authState = {
          isAuthenticated: true,
          token: authData.token,
          user: authData.user || {},
          lastValidated: Date.now()
        };
        
        // Save to chrome.storage
        await chrome.storage.local.set({
          'authToken': authData.token,
          'userData': authData.user,
          'authTimestamp': Date.now()
        });
        
        // Set up token validation
        setupTokenValidation();
        
        // Notify other parts of the extension
        chrome.runtime.sendMessage({
          action: 'auth_state_changed',
          isAuthenticated: true,
          user: authData.user
        });
        
        // Close the callback tab after a delay
        setTimeout(() => {
          try {
            chrome.tabs.remove(tabId);
          } catch (error) {
            console.error('Error closing callback tab:', error);
          }
        }, 3000);
      } else {
        console.log('Token from callback is invalid');
      }
    }
  } catch (error) {
    console.error('Error processing auth callback:', error);
  }
}

// Function to be injected into the callback page - use regular function instead of arrow function
function extractAuthDataFromPage() {
  // This function runs in the context of the web page, not the service worker
  // So we need to use try-catch for any window references
  try {
    console.log('Extracting auth data from page');
    
    try {
      // Try to get data from localStorage first (most reliable)
      if (typeof localStorage !== 'undefined') {
        const authStr = localStorage.getItem('chess_assistant_auth');
        if (authStr) {
          try {
            const authData = JSON.parse(authStr);
            console.log('Found auth data in localStorage');
            return authData;
          } catch (e) {
            console.error('Error parsing auth data from localStorage:', e);
          }
        }
        
        // Try alternate storage format
        const tokenStr = localStorage.getItem('chess_assistant_token');
        if (tokenStr) {
          try {
            const tokenData = JSON.parse(tokenStr);
            console.log('Found token data in localStorage');
            return {
              isAuthenticated: true,
              token: tokenData.access_token || tokenData.token,
              user: tokenData.user
            };
          } catch (e) {
            console.error('Error parsing token data from localStorage:', e);
          }
        }
      }
    } catch (storageError) {
      console.error('Error accessing localStorage:', storageError);
    }
    
    try {
      // Try to find token data in a DOM element
      if (typeof document !== 'undefined') {
        const tokenElement = document.getElementById('token-data');
        if (tokenElement) {
          try {
            const tokenData = JSON.parse(tokenElement.textContent);
            console.log('Found token data in DOM element');
            return {
              isAuthenticated: true,
              token: tokenData.access_token || tokenData.token,
              user: tokenData.user
            };
          } catch (e) {
            console.error('Error parsing token element:', e);
          }
        }
      }
    } catch (domError) {
      console.error('Error accessing DOM:', domError);
    }
    
    try {
      // Try to find tokenData in global scope (set by the page)
      if (typeof window !== 'undefined' && typeof window.tokenData !== 'undefined') {
        console.log('Found tokenData in global scope');
        return {
          isAuthenticated: true,
          token: window.tokenData.access_token || window.tokenData.token,
          user: window.tokenData.user
        };
      }
    } catch (windowError) {
      console.error('Error accessing window.tokenData:', windowError);
    }
    
    // Nothing found
    console.log('No auth data found in the page');
    return null;
  } catch (error) {
    console.error('Error extracting auth data:', error);
    return null;
  }
}

// Safely send a message to tab, handling errors
function safelySendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        reject(new Error('No active tab found'));
        return;
      }
      
      try {
        chrome.tabs.sendMessage(
          tabs[0].id,
          message,
          (response) => {
            if (chrome.runtime.lastError) {
              console.error('Error sending message:', chrome.runtime.lastError);
              reject(chrome.runtime.lastError);
            } else {
              resolve(response);
            }
          }
        );
      } catch (error) {
        console.error('Error sending message:', error);
        reject(error);
      }
    });
  });
}

// Sync auth state with storage and notify listeners
async function syncAuthState(data) {
  try {
    if (!data) {
      console.log('No auth data provided to sync');
      return { success: false };
    }
    
    console.log('Syncing auth state with provided data');
    
    // Validate token if provided
    let isValid = false;
    
    if (data.token) {
      isValid = await validateToken(data.token);
      
      if (!isValid) {
        console.log('Token validation failed during sync');
        return { success: false, error: 'Invalid token' };
      }
    }
    
    // Update auth state
    authState = {
      isAuthenticated: true,
      token: data.token,
      user: data.user || {},
      lastValidated: Date.now()
    };
    
    // Save to chrome.storage
    await chrome.storage.local.set({
      'authToken': data.token,
      'userData': data.user,
      'authTimestamp': Date.now()
    });
    
    // Set up token validation
    setupTokenValidation();
    
    // Notify other parts of the extension
    chrome.runtime.sendMessage({
      action: 'auth_state_changed',
      isAuthenticated: true,
      user: data.user
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error syncing auth state:', error);
    return { success: false, error: error.message };
  }
}

// Test API connection on startup
function testApiConnection() {
  console.log('Testing API connection...');
  
  fetch(`${API_URL}/health`)
    .then(response => {
      if (response.ok) {
        console.log('API connection successful');
        return response.json();
      } else {
        throw new Error(`API error: ${response.status}`);
      }
    })
    .then(data => {
      console.log('API health check response:', data);
    })
    .catch(error => {
      console.error('API connection error:', error);
    });
}

// Update signup function with debug bypass
async function signupWithCredentials(email, password, fullName) {
  console.log("Attempting to sign up with email/password");
  
  try {
    if (!email || !password) {
      throw new Error('Email and password are required');
    }
    
    console.log(`Sending signup request for email: ${email}`);
    
    // DEBUG MODE: Bypass server authentication for testing
    const DEBUG_MODE = true; // Set to false to use real server authentication
    
    if (DEBUG_MODE) {
      console.log("DEBUG MODE: Bypassing server signup");
      
      // Create a mock successful signup response
      const mockUser = {
        id: "debug-user-id",
        email: email,
        full_name: fullName || email,
        is_active: true,
        credits: 10
      };
      
      const mockToken = "debug-token-" + Date.now();
      
      // Update auth state
      authState = {
        isAuthenticated: true,
        token: mockToken,
        user: mockUser,
        lastValidated: Date.now()
      };
      
      // Save to chrome.storage
      await chrome.storage.local.set({
        'authToken': mockToken,
        'userData': mockUser,
        'authTimestamp': Date.now()
      });
      
      console.log("DEBUG: Mock signup data saved to chrome.storage");
      
      return { 
        success: true, 
        user: mockUser 
      };
    }
    
    // NORMAL SIGNUP CODE FOLLOWS
    // Log the API URL being used
    console.log(`API URL: ${API_URL}/auth/signup`);
    
    // Call the API directly
    const response = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        email: email,
        password: password,
        full_name: fullName || ''
      })
    });
    
    console.log(`Signup API response status: ${response.status}`);
    
    if (!response.ok) {
      // Clone the response so we can both read the text
      const clonedResponse = response.clone();
      
      // First, try to read the response as text to capture any non-JSON error messages
      let errorText = '';
      try {
        errorText = await response.text();
        console.error('Server error text:', errorText);
        
        // Check if the error text contains "Internal Server Error"
        if (errorText.includes("Internal Server Error")) {
          console.error('Detected Internal Server Error');
          throw new Error('Server error occurred. Please try again later or contact support.');
        }
        
        // Then try to parse it as JSON if it looks like JSON
        if (errorText.trim().startsWith('{')) {
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.detail) {
              throw new Error(errorData.detail);
            }
          } catch (parseError) {
            console.error('Error parsing error response as JSON:', parseError);
            // Continue to use the error text as a fallback
          }
        }
        
        // If we get here, it wasn't valid JSON or didn't have a detail field
        // So use the text directly if it's not empty
        if (errorText && errorText.trim()) {
          if (errorText.includes("already registered")) {
            throw new Error('This email is already registered');
          } else {
            throw new Error(errorText.trim());
          }
        }
      } catch (textError) {
        if (textError.message !== 'Server error occurred. Please try again later or contact support.') {
          console.error('Error reading response as text:', textError);
        }
        // If this is our custom error, just re-throw it
        if (textError.message === 'Server error occurred. Please try again later or contact support.') {
          throw textError;
        }
        // Otherwise continue to default error messages
      }
      
      // Default error messages based on status codes
      if (response.status === 400) {
        throw new Error('Invalid input data. Please check your email and password.');
      } else if (response.status === 500) {
        throw new Error('Server error. Please try again later or contact support.');
      } else {
        throw new Error(`Signup failed with status: ${response.status}`);
      }
    }
    
    // Try to parse the success response
    let authData;
    try {
      // Use cloned response to preserve the original
      const responseForJson = response.clone();
      authData = await responseForJson.json();
      console.log("Signup API response parsed successfully");
    } catch (parseError) {
      console.error('Error parsing signup response:', parseError);
      
      // Try to read as text if JSON parsing fails
      try {
        const responseText = await response.text();
        console.error('Non-JSON response:', responseText);
        
        // If the response contains any text that looks like a server error
        if (responseText.includes("Error") || responseText.includes("error") || 
            responseText.includes("Exception") || responseText.includes("Failed")) {
          throw new Error(`Server error: ${responseText.slice(0, 100)}...`);
        }
      } catch (e) {
        console.error('Error reading response text:', e);
      }
      
      throw new Error('Invalid response from server: could not parse response');
    }
    
    if (!authData || !authData.access_token) {
      console.error('Invalid auth data received:', authData);
      throw new Error('Invalid response from server: no token provided');
    }
    
    // Update auth state
    authState = {
      isAuthenticated: true,
      token: authData.access_token,
      user: authData.user || {},
      lastValidated: Date.now()
    };
    
    // Save to chrome.storage
    await chrome.storage.local.set({
      'authToken': authData.access_token,
      'userData': authData.user,
      'authTimestamp': Date.now()
    });
    
    console.log("Auth data saved to chrome.storage");
    
    // Set up token validation
    setupTokenValidation();
    
    // Return success
    return { 
      success: true, 
      user: authData.user 
    };
  } catch (error) {
    console.error('Signup error:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

