// Updated popup.js with improved authentication handling
console.log("Popup script loading...");

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
        
        // Assign functions to window scope
        window.isAuthenticated = window.chessAuthModule.isAuthenticated;
        window.getCurrentUser = window.chessAuthModule.getCurrentUser;
        window.clearAuth = window.chessAuthModule.clearAuth;
        
        // Check auth immediately after loading, but don't update UI yet
        console.log("Initial auth data available");
        
        resolve(window.chessAuthModule);
        return;
      }
      
      // Otherwise, load it dynamically
      const authScriptUrl = chrome.runtime.getURL('src/auth/auth-storage.js');
      console.log("Loading auth module from:", authScriptUrl);
      
      const script = document.createElement('script');
      script.src = authScriptUrl;
      script.type = 'text/javascript';
      
      script.onload = () => {
        console.log("Auth script loaded successfully");
        
        setTimeout(() => {
          if (window.chessAuthModule) {
            console.log("Auth module available after script load");
            
            // Assign functions to window scope
            window.isAuthenticated = window.chessAuthModule.isAuthenticated;
            window.getCurrentUser = window.chessAuthModule.getCurrentUser;
            window.clearAuth = window.chessAuthModule.clearAuth;
            
            // Do not update UI here, we'll do it after we ensure the functions are defined
            resolve(window.chessAuthModule);
          } else {
            reject(new Error("Auth module not available after script load"));
          }
        }, 100);
      };
      
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
    // First try chrome.storage.local
    const storageData = await new Promise(resolve => {
      chrome.storage.local.get(['authToken', 'userData'], result => {
        resolve(result);
      });
    });
    
    if (storageData.authToken) {
      console.log("Auth found in chrome.storage");
      return {
        isAuthenticated: true,
        user: storageData.userData
      };
    }
    
    // If not in chrome.storage, check background script
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "getAuthState" }, (response) => {
        if (chrome.runtime.lastError || !response) {
          console.log("Error getting auth state from background, using local check");
          
          // Fall back to localStorage
          try {
            const authDataStr = localStorage.getItem('chess_assistant_auth');
            if (authDataStr) {
              const authData = JSON.parse(authDataStr);
              if (authData && authData.token) {
                console.log("Auth found in localStorage");
                resolve({
                  isAuthenticated: true,
                  user: authData.user
                });
                return;
              }
            }
          } catch (e) {
            console.error("Error parsing localStorage auth:", e);
          }
          
          // Nothing found
          resolve({
            isAuthenticated: false,
            user: null
          });
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

// Track initialization state
let popupInitialized = false;

// Initialize the popup
async function initializePopup() {
  if (popupInitialized) return;
  
  console.log("Initializing popup");
  popupInitialized = true;
  
  try {
    // Check if background is ready
    chrome.runtime.sendMessage({ action: "ping" }, response => {
      if (chrome.runtime.lastError) {
        console.error("Background not ready:", chrome.runtime.lastError);
        showStatus("Extension background not ready. Please try again.", "error");
        return;
      }
      
      console.log("Background is ready");
      
      // Now load auth module
      loadAuthModule()
        .then(authModule => {
          console.log("Auth module loaded:", !!authModule);
          
          // Get initial auth state
          return getAuthState();
        })
        .then(authState => {
          console.log("Initial auth state:", authState);
          
          // Update UI based on auth state
          updateUserInfoSection(authState.isAuthenticated, authState.user);
          updateButtonState(authState.isAuthenticated);
        })
        .catch(error => {
          console.error("Popup initialization error:", error);
          showStatus("Error initializing: " + error.message, "error");
        });
    });
  } catch (e) {
    console.error("Error during popup initialization:", e);
    showStatus("Error initializing popup", "error");
  }
}

// Update user info section based on auth state
function updateUserInfoSection(authenticated, user) {
  console.log("Updating user info section:", authenticated, user);
  
  const userInfoSection = document.getElementById('user-info');
  if (!userInfoSection) {
    console.error("User info section not found");
    return;
  }
  
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
  console.log("Updating button state, authenticated:", authenticated);
  
  const captureButton = document.getElementById('capture-button');
  const sidebarButton = document.getElementById('sidebar-button');
  
  if (captureButton) {
    captureButton.disabled = !authenticated;
    if (authenticated) {
      captureButton.removeAttribute('title');
      captureButton.classList.remove('disabled');
    } else {
      captureButton.title = "Login to analyze positions";
      captureButton.classList.add('disabled');
    }
  }
  
  if (sidebarButton) {
    sidebarButton.disabled = !authenticated;
    if (authenticated) {
      sidebarButton.removeAttribute('title');
      sidebarButton.classList.remove('disabled');
    } else {
      sidebarButton.title = "Login to analyze positions";
      sidebarButton.classList.add('disabled');
    }
  }
}

// Improved login handler
async function handleLogin() {
  showStatus('Initiating login...', 'info');
  
  try {
    // Send login request to background
    chrome.runtime.sendMessage({ action: "login" }, response => {
      if (chrome.runtime.lastError) {
        console.error("Login error:", chrome.runtime.lastError);
        showStatus("Login error: " + chrome.runtime.lastError.message, "error");
        return;
      }
      
      if (response && response.success) {
        showStatus("Login window opened. Please complete login there.", "info");
        
        // Close popup after a delay
        setTimeout(() => {
          window.close();
        }, 2000);
      } else {
        const errorMsg = response && response.error ? response.error : "Unknown error";
        showStatus("Login failed: " + errorMsg, "error");
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    showStatus("Login error: " + error.message, "error");
  }
}

// Handle logout
function handleLogout() {
  try {
    if (window.chessAuthModule && window.chessAuthModule.clearAuth) {
      window.chessAuthModule.clearAuth();
    } else if (window.clearAuth) {
      window.clearAuth();
    } else {
      // Fallback: clear storage directly
      chrome.storage.local.remove(['authToken', 'userData']);
      localStorage.removeItem('chess_assistant_auth');
      localStorage.removeItem('chess_assistant_token');
      localStorage.removeItem('chess_assistant_auth_updated');
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

// Improved sidebar opener
async function openAnalysisSidebar() {
  showStatus('Opening analysis sidebar...', 'info');
  
  try {
    // Get current tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || !tabs.length) {
      showStatus('Could not determine current tab', 'error');
      return;
    }
    
    const tab = tabs[0];
    
    // Check if we're on a chess site
    if (!tab.url || !(tab.url.includes('lichess.org') || tab.url.includes('chess.com'))) {
      showStatus('Please navigate to Lichess or Chess.com to use this feature', 'error');
      return;
    }
    
    // First check if content script is ready
    chrome.tabs.sendMessage(tab.id, { action: "ping" }, response => {
      if (chrome.runtime.lastError) {
        console.log("Content script not ready, injecting it");
        
        // Inject content script
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['src/content/content-script.js']
        })
        .then(() => {
          // Wait for script to initialize
          setTimeout(() => {
            // Now try to show sidebar
            chrome.tabs.sendMessage(tab.id, { action: "showSidebar" }, sidebarResponse => {
              if (chrome.runtime.lastError) {
                showStatus("Error: " + chrome.runtime.lastError.message, "error");
                return;
              }
              
              if (sidebarResponse && sidebarResponse.success) {
                window.close(); // Close popup on success
              } else {
                const errorMsg = sidebarResponse && sidebarResponse.error 
                  ? sidebarResponse.error 
                  : "Unknown error";
                showStatus("Error: " + errorMsg, "error");
              }
            });
          }, 1000);
        })
        .catch(error => {
          console.error("Script injection error:", error);
          showStatus("Error injecting content script: " + error.message, "error");
        });
      } else {
        // Content script is ready, show sidebar
        chrome.tabs.sendMessage(tab.id, { action: "showSidebar" }, sidebarResponse => {
          if (chrome.runtime.lastError) {
            showStatus("Error: " + chrome.runtime.lastError.message, "error");
            return;
          }
          
          if (sidebarResponse && sidebarResponse.success) {
            window.close(); // Close popup on success
          } else {
            const errorMsg = sidebarResponse && sidebarResponse.error 
              ? sidebarResponse.error 
              : "Unknown error";
            showStatus("Error: " + errorMsg, "error");
          }
        });
      }
    });
  } catch (error) {
    console.error("Error opening sidebar:", error);
    showStatus("Error: " + error.message, "error");
  }
}

// Function to show status messages
function showStatus(message, type) {
  console.log("Status:", message, type);
  const statusDiv = document.getElementById('status');
  if (!statusDiv) {
    console.error("Status div not found!");
    return;
  }
  statusDiv.textContent = message;
  statusDiv.className = 'status ' + (type || 'info');
  statusDiv.style.display = 'block';
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log("Popup DOM loaded");
  
  // Set up UI elements
  const loginButton = document.getElementById('login-button');
  const logoutButton = document.getElementById('logout-button');
  const sidebarButton = document.getElementById('sidebar-button');
  const captureButton = document.getElementById('capture-button');
  const statusDiv = document.getElementById('status');
  const userInfoSection = document.getElementById('user-info');
  
  // Set up button listeners
  if (loginButton) {
    loginButton.addEventListener('click', handleLogin);
  }
  
  if (logoutButton) {
    logoutButton.addEventListener('click', handleLogout);
  }
  
  if (sidebarButton) {
    sidebarButton.addEventListener('click', openAnalysisSidebar);
  }
  
  if (captureButton) {
    captureButton.addEventListener('click', captureChessPosition);
  }
  
  // Initialize the popup
  initializePopup();
  
  // Listen for auth state changes
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'auth_state_changed') {
      console.log("Auth state changed:", message);
      updateUserInfoSection(message.isAuthenticated, message.user);
      updateButtonState(message.isAuthenticated);
    }
  });
});