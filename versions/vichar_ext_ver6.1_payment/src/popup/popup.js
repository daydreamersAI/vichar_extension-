// Updated popup.js with improved authentication handling
console.log("Popup script initializing...");

// Create consistent namespace for auth functions
window.chessAnalyzerApp = window.chessAnalyzerApp || {};

// Define placeholder auth functions until the module loads
let isAuthenticated = () => {
  // Try localStorage as fallback
  try {
    const authData = localStorage.getItem('chess_assistant_auth');
    return authData && JSON.parse(authData).token;
  } catch (e) {
    return false;
  }
};

let getCurrentUser = () => {
  // Try localStorage as fallback
  try {
    const authData = localStorage.getItem('chess_assistant_auth');
    return authData ? JSON.parse(authData).user : null;
  } catch (e) {
    return null;
  }
};

// Load auth functions from the auth script
function loadAuthModule() {
  return new Promise((resolve, reject) => {
    try {
      // First check if it's already in the global namespace
      if (window.chessAuthModule) {
        console.log("Auth module already available in window namespace");
        
        // Assign functions directly from window object
        isAuthenticated = window.chessAuthModule.isAuthenticated;
        getCurrentUser = window.chessAuthModule.getCurrentUser;
        clearAuth = window.chessAuthModule.clearAuth;
        
        resolve(window.chessAuthModule);
        return;
      }
      
      // Otherwise, load it dynamically
      const authScriptUrl = chrome.runtime.getURL('src/auth/auth-connector.js');
      
      console.log("Loading auth module from:", authScriptUrl);
      
      // Create script element
      const script = document.createElement('script');
      script.src = authScriptUrl;
      script.type = 'text/javascript';
      
      // When script loads, the module will be available in window.chessAuthModule
      script.onload = () => {
        console.log("Auth script loaded successfully");
        
        // Wait a brief moment for initialization
        setTimeout(() => {
          if (window.chessAuthModule) {
            console.log("Auth module available after script load");
            
            // Assign functions
            isAuthenticated = window.chessAuthModule.isAuthenticated;
            getCurrentUser = window.chessAuthModule.getCurrentUser;
            clearAuth = window.chessAuthModule.clearAuth;
            
            // Check auth immediately
            console.log("Checking auth state after script load, authenticated:", isAuthenticated());
            
            resolve(window.chessAuthModule);
          } else {
            const error = new Error("Auth module not available after script load");
            console.error(error);
            reject(error);
          }
        }, 100);
      };
      
      script.onerror = (event) => {
        const error = new Error("Failed to load auth script");
        console.error("Script load error:", event);
        reject(error);
      };
      
      // Add script to page
      document.head.appendChild(script);
      
    } catch (error) {
      console.error("Error in loadAuthModule:", error);
      reject(error);
    }
  });
}

// Function to get auth state from background script or local storage
async function getAuthState() {
  try {
    // First try to get from background script
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "getAuthState" }, (response) => {
        if (chrome.runtime.lastError || !response) {
          console.log("Error getting auth state from background, using local check");
          
          // Fall back to local check
          const localState = {
            isAuthenticated: isAuthenticated(),
            user: getCurrentUser()
          };
          
          console.log("Auth state from local check:", localState);
          resolve(localState);
        } else {
          // Use response from background script
          console.log("Auth state from background:", response);
          resolve(response);
        }
      });
    });
  } catch (error) {
    console.error("Error in getAuthState:", error);
    
    // Return default state if there's an error
    return {
      isAuthenticated: false,
      user: null
    };
  }
}

// Initialize the popup
document.addEventListener('DOMContentLoaded', async function() {
  console.log("Popup DOM loaded");
  
  const captureButton = document.getElementById('captureBtn');
  const sidebarButton = document.getElementById('sidebarBtn');
  const statusDiv = document.getElementById('status');
  
  // Create user info section if it doesn't exist
  let userInfoSection = document.getElementById('user-info');
  if (!userInfoSection) {
    userInfoSection = document.createElement('div');
    userInfoSection.className = 'user-info';
    userInfoSection.id = 'user-info';
    
    // Insert it after the title
    const titleElement = document.querySelector('h2');
    if (titleElement && titleElement.nextElementSibling) {
      titleElement.nextElementSibling.insertAdjacentElement('afterend', userInfoSection);
    } else {
      document.body.insertBefore(userInfoSection, document.body.firstChild);
    }
  }
  
  // Load auth module and initialize
  try {
    await loadAuthModule();
    console.log("Auth module loaded successfully");
    
    // Get latest auth state
    const authState = await getAuthState();
    console.log("Initial auth state:", authState);
    
    // Update UI based on auth state
    updateUserInfoSection(authState.isAuthenticated, authState.user);
    
    // Set button enabled state
    updateButtonState(authState.isAuthenticated);
    
  } catch (error) {
    console.error("Error initializing popup:", error);
    showStatus(`Error: ${error.message}`, 'error');
  }
  
  // Update user info section based on auth state
  function updateUserInfoSection(authenticated, user) {
    console.log("Updating user info section:", authenticated, user);
    
    if (authenticated && user) {
      userInfoSection.innerHTML = `
        <div class="user-logged-in">
          <div class="user-details">
            <span class="user-name">${user.full_name || user.email || 'User'}</span>
            <div class="credits-display">
              <span class="credits-count">${user.credits || 0}</span>
              <span class="credits-label">credits</span>
            </div>
          </div>
          <button id="logoutBtn" class="text-button">Logout</button>
        </div>
      `;
      
      // Add logout button listener
      setTimeout(() => {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
          logoutBtn.addEventListener('click', handleLogout);
        }
      }, 0);
    } else {
      userInfoSection.innerHTML = `
        <div class="user-logged-out">
          <p>Login to use AI chess analysis</p>
          <button id="loginBtn" class="login-button">Login with Google</button>
        </div>
      `;
      
      // Add login button listener
      setTimeout(() => {
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) {
          loginBtn.addEventListener('click', handleLogin);
        }
      }, 0);
    }
  }
  
  // Update button state based on auth
  function updateButtonState(authenticated) {
    if (captureButton) {
      captureButton.disabled = !authenticated;
      captureButton.title = authenticated ? "" : "Login to analyze positions";
    }
    
    if (sidebarButton) {
      sidebarButton.disabled = !authenticated;
      sidebarButton.title = authenticated ? "" : "Login to analyze positions";
    }
  }
  
  // Handle Google login
  async function handleLogin() {
    showStatus('Opening login window...', 'info');
    
    try {
      // Fetch auth URL from API
      const response = await fetch('https://api.beekayprecision.com/auth/login/google');
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.url) {
        throw new Error('No authentication URL found in the response');
      }
      
      console.log('Opening auth URL:', data.url);
      
      // Open the auth URL in a new tab
      chrome.tabs.create({ url: data.url });
      
      showStatus('Continue in the opened tab...', 'info');
      
      // Set up storage listener to detect auth changes
      const storageListener = (event) => {
        if (event.key === 'chess_assistant_auth' || event.key === 'chess_assistant_token') {
          console.log("Auth storage change detected");
          
          // Get updated auth state
          const authData = isAuthenticated() ? {
            isAuthenticated: true,
            user: getCurrentUser()
          } : {
            isAuthenticated: false,
            user: null
          };
          
          // Update UI
          updateUserInfoSection(authData.isAuthenticated, authData.user);
          updateButtonState(authData.isAuthenticated);
          
          // Remove listener after handling
          window.removeEventListener('storage', storageListener);
        }
      };
      
      window.addEventListener('storage', storageListener);
      
    } catch (error) {
      console.error('Login error:', error);
      showStatus(`Login error: ${error.message}`, 'error');
    }
  }
  
  // Handle logout
  function handleLogout() {
    try {
      if (window.chessAuthModule && window.chessAuthModule.clearAuth) {
        window.chessAuthModule.clearAuth();
      } else if (typeof clearAuth === 'function') {
        clearAuth();
      } else {
        // Fallback: clear storage directly
        localStorage.removeItem('chess_assistant_auth');
        localStorage.removeItem('chess_assistant_token');
      }
      
      // Update UI
      updateUserInfoSection(false, null);
      updateButtonState(false);
      
      showStatus('Logged out successfully', 'info');
      
      // Notify background script
      chrome.runtime.sendMessage({ action: "logout" });
      
    } catch (error) {
      console.error("Logout error:", error);
      showStatus(`Logout error: ${error.message}`, 'error');
    }
  }
  
  // Function to capture chess position
  async function captureChessPosition() {
    console.log("captureChessPosition function called");
    showStatus('Capturing chess board...', 'info');
    
    try {
      // Get the current tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tabs || !tabs.length) {
        showStatus('Could not determine current tab.', 'error');
        return;
      }
      
      const tab = tabs[0];
      
      // Check if we're on a chess site
      const url = tab.url || '';
      const isChessSite = url.includes('lichess.org') || url.includes('chess.com');
      
      if (!isChessSite) {
        showStatus('Please navigate to Lichess or Chess.com to capture a position.', 'error');
        return;
      }
      
      // Send capture request to background
      chrome.runtime.sendMessage({ 
        action: "captureBoard",
        tabId: tab.id 
      }, function(response) {
        if (chrome.runtime.lastError) {
          console.error("Message error:", chrome.runtime.lastError);
          showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
          return;
        }
        
        if (response && response.success) {
          showStatus('Chess position captured!', 'success');
          
          // Open analysis page
          setTimeout(function() {
            chrome.tabs.create({ url: chrome.runtime.getURL('src/analysis/analysis.html') });
            window.close(); // Close popup
          }, 1000);
        } else {
          const errorMsg = response && response.error ? response.error : 'Unknown error';
          showStatus('Error: ' + errorMsg, 'error');
        }
      });
    } catch (error) {
      console.error("Error in capture function:", error);
      showStatus('Error: ' + error.message, 'error');
    }
  }
  
  // Function to open sidebar
  async function openAnalysisSidebar() {
    console.log("openAnalysisSidebar function called");
    showStatus('Opening analysis sidebar...', 'info');
    
    try {
      // Get the current tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tabs || !tabs.length) {
        showStatus('Could not determine current tab.', 'error');
        return;
      }
      
      const tab = tabs[0];
      
      // Check if we're on a chess site
      const url = tab.url || '';
      const isChessSite = url.includes('lichess.org') || url.includes('chess.com');
      
      if (!isChessSite) {
        showStatus('Please navigate to Lichess or Chess.com to use the sidebar.', 'error');
        return;
      }
      
      // First ensure the content script is loaded
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['src/content/content-script.js']
        });
        console.log("Content script injected successfully");
        
        // Wait a moment for script to initialize
        setTimeout(async () => {
          try {
            // Send message to show sidebar
            chrome.tabs.sendMessage(tab.id, { action: "showSidebar" }, (response) => {
              if (chrome.runtime.lastError) {
                console.error("Message error:", chrome.runtime.lastError);
                showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
                return;
              }
              
              if (response && response.success) {
                window.close(); // Close popup
              } else {
                const errorMsg = response && response.error ? response.error : 'Unknown error';
                showStatus('Error: ' + errorMsg, 'error');
              }
            });
          } catch (sendError) {
            console.error("Error sending message:", sendError);
            showStatus('Error communicating with page: ' + sendError.message, 'error');
          }
        }, 500);
        
      } catch (injectionError) {
        console.error("Script injection error:", injectionError);
        showStatus('Error injecting content script: ' + injectionError.message, 'error');
      }
    } catch (error) {
      console.error("Error in sidebar function:", error);
      showStatus('Error: ' + error.message, 'error');
    }
  }
  
  // Function to show status messages
  function showStatus(message, type) {
    console.log("Status:", message, type);
    if (!statusDiv) {
      console.error("Status div not found!");
      return;
    }
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + (type || 'info');
    statusDiv.style.display = 'block';
  }
  
  // Add direct click handlers to buttons
  if (captureButton) {
    console.log("Setting up capture button listener");
    captureButton.addEventListener('click', function() {
      console.log("Capture button clicked");
      
      // Check auth state first
      if (!isAuthenticated()) {
        showStatus('Please login to use this feature', 'error');
        return;
      }
      
      captureChessPosition();
    });
  }
  
  if (sidebarButton) {
    console.log("Setting up sidebar button listener");
    sidebarButton.addEventListener('click', function() {
      console.log("Sidebar button clicked");
      
      // Check auth state first
      if (!isAuthenticated()) {
        showStatus('Please login to use this feature', 'error');
        return;
      }
      
      openAnalysisSidebar();
    });
  }
  
  // Listen for storage changes
  window.addEventListener('storage', (event) => {
    if (event.key === 'chess_assistant_auth' || event.key === 'chess_assistant_token') {
      console.log("Auth storage changed in popup");
      
      // Update UI based on new auth state
      const authState = {
        isAuthenticated: isAuthenticated(),
        user: getCurrentUser()
      };
      
      updateUserInfoSection(authState.isAuthenticated, authState.user);
      updateButtonState(authState.isAuthenticated);
    }
  });
  
  // Listen for auth_state_changed message from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'auth_state_changed') {
      console.log("Auth state changed message received:", message);
      
      updateUserInfoSection(message.isAuthenticated, message.user);
      updateButtonState(message.isAuthenticated);
    }
  });
});