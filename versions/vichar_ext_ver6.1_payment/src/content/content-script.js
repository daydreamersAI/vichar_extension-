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

// Define placeholder auth functions until the module loads
let isAuthenticated = () => {
  if (authModule) return authModule.isAuthenticated();
  // Try localStorage as fallback
  try {
    const authData = localStorage.getItem('chess_assistant_auth');
    return authData && JSON.parse(authData).token;
  } catch (e) {
    return false;
  }
};

let getCurrentUser = () => {
  if (authModule) return authModule.getCurrentUser();
  // Try localStorage as fallback
  try {
    const authData = localStorage.getItem('chess_assistant_auth');
    return authData ? JSON.parse(authData).user : null;
  } catch (e) {
    return null;
  }
};

let getAuthToken = () => {
  if (authModule) return authModule.getAuthToken();
  // Try localStorage as fallback
  try {
    const authData = localStorage.getItem('chess_assistant_auth');
    return authData ? JSON.parse(authData).token : null;
  } catch (e) {
    return null;
  }
};

// Other placeholder functions
let loginWithGoogle = () => Promise.reject(new Error("Auth module not loaded"));
let openPaymentPage = () => Promise.reject(new Error("Auth module not loaded"));
let getCreditPackages = () => Promise.reject(new Error("Auth module not loaded"));
let updateUserData = () => false;

// Completely revise loadAuthModule function for maximum reliability
async function loadAuthModule() {
  try {
    // First check if it's already loaded - simplify the check
    if (window.chessAuthModule) {
      console.log("Auth module already available");
      window.chessAuthModule.isInitialized = true; // Force it to be initialized
      return window.chessAuthModule;
    }

    // Create a simplified auth module directly in the content script as fallback
    window.chessAuthModule = window.chessAuthModule || {
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
      getCurrentUser: function() {
        try {
          const authStr = localStorage.getItem('chess_assistant_auth');
          return authStr ? JSON.parse(authStr).user : null;
        } catch (e) { return null; }
      },
      getAuthToken: function() {
        try {
          const authStr = localStorage.getItem('chess_assistant_auth');
          return authStr ? JSON.parse(authStr).token : null;
        } catch (e) { return null; }
      },
      clearAuth: function() {
        localStorage.removeItem('chess_assistant_auth');
        localStorage.removeItem('chess_assistant_token');
      }
    };
    
    // Now try to load the actual auth script
    console.log("Loading auth script");
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('src/auth/auth-storage.js');
    script.type = 'text/javascript';
    
    // Use a simpler approach to loading
    document.head.appendChild(script);
    
    // Return the basic module immediately instead of waiting
    return window.chessAuthModule;
  } catch (error) {
    console.error("Error in loadAuthModule:", error);
    // Return a basic auth module as fallback
    return window.chessAuthModule;
  }
}

// Assign auth functions from the module
function assignAuthFunctions(module) {
  // Assign all functions from the module
  isAuthenticated = module.isAuthenticated;
  getCurrentUser = module.getCurrentUser;
  loginWithGoogle = module.loginWithGoogle;
  openPaymentPage = module.openPaymentPage;
  getCreditPackages = module.getCreditPackages;
  getAuthToken = module.getAuthToken;
  updateUserData = module.updateUserData;
  
  console.log("Auth functions assigned, authenticated:", isAuthenticated());
  
  // Update the UI based on auth state
  const userInfoPanel = document.getElementById('user-info-panel');
  if (userInfoPanel) {
    updateUserPanel(userInfoPanel);
  }
  
  // Update ask button state
  updateAskButtonState();
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
      console.log("Sidebar already exists, skipping initialization");
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
  console.log("Updating user panel");
  
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
    console.error("Error in updateUserPanel:", error);
    panel.innerHTML = `
      <div class="user-status-loading">
        <p>Error checking login status</p>
      </div>
    `;
  }
}

// Function to update ask button state
function updateAskButtonState() {
  const askButton = document.getElementById('ask-button');
  if (!askButton) return;
  
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
  if (request.action === "showSidebar") {
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
    console.log("Auth state changed:", request.isAuthenticated);
    
    // Update UI elements
    const userInfoPanel = document.getElementById('user-info-panel');
    if (userInfoPanel) {
      updateUserPanel(userInfoPanel);
    }
    
    // Update ask button state
    updateAskButtonState();
    
    sendResponse({ success: true });
    return true;
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
  const url = window.location.href;
  return url.includes('chess.com') || url.includes('lichess.org');
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
    if (request.action === "showSidebar") {
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
  console.log("Updating user info section:", authenticated, user);
  
  const userInfoPanel = document.getElementById('user-info-panel');
  if (!userInfoPanel) {
    console.error("User info panel not found");
    return;
  }
  
  if (authenticated && user) {
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
    userInfoPanel.innerHTML = `
      <div class="user-logged-out" style="text-align: center;">
        <p style="margin-bottom: 10px;">Login to use AI chess analysis</p>
        <button id="sidebar-login-btn" style="background-color: #4285f4; color: white; border: none; border-radius: 4px; padding: 8px 12px; cursor: pointer;">
          Login with Google
        </button>
      </div>
    `;
    
    // Add login button listener
    setTimeout(() => {
      const loginBtn = document.getElementById('sidebar-login-btn');
      if (loginBtn) {
        loginBtn.addEventListener('click', () => {
          loginBtn.textContent = "Logging in...";
          loginBtn.disabled = true;
          
          try {
            chrome.runtime.sendMessage({ action: "login" }, response => {
              if (chrome.runtime.lastError) {
                console.error("Login error:", chrome.runtime.lastError);
                loginBtn.textContent = "Login with Google";
                loginBtn.disabled = false;
                return;
              }
              
              console.log("Login initiated by background script");
              // The background script will handle the rest
            });
          } catch (e) {
            console.error("Error sending login message:", e);
            loginBtn.textContent = "Login with Google";
            loginBtn.disabled = false;
          }
        });
      }
    }, 0);
  }
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