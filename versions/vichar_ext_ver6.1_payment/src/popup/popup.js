// Updated popup.js without ES modules

// Define placeholder auth functions
let isAuthenticated = () => false;
let getCurrentUser = () => null;
let loginWithGoogle = () => Promise.reject(new Error("Auth module not loaded"));
let fetchUserData = () => Promise.reject(new Error("Auth module not loaded"));
let validateStoredAuth = () => Promise.resolve(false);
let clearAuth = () => false;

// Load auth functions from the auth script
function loadAuthModule() {
  return new Promise((resolve, reject) => {
    try {
      // Create a script element to load the auth module
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('src/auth/auth-storage.js');
      script.type = 'text/javascript';
      
      script.onload = () => {
        console.log("Auth module loaded successfully");
        
        // Assign auth functions
        if (window.chessAuthModule) {
          isAuthenticated = window.chessAuthModule.isAuthenticated;
          getCurrentUser = window.chessAuthModule.getCurrentUser;
          loginWithGoogle = window.chessAuthModule.loginWithGoogle;
          fetchUserData = window.chessAuthModule.fetchUserData;
          validateStoredAuth = window.chessAuthModule.validateStoredAuth;
          clearAuth = window.chessAuthModule.clearAuth;
          
          resolve(window.chessAuthModule);
        } else {
          console.error("Auth module loaded but functions not available");
          reject(new Error("Auth module loaded but functions not available"));
        }
      };
      
      script.onerror = (error) => {
        console.error("Failed to load auth module:", error);
        reject(error);
      };
      
      document.head.appendChild(script);
    } catch (error) {
      console.error("Error loading auth module:", error);
      reject(error);
    }
  });
}

// Function to get the current authentication state
async function getAuthState() {
  try {
    // First try to get it from the background script
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "getAuthState" }, (response) => {
        if (chrome.runtime.lastError || !response) {
          // If there's an error or no response, fall back to local check
          console.log("Error getting auth state from background, using local check");
          resolve({
            isAuthenticated: isAuthenticated(),
            user: getCurrentUser()
          });
        } else {
          // Use the response from the background script
          resolve(response);
        }
      });
    });
  } catch (error) {
    console.error("Error in getAuthState:", error);
    // Return a default state if there's an error
    return {
      isAuthenticated: false,
      user: null
    };
  }
}

// Function to update the UI based on auth state
function updateAuthUI(authState) {
  console.log("Updating auth UI with state:", authState);
  
  // Enable/disable buttons based on auth state
  if (authState && authState.isAuthenticated) {
    // User is authenticated, enable buttons
    const captureButton = document.getElementById('captureBtn');
    const sidebarButton = document.getElementById('sidebarBtn');
    
    if (captureButton) {
      captureButton.disabled = false;
      console.log("Capture button enabled");
    }
    
    if (sidebarButton) {
      sidebarButton.disabled = false;
      console.log("Sidebar button enabled");
    }
  }
}

// At the top of popup.js
document.addEventListener('DOMContentLoaded', async function() {
  console.log("Popup loaded");
  
  // First load auth module
  try {
    await loadAuthModule();
    console.log("Auth module loaded successfully");
    
    // Now validate stored auth data
    const isValid = await validateStoredAuth();
    console.log("Auth validation result:", isValid);
    
    // Create auth section in the popup
    const authSection = document.createElement('div');
    authSection.id = 'auth-section';
    authSection.className = 'section';
    
    // Get current auth state
    const authState = await getAuthState();
    console.log("Auth state:", authState);
    
    // Update UI based on auth state
    updateAuthUI(authState);
    
    // Add auth section to popup
    const firstElement = document.body.firstChild;
    if (firstElement) {
      document.body.insertBefore(authSection, firstElement);
    } else {
      document.body.appendChild(authSection);
    }
    
    // Set up click handlers
    document.body.addEventListener('click', async (event) => {
      if (event.target.id === 'login-button') {
        console.log("Login button clicked");
        try {
          const result = await login();
          console.log("Login result:", result);
          if (result && result.success) {
            updateAuthUI({ isAuthenticated: true, user: result.user });
          }
        } catch (error) {
          console.error("Login error:", error);
          alert("Login failed: " + error.message);
        }
      }
    });
  } catch (error) {
    console.error("Error during initialization:", error);
  }
});

document.addEventListener('DOMContentLoaded', function() {
  const captureButton = document.getElementById('captureBtn');
  const sidebarButton = document.getElementById('sidebarBtn');
  const statusDiv = document.getElementById('status');
  
  // Create user info section
  const userInfoSection = document.createElement('div');
  userInfoSection.className = 'user-info';
  userInfoSection.id = 'user-info';
  
  // Insert it after the title
  const titleElement = document.querySelector('h2');
  if (titleElement && titleElement.nextElementSibling) {
    titleElement.nextElementSibling.insertAdjacentElement('afterend', userInfoSection);
  } else {
    document.body.insertBefore(userInfoSection, document.body.firstChild);
  }
  
  // Update user info section based on auth state
  updateUserInfoSection();
  
  console.log("Popup initialized");

  // Helper function to ensure content script is loaded before sending messages
  async function ensureContentScriptLoaded(tabId) {
    return new Promise((resolve, reject) => {
      try {
        chrome.tabs.sendMessage(tabId, { action: "ping" }, response => {
          if (chrome.runtime.lastError) {
            console.log("Content script not ready, will try to inject it");
            // Content script not ready, inject it
            chrome.scripting.executeScript({
              target: { tabId: tabId },
              files: ['src/content/content-script.js']
            })
            .then(() => {
              console.log("Content script injected successfully");
              resolve();
            })
            .catch(error => {
              console.error("Failed to inject content script:", error);
              reject(error);
            });
          } else {
            // Content script already loaded
            console.log("Content script already loaded");
            resolve();
          }
        });
      } catch (error) {
        console.error("Error in ensureContentScriptLoaded:", error);
        reject(error);
      }
    });
  }
  
  // Update user info section
  function updateUserInfoSection() {
    console.log("Updating user info section, isAuthenticated:", isAuthenticated());

    if (isAuthenticated()) {
      const user = getCurrentUser();
      console.log("Current user:", user);
      
      userInfoSection.innerHTML = `
        <div class="user-logged-in">
          <div class="user-details">
            <span class="user-name">${user?.full_name || user?.email || 'User'}</span>
            <div class="credits-display">
              <span class="credits-count">${user?.credits || 0}</span>
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
      
      // Update button state
      enableButtons();
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
      
      // Update button state
      disableButtons();
    }
  }
  
  // Enable both action buttons
  function enableButtons() {
    console.log("Enabling buttons");
    if (captureButton) {
      captureButton.disabled = false;
      captureButton.title = "";
      console.log("Capture button enabled");
    }
    
    if (sidebarButton) {
      sidebarButton.disabled = false;
      sidebarButton.title = "";
      console.log("Sidebar button enabled");
    }
  }
  
  // Disable both action buttons
  function disableButtons() {
    console.log("Disabling buttons");
    if (captureButton) {
      captureButton.disabled = true;
      captureButton.title = "Login to analyze positions";
    }
    
    if (sidebarButton) {
      sidebarButton.disabled = true;
      sidebarButton.title = "Login to analyze positions";
    }
  }
  
  // Updated Google login handler that directly fetches and opens the auth URL
  async function handleLogin() {
    showStatus('Opening login window...', 'info');
    
    try {
      // Directly fetch the auth URL from the API
      const response = await fetch('https://api.beekayprecision.com/auth/login/google');
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      // Parse the JSON response
      const data = await response.json();
      
      if (!data.url) {
        throw new Error('No authentication URL found in the response');
      }
      
      console.log('Opening auth URL:', data.url);
      
      // Open the authentication URL in a new tab
      chrome.tabs.create({ url: data.url });
      
      showStatus('Continue in the opened tab...', 'info');
      
      // We'll handle the actual login through the callback URL
      // Your backend should redirect to a page that calls loginWithGoogle()
      
    } catch (error) {
      console.error('Login error:', error);
      showStatus(`Login error: ${error.message}`, 'error');
    }
  }
  
  // Handle logout
  function handleLogout() {
    clearAuth();
    updateUserInfoSection();
    showStatus('Logged out successfully', 'info');
  }
  
  // IMPORTANT: Add direct event listeners to buttons, ensuring they work
  if (captureButton) {
    console.log("Setting up capture button direct listener");
    captureButton.addEventListener('click', function() {
      console.log("Capture button clicked (direct handler)");
      
      // Check if we're logged in
      if (!isAuthenticated()) {
        showStatus('Please login to use this feature', 'error');
        return;
      }
      
      captureChessPosition();
    });
  } else {
    console.error("Capture button not found in DOM!");
  }
  
  if (sidebarButton) {
    console.log("Setting up sidebar button direct listener");
    sidebarButton.addEventListener('click', function() {
      console.log("Sidebar button clicked (direct handler)");
      
      // Check if we're logged in
      if (!isAuthenticated()) {
        showStatus('Please login to use this feature', 'error');
        return;
      }
      
      openAnalysisSidebar();
    });
  } else {
    console.error("Sidebar button not found in DOM!");
  }
  
  // Function to capture chess position - simplified for reliability
  async function captureChessPosition() {
    console.log("captureChessPosition function called");
    showStatus('Attempting to capture chess board...', 'info');
    
    try {
      // Get the current active tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tabs || !tabs.length) {
        showStatus('Could not determine current tab.', 'error');
        return;
      }
      
      const tab = tabs[0];
      
      // Check if we're on a supported chess site
      const url = tab.url || '';
      const isChessSite = url.includes('lichess.org') || url.includes('chess.com');
      
      if (!isChessSite) {
        showStatus('Please navigate to Lichess or Chess.com to capture a position.', 'error');
        return;
      }
      
      // Send message to background script
      chrome.runtime.sendMessage({ 
        action: "captureBoard",
        tabId: tab.id 
      }, function(response) {
        console.log("Capture response:", response);
        
        if (chrome.runtime.lastError) {
          console.error("Message error:", chrome.runtime.lastError);
          showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
          return;
        }
        
        if (response && response.success) {
          showStatus('Chess position captured successfully!', 'success');
          
          // Open the analysis page
          setTimeout(function() {
            chrome.tabs.create({ url: chrome.runtime.getURL('src/analysis/analysis.html') });
            window.close(); // Close the popup
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
  
  // Function to open sidebar - enhanced with proper script injection
  async function openAnalysisSidebar() {
    console.log("openAnalysisSidebar function called");
    showStatus('Opening analysis sidebar...', 'info');
    
    try {
      // Get the current active tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tabs || !tabs.length) {
        showStatus('Could not determine current tab.', 'error');
        return;
      }
      
      const tab = tabs[0];
      
      // Check if we're on a supported chess site
      const url = tab.url || '';
      const isChessSite = url.includes('lichess.org') || url.includes('chess.com');
      
      if (!isChessSite) {
        showStatus('Please navigate to Lichess or Chess.com to use the sidebar.', 'error');
        return;
      }
      
      // First ensure the content script is loaded by injecting it explicitly
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['src/content/content-script.js']
        });
        console.log("Content script injected successfully");
        
        // Wait a moment for the script to initialize
        setTimeout(async () => {
          try {
            // Now send the message to show sidebar
            chrome.tabs.sendMessage(tab.id, { action: "showSidebar" }, (response) => {
              if (chrome.runtime.lastError) {
                console.error("Message error:", chrome.runtime.lastError);
                showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
                return;
              }
              
              if (response && response.success) {
                window.close(); // Close the popup
              } else {
                const errorMsg = response && response.error ? response.error : 'Unknown error';
                showStatus('Error: ' + errorMsg, 'error');
              }
            });
          } catch (sendError) {
            console.error("Error sending message:", sendError);
            showStatus('Error communicating with page: ' + sendError.message, 'error');
          }
        }, 500); // Wait 500ms for script to initialize
        
      } catch (injectionError) {
        console.error("Script injection error:", injectionError);
        showStatus('Error injecting content script: ' + injectionError.message, 'error');
      }
    } catch (error) {
      console.error("Error in sidebar function:", error);
      showStatus('Error: ' + error.message, 'error');
    }
  }
  
  // Helper function to show status messages
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
  
  // Check for auth status changes (e.g., from other extension pages)
  window.addEventListener('storage', (event) => {
    if (event.key === 'chess_assistant_auth' || event.key === 'chess_assistant_token') {
      console.log(`Auth storage event detected for key ${event.key}, updating UI`);
      updateUserInfoSection();
    }
  });
  
  // Add listener for auth_changed event from auth-storage.js
  window.addEventListener('auth_changed', (event) => {
    console.log("Auth changed event received", event.detail);
    updateUserInfoSection();
  });
  
  // Simple login function for the top section
  async function login() {
    try {
      // Call the loginWithGoogle function from auth-storage.js
      const authData = await loginWithGoogle();
      return {
        success: true,
        user: authData.user
      };
    } catch (error) {
      console.error("Login function error:", error);
      return {
        success: false,
        error: error.message
      };
    }
  }
});