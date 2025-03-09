// Updated content-script.js with robust authentication integration
console.log("Chess analyzer content script loading at:", new Date().toISOString());

// Create a global namespace for our functions
window.chessAnalyzerApp = window.chessAnalyzerApp || {};
window.chessAnalyzerExtension = window.chessAnalyzerExtension || {};

// Create a variable to track if we've already initialized
window.chessSidebarInitialized = window.chessSidebarInitialized || false;

// Set API URL globally if not already set
window.API_URL = window.API_URL || "https://api.beekayprecision.com";

// Auth module reference - declare only once
let authModule = null;

// Default placeholder functions
let isAuthenticated = () => {
  console.log("Using enhanced isAuthenticated function");
  
  // First check localStorage as a quick synchronous check
  try {
    const authStr = localStorage.getItem('chess_assistant_auth');
    const localResult = !!authStr && !!JSON.parse(authStr).token;
    console.log("Local auth check result:", localResult);
    
    // Then asynchronously check with background script and update UI if needed
    chrome.runtime.sendMessage({ action: 'get_auth_state' }, response => {
      if (chrome.runtime.lastError) {
        console.error("Error getting auth state from background:", chrome.runtime.lastError);
        return;
      }
      
      console.log("Background auth check result:", response?.isAuthenticated);
      
      // If the auth state is different than what we thought, update the UI
      if (response && response.isAuthenticated !== localResult) {
        console.log("Auth state mismatch, updating UI");
        // Update user panel if it exists
        const userInfoPanel = document.getElementById('user-info-panel');
        if (userInfoPanel) {
          window.chessAnalyzerExtension.updateUserInfoSection(response.isAuthenticated, response.user);
        }
        
        // Update ask button state
        updateAskButtonState();
      }
    });
    
    return localResult;
  } catch (e) { 
    console.error("Error in enhanced isAuthenticated:", e);
    return false; 
  }
};

let getCurrentUser = () => {
  console.log("Using enhanced getCurrentUser function");
  
  // First check localStorage as a quick synchronous check
  try {
    const authStr = localStorage.getItem('chess_assistant_auth');
    const localUser = authStr ? JSON.parse(authStr).user : null;
    
    // Asynchronously check with background script
    chrome.runtime.sendMessage({ action: 'get_auth_state' }, response => {
      if (chrome.runtime.lastError) {
        console.error("Error getting user data from background:", chrome.runtime.lastError);
        return;
      }
      
      // If we have user data and it's different from what we have locally
      if (response && response.user) {
        const backgroundUser = response.user;
        
        // Compare by checking if credits or email changed
        const userChanged = !localUser || 
                           localUser.email !== backgroundUser.email || 
                           localUser.credits !== backgroundUser.credits;
        
        if (userChanged) {
          console.log("User data from background differs from local, updating UI");
          
          // Update localStorage with latest user data
          try {
            const authStr = localStorage.getItem('chess_assistant_auth');
            if (authStr) {
              const authData = JSON.parse(authStr);
              authData.user = backgroundUser;
              localStorage.setItem('chess_assistant_auth', JSON.stringify(authData));
            }
          } catch (e) {
            console.error("Error updating localStorage:", e);
          }
          
          // Update UI elements
          const userInfoPanel = document.getElementById('user-info-panel');
          if (userInfoPanel) {
            window.chessAnalyzerExtension.updateUserInfoSection(true, backgroundUser);
          }
          
          // Update ask button state
          updateAskButtonState();
        }
      }
    });
    
    return localUser;
  } catch (e) { 
    console.error("Error in enhanced getCurrentUser:", e);
    return null; 
  }
};

let getAuthToken = () => {
  console.log("Using fallback getAuthToken function");
  try {
    const authStr = localStorage.getItem('chess_assistant_auth');
    return authStr ? JSON.parse(authStr).token : null;
  } catch (e) { 
    console.error("Error in fallback getAuthToken:", e);
    return null; 
  }
};

// Other placeholder functions
let loginWithGoogle = () => {
  console.error("Auth module not loaded - loginWithGoogle not available");
  return Promise.reject(new Error("Auth module not loaded"));
};
let openPaymentPage = () => Promise.reject(new Error("Auth module not loaded"));
let getCreditPackages = () => Promise.reject(new Error("Auth module not loaded"));
let updateUserData = () => false;

// Improved loadAuthModule function with better error handling and resilience
async function loadAuthModule() {
  console.log("Loading auth module - start");
  
  try {
    // First, check if the module is already loaded and accessible
    if (window.chessAuthModule && window.chessAuthModule.isInitialized) {
      console.log("Auth module already available in window");
      assignAuthFunctions(window.chessAuthModule);
      return window.chessAuthModule;
    }
    
    // Create a fallback module first, in case script loading fails
    createFallbackAuthModule();
    
    // Now try to load the actual auth script
    console.log("Injecting auth script to page");
    
    // If we're in a content script context, we need to inject the auth script
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('src/auth/auth-storage.js');
    script.type = 'text/javascript';
    
    // Create a promise to track script loading
    const loadPromise = new Promise((resolve) => {
      script.onload = () => {
        console.log("Auth script loaded successfully");
        
        // Check if the module is available and initialized
        if (window.chessAuthModule && window.chessAuthModule.isInitialized) {
          console.log("Auth module initialized after script load");
          // Force initialize if needed
          window.chessAuthModule.isInitialized = true;
          assignAuthFunctions(window.chessAuthModule);
          resolve(window.chessAuthModule);
        } else {
          console.warn("Auth script loaded but module not initialized");
          // We already have a fallback module created, let's keep using it
          console.log("Using fallback auth module instead");
          resolve(window.chessAuthModule);
        }
      };
      
      script.onerror = (error) => {
        console.error("Error loading auth script:", error);
        // We already have a fallback module created, let's use it
        console.log("Using fallback auth module due to script load error");
        resolve(window.chessAuthModule);
      };
      
      // Set a timeout in case the script loads but doesn't initialize properly
      setTimeout(() => {
        if (!window.chessAuthModule || !window.chessAuthModule.isInitialized) {
          console.warn("Auth module initialization timed out");
          // Force initialization if the module exists
          if (window.chessAuthModule) {
            window.chessAuthModule.isInitialized = true;
            assignAuthFunctions(window.chessAuthModule);
          }
          resolve(window.chessAuthModule);
        }
      }, 2000);
    });
    
    // Inject the script
    document.head.appendChild(script);
    
    // Wait for script to load and return the module
    await loadPromise;
    
    // Double check initialization status
    if (window.chessAuthModule && !window.chessAuthModule.isInitialized) {
      console.log("Forcing module initialization after load");
      window.chessAuthModule.isInitialized = true;
    }
    
    console.log("Auth module load complete");
    return window.chessAuthModule;
  } catch (error) {
    console.error("Fatal error in loadAuthModule:", error);
    
    // Make sure we always have at least the fallback module
    if (!window.chessAuthModule) {
      console.log("Creating emergency fallback auth module after error");
      createFallbackAuthModule();
    }
    
    return window.chessAuthModule;
  }
}

// Helper function to create a fallback auth module
function createFallbackAuthModule() {
  console.log("Creating fallback auth module");
  
  window.chessAuthModule = {
    isInitialized: true,
    
    isAuthenticated: async function() { 
      try {
        const authStr = localStorage.getItem('chess_assistant_auth');
        return !!authStr && !!JSON.parse(authStr).token;
      } catch (e) { return false; }
    },
    
    isAuthenticatedSync: function() {
      try {
        const authStr = localStorage.getItem('chess_assistant_auth');
        return !!authStr && !!JSON.parse(authStr).token;
      } catch (e) { return false; }
    },
    
    getCurrentUser: async function() {
      try {
        const authStr = localStorage.getItem('chess_assistant_auth');
        return authStr ? JSON.parse(authStr).user : null;
      } catch (e) { return null; }
    },
    
    getAuthToken: async function() {
      try {
        const authStr = localStorage.getItem('chess_assistant_auth');
        return authStr ? JSON.parse(authStr).token : null;
      } catch (e) { return null; }
    },
    
    clearAuth: async function() {
      try {
        localStorage.removeItem('chess_assistant_auth');
        localStorage.removeItem('chess_assistant_token');
        return true;
      } catch (e) { return false; }
    },
    
    saveAuthData: async function(authData) {
      try {
        if (!authData || !authData.token) return false;
        
        const storageData = {
          isAuthenticated: true,
          token: authData.token || authData.access_token,
          user: authData.user || {}
        };
        
        localStorage.setItem('chess_assistant_auth', JSON.stringify(storageData));
        localStorage.setItem('chess_assistant_token', JSON.stringify(authData));
        return true;
      } catch (e) { return false; }
    },
    
    // Limited implementation of other functions
    loginWithGoogle: async function() {
      // Try to call the background script
      return new Promise((resolve, reject) => {
        try {
          chrome.runtime.sendMessage({ action: "initiate_google_auth" }, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error("Error connecting to background script"));
            } else {
              resolve(response || { success: true });
            }
          });
        } catch (e) {
          reject(new Error("Failed to initiate login"));
        }
      });
    },
    
    getCreditPackages: async function() {
      return [];
    },
    
    openPaymentPage: async function() {
      return { success: false, error: "Auth module not fully loaded" };
    },
    
    updateUserData: async function() {
      return false;
    }
  };
  
  // Assign the fallback functions
  assignAuthFunctions(window.chessAuthModule);
}

// Assign auth functions from the module
function assignAuthFunctions(module) {
  if (!module) {
    console.error("Cannot assign auth functions from null module");
    return;
  }
  
  console.log("Assigning auth functions from module");
  
  // Assign all functions from the module
  isAuthenticated = module.isAuthenticated;
  getCurrentUser = module.getCurrentUser;
  getAuthToken = module.getAuthToken;
  loginWithGoogle = module.loginWithGoogle;
  openPaymentPage = module.openPaymentPage;
  getCreditPackages = module.getCreditPackages;
  updateUserData = module.updateUserData;
  
  const authenticated = module.isAuthenticatedSync ? 
    module.isAuthenticatedSync() : 
    false;
  
  console.log("Auth functions assigned, authenticated:", authenticated);
}

// Create a global variable to keep track of the sidebar state
let sidebarInitialized = false;
let sidebarVisible = false;

// API configuration
// const API_URL = "https://api.beekayprecision.com";

// Ensure the toggle button is visible
function ensureToggleButtonVisible() {
  const toggleButton = document.getElementById('sidebar-toggle');
  if (toggleButton) {
    console.log("Toggle button found, ensuring visibility");
    toggleButton.style.zIndex = "10000";
    toggleButton.style.display = "flex";
    toggleButton.style.position = "fixed";
    toggleButton.style.right = "0";
    toggleButton.style.top = "50%";
    toggleButton.style.backgroundColor = "#4285f4";
    toggleButton.style.width = "30px";
    toggleButton.style.height = "60px";
    toggleButton.style.cursor = "pointer";
    toggleButton.style.borderRadius = "5px 0 0 5px";
    toggleButton.style.boxShadow = "-2px 0 5px rgba(0, 0, 0, 0.1)";
  } else {
    console.log("Toggle button not found, will create in initializeSidebar");
  }
}

// Function to create and initialize the sidebar
async function initializeSidebar() {
  try {
    console.log("Starting sidebar initialization");
    
    // Check if sidebar already exists
    if (document.getElementById('chess-analysis-sidebar')) {
      console.log("Sidebar already exists, refreshing auth state");
      
      // Refresh auth state even if sidebar exists
      try {
        chrome.runtime.sendMessage({ action: 'get_auth_state' }, response => {
          if (chrome.runtime.lastError) {
            console.error("Error getting auth state during refresh:", chrome.runtime.lastError);
            return;
          }
          
          console.log("Refreshed auth state:", response);
          
          // Update the user panel with the latest auth state
          const userInfoPanel = document.getElementById('user-info-panel');
          if (userInfoPanel && response) {
            window.chessAnalyzerExtension.updateUserInfoSection(response.isAuthenticated, response.user);
          }
          
          // Update ask button state
          updateAskButtonState();
        });
      } catch (refreshError) {
        console.error("Error refreshing auth state:", refreshError);
      }
      
      sidebarInitialized = true;
      return;
    }
    
    // Create sidebar container if it doesn't exist
    const sidebar = document.createElement('div');
    sidebar.id = 'chess-analysis-sidebar';
    sidebar.className = 'chess-analysis-sidebar';
    
    // Add basic styling
    sidebar.style.position = 'fixed';
    sidebar.style.top = '0';
    sidebar.style.right = '-400px'; // Start off-screen
    sidebar.style.width = '400px';
    sidebar.style.height = '100%';
    sidebar.style.backgroundColor = 'white';
    sidebar.style.boxShadow = '-2px 0 5px rgba(0,0,0,0.2)';
    sidebar.style.zIndex = '9999';
    sidebar.style.transition = 'right 0.3s ease';
    sidebar.style.display = 'flex';
    sidebar.style.flexDirection = 'column';
    sidebar.style.overflow = 'hidden';
    
    // Create sidebar content
    sidebar.innerHTML = `
      <div class="sidebar-header" style="padding: 16px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
        <h2 style="margin: 0; font-size: 18px;">Chess Analysis</h2>
        <button id="sidebar-close" style="background: none; border: none; font-size: 20px; cursor: pointer;">×</button>
      </div>
      <div id="user-info-panel" style="padding: 16px; border-bottom: 1px solid #eee;"></div>
      <div class="sidebar-content" style="flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column;">
        <div class="input-container" style="margin-bottom: 16px;">
          <input id="question-input" type="text" placeholder="Ask about this position..." 
                 style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
        </div>
        <button id="ask-button" style="padding: 8px 16px; background-color: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer; margin-bottom: 16px;">
          Ask
        </button>
        <div id="response-area" style="flex: 1; border: 1px solid #eee; border-radius: 4px; padding: 16px; overflow-y: auto;">
          <p>Ask a question about the current chess position.</p>
        </div>
      </div>
    `;
    
    // Add to document
    document.body.appendChild(sidebar);
    console.log("Sidebar element created and added to document");
    
    // Add event listeners
    const closeButton = sidebar.querySelector('#sidebar-close');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        console.log("Close button clicked");
        sidebar.style.right = '-400px';
        sidebarVisible = false;
      });
    }
    
    // Add ask button functionality
    const askButton = sidebar.querySelector('#ask-button');
    const questionInput = sidebar.querySelector('#question-input');
    const responseArea = sidebar.querySelector('#response-area');
    
    if (askButton && questionInput && responseArea) {
      askButton.addEventListener('click', () => {
        handleQuestionSubmit(questionInput, responseArea);
      });
      
      // Also listen for Enter key
      questionInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          handleQuestionSubmit(questionInput, responseArea);
        }
      });
    }
    
    // Update the user panel
    const userInfoPanel = sidebar.querySelector('#user-info-panel');
    if (userInfoPanel) {
      updateUserPanel(userInfoPanel);
    }
    
    // Add toggle button if not already present
    ensureToggleButtonVisible();
    
    sidebarInitialized = true;
    console.log("Sidebar fully initialized");
    
  } catch (error) {
    console.error("Error initializing sidebar:", error);
    throw error;
  }
}

// Function to check auth and load packages if authenticated
function checkAuthAndLoadPackages() {
  console.log("Checking auth status for credit packages", isAuthenticated());
  if (isAuthenticated()) {
    loadCreditPackages();
  }
}

// Function to toggle sidebar visibility
function toggleSidebar() {
  const sidebar = document.getElementById('chess-analysis-sidebar');
  if (!sidebar) return;
  
  sidebarVisible = !sidebarVisible;
  sidebar.style.right = sidebarVisible ? '0' : '-400px';
  console.log("Sidebar visibility toggled:", sidebarVisible);
}

// Function to update user panel
function updateUserPanel(panel) {
  console.log("Updating user panel with enhanced check");
  
  try {
    // Check with background script first for most accurate state
    chrome.runtime.sendMessage({ action: 'get_auth_state' }, response => {
      if (chrome.runtime.lastError) {
        console.error("Error getting auth state from background:", chrome.runtime.lastError);
        // Fall back to other methods
        fallbackUpdateUserPanel(panel);
      } else if (response) {
        console.log("Got auth state from background:", response);
        window.chessAnalyzerExtension.updateUserInfoSection(response.isAuthenticated, response.user);
      } else {
        console.warn("No response from background script, using fallback");
        fallbackUpdateUserPanel(panel);
      }
    });
  } catch (error) {
    console.error("Error in updateUserPanel:", error);
    panel.innerHTML = `
      <div class="user-status-loading">
        <p>Error checking login status</p>
      </div>
    `;
  }
}

// Fallback method to update user panel
function fallbackUpdateUserPanel(panel) {
  try {
    // Use safely scoped function
    if (window.chessAuthModule && window.chessAuthModule.isAuthenticatedSync) {
      const isAuth = window.chessAuthModule.isAuthenticatedSync();
      const user = window.chessAuthModule.getCurrentUser();
      window.chessAnalyzerExtension.updateUserInfoSection(isAuth, user);
    } else {
      // Fallback to checking localStorage
      let isAuth = false;
      let user = null;
      
      try {
        const authStr = localStorage.getItem('chess_assistant_auth');
        if (authStr) {
          const authData = JSON.parse(authStr);
          isAuth = !!authData && !!authData.token;
          user = authData.user;
        }
      } catch (e) {
        console.error("Error checking localStorage:", e);
      }
      
      window.chessAnalyzerExtension.updateUserInfoSection(isAuth, user);
    }
  } catch (error) {
    console.error("Error in fallbackUpdateUserPanel:", error);
    panel.innerHTML = `
      <div class="user-status-loading">
        <p>Error checking login status</p>
      </div>
    `;
  }
}

// Function to update ask button state
function updateAskButtonState() {
  console.log("Updating ask button state with enhanced auth check");
  const askButton = document.getElementById('ask-button');
  if (!askButton) return;
  
  // Get auth state from background script for most accurate information
  chrome.runtime.sendMessage({ action: 'get_auth_state' }, response => {
    if (chrome.runtime.lastError) {
      console.error("Error getting auth state from background:", chrome.runtime.lastError);
      // Fall back to other methods
      updateAskButtonWithLocalAuth(askButton);
    } else if (response) {
      const authenticated = response.isAuthenticated;
      const user = response.user;
      
      console.log("Got auth state from background for ask button:", authenticated, user);
      
      if (authenticated && user) {
        if (user.credits > 0) {
          askButton.disabled = false;
          askButton.title = "";
          askButton.style.opacity = "1";
          askButton.style.cursor = "pointer";
          console.log("Ask button enabled - user has credits");
        } else {
          askButton.disabled = true;
          askButton.title = "You need credits to analyze positions";
          askButton.style.opacity = "0.6";
          askButton.style.cursor = "not-allowed";
          console.log("Ask button disabled - no credits");
        }
      } else {
        askButton.disabled = true;
        askButton.title = "Login to analyze positions";
        askButton.style.opacity = "0.6";
        askButton.style.cursor = "not-allowed";
        console.log("Ask button disabled - not authenticated");
      }
    } else {
      console.warn("No response from background script, using fallback for ask button");
      updateAskButtonWithLocalAuth(askButton);
    }
  });
}

// Fallback function to update ask button using local auth check
function updateAskButtonWithLocalAuth(askButton) {
  if (isAuthenticated()) {
    const user = getCurrentUser();
    if (user && user.credits > 0) {
      askButton.disabled = false;
      askButton.title = "";
      askButton.style.opacity = "1";
      askButton.style.cursor = "pointer";
    } else {
      askButton.disabled = true;
      askButton.title = "You need credits to analyze positions";
      askButton.style.opacity = "0.6";
      askButton.style.cursor = "not-allowed";
    }
  } else {
    askButton.disabled = true;
    askButton.title = "Login to analyze positions";
    askButton.style.opacity = "0.6";
    askButton.style.cursor = "not-allowed";
  }
}

// Handle login
function handleLogin() {
  const responseArea = document.getElementById('response-area');
  if (responseArea) {
    responseArea.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100px;">
        <div style="display: inline-block; border-radius: 50%; border: 3px solid #4285f4; 
             border-top-color: transparent; width: 24px; height: 24px; animation: spin 1s linear infinite;"></div>
        <div style="margin-left: 15px; font-weight: 500;">Opening login window...</div>
      </div>
    `;
  }
  
  // Make sure the auth module is loaded
  if (authModule && authModule.loginWithGoogle) {
    authModule.loginWithGoogle()
      .then(authData => {
        console.log("Login successful:", authData);
        
        // Update the user panel
        const userInfoPanel = document.getElementById('user-info-panel');
        if (userInfoPanel) {
          updateUserPanel(userInfoPanel);
        }
        
        // Load credit packages
        loadCreditPackages();
        
        // Update ask button state
        updateAskButtonState();
        
        if (responseArea) {
          responseArea.textContent = `Login successful! You have ${authData.user.credits} credits available.`;
        }
      })
      .catch(error => {
        console.error("Login error:", error);
        
        if (responseArea) {
          responseArea.innerHTML = `
            <div style="color: #d32f2f; padding: 10px; background-color: #ffebee; border-radius: 4px;">
              <strong>Login Error:</strong> ${error.message}
            </div>
          `;
        }
      });
  } else {
    // Fallback to direct API call if auth module is not loaded
    console.log("Auth module not loaded, using fallback login method");
    
    // Open login page in new tab
    chrome.runtime.sendMessage({ action: "login" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Runtime error in login:", chrome.runtime.lastError);
        if (responseArea) {
          responseArea.textContent = 'Error: ' + chrome.runtime.lastError.message;
        }
        return;
      }
      
      console.log("Login response:", response);
      
      if (responseArea) {
        responseArea.textContent = 'Login initiated. Please check the opened tab to complete login.';
      }
    });
  }
}

// Show login prompt in response area
function showLoginPrompt() {
  const responseArea = document.getElementById('response-area');
  if (responseArea) {
    responseArea.innerHTML = `
      <div style="padding: 15px; text-align: center;">
        <div style="font-weight: 600; font-size: 16px; margin-bottom: 10px;">Login Required</div>
        <p>Please login with your Google account to use the chess analysis feature.</p>
        <button id="login-prompt-btn" style="
          padding: 8px 16px;
          background-color: #4285f4;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          margin-top: 10px;
        ">Login with Google</button>
      </div>
    `;
    
    setTimeout(() => {
      const loginPromptBtn = document.getElementById('login-prompt-btn');
      if (loginPromptBtn) {
        loginPromptBtn.addEventListener('click', handleLogin);
      }
    }, 0);
  }
}

// Show insufficient credits warning
function showInsufficientCreditsWarning() {
  const responseArea = document.getElementById('response-area');
  if (responseArea) {
    responseArea.innerHTML = `
      <div style="padding: 15px; text-align: center;">
        <div style="font-weight: 600; font-size: 16px; margin-bottom: 10px; color: #f57c00;">Insufficient Credits</div>
        <p>You need at least 1 credit to analyze a chess position.</p>
        <button id="buy-credits-prompt-btn" style="
          padding: 8px 16px;
          background-color: #fbbc05;
          color: #333;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          margin-top: 10px;
        ">Buy Credits</button>
      </div>
    `;
    
    setTimeout(() => {
      const buyCreditsPromptBtn = document.getElementById('buy-credits-prompt-btn');
      if (buyCreditsPromptBtn) {
        buyCreditsPromptBtn.addEventListener('click', () => {
          toggleCreditPackages();
        });
      }
    }, 0);
  }
}

// Toggle credit packages container
function toggleCreditPackages() {
  const creditPackagesContainer = document.getElementById('credit-packages-container');
  if (!creditPackagesContainer) return;
  
  const isVisible = creditPackagesContainer.style.display === 'flex';
  creditPackagesContainer.style.display = isVisible ? 'none' : 'flex';
  
  if (!isVisible) {
    // Load packages if container is being shown
    loadCreditPackages();
  }
}

// Load credit packages
async function loadCreditPackages() {
  const packageButtonsContainer = document.getElementById('package-buttons');
  if (!packageButtonsContainer) return;
  
  if (!isAuthenticated()) {
    packageButtonsContainer.innerHTML = `
      <div style="text-align: center; padding: 10px;">
        <p>Please login to purchase credits</p>
      </div>
    `;
    return;
  }
  
  try {
    packageButtonsContainer.innerHTML = `
      <div style="text-align: center; padding: 10px;">
        <div style="display: inline-block; border-radius: 50%; border: 3px solid #4285f4; 
             border-top-color: transparent; width: 20px; height: 20px; animation: spin 1s linear infinite;"></div>
        <div style="margin-top: 10px;">Loading packages...</div>
      </div>
    `;
    
    if (authModule && authModule.getCreditPackages) {
      const packages = await authModule.getCreditPackages();
      
      if (packages && packages.packages && packages.packages.length > 0) {
        const buttonsHtml = packages.packages.map(pkg => `
          <button class="package-btn" data-package-id="${pkg.id}" style="
            padding: 10px;
            background-color: white;
            border: 1px solid #ddd;
            border-radius: 4px;
            cursor: pointer;
            text-align: left;
            display: flex;
            justify-content: space-between;
            align-items: center;
          ">
            <div>
              <div style="font-weight: 600;">${pkg.name}</div>
              <div style="color: #34a853; font-size: 14px; margin-top: 5px;">${pkg.credits} Credits</div>
            </div>
            <div style="font-weight: 600; color: #4285f4;">${pkg.amount_display}</div>
          </button>
        `).join('');
        
        packageButtonsContainer.innerHTML = buttonsHtml;
        
        // Add event listeners to the package buttons
        setTimeout(() => {
          const packageButtons = document.querySelectorAll('.package-btn');
          packageButtons.forEach(button => {
            button.addEventListener('click', () => {
              const packageId = button.getAttribute('data-package-id');
              purchaseCredits(packageId);
            });
          });
        }, 0);
      } else {
        packageButtonsContainer.innerHTML = `
          <div style="text-align: center; padding: 10px;">
            <p>No credit packages available</p>
          </div>
        `;
      }
    } else {
      console.error("getCreditPackages function not available");
      packageButtonsContainer.innerHTML = `
        <div style="text-align: center; padding: 10px; color: #d32f2f;">
          <p>Error: Credit packages service unavailable</p>
        </div>
      `;
    }
  } catch (error) {
    console.error("Error loading credit packages:", error);
    
    packageButtonsContainer.innerHTML = `
      <div style="text-align: center; padding: 10px; color: #d32f2f;">
        <p>Error loading packages: ${error.message}</p>
        <button id="retry-packages-btn" style="
          padding: 6px 12px;
          background-color: #4285f4;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
          margin-top: 10px;
        ">Retry</button>
      </div>
    `;
    
    setTimeout(() => {
      const retryBtn = document.getElementById('retry-packages-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', loadCreditPackages);
      }
    }, 0);
  }
}

// Purchase credits
function purchaseCredits(packageId) {
  if (!isAuthenticated()) {
    showLoginPrompt();
    return;
  }
  
  const packageButtonsContainer = document.getElementById('package-buttons');
  if (packageButtonsContainer) {
    packageButtonsContainer.innerHTML = `
      <div style="text-align: center; padding: 10px;">
        <div style="display: inline-block; border-radius: 50%; border: 3px solid #4285f4; 
             border-top-color: transparent; width: 20px; height: 20px; animation: spin 1s linear infinite;"></div>
        <div style="margin-top: 10px;">Opening payment window...</div>
      </div>
    `;
  }
  
  if (authModule && authModule.openPaymentPage) {
    authModule.openPaymentPage(packageId)
      .then(userData => {
        console.log("Payment successful:", userData);
        
        // Update the user panel
        const userInfoPanel = document.getElementById('user-info-panel');
        if (userInfoPanel) {
          updateUserPanel(userInfoPanel);
        }
        
        // Update ask button state
        updateAskButtonState();
        
        // Show success message
        const responseArea = document.getElementById('response-area');
        if (responseArea) {
          responseArea.innerHTML = `
            <div style="padding: 10px; background-color: #e8f5e9; border-radius: 4px; color: #2e7d32;">
              <strong>Payment Successful!</strong>
              <p>Your credits have been updated. You now have ${userData.credits} credits.</p>
            </div>
          `;
        }
        
        // Reload credit packages
        loadCreditPackages();
      })
      .catch(error => {
        console.error("Payment error:", error);
        
        if (packageButtonsContainer) {
          packageButtonsContainer.innerHTML = `
            <div style="text-align: center; padding: 10px; color: #d32f2f;">
              <p>Payment error: ${error.message}</p>
              <button id="retry-payment-btn" style="
                padding: 6px 12px;
                background-color: #4285f4;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 13px;
                margin-top: 10px;
              ">Try Again</button>
            </div>
          `;
          
          setTimeout(() => {
            const retryBtn = document.getElementById('retry-payment-btn');
            if (retryBtn) {
              retryBtn.addEventListener('click', () => purchaseCredits(packageId));
            }
          }, 0);
        }
      });
  } else {
    console.error("openPaymentPage function not available");
    
    if (packageButtonsContainer) {
      packageButtonsContainer.innerHTML = `
        <div style="text-align: center; padding: 10px; color: #d32f2f;">
          <p>Payment service unavailable</p>
        </div>
      `;
    }
  }
}

// Extract base64 image data from the image source
function getBase64FromImageSrc(src) {
  if (src && src.startsWith('data:image/')) {
    return src.split(',')[1];
  }
  return null;
}

// Add this function to safely access chrome.storage
function safelyGetStorage(keys) {
  return new Promise((resolve, reject) => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(keys, (result) => {
          if (chrome.runtime.lastError) {
            console.error("Storage error:", chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else {
            resolve(result);
          }
        });
      } else {
        reject(new Error("Chrome storage not available"));
      }
    } catch (error) {
      console.error("Error accessing storage:", error);
      reject(error);
    }
  });
}

// Update the captureCurrentPosition function
function captureCurrentPosition() {
  console.log("Capturing current position for sidebar");
  const responseArea = document.getElementById('response-area');
  if (responseArea) {
    responseArea.textContent = 'Capturing chess position...';
  }
  
  // Use the safe message function
  return safelySendMessage({ 
    action: "captureBoardForSidebar"
  }).then(response => {
    console.log("Capture response:", response);
    
    if (response && response.success) {
      // Load the newly captured board
      return loadStoredBoardData().then(() => {
        if (responseArea) {
          responseArea.textContent = 'Position captured! Ask a question about this position.';
        }
        return response.capturedBoard || {};
      });
    } else {
      const errorMsg = response && response.error ? response.error : 'Unknown error';
      if (responseArea) {
        responseArea.textContent = 'Error capturing position: ' + errorMsg;
      }
      throw new Error(errorMsg);
    }
  }).catch(error => {
    console.error("Error capturing position:", error);
    if (responseArea) {
      responseArea.textContent = 'Error: ' + error.message;
    }
    throw error;
  });
}

// Update the loadStoredBoardData function
async function loadStoredBoardData() {
  try {
    const result = await safelyGetStorage(['capturedBoard']);
    const capturedBoard = result.capturedBoard;
    const capturedImage = document.getElementById('captured-board-image');
    const gameInfoContainer = document.getElementById('game-info-container');
    const fenValue = document.getElementById('fen-value');
    const pgnValue = document.getElementById('pgn-value');
    
    if (capturedBoard && capturedBoard.imageData && capturedImage) {
      console.log("Loaded stored board data");
      console.log("FEN data:", capturedBoard.fen);
      
      // Update the image
      capturedImage.src = capturedBoard.imageData;
      capturedImage.style.display = 'block';
      
      // Update game info if available
      if (gameInfoContainer) {
        gameInfoContainer.style.display = 'flex';
        
        // Update FEN
        if (fenValue && capturedBoard.fen) {
          fenValue.textContent = capturedBoard.fen;
        }
        
        // Update PGN
        if (pgnValue) {
          // Make sure we have PGN data
          if (capturedBoard.pgn && capturedBoard.pgn.trim().length > 0) {
            console.log("Displaying PGN in sidebar");
            pgnValue.textContent = capturedBoard.pgn;
            pgnValue.style.display = 'block';
          } else {
            console.log("No PGN data to display");
            pgnValue.textContent = "No move history available";
            pgnValue.style.display = 'block';
          }
        }
      }
      
      return capturedBoard;
    } else {
      console.log("No stored board data found");
      if (capturedImage) {
        capturedImage.style.display = 'none';
      }
      if (gameInfoContainer) {
        gameInfoContainer.style.display = 'none';
      }
      const responseArea = document.getElementById('response-area');
      if (responseArea) {
        responseArea.textContent = 'Capture a position to begin analysis.';
      }
      return null;
    }
  } catch (error) {
    console.error("Error loading stored board data:", error);
    return null;
  }
}

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Content script received message:", request);
  
  // Add ping handler for extension health check
  if (request.action === "ping") {
    console.log("Ping received, responding immediately");
    sendResponse({ success: true });
    return true;
  }
  
  // Only process sidebar requests on chess sites
  if (request.action === "showSidebar" || request.action === "show_sidebar") {
    console.log("Show sidebar request received");
    
    // Check if we're on a chess site
    if (!isChessSite()) {
      console.log("Not on a chess site, can't show sidebar");
      sendResponse({ 
        success: false, 
        error: "Not on a supported chess site (Chess.com or Lichess)" 
      });
      return true;
    }
    
    // Handle async operations with a promise chain instead of await
    const handleShowSidebar = async () => {
      try {
        console.log("Starting sidebar initialization");
        
        // Make sure auth is initialized first
        let authInitialized = false;
        try {
          const authModule = await initializeAuth();
          authInitialized = !!authModule;
          console.log("Auth initialized:", authInitialized);
        } catch (authError) {
          console.error("Auth initialization error:", authError);
          // Continue anyway, we'll show login UI
        }
        
        // Initialize the sidebar if not already done
        if (!sidebarInitialized) {
          console.log("Sidebar not initialized, initializing now");
          await initializeSidebar();
          console.log("Sidebar initialized:", sidebarInitialized);
        } else {
          console.log("Sidebar already initialized");
        }
        
        // Show the sidebar
        sidebarVisible = true;
        const sidebar = document.getElementById('chess-analysis-sidebar');
        if (sidebar) {
          console.log("Sidebar element found, displaying it");
          
          // Make sure the sidebar is visible with multiple style properties
          sidebar.style.right = '0';
          sidebar.style.display = 'flex';
          sidebar.style.visibility = 'visible';
          sidebar.style.opacity = '1';
          sidebar.style.zIndex = '9999';
          
          // Make sure toggle button is visible
          ensureToggleButtonVisible();
          
          // Update user panel with fallback handling
          const userInfoPanel = document.getElementById('user-info-panel');
          if (userInfoPanel) {
            try {
              // Try to determine auth state using multiple methods
              let isAuth = false;
              let user = null;
              
              if (window.chessAuthModule && window.chessAuthModule.isAuthenticatedSync) {
                isAuth = window.chessAuthModule.isAuthenticatedSync();
                user = window.chessAuthModule.getCurrentUser();
              } else {
                // Fallback to checking storage
                try {
                  const authStr = localStorage.getItem('chess_assistant_auth');
                  if (authStr) {
                    const authData = JSON.parse(authStr);
                    isAuth = !!authData && !!authData.token;
                    user = authData.user;
                  }
                } catch (e) {
                  console.error("Error checking localStorage:", e);
                }
              }
              
              // Update the user info section
              if (window.chessAnalyzerExtension && window.chessAnalyzerExtension.updateUserInfoSection) {
                window.chessAnalyzerExtension.updateUserInfoSection(isAuth, user);
              } else {
                console.warn("updateUserInfoSection not found, using fallback");
                userInfoPanel.innerHTML = isAuth 
                  ? `<div>Logged in as ${user?.email || 'User'}</div>`
                  : `<div>Please log in to use AI analysis</div>`;
              }
            } catch (panelError) {
              console.error("Error updating user panel:", panelError);
              userInfoPanel.innerHTML = `<div>Error checking login status</div>`;
            }
          }
          
          sendResponse({ success: true });
        } else {
          console.error("Sidebar element not found after initialization");
          sendResponse({ success: false, error: "Sidebar element not found" });
        }
      } catch (error) {
        console.error("Error showing sidebar:", error);
        sendResponse({ success: false, error: error.message });
      }
    };
    
    // Execute the async function and return true to indicate async response
    handleShowSidebar();
    return true;
  }
  
  if (request.action === "updateSidebarImage") {
    console.log("Update sidebar image request received");
    
    try {
      loadStoredBoardData();
      sendResponse({ success: true });
    } catch (error) {
      console.error("Error updating sidebar image:", error);
      sendResponse({ success: false, error: error.message });
    }
    
    return true;
  }
  
  // Handle auth state changes from background
  if (request.action === "auth_state_changed") {
    console.log("Auth state changed notification received:", request.isAuthenticated);
    
    // Refresh auth state from background to get complete data
    refreshAuthState();
    
    // Also update UI elements directly
    const userInfoPanel = document.getElementById('user-info-panel');
    if (userInfoPanel) {
      updateUserPanel(userInfoPanel);
    }
    
    // Update ask button state
    updateAskButtonState();
    
    sendResponse({ success: true });
    return true;
  }

  // Add capture_board action handler 
  if (request.action === "capture_board") {
    console.log("Capture board request received");
    
    // Check if we're on a chess site
    if (!isChessSite()) {
      console.log("Not on a chess site, can't capture board");
      sendResponse({ 
        success: false, 
        error: "Not on a supported chess site (Chess.com or Lichess)" 
      });
      return true;
    }
    
    // Handle the capture request
    try {
      captureCurrentPosition()
        .then(boardData => {
          console.log("Board captured successfully");
          sendResponse({ 
            success: true,
            message: "Board captured successfully" 
          });
        })
        .catch(error => {
          console.error("Error capturing board:", error);
          sendResponse({ 
            success: false, 
            error: error.message || "Failed to capture chess board" 
          });
        });
      
      return true; // Indicates we'll send a response asynchronously
    } catch (error) {
      console.error("Error in capture_board handler:", error);
      sendResponse({ 
        success: false, 
        error: error.message || "Error processing capture request" 
      });
      return true;
    }
  }
});

// Add style for animations
const style = document.createElement('style');
style.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);

// Initialize on load
document.addEventListener('DOMContentLoaded', async () => {
  console.log("DOM loaded, initializing");
  try {
    // Load auth module first
    await loadAuthModule();
    
    // Initialize sidebar
    initializeSidebar();
    ensureToggleButtonVisible();
    
    // Set up periodic auth state refresh
    setupAuthRefresh();
  } catch (error) {
    console.error("Error during initialization:", error);
  }
});

// If the page is already loaded, initialize immediately
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  console.log("Page already loaded, initializing immediately");
  loadAuthModule().then(() => {
    initializeSidebar();
    ensureToggleButtonVisible();
    
    // Set up periodic auth state refresh
    setupAuthRefresh();
  }).catch(error => {
    console.error("Error loading auth module:", error);
  });
}

// Listen for storage changes (auth state changes)
window.addEventListener('storage', (event) => {
  if (event.key === 'chess_assistant_auth' || event.key === 'chess_assistant_token' || event.key === 'chess_assistant_auth_updated') {
    console.log('Auth data changed in storage:', event.key);
    const userInfoPanel = document.getElementById('user-info-panel');
    if (userInfoPanel) {
      updateUserPanel(userInfoPanel);
    }
    
    // Update ask button state
    updateAskButtonState();
  }
});

// Listen for custom auth change events
window.addEventListener('chess_auth_changed', (event) => {
  console.log('Auth changed event received:', event.detail);
  const userInfoPanel = document.getElementById('user-info-panel');
  if (userInfoPanel) {
    updateUserPanel(userInfoPanel);
  }
  
  // Update ask button state
  updateAskButtonState();
});

// Make auth initialization more resilient with immediate fallbacks
async function initializeAuth(maxRetries = 2) {
  try {
    console.log("Starting auth initialization");
    // Try a simple ping to check background connection first
    try {
      await pingBackgroundScript();
      console.log("Background connection confirmed");
    } catch (pingError) {
      console.warn("Background connection issue, continuing anyway:", pingError);
    }
    
    // Load the auth module with minimal waiting
    const module = await loadAuthModule();
    console.log("Auth module loaded");
    
    // Assign reference and functions
    authModule = module;
    
    // Force isInitialized to true
    if (module) {
      module.isInitialized = true;
      assignAuthFunctions(module);
      console.log("Auth functions assigned");
      return module;
    }
    
    throw new Error("Auth module not available");
  } catch (error) {
    console.error("Auth init error, using fallback:", error);
    // Create a fallback auth module
    const fallbackModule = window.chessAuthModule || {
      isInitialized: true,
      isAuthenticated: async () => false,
      isAuthenticatedSync: () => false,
      getCurrentUser: () => null,
      getAuthToken: () => null,
      clearAuth: () => {}
    };
    
    // Set the fallback
    authModule = fallbackModule;
    window.chessAuthModule = fallbackModule;
    assignAuthFunctions(fallbackModule);
    
    // Return the fallback
    return fallbackModule;
  }
}

// Add this new function to update UI based on auth state
function updateUIBasedOnAuth() {
  const isAuthenticated = window.chessAuthModule.isAuthenticated();
  const user = window.chessAuthModule.getCurrentUser();
  console.log("Updating UI with auth state:", { isAuthenticated, user });
  
  const userInfoPanel = document.getElementById('user-info-panel');
  if (userInfoPanel) {
    updateUserPanel(userInfoPanel);
  }
  
  // Update ask button state
  updateAskButtonState();
}

// Initialize auth when content script loads
document.addEventListener('DOMContentLoaded', initializeAuth);

// Add function to handle question submissions
async function handleQuestionSubmit(inputElement, responseArea) {
  const question = inputElement.value.trim();
  if (!question) return;
  
  // Check auth state
  if (!window.chessAuthModule.isAuthenticatedSync()) {
    responseArea.innerHTML = '<p class="error">Please login to ask questions.</p>';
    return;
  }
  
  // Show loading state
  responseArea.innerHTML = '<p class="loading">Analyzing position...</p>';
  
  try {
    // Get current position data
    const positionData = await captureCurrentPosition();
    
    // Call API with question and position data
    const response = await fetch(`${window.API_URL}/analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getAuthToken()}`
      },
      body: JSON.stringify({
        message: question,
        fen: positionData.fen || '',
        pgn: positionData.pgn || '',
        image_data: positionData.imageData || ''
      })
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        responseArea.innerHTML = '<p class="error">Authentication required. Please login again.</p>';
      } else if (response.status === 402) {
        responseArea.innerHTML = '<p class="error">You need more credits to analyze positions.</p>';
      } else {
        responseArea.innerHTML = `<p class="error">Error: ${response.status} - ${response.statusText}</p>`;
      }
      return;
    }
    
    const data = await response.json();
    
    // Display response
    responseArea.innerHTML = `
      <div class="question">
        <strong>Q: ${question}</strong>
      </div>
      <div class="answer">
        ${data.response || 'No analysis available.'}
      </div>
    `;
    
    // Clear input
    inputElement.value = '';
    
  } catch (error) {
    console.error("Error submitting question:", error);
    responseArea.innerHTML = `<p class="error">Error: ${error.message}</p>`;
  }
}

// Check if we're on a chess site before initializing
function isChessSite() {
  try {
    const url = window.location.href || '';
    console.log("Checking if current URL is a chess site:", url);
    
    // Allow debugging on any page if needed
    const DEBUG_MODE = true; // Set to false in production
    if (DEBUG_MODE) {
      console.log("DEBUG MODE: Treating all pages as chess sites for testing");
      return true;
    }
    
    // Standard detection for production
    return url.includes('chess.com') || 
           url.includes('lichess.org') || 
           url.includes('chess24.com') || 
           url.includes('chesstempo.com');
  } catch (error) {
    console.error("Error in isChessSite check:", error);
    // Default to false if there's an error
    return false;
  }
}

// Only run on chess sites
if (isChessSite()) {
  // Initialize auth system
  initializeAuth().catch(error => {
    console.error("Error during auth initialization:", error);
  });
  
  // Register message listener for sidebar - make sure it actually registers
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Content script received message:", request);
    
    // Add ping handler for extension health check
    if (request.action === "ping") {
      console.log("Ping received, responding immediately");
      sendResponse({ success: true });
      return true;
    }
    
    // Only process sidebar requests on chess sites
    if (request.action === "showSidebar" || request.action === "show_sidebar") {
      console.log("Show sidebar request received");
      
      // Create a promise to handle the async operations
      const handleShowSidebar = async () => {
        try {
          console.log("Starting sidebar initialization");
          
          // Make sure auth is initialized first
          await initializeAuth();
          console.log("Auth initialized, continuing to sidebar init");
          
          // Initialize the sidebar if not already done
          if (!sidebarInitialized) {
            console.log("Sidebar not initialized, initializing now");
            await initializeSidebar();
            console.log("Sidebar initialized:", sidebarInitialized);
          } else {
            console.log("Sidebar already initialized");
          }
          
          // Show the sidebar
          sidebarVisible = true;
          const sidebar = document.getElementById('chess-analysis-sidebar');
          if (sidebar) {
            console.log("Sidebar element found, displaying it");
            sidebar.style.right = '0';
            sidebar.style.display = 'flex';
            sidebar.style.visibility = 'visible';
            
            // Make sure the toggle button is visible
            ensureToggleButtonVisible();
            
            // Force style to be visible
            sidebar.style.opacity = '1';
            sidebar.style.zIndex = '9999';
            
            // Update user panel
            const userInfoPanel = document.getElementById('user-info-panel');
            if (userInfoPanel) {
              if (window.chessAnalyzerExtension && window.chessAnalyzerExtension.updateUserInfoSection) {
                window.chessAnalyzerExtension.updateUserInfoSection(
                  window.chessAuthModule ? window.chessAuthModule.isAuthenticatedSync() : false, 
                  window.chessAuthModule ? window.chessAuthModule.getCurrentUser() : null
                );
              } else {
                console.error("updateUserInfoSection function not found");
              }
            }
            
            sendResponse({ success: true });
          } else {
            console.error("Sidebar element not found after initialization");
            sendResponse({ success: false, error: "Sidebar element not found" });
          }
        } catch (error) {
          console.error("Error showing sidebar:", error);
          sendResponse({ success: false, error: error.message });
        }
      };
      
      // Execute the async function and return true
      handleShowSidebar();
      return true;
    }
    
    // Handle other messages...
    return false;
  });
} else {
  console.log("Not on a supported chess site, content script idle");
}

// Clean up duplicate declarations and fix initialization 
// Add this at the start of your content-script.js
window.chessAnalyzerExtension = window.chessAnalyzerExtension || {};

// Define the updateUserInfoSection function once
window.chessAnalyzerExtension.updateUserInfoSection = function(authenticated, user) {
  console.log("Updating user info section. Auth state:", authenticated, "User:", user);
  
  const userInfoPanel = document.getElementById('user-info-panel');
  if (!userInfoPanel) {
    console.error("User info panel not found");
    return;
  }
  
  // Check with background script for latest auth state
  chrome.runtime.sendMessage({ action: 'get_auth_state' }, response => {
    if (chrome.runtime.lastError) {
      console.error("Error getting auth state from background:", chrome.runtime.lastError);
      // Continue with the provided auth state as fallback
    } else if (response) {
      console.log("Received auth state from background:", response);
      // Override with latest state from background script
      authenticated = response.isAuthenticated;
      user = response.user;
    }
    
    // Now update the UI with the most accurate auth state
    if (authenticated && user) {
      console.log("Showing logged in UI with user:", user);
      userInfoPanel.innerHTML = `
        <div class="user-logged-in" style="display: flex; justify-content: space-between; align-items: center;">
          <div class="user-details">
            <span class="user-name" style="font-weight: 500; font-size: 14px; margin-bottom: 4px; display: block;">
              ${user.full_name || user.email || 'User'}
            </span>
            <div class="credits-display" style="display: flex; align-items: center; gap: 4px;">
              <span class="credits-count" style="color: #34a853; font-weight: 600; font-size: 15px;">
                ${user.credits || 0}
              </span>
              <span class="credits-label" style="color: #666; font-size: 13px;">credits</span>
            </div>
          </div>
          <button id="sidebar-logout-btn" style="background: none; border: none; color: #4285f4; cursor: pointer;">
            Logout
          </button>
        </div>
      `;
      
      // Add logout button listener
      setTimeout(() => {
        const logoutBtn = document.getElementById('sidebar-logout-btn');
        if (logoutBtn) {
          logoutBtn.addEventListener('click', () => {
            try {
              chrome.runtime.sendMessage({ action: "logout" }, response => {
                if (chrome.runtime.lastError) {
                  console.error("Logout error:", chrome.runtime.lastError);
                  return;
                }
                
                // Update UI after logout
                window.chessAnalyzerExtension.updateUserInfoSection(false, null);
              });
            } catch (e) {
              console.error("Error sending logout message:", e);
            }
          });
        }
      }, 0);
    } else {
      console.log("Showing logged out UI");
      userInfoPanel.innerHTML = `
        <div class="user-logged-out" style="text-align: center;">
          <p style="margin-bottom: 10px;">Login to use AI chess analysis</p>
          <button id="sidebar-login-btn" style="background-color: #4285f4; color: white; border: none; border-radius: 4px; padding: 8px 12px; cursor: pointer;">
            Login
          </button>
        </div>
      `;
      
      // Add login button listener
      setTimeout(() => {
        const loginBtn = document.getElementById('sidebar-login-btn');
        if (loginBtn) {
          loginBtn.addEventListener('click', () => {
            loginBtn.textContent = "Opening login...";
            loginBtn.disabled = true;
            
            try {
              // Open the popup for login instead of using Google auth
              chrome.runtime.sendMessage({ action: "open_popup" }, response => {
                if (chrome.runtime.lastError) {
                  console.error("Error opening popup:", chrome.runtime.lastError);
                  loginBtn.textContent = "Login";
                  loginBtn.disabled = false;
                  return;
                }
                
                console.log("Login popup opened");
              });
            } catch (e) {
              console.error("Error sending open_popup message:", e);
              loginBtn.textContent = "Login";
              loginBtn.disabled = false;
            }
          });
        }
      }, 0);
    }
  });
};

// Add a safe messaging function to handle connection errors
function safelySendMessage(message, maxRetries = 3) {
  return new Promise((resolve, reject) => {
    let retries = 0;
    
    function attemptSend() {
      try {
        chrome.runtime.sendMessage(message, response => {
          if (chrome.runtime.lastError) {
            console.warn(`Message error (attempt ${retries + 1}/${maxRetries}):`, chrome.runtime.lastError);
            
            if (retries < maxRetries) {
              retries++;
              // Exponential backoff
              setTimeout(attemptSend, 300 * Math.pow(2, retries));
            } else {
              reject(new Error(`Failed to send message after ${maxRetries} attempts: ${chrome.runtime.lastError.message || 'Connection failed'}`));
            }
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        if (retries < maxRetries) {
          retries++;
          setTimeout(attemptSend, 300 * Math.pow(2, retries));
        } else {
          reject(error);
        }
      }
    }
    
    attemptSend();
  });
}

// Replace direct chrome.runtime.sendMessage calls with safelySendMessage
// For example:
// Instead of:
// chrome.runtime.sendMessage({ action: "login" }, response => {...});
// Use:
// safelySendMessage({ action: "login" }).then(response => {...}).catch(error => {...});

// Function to ask a question about the position
function askQuestion() {
  const questionInput = document.getElementById('question-input');
  const responseArea = document.getElementById('response-area');
  const aiVisionToggle = document.getElementById('ai-vision-toggle');
  
  if (!questionInput || !responseArea) {
    console.error("Question input or response area not found");
    return;
  }
  
  const question = questionInput.value.trim();
  
  if (!question) {
    responseArea.textContent = "Please enter a question about the position.";
    return;
  }
  
  // Show loading indicator
  responseArea.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; height: 100px;">
      <div style="display: inline-block; border-radius: 50%; border: 3px solid #4285f4; 
           border-top-color: transparent; width: 24px; height: 24px; animation: spin 1s linear infinite;"></div>
      <div style="margin-left: 15px; font-weight: 500;">Analyzing position...</div>
    </div>
    <style>
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
  `;
  
  // Check if we have a captured board
  safelyGetStorage(['capturedBoard']).then(result => {
    const capturedBoard = result.capturedBoard;
    
    if (!capturedBoard) {
      responseArea.textContent = "Please capture a chess position first.";
      return;
    }
    
    // Determine if we should use vision
    const useVision = aiVisionToggle && aiVisionToggle.checked;
    
    try {
      // Get auth token
      const auth = getAuthToken();
      console.log("Using auth token:", auth ? "Present" : "Not available");
      
      // Send request to background script to handle API call
      safelySendMessage({
        action: "analyzeChessPosition",
        question: question,
        capturedBoard: capturedBoard,
        useVision: useVision,
        authToken: auth
      }).then(response => {
        console.log("Analysis response:", response);
        
        if (response && response.success) {
          // Check if user info was returned (to update credit count)
          if (response.user) {
            console.log("Updating user data with:", response.user);
            
            // Update user data
            if (authModule && authModule.updateUserData) {
              authModule.updateUserData(response.user);
            } else {
              // Fallback: update directly in auth state
              const authData = window.chessAuthModule && window.chessAuthModule.getAuthData();
              if (authData) {
                authData.user = response.user;
                localStorage.setItem('chess_assistant_auth', JSON.stringify(authData));
              }
            }
            
            // Update UI
            const userInfoPanel = document.getElementById('user-info-panel');
            if (userInfoPanel) {
              updateUserPanel(userInfoPanel);
            }
          }
          
          // Format the response with better styling
          const formattedResponse = formatAPIResponse(response.data);
          responseArea.innerHTML = formattedResponse;
        } else {
          // Handle specific error cases
          const errorMsg = response?.error || "Unknown error";
          
          if (errorMsg.includes("Authentication required")) {
            // Authentication error
            responseArea.innerHTML = `
              <div style="padding: 15px; text-align: center;">
                <div style="font-weight: 600; font-size: 16px; margin-bottom: 10px;">Authentication Required</div>
                <p>Your session has expired. Please login again to continue.</p>
                <button id="relogin-btn" style="
                  padding: 8px 16px;
                  background-color: #4285f4;
                  color: white;
                  border: none;
                  border-radius: 4px;
                  cursor: pointer;
                  font-size: 14px;
                  font-weight: 500;
                  margin-top: 10px;
                ">Login Again</button>
              </div>
            `;
            
            setTimeout(() => {
              const reloginBtn = document.getElementById('relogin-btn');
              if (reloginBtn) {
                reloginBtn.addEventListener('click', handleLogin);
              }
            }, 0);
          } else if (errorMsg.includes("Insufficient credits")) {
            // Insufficient credits
            showInsufficientCreditsWarning();
          } else {
            // General error
            responseArea.innerHTML = `
              <div style="color: #d32f2f; padding: 10px; background-color: #ffebee; border-radius: 4px;">
                <strong>Error:</strong> ${errorMsg}
              </div>
            `;
          }
        }
      }).catch(error => {
        console.error("Error in ask question flow:", error);
        responseArea.innerHTML = `
          <div style="color: #d32f2f; padding: 10px; background-color: #ffebee; border-radius: 4px;">
            <strong>Error:</strong> ${error.message}
          </div>
        `;
      });
    } catch (error) {
      console.error("Error in ask question flow:", error);
      responseArea.innerHTML = `
        <div style="color: #d32f2f; padding: 10px; background-color: #ffebee; border-radius: 4px;">
          <strong>Error:</strong> ${error.message}
        </div>
      `;
    }
  }).catch(error => {
    console.error("Error accessing storage:", error);
    responseArea.innerHTML = `
      <div style="color: #d32f2f; padding: 10px; background-color: #ffebee; border-radius: 4px;">
        <strong>Error:</strong> Could not access storage: ${error.message}
      </div>
    `;
  });
}

// Function to format API responses with better styling
function formatAPIResponse(response) {
  if (!response) return "No response from the server";
  
  // Replace newlines with HTML line breaks
  let formatted = response.replace(/\n/g, '<br>');
  
  // Bold key terms
  formatted = formatted.replace(/(best move|advantage|winning|check|mate|fork|pin|skewer|discovered attack|zwischenzug|tempo|initiative|development|center control|king safety|pawn structure)/gi, 
    '<strong>$1</strong>');
  
  // Highlight chess moves (like e4, Nf3, etc.)
  formatted = formatted.replace(/\b([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[\+#]?)\b/g, 
    '<span style="color: #1a73e8; font-weight: 500;">$1</span>');
  
  // Highlight evaluations (+1.5, -0.7, etc.)
  formatted = formatted.replace(/(\+|-)\d+\.?\d*/g, 
    '<span style="color: #188038; font-weight: 500;">$1</span>');
  
  return formatted;
}

// Add diagnostic function to check if background script is alive
function pingBackgroundScript() {
  console.log("Pinging background script...");
  return safelySendMessage({ action: "ping" })
    .then(response => {
      console.log("Background script responded:", response);
      return response;
    })
    .catch(error => {
      console.error("Background script ping failed:", error);
      throw error;
    });
}

// Call this on initialization to check connection
document.addEventListener('DOMContentLoaded', () => {
  // Ping the background script to make sure it's alive
  pingBackgroundScript()
    .then(() => {
      console.log("Background script connection verified");
    })
    .catch(error => {
      console.error("Background connection issue:", error);
      // Show error message to user if needed
    });
});

// Function to periodically refresh auth state
function setupAuthRefresh() {
  console.log("Setting up periodic auth state refresh");
  
  // Refresh auth state immediately
  refreshAuthState();
  
  // Then refresh every 30 seconds
  setInterval(refreshAuthState, 30000);
}

// Function to refresh auth state from background
function refreshAuthState() {
  console.log("Refreshing auth state from background");
  
  try {
    chrome.runtime.sendMessage({ action: 'get_auth_state' }, response => {
      if (chrome.runtime.lastError) {
        console.error("Error getting auth state during refresh:", chrome.runtime.lastError);
        return;
      }
      
      if (!response) {
        console.warn("No response received from background during auth refresh");
        return;
      }
      
      console.log("Received refreshed auth state:", response);
      
      // Update localStorage with the latest auth state
      try {
        const authStr = localStorage.getItem('chess_assistant_auth');
        if (authStr) {
          const authData = JSON.parse(authStr);
          
          // Check if the auth state has changed
          const stateChanged = 
            authData.token !== response.token || 
            !authData.user || 
            !response.user ||
            authData.user.email !== response.user.email ||
            authData.user.credits !== response.user.credits;
          
          if (stateChanged) {
            console.log("Auth state changed, updating localStorage and UI");
            
            // Update localStorage
            const newAuthData = {
              token: response.token,
              user: response.user,
              timestamp: Date.now()
            };
            localStorage.setItem('chess_assistant_auth', JSON.stringify(newAuthData));
            
            // Update UI elements
            const userInfoPanel = document.getElementById('user-info-panel');
            if (userInfoPanel) {
              window.chessAnalyzerExtension.updateUserInfoSection(response.isAuthenticated, response.user);
            }
            
            // Update ask button state
            updateAskButtonState();
          }
        } else if (response.isAuthenticated) {
          // No local auth data but we're authenticated in background
          console.log("No local auth data but authenticated in background, updating localStorage");
          
          const newAuthData = {
            token: response.token,
            user: response.user,
            timestamp: Date.now()
          };
          localStorage.setItem('chess_assistant_auth', JSON.stringify(newAuthData));
          
          // Update UI elements
          const userInfoPanel = document.getElementById('user-info-panel');
          if (userInfoPanel) {
            window.chessAnalyzerExtension.updateUserInfoSection(response.isAuthenticated, response.user);
          }
          
          // Update ask button state
          updateAskButtonState();
        }
      } catch (e) {
        console.error("Error updating localStorage during auth refresh:", e);
      }
    });
  } catch (error) {
    console.error("Error refreshing auth state:", error);
  }
}