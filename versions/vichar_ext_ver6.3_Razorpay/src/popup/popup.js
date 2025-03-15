// Updated popup.js with Razorpay integration
console.log("Popup script loading...");

// Create consistent namespace for auth functions
window.chessAnalyzerApp = window.chessAnalyzerApp || {};

// Declare auth functions that will be defined later
let isAuthenticated = () => {
  console.log("Using fallback isAuthenticated function");
  try {
    const authStr = localStorage.getItem('chess_assistant_auth');
    return !!authStr && !!JSON.parse(authStr).token;
  } catch (e) { 
    console.error("Error in fallback isAuthenticated:", e);
    return false; 
  }
};

let getCurrentUser = () => {
  console.log("Using fallback getCurrentUser function");
  try {
    const authStr = localStorage.getItem('chess_assistant_auth');
    return authStr ? JSON.parse(authStr).user : null;
  } catch (e) { 
    console.error("Error in fallback getCurrentUser:", e);
    return null; 
  }
};

// API endpoint
// //const API_URL = "https://api.beekayprecision.com";

// const API_URL = window.chessAnalyzerConfig.API_URL;
// // Razorpay API Key
// const RAZORPAY_KEY_ID = "rzp_test_JB7DxS1VpotPXc"; // Replace with your actual key

// Credit package definitions
// const CREDIT_PACKAGES = [
//   { id: 'basic', name: 'Basic', credits: 50, amount: 29900 },  // ₹299
//   { id: 'standard', name: 'Standard', credits: 120, amount: 59900 },  // ₹599
//   { id: 'premium', name: 'Premium', credits: 300, amount: 99900 }   // ₹999
// ];

// Function to load the auth module
function loadAuthModule() {
  console.log("Loading auth module in popup.js");
  
  try {
    // Check if module is already available
    if (window.chessAuthModule && window.chessAuthModule.isInitialized) {
      console.log("Auth module already available");
      isAuthenticated = window.chessAuthModule.isAuthenticated;
      getCurrentUser = window.chessAuthModule.getCurrentUser;
      loginWithCredentials = window.chessAuthModule.loginWithCredentials;
      return Promise.resolve(window.chessAuthModule);
    }
    
    return new Promise((resolve) => {
      // Set a timeout to handle cases where the module isn't loaded properly
      setTimeout(() => {
        // Check if module is now available
        if (window.chessAuthModule && window.chessAuthModule.isInitialized) {
          console.log("Auth module loaded after delay");
          isAuthenticated = window.chessAuthModule.isAuthenticated;
          getCurrentUser = window.chessAuthModule.getCurrentUser;
          loginWithCredentials = window.chessAuthModule.loginWithCredentials;
          resolve(window.chessAuthModule);
        } else {
          console.warn("Auth module not available after delay, using fallbacks");
          resolve(null);
        }
      }, 1000);
    });
  } catch (error) {
    console.error("Error loading auth module:", error);
    return Promise.resolve(null);
  }
}

// Function to directly get auth state from background script
async function getAuthState() {
  console.log("Getting auth state from background script");
  
  try {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "get_auth_state" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error getting auth state:", chrome.runtime.lastError);
          resolve({ isAuthenticated: false, user: null });
        } else {
          console.log("Received auth state:", response);
          resolve(response || { isAuthenticated: false, user: null });
        }
      });
    });
  } catch (error) {
    console.error("Error getting auth state:", error);
    return { isAuthenticated: false, user: null };
  }
}

// Track initialization state
let popupInitialized = false;

// Update signup form handling to use direct background script messaging
async function handleSignupFormSubmit(event) {
  event.preventDefault();
  
  const email = document.getElementById('signup-email').value;
  const fullName = document.getElementById('full-name').value;
  const password = document.getElementById('signup-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;
  
  if (!email || !password) {
    showStatus('Please enter email and password', 'error');
    return;
  }
  
  if (password !== confirmPassword) {
    showStatus('Passwords do not match', 'error');
    return;
  }
  
  showStatus('Creating account...', 'info');
  
  try {
    // Send signup request to background script
    const response = await chrome.runtime.sendMessage({
      action: 'signup_with_credentials',
      email,
      password,
      fullName
    });
    
    console.log("Signup response:", response);
    
    if (response && response.success) {
      // Update UI with user info
      updateUserInfoSection(true, response.user);
      updateButtonState(true);
      showStatus('Account created successfully!', 'success');
    } else {
      // Handle error
      const errorMessage = response && response.error 
        ? response.error 
        : 'Signup failed. Please try again.';
        
      showStatus(`Signup error: ${errorMessage}`, 'error');
    }
  } catch (error) {
    console.error("Error during signup:", error);
    
    // Check if it's a connection error
    if (error.message && error.message.includes('Could not establish connection')) {
      showStatus('Connection error. Please try again.', 'error');
    } else {
      showStatus(`Signup error: ${error.message}`, 'error');
    }
  }
}

// Function to rebuild and set up authentication tabs and forms
function setupAuthTabs() {
  console.log("Setting up auth tabs");
  
  const userInfoDiv = document.getElementById('user-info');
  if (!userInfoDiv) {
    console.error("User info div not found in DOM");
    return;
  }
  
  // Clear existing content
  userInfoDiv.innerHTML = `
    <div class="auth-tabs">
      <button id="login-tab" class="auth-tab active" type="button">Login</button>
      <button id="signup-tab" class="auth-tab" type="button">Signup</button>
    </div>
    
    <div id="login-form-container" class="user-logged-out">
      <form id="login-form" class="login-form">
        <div class="form-group">
          <label for="username">Email / Username</label>
          <input type="text" id="username" name="username" required>
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" name="password" required>
        </div>
        <button type="submit" class="login-button">Log In</button>
      </form>
    </div>
    
    <div id="signup-form-container" class="user-logged-out" style="display: none;">
      <form id="signup-form" class="login-form">
        <div class="form-group">
          <label for="signup-email">Email</label>
          <input type="email" id="signup-email" name="email" required>
        </div>
        <div class="form-group">
          <label for="full-name">Full Name (Optional)</label>
          <input type="text" id="full-name" name="fullName">
        </div>
        <div class="form-group">
          <label for="signup-password">Password</label>
          <input type="password" id="signup-password" name="password" required>
        </div>
        <div class="form-group">
          <label for="confirm-password">Confirm Password</label>
          <input type="password" id="confirm-password" name="confirmPassword" required>
        </div>
        <button type="submit" class="login-button">Sign Up</button>
      </form>
    </div>
  `;
  
  // Add event listeners after the DOM is updated
  const loginTab = document.getElementById('login-tab');
  const signupTab = document.getElementById('signup-tab');
  const loginForm = document.getElementById('login-form-container');
  const signupForm = document.getElementById('signup-form-container');
  
  if (!loginTab || !signupTab || !loginForm || !signupForm) {
    console.error("Auth tab elements not found after rebuilding DOM");
    return;
  }
  
  // Set initial state
  loginTab.classList.add('active');
  signupTab.classList.remove('active');
  loginForm.style.display = 'block';
  signupForm.style.display = 'none';
  
  // Add event listeners
  loginTab.addEventListener('click', () => {
    console.log("Login tab clicked");
    loginTab.classList.add('active');
    signupTab.classList.remove('active');
    loginForm.style.display = 'block';
    signupForm.style.display = 'none';
    showStatus('', '');
  });
  
  signupTab.addEventListener('click', () => {
    console.log("Signup tab clicked");
    signupTab.classList.add('active');
    loginTab.classList.remove('active');
    signupForm.style.display = 'block';
    loginForm.style.display = 'none';
    showStatus('', '');
  });
  
  // Attach form handlers
  document.getElementById('login-form').addEventListener('submit', handleLoginFormSubmit);
  document.getElementById('signup-form').addEventListener('submit', handleSignupFormSubmit);
  
  console.log("Auth tabs and forms rebuilt and handlers attached");
}

// Function to check if current tab is a chess site
async function isChessSite() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.url) {
      return false;
    }
    
    const url = tab.url.toLowerCase();
    return url.includes('chess.com') || 
           url.includes('lichess.org') || 
           url.includes('chess24.com') || 
           url.includes('chesstempo.com');
  } catch (error) {
    console.error("Error checking chess site:", error);
    return false;
  }
}

// Update initialization to check for chess site
async function initializePopup() {
  console.log("Initializing popup");
  
  try {
    // First, set up auth tabs before anything else
    setupAuthTabs();
    
    // Then load auth module
    await loadAuthModule();
    
    // Check auth state directly from background
    const authState = await getAuthState();
    const isUserAuthenticated = authState.isAuthenticated;
    const currentUser = authState.user;
    
    console.log("Auth state:", isUserAuthenticated ? "Authenticated" : "Not authenticated");
    
    // If not authenticated according to background, try checking directly
    if (!isUserAuthenticated) {
      const isAuthLocal = await isAuthenticated();
      
      if (isAuthLocal) {
        // Get user data directly
        const userLocal = await getCurrentUser();
        updateUserInfoSection(true, userLocal);
      } else {
        updateUserInfoSection(false);
      }
      
      updateButtonState(isAuthLocal);
    } else {
      // Use auth state from background
      updateUserInfoSection(isUserAuthenticated, currentUser);
      updateButtonState(isUserAuthenticated);
    }
    
    // Check if current page is a chess site
    const onChessSite = await isChessSite();
    
    // Set up event listeners
    const sidebarButton = document.getElementById('sidebar-button');
    const captureButton = document.getElementById('capture-button');
    
    // Add warning for non-chess sites
    if (!onChessSite) {
      sidebarButton.title = "Only works on chess websites";
      captureButton.title = "Only works on chess websites";
      
      // Set opacity to indicate limited functionality
      sidebarButton.style.opacity = "0.7";
      captureButton.style.opacity = "0.7";
    }
    
    sidebarButton.addEventListener('click', openAnalysisSidebar);
    captureButton.addEventListener('click', captureChessPosition);
    
    console.log("Popup initialization complete");
  } catch (error) {
    console.error("Error initializing popup:", error);
    updateUserInfoSection(false);
    updateButtonState(false);
  }
}

// Function to update user info section based on auth state
function updateUserInfoSection(authenticated, user) {
  const userInfoDiv = document.getElementById('user-info');
  
  if (authenticated && user) {
    // User is logged in, show user info
    userInfoDiv.innerHTML = `
      <div class="user-logged-in">
        <div>
          <span class="user-name">${user.full_name || user.email || 'User'}</span>
          <div class="credits-display">
            <span class="credits-count">${user.credits || 0}</span>
            <span class="credits-label">credits</span>
          </div>
          <button id="buy-credits-btn" class="buy-credits-btn">+ Buy Credits</button>
        </div>
        <button id="logout-button" class="text-button">Log out</button>
      </div>
    `;
    
    // Add logout button handler
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
      logoutButton.addEventListener('click', handleLogout);
    } else {
      console.error("Logout button not found after rendering");
    }
    
    // Add buy credits button handler
    const buyCreditsBtn = document.getElementById('buy-credits-btn');
    if (buyCreditsBtn) {
      buyCreditsBtn.addEventListener('click', () => {
        showCreditPackages(user);
      });
    } else {
      console.error("Buy credits button not found after rendering");
    }
  } else {
    // User is not logged in, show login/signup tabs and forms
    userInfoDiv.innerHTML = `
      <div class="auth-tabs">
        <button id="login-tab" class="auth-tab active" type="button">Login</button>
        <button id="signup-tab" class="auth-tab" type="button">Signup</button>
      </div>
      
      <div id="login-form-container" class="user-logged-out">
        <form id="login-form" class="login-form">
          <div class="form-group">
            <label for="username">Email / Username</label>
            <input type="text" id="username" name="username" required>
          </div>
          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" required>
          </div>
          <button type="submit" class="login-button">Log In</button>
        </form>
      </div>
      
      <div id="signup-form-container" class="user-logged-out" style="display: none;">
        <form id="signup-form" class="login-form">
          <div class="form-group">
            <label for="signup-email">Email</label>
            <input type="email" id="signup-email" name="email" required>
          </div>
          <div class="form-group">
            <label for="full-name">Full Name (Optional)</label>
            <input type="text" id="full-name" name="fullName">
          </div>
          <div class="form-group">
            <label for="signup-password">Password</label>
            <input type="password" id="signup-password" name="password" required>
          </div>
          <div class="form-group">
            <label for="confirm-password">Confirm Password</label>
            <input type="password" id="confirm-password" name="confirmPassword" required>
          </div>
          <button type="submit" class="login-button">Sign Up</button>
        </form>
      </div>
    `;
    
    // Set up auth tabs again
    setupAuthTabs();
  }
}

// Function to update button state based on auth state
function updateButtonState(authenticated) {
  const sidebarButton = document.getElementById('sidebar-button');
  const captureButton = document.getElementById('capture-button');
  
  if (authenticated) {
    // Enable buttons
    sidebarButton.classList.remove('disabled');
    captureButton.classList.remove('disabled');
    
    sidebarButton.disabled = false;
    captureButton.disabled = false;
  } else {
    // Disable buttons that require auth
    sidebarButton.classList.add('disabled');
    
    sidebarButton.disabled = true;
    
    // Still allow capture button to work
    captureButton.classList.remove('disabled');
    captureButton.disabled = false;
  }
}

// Function to handle login form submission
async function handleLoginFormSubmit(event) {
  event.preventDefault();
  
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  if (!username || !password) {
    showStatus('Please enter both username and password', 'error');
    return;
  }
  
  showStatus('Logging in...', 'info');
  
  try {
    // Send login request to background script
    const response = await chrome.runtime.sendMessage({
      action: 'login_with_credentials',
      username,
      password
    });
    
    console.log("Login response:", response);
    
    if (response && response.success) {
      // Update UI with user info
      updateUserInfoSection(true, response.user);
      updateButtonState(true);
      showStatus('Login successful!', 'success');
    } else {
      // Handle error
      const errorMessage = response && response.error 
        ? response.error 
        : 'Login failed. Please check your credentials.';
        
      showStatus(`Login error: ${errorMessage}`, 'error');
    }
  } catch (error) {
    console.error("Error during login:", error);
    
    // Check if it's a connection error
    if (error.message && error.message.includes('Could not establish connection')) {
      showStatus('Connection error. Please try again.', 'error');
    } else {
      showStatus(`Login error: ${error.message}`, 'error');
    }
  }
}

// Handle logout
function handleLogout() {
  console.log("Handling logout");
  
  try {
    // Clear local storage
    localStorage.removeItem('chess_assistant_auth');
    localStorage.removeItem('chess_assistant_token');
    
    // Clear chrome storage
    chrome.storage.local.remove(['authToken', 'userData', 'authTimestamp']);
    
    // Notify background script
    chrome.runtime.sendMessage({ action: 'logout' });
    
    // Update UI
    updateUserInfoSection(false);
    updateButtonState(false);
    
    showStatus('Logged out successfully', 'success');
  } catch (error) {
    console.error("Error during logout:", error);
    showStatus('Error during logout', 'error');
  }
}

// Function to capture chess position with improved error handling
async function captureChessPosition() {
  showStatus('Checking for chess board...', 'info');
  
  try {
    // Capture from active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      showStatus('No active tab found', 'error');
      return;
    }
    
    console.log("Attempting to capture board in tab:", tab.url);
    
    // First try injecting our content script if it's not already there
    try {
      await injectContentScripts(tab.id);
    } catch (injectionError) {
      console.log("Content script injection skipped:", injectionError);
      // Continue anyway - it might already be loaded or we don't have permission
    }
    
    // Use a promise-based approach for sending the message
    const sendCaptureMessage = () => {
      return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(
          tab.id, 
          { action: 'capture_board' }, 
          (response) => {
            if (chrome.runtime.lastError) {
              console.error("Error sending capture message:", chrome.runtime.lastError);
              reject(new Error(chrome.runtime.lastError.message || 'Could not communicate with page'));
            } else if (response && response.success) {
              resolve(response);
            } else {
              reject(new Error(response?.error || 'Could not capture chess position'));
            }
          }
        );
      });
    };
    
    try {
      // Try to send the message
      const response = await sendCaptureMessage();
      console.log("Capture response:", response);
      
      // Either open in new tab or show in sidebar
      await chrome.tabs.create({ url: 'src/analysis/analysis.html' });
      showStatus('Board captured successfully!', 'success');
    } catch (messageError) {
      console.error("Error with capture message:", messageError);
      
      if (messageError.message.includes('Could not establish connection') || 
          messageError.message.includes('receiving end does not exist')) {
        
        // Special handling for chess sites
        const url = tab.url.toLowerCase();
        if (url.includes('chess.com') || url.includes('lichess.org')) {
          showStatus('Please reload the chess page and try again. The extension needs to be properly initialized on the page.', 'error');
        } else {
          // Not a chess site
          showStatus('This feature only works on chess websites like Chess.com or Lichess.org. Please navigate to a chess site and try again.', 'error');
        }
      } else {
        showStatus(`Capture error: ${messageError.message}`, 'error');
      }
    }
  } catch (error) {
    console.error("General error capturing chess position:", error);
    showStatus(`Error: ${error.message}`, 'error');
  }
}

// Function to open analysis sidebar with improved error handling
async function openAnalysisSidebar() {
  showStatus('Opening analysis sidebar...', 'info');
  
  try {
    // Check auth first
    const authenticated = await isAuthenticated();
    
    if (!authenticated) {
      showStatus('Please log in to use the analysis sidebar', 'error');
      return;
    }
    
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      showStatus('No active tab found', 'error');
      return;
    }
    
    console.log("Attempting to open sidebar in tab:", tab.url);
    
    // First try injecting our content script if it's not already there
    // This will help on pages where the content script isn't automatically loaded
    try {
      await injectContentScripts(tab.id);
    } catch (injectionError) {
      console.log("Content script injection skipped (might already be there):", injectionError);
      // Continue anyway - it might already be loaded or we don't have permission
    }
    
    // Use a promise-based approach for sending the message
    const sendSidebarMessage = () => {
      return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(
          tab.id, 
          { action: 'show_sidebar' }, 
          (response) => {
            if (chrome.runtime.lastError) {
              console.error("Error sending sidebar message:", chrome.runtime.lastError);
              reject(new Error(chrome.runtime.lastError.message || 'Could not communicate with page'));
            } else if (response && response.success) {
              resolve(response);
            } else {
              reject(new Error(response?.error || 'Could not open sidebar'));
            }
          }
        );
      });
    };
    
    try {
      // Try to send the message
      const response = await sendSidebarMessage();
      console.log("Sidebar response:", response);
      
      showStatus('Sidebar opened!', 'success');
      
      // Close popup after a short delay to show the success message
      setTimeout(() => {
        window.close();
      }, 1000);
    } catch (messageError) {
      console.error("Error with sidebar message:", messageError);
      
      if (messageError.message.includes('Could not establish connection') || 
          messageError.message.includes('receiving end does not exist')) {
        
        // Special handling for chess sites - if we're on chess.com or lichess.org
        // but still getting connection errors, we need to reload the page
        const url = tab.url.toLowerCase();
        if (url.includes('chess.com') || url.includes('lichess.org')) {
          showStatus('Please reload the chess page and try again. The extension needs to be properly initialized on the page.', 'error');
        } else {
          // Not a chess site
          showStatus('This feature only works on chess websites like Chess.com or Lichess.org. Please navigate to a chess site and try again.', 'error');
        }
      } else {
        showStatus(`Sidebar error: ${messageError.message}`, 'error');
      }
    }
    
  } catch (error) {
    console.error("General error opening analysis sidebar:", error);
    showStatus(`Error: ${error.message}`, 'error');
  }
}

// Helper function to show status messages
function showStatus(message, type) {
  const statusDiv = document.getElementById('status');
  
  if (!statusDiv) {
    console.error("Status div not found");
    return;
  }
  
  if (!message) {
    statusDiv.style.display = 'none';
    return;
  }
  
  statusDiv.textContent = message;
  statusDiv.className = 'status ' + (type || 'info');
  statusDiv.style.display = 'block';
  
  console.log(`Status message (${type}): ${message}`);
  
  // For success messages, keep them visible longer and make them more prominent
  if (type === 'success') {
    statusDiv.style.fontWeight = 'bold';
    statusDiv.style.fontSize = '1.1em';
    statusDiv.style.padding = '12px';
    
    // Show for 5 seconds then fade out
    setTimeout(() => {
      statusDiv.style.opacity = '0.8';
      setTimeout(() => {
        statusDiv.style.opacity = '0.5';
        setTimeout(() => {
          statusDiv.style.opacity = '0.2';
          setTimeout(() => {
            statusDiv.style.display = 'none';
            statusDiv.style.opacity = '1';
            statusDiv.style.fontWeight = 'normal';
            statusDiv.style.fontSize = '1em';
            statusDiv.style.padding = '10px';
          }, 500);
        }, 500);
      }, 500);
    }, 3500);
  }
}

// Common function to inject all required scripts for the content script
async function injectContentScripts(tabId) {
  console.log("Injecting content scripts into tab:", tabId);
  
  try {
    // First inject the html2canvas library
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['lib/html2canvas.min.js']
    });
    console.log("html2canvas injected successfully");
    
    // Then inject our content script
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/content/content-script.js']
    });
    console.log("Content script injected successfully");
    
    // Verify that the content script is now responsive
    return await verifyContentScriptResponsive(tabId);
  } catch (error) {
    console.warn("Content script injection error:", error);
    // Not failing - the scripts might already be loaded
    return await verifyContentScriptResponsive(tabId);
  }
}

// Function to verify that the content script is responsive
async function verifyContentScriptResponsive(tabId) {
  return new Promise((resolve) => {
    // Add a timeout for the ping
    const pingTimeout = setTimeout(() => {
      console.warn("Content script ping timed out");
      resolve(false);
    }, 1000);
    
    try {
      // Try to ping the content script
      chrome.tabs.sendMessage(tabId, { action: 'ping' }, (response) => {
        clearTimeout(pingTimeout);
        
        if (chrome.runtime.lastError) {
          console.warn("Content script ping error:", chrome.runtime.lastError);
          resolve(false);
        } else if (response && response.success) {
          console.log("Content script is responsive");
          resolve(true);
        } else {
          console.warn("Content script ping returned unexpected response:", response);
          resolve(false);
        }
      });
    } catch (error) {
      clearTimeout(pingTimeout);
      console.warn("Error during content script ping:", error);
      resolve(false);
    }
  });
}

// Show credit packages modal
function showCreditPackages(user) {
  console.log("Showing credit packages for user:", user);
  
  // Create modal overlay
  const modal = document.createElement('div');
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  modal.style.display = 'flex';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
  modal.style.zIndex = '1000';
  
  // Create modal content
  const modalContent = document.createElement('div');
  modalContent.style.backgroundColor = 'white';
  modalContent.style.padding = '20px';
  modalContent.style.borderRadius = '8px';
  modalContent.style.width = '280px';
  
  // Create modal header
  const modalHeader = document.createElement('div');
  modalHeader.style.display = 'flex';
  modalHeader.style.justifyContent = 'space-between';
  modalHeader.style.alignItems = 'center';
  modalHeader.style.marginBottom = '16px';
  
  const modalTitle = document.createElement('h2');
  modalTitle.textContent = 'Buy Credits';
  modalTitle.style.margin = '0';
  modalTitle.style.fontSize = '18px';
  
  const closeButton = document.createElement('button');
  closeButton.textContent = '×';
  closeButton.style.background = 'none';
  closeButton.style.border = 'none';
  closeButton.style.fontSize = '24px';
  closeButton.style.cursor = 'pointer';
  closeButton.style.padding = '0';
  closeButton.style.lineHeight = '1';
  closeButton.style.color = '#666';
  closeButton.onclick = () => {
    document.body.removeChild(modal);
  };
  
  modalHeader.appendChild(modalTitle);
  modalHeader.appendChild(closeButton);
  modalContent.appendChild(modalHeader);
  
  // Create package options
  CREDIT_PACKAGES.forEach(pkg => {
    const packageOption = document.createElement('div');
    packageOption.style.padding = '12px';
    packageOption.style.border = '1px solid #ddd';
    packageOption.style.borderRadius = '4px';
    packageOption.style.marginBottom = '10px';
    packageOption.style.cursor = 'pointer';
    packageOption.style.transition = 'background-color 0.2s';
    
    // Hover effect
    packageOption.onmouseover = () => {
      packageOption.style.backgroundColor = '#f5f9ff';
    };
    packageOption.onmouseout = () => {
      packageOption.style.backgroundColor = 'white';
    };
    
    // Click handler
    packageOption.onclick = () => {
      document.body.removeChild(modal);
      openRazorpayCheckout(pkg, user);
    };
    
    const packageHeader = document.createElement('div');
    packageHeader.style.display = 'flex';
    packageHeader.style.justifyContent = 'space-between';
    packageHeader.style.marginBottom = '8px';
    
    const packageName = document.createElement('div');
    packageName.textContent = pkg.name;
    packageName.style.fontWeight = 'bold';
    
    const packagePrice = document.createElement('div');
    packagePrice.textContent = `₹${(pkg.amount / 100).toFixed(2)}`;
    packagePrice.style.color = '#34a853';
    packagePrice.style.fontWeight = 'bold';
    
    packageHeader.appendChild(packageName);
    packageHeader.appendChild(packagePrice);
    
    const packageCredits = document.createElement('div');
    packageCredits.textContent = `${pkg.credits} credits`;
    packageCredits.style.fontSize = '14px';
    packageCredits.style.color = '#666';
    
    packageOption.appendChild(packageHeader);
    packageOption.appendChild(packageCredits);
    modalContent.appendChild(packageOption);
  });
  
  modal.appendChild(modalContent);
  document.body.appendChild(modal);
}

// Function to open Razorpay checkout
async function openRazorpayCheckout(package, user) {
  console.log("Opening Razorpay checkout for package:", package);
  
  try {
    // Show loading message
    showStatus('Initializing payment...', 'info');
    
    // Get the auth token
    const authData = await chrome.storage.local.get(['authToken']);
    const token = authData.authToken;
    
    if (!token) {
      throw new Error('Authentication required');
    }
    
    // Create order on the backend
    let orderData;
    try {
      // Create an order through our backend
      const createOrderResponse = await fetch(`${API_URL}/payments/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: package.amount,
          currency: 'INR',
          packageId: package.id,
          credits: package.credits,
          receipt: `chess_credits_${Date.now()}`
        })
      });
      
      if (!createOrderResponse.ok) {
        throw new Error(`Failed to create order: ${createOrderResponse.status}`);
      }
      
      orderData = await createOrderResponse.json();
      console.log("Order created:", orderData);
    } catch (orderError) {
      console.error("Error creating order through backend:", orderError);
      showStatus(`Error creating order: ${orderError.message}`, 'error');
      return;
    }
    
    // Initialize Razorpay options
    const options = {
      key: RAZORPAY_KEY_ID,
      amount: orderData.amount,
      currency: orderData.currency || 'INR',
      name: 'Chess Position Analyzer',
      description: `${package.name} Credits Package`,
      order_id: orderData.id,
      handler: function(response) {
        console.log("Payment successful:", response);
        processSuccessfulPayment(response, package);
      },
      prefill: {
        name: user ? user.full_name : '',
        email: user ? user.email : '',
        contact: ''
      },
      theme: {
        color: '#4285f4'
      },
      modal: {
        ondismiss: function() {
          console.log("Checkout form closed");
          showStatus('Payment cancelled', 'info');
        }
      }
    };
    
    console.log("Razorpay options:", options);
    
    // Open Razorpay checkout
    const rzp = new Razorpay(options);
    rzp.open();
    
    rzp.on('payment.failed', function(response) {
      console.error("Payment failed:", response.error);
      showStatus(`Payment failed: ${response.error.description}`, 'error');
    });
    
  } catch (error) {
    console.error("Error opening Razorpay checkout:", error);
    showStatus(`Error: ${error.message}`, 'error');
  }
}

// Process successful payment
async function processSuccessfulPayment(paymentData, package) {
  console.log("Processing successful payment:", paymentData);
  
  try {
    showStatus('Verifying payment...', 'info');
    
    // Get the auth token
    const authData = await chrome.storage.local.get(['authToken']);
    const token = authData.authToken;
    
    if (!token) {
      throw new Error('Authentication required');
    }
    
    // Verify payment with backend
    const verifyResponse = await fetch(`${API_URL}/payments/verify-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        razorpay_payment_id: paymentData.razorpay_payment_id,
        razorpay_order_id: paymentData.razorpay_order_id,
        razorpay_signature: paymentData.razorpay_signature,
        packageId: package.id,
        credits: package.credits
      })
    });
    
    if (!verifyResponse.ok) {
      throw new Error(`Failed to verify payment: ${verifyResponse.status}`);
    }
    
    const verifyData = await verifyResponse.json();
    
    if (verifyData.verified) {
      // Payment verified successfully
      showStatus('Payment successful! Credits added to your account.', 'success');
      
      // Update UI with new credits count
      updateCreditsDisplay(verifyData.updatedCredits || (package.credits + (authData.userData?.credits || 0)));
      
      // Refresh user data
      setTimeout(() => {
        chrome.runtime.sendMessage({ 
          action: 'fetchUserData',
          token: token
        });
      }, 1000);
      
    } else {
      throw new Error('Payment verification failed');
    }
  } catch (error) {
    console.error("Error processing payment:", error);
    
    // Even if verification fails on our end, the payment might still be successful
    // We should guide the user accordingly
    showStatus(`Payment received but verification had an issue. Please contact support if credits aren't added within a few minutes.`, 'error');
  }
}

// Update credits display in the UI
function updateCreditsDisplay(newCreditsCount) {
  const creditsCountElement = document.querySelector('.credits-count');
  
  if (creditsCountElement) {
    creditsCountElement.textContent = newCreditsCount;
    
    // Add animation effect
    creditsCountElement.style.transition = 'color 0.5s';
    creditsCountElement.style.color = '#34a853';
    
    setTimeout(() => {
      creditsCountElement.style.transition = 'color 1s';
      creditsCountElement.style.color = '#34a853';
    }, 500);
  }
}

// Initialize when DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM content loaded, initializing popup");
  setTimeout(() => {
    initializePopup().catch(error => {
      console.error("Error in popup initialization:", error);
      showStatus("Error initializing popup: " + error.message, "error");
    });
  }, 100); // Small delay to ensure DOM is fully processed
});