document.addEventListener('DOMContentLoaded', function() {
  const captureButton = document.getElementById('captureBtn');
  const sidebarButton = document.getElementById('sidebarBtn');
  const statusDiv = document.getElementById('status');
  
  // Authentication elements
  const userInfoDiv = document.getElementById('userInfo');
  const authContainerDiv = document.getElementById('authContainer');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const loginBtn = document.getElementById('loginBtn');
  const registerBtn = document.getElementById('registerBtn');
  const showRegisterBtn = document.getElementById('showRegisterBtn');
  const showLoginBtn = document.getElementById('showLoginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const userNameSpan = document.getElementById('userName');
  
  console.log("Popup initialized");

  // Check if user is already logged in
  checkAuthStatus();

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
  
  // When the capture button is clicked (for standalone analysis page)
  captureButton.addEventListener('click', async () => {
    console.log("Capture button clicked");
    
    // Check if user is logged in
    if (!isLoggedIn()) {
      showStatus('Please log in to use this feature.', 'error');
      return;
    }
    
    try {
      // Get the current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      console.log("Current tab:", tab);
      
      if (!tab) {
        showStatus('Could not determine current tab.', 'error');
        return;
      }
      
      // Ensure content script is loaded
      await ensureContentScriptLoaded(tab.id);
      
      // Send message to content script to capture the board
      chrome.tabs.sendMessage(
        tab.id,
        { action: "captureBoard" },
        async (response) => {
          if (chrome.runtime.lastError) {
            console.error("Error sending message:", chrome.runtime.lastError);
            showStatus('Error communicating with the page.', 'error');
            return;
          }
          
          if (!response || !response.success) {
            showStatus(response?.message || 'Failed to capture the chess board.', 'error');
            return;
          }
          
          console.log("Captured data:", response);
          
          // Store the captured data in local storage for the analysis page
          chrome.storage.local.set({
            capturedData: {
              imageData: response.imageData,
              fen: response.fen,
              pgn: response.pgn,
              timestamp: new Date().toISOString()
            }
          }, () => {
            // Open the analysis page in a new tab
            chrome.tabs.create({ url: chrome.runtime.getURL("src/analysis/analysis.html") });
          });
        }
      );
    } catch (error) {
      console.error("Error in capture button click handler:", error);
      showStatus('An error occurred: ' + error.message, 'error');
    }
  });
  
  // When the sidebar button is clicked
  sidebarButton.addEventListener('click', async () => {
    console.log("Sidebar button clicked");
    
    // Check if user is logged in
    if (!isLoggedIn()) {
      showStatus('Please log in to use this feature.', 'error');
      return;
    }
    
    try {
      // Get the current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab) {
        showStatus('Could not determine current tab.', 'error');
        return;
      }
      
      // Ensure content script is loaded
      await ensureContentScriptLoaded(tab.id);
      
      // Send message to content script to toggle the sidebar
      chrome.tabs.sendMessage(
        tab.id,
        { action: "toggleSidebar" },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error("Error sending message:", chrome.runtime.lastError);
            showStatus('Error communicating with the page.', 'error');
            return;
          }
          
          if (response && response.success) {
            showStatus('Sidebar ' + (response.isOpen ? 'opened' : 'closed') + ' successfully.', 'success');
          } else {
            showStatus(response?.message || 'Failed to toggle the sidebar.', 'error');
          }
        }
      );
    } catch (error) {
      console.error("Error in sidebar button click handler:", error);
      showStatus('An error occurred: ' + error.message, 'error');
    }
  });

  // Authentication functions
  function checkAuthStatus() {
    // Check if user is logged in by looking for token in localStorage
    const token = localStorage.getItem('auth_token');
    const userName = localStorage.getItem('user_name');
    
    if (token && userName) {
      // User is logged in
      userNameSpan.textContent = userName;
      userInfoDiv.classList.remove('hidden');
      authContainerDiv.classList.add('hidden');
      
      // Enable buttons
      captureButton.disabled = false;
      sidebarButton.disabled = false;
    } else {
      // User is not logged in
      userInfoDiv.classList.add('hidden');
      authContainerDiv.classList.remove('hidden');
      loginForm.classList.remove('hidden');
      registerForm.classList.add('hidden');
      
      // Disable buttons
      captureButton.disabled = true;
      sidebarButton.disabled = true;
    }
  }
  
  // Check if user is logged in
  function isLoggedIn() {
    return !!localStorage.getItem('auth_token');
  }

  // Toggle between login and register forms
  showRegisterBtn.addEventListener('click', () => {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
  });

  showLoginBtn.addEventListener('click', () => {
    registerForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
  });

  // Handle login
  loginBtn.addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
      showStatus('Please enter both email and password.', 'error');
      return;
    }
    
    try {
      showStatus('Logging in...', 'info');
      
      // Call the API to login
      const response = await fetch('https://api.beekayprecision.com/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Login failed');
      }
      
      const data = await response.json();
      
      // Store the token and user info
      localStorage.setItem('auth_token', data.access_token);
      localStorage.setItem('user_id', data.user_id);
      localStorage.setItem('user_name', data.name);
      
      showStatus('Login successful!', 'success');
      
      // Update UI
      checkAuthStatus();
    } catch (error) {
      console.error('Login error:', error);
      showStatus('Login failed: ' + error.message, 'error');
    }
  });

  // Handle registration
  registerBtn.addEventListener('click', async () => {
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    
    if (!name || !email || !password) {
      showStatus('Please fill in all fields.', 'error');
      return;
    }
    
    try {
      showStatus('Registering...', 'info');
      
      // Call the API to register
      const response = await fetch('https://api.beekayprecision.com/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, email, password })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Registration failed');
      }
      
      const data = await response.json();
      
      // Store the token and user info
      localStorage.setItem('auth_token', data.access_token);
      localStorage.setItem('user_id', data.user_id);
      localStorage.setItem('user_name', data.name);
      
      showStatus('Registration successful!', 'success');
      
      // Update UI
      checkAuthStatus();
    } catch (error) {
      console.error('Registration error:', error);
      showStatus('Registration failed: ' + error.message, 'error');
    }
  });

  // Handle logout
  logoutBtn.addEventListener('click', () => {
    // Clear authentication data
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_name');
    
    // Update UI
    checkAuthStatus();
    
    showStatus('Logged out successfully.', 'success');
  });
  
  // Helper function to show status messages
  function showStatus(message, type = 'info') {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
    statusDiv.style.display = 'block';
    
    // Hide the status message after 5 seconds
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 5000);
  }
});