// Updated background.js with authentication support
import { injectCaptureScript } from './scriptInjector.js';

// Initialize the background script
console.log("Background script initialized");

// API_URL for authenticated endpoints
const API_URL = "https://api.beekayprecision.com";

// Auth state management
let authState = {
  isAuthenticated: false,
  token: null,
  user: null
};

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

// Updated Google Auth function that uses launchWebAuthFlow instead of getAuthToken
// Direct approach to Google authentication
// Replace your current initiateGoogleAuth with this much simpler version
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

// Alternative approach using a popup window
async function initiateGoogleAuthWithPopup() {
  console.log("Initiating Google Auth with popup...");
  
  return new Promise(async (resolve, reject) => {
    try {
      // Step 1: Call your backend to get the OAuth URL
      const response = await fetch(`${API_URL}/auth/login/google`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get auth URL: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log("Received auth data:", data);
      
      // Step 2: Extract the URL from the response
      if (!data.url) {
        throw new Error("No authentication URL provided by the server");
      }
      
      // Step 3: Open a popup window with the authentication URL
      const width = 800;
      const height = 600;
      const left = (screen.width - width) / 2;
      const top = (screen.height - height) / 2;
      
      const authWindow = window.open(
        data.url,
        "GoogleAuth",
        `width=${width},height=${height},left=${left},top=${top}`
      );
      
      if (!authWindow) {
        throw new Error("Popup blocked. Please allow popups for this site.");
      }
      
      // Step 4: Set up a message listener for the auth result
      // This assumes your callback page will send a postMessage
      const messageListener = (event) => {
        // Verify the message origin matches your API domain
        if (event.origin !== new URL(API_URL).origin) {
          return;
        }
        
        console.log("Received auth message:", event.data);
        
        if (event.data.token) {
          // Remove the listener and close the window
          window.removeEventListener('message', messageListener);
          authWindow.close();
          
          // Update auth state
          authState = {
            isAuthenticated: true,
            token: event.data.token,
            user: event.data.user
          };
          
          // Store token in secure storage
          chrome.storage.local.set({
            'authToken': event.data.token,
            'userData': event.data.user
          }).then(() => {
            // Notify any open extension pages about the login
            chrome.runtime.sendMessage({
              action: 'auth_state_changed',
              isAuthenticated: true,
              user: event.data.user
            });
            
            console.log("Authentication successful!");
            resolve(true);
          });
        } else if (event.data.error) {
          window.removeEventListener('message', messageListener);
          authWindow.close();
          reject(new Error(event.data.error));
        }
      };
      
      window.addEventListener('message', messageListener);
      
      // Set a timeout to clean up if auth takes too long
      setTimeout(() => {
        window.removeEventListener('message', messageListener);
        if (!authWindow.closed) {
          authWindow.close();
        }
        reject(new Error("Authentication timed out after 2 minutes"));
      }, 120000); // 2 minute timeout
      
    } catch (error) {
      console.error("Authentication error:", error);
      reject(error);
    }
  });
}

// New function to handle Google login with your backend
async function loginWithGoogle(accessToken) {
  try {
    console.log('Sending access token to backend...');
    
    const response = await fetch(`${API_URL}/auth/login/google`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: accessToken })
    });
    
    console.log("Backend response status:", response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Backend error response:", errorText);
      return { success: false, error: `Server error: ${response.status} - ${errorText}` };
    }
    
    const data = await response.json();
    console.log("Backend login response:", data);
    
    if (!data.token) {
      return { success: false, error: 'Invalid response from server - no token returned' };
    }
    
    return {
      success: true,
      token: data.token,
      user: data.user
    };
  } catch (error) {
    console.error('Backend login error:', error);
    return { success: false, error: error.message };
  }
}

// Function to get user profile information from Google
async function getUserInfo(token) {
  try {
    console.log('Fetching user info from Google...');
    
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error getting user info:', error);
    throw error;
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
  const data = await chrome.storage.local.get(['authToken', 'userData']);
  
  if (data.authToken) {
    // Validate token with server
    const isValid = await validateToken(data.authToken);
    
    if (isValid) {
      authState = {
        isAuthenticated: true,
        token: data.authToken,
        user: data.userData
      };
      console.log('User authenticated from stored token');
    } else {
      // Token invalid, clear storage
      await chrome.storage.local.remove(['authToken', 'userData']);
      console.log('Stored token invalid, cleared auth data');
    }
  }
}

// Validate token with server
async function validateToken(token) {
  try {
    const response = await fetch(`${API_URL}/auth/validate-token`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    return response.ok;
  } catch (error) {
    console.error('Token validation error:', error);
    return false;
  }
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

// Add this function to your background.js

// Simple test function to understand the API response
async function testGoogleAuth() {
  const API_URL = "https://api.beekayprecision.com";
  console.log("Testing Google Auth API...");
  
  try {
    // Make a simple GET request to the auth endpoint
    const response = await fetch(`${API_URL}/auth/login/google`);
    console.log("API Response Status:", response.status);
    
    // Get the response text
    const responseText = await response.text();
    console.log("API Response Body:", responseText);
    
    // Try to parse as JSON if possible
    try {
      const jsonData = JSON.parse(responseText);
      console.log("Parsed JSON:", jsonData);
      
      // If there's a URL in the response, log it
      if (jsonData.url) {
        console.log("Auth URL found:", jsonData.url);
        
        // Open the URL in a new tab for testing
        chrome.tabs.create({ url: jsonData.url });
      }
    } catch (parseError) {
      console.log("Response is not valid JSON");
    }
    
    return "Test completed, check console logs";
  } catch (error) {
    console.error("Test failed:", error);
    return "Test failed: " + error.message;
  }
}

// Modify your message listener to include a test function
// Add this to your existing chrome.runtime.onMessage.addListener function in background.js

// Handle auth update from callback page
if (request.action === "auth_updated") {
  console.log("Received auth update:", request.data);
  
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
  
  return true;
}

// Run connectivity test at startup
testApiConnection();

// Check auth state on startup
checkAuthState();