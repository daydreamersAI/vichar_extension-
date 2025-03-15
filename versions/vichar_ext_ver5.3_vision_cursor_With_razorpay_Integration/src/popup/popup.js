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
  
  // Credits elements
  const creditsContainer = document.getElementById('creditsContainer');
  const creditsValue = document.getElementById('creditsValue');
  const packageOptions = document.querySelectorAll('.package-option');
  const buyCreditsBtn = document.getElementById('buyCreditsBtn');
  
  // API URL - Updated to match deployed server
  const API_URL = "https://api.beekayprecision.com";  // Using HTTPS for security
  
  // Razorpay Key ID
  const RAZORPAY_KEY_ID = "rzp_test_JB7DxS1VpotPXc"; // Replace with your actual key
  
  console.log("Popup initialized");

  // Test API connectivity
  testApiConnectivity();

  // Check if user is already logged in
  checkAuthStatus();

  // If logged in, fetch credits and display packages
  if (isLoggedIn()) {
    fetchUserCredits();
    displayCreditPackages();
    document.getElementById('credits-container').classList.remove('hidden');
  }

  // Helper function to ensure content script is loaded before sending messages
  async function ensureContentScriptLoaded(tabId) {
    return new Promise((resolve, reject) => {
      try {
        console.log(`Checking if content script is loaded in tab ${tabId}`);
        
        // First check if the tab exists and is a valid webpage
        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError) {
            console.error("Tab error:", chrome.runtime.lastError);
            reject(new Error("Invalid tab ID"));
            return;
          }
          
          // Verify this is a normal webpage (not a chrome:// page)
          if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) {
            console.error("Cannot inject script into this page type:", tab.url);
            reject(new Error("Cannot inject script into this page type"));
            return;
          }
          
          // Try to ping the content script
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
                
                // Wait a moment to ensure script is initialized
                setTimeout(() => resolve(), 500);
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
        });
      } catch (error) {
        console.error("Error in ensureContentScriptLoaded:", error);
        reject(error);
      }
    });
  }
  
  // When the capture button is clicked (for standalone analysis page)
  if (captureButton) {
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
  }
  
  // When the sidebar button is clicked
  if (sidebarButton) {
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
          { action: "showSidebar" },  // Change this to showSidebar for more reliable behavior
          (response) => {
            if (chrome.runtime.lastError) {
              console.error("Error sending message:", chrome.runtime.lastError);
              showStatus('Error communicating with the page.', 'error');
              return;
            }
            
            if (response && response.success) {
              showStatus('Sidebar opened successfully.', 'success');
            } else {
              showStatus(response?.message || 'Failed to open the sidebar.', 'error');
            }
          }
        );
      } catch (error) {
        console.error("Error in sidebar button click handler:", error);
        showStatus('An error occurred: ' + error.message, 'error');
      }
    });
  }

  // Authentication functions
  function checkAuthStatus() {
    console.log("Checking authentication status");
    
    // Check if user is logged in by looking for token in localStorage
    const token = localStorage.getItem('auth_token');
    const userName = localStorage.getItem('user_name');
    
    // Make sure all required elements exist before trying to access them
    const userInfoDiv = document.getElementById('userInfo');
    const authContainerDiv = document.getElementById('authContainer');
    const userNameSpan = document.getElementById('userName');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const captureButton = document.getElementById('captureBtn');
    const sidebarButton = document.getElementById('sidebarBtn');
    const creditsContainer = document.getElementById('creditsContainer');
    
    console.log("Elements found:", {
      userInfoDiv: !!userInfoDiv,
      authContainerDiv: !!authContainerDiv,
      userNameSpan: !!userNameSpan,
      loginForm: !!loginForm,
      registerForm: !!registerForm,
      captureButton: !!captureButton,
      sidebarButton: !!sidebarButton,
      creditsContainer: !!creditsContainer
    });
    
    if (token && userName) {
      // User is logged in
      console.log("User is logged in:", userName);
      
      if (userNameSpan) userNameSpan.textContent = userName;
      if (userInfoDiv) userInfoDiv.classList.remove('hidden');
      if (authContainerDiv) authContainerDiv.classList.add('hidden');
      if (loginForm) loginForm.classList.add('hidden');
      if (registerForm) registerForm.classList.add('hidden');
      
      // Enable buttons
      if (captureButton) captureButton.disabled = false;
      if (sidebarButton) sidebarButton.disabled = false;
      
      // Show credits container and fetch user credits
      if (creditsContainer) creditsContainer.classList.remove('hidden');
      if (isFunction(fetchUserCredits)) fetchUserCredits();
    } else {
      // User is not logged in
      console.log("User is not logged in");
      
      if (userInfoDiv) userInfoDiv.classList.add('hidden');
      if (authContainerDiv) authContainerDiv.classList.remove('hidden');
      if (loginForm) loginForm.classList.remove('hidden');
      if (registerForm) registerForm.classList.add('hidden');
      
      // Hide credits container
      if (creditsContainer) creditsContainer.classList.add('hidden');
      
      // Disable buttons
      if (captureButton) captureButton.disabled = true;
      if (sidebarButton) sidebarButton.disabled = true;
    }
  }
  
  // Helper to check if something is a function
  function isFunction(functionToCheck) {
    return functionToCheck && {}.toString.call(functionToCheck) === '[object Function]';
  }
  
  // Check if user is logged in
  function isLoggedIn() {
    return !!localStorage.getItem('auth_token');
  }

  // Toggle between login and register forms
  if (showRegisterBtn) {
    showRegisterBtn.addEventListener('click', () => {
      if (loginForm) loginForm.classList.add('hidden');
      if (registerForm) registerForm.classList.remove('hidden');
    });
  }

  if (showLoginBtn) {
    showLoginBtn.addEventListener('click', () => {
      if (registerForm) registerForm.classList.add('hidden');
      if (loginForm) loginForm.classList.remove('hidden');
    });
  }

  // Handle login
  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      const email = document.getElementById('loginEmail')?.value || '';
      const password = document.getElementById('loginPassword')?.value || '';
      
      if (!email || !password) {
        showStatus('Please enter both email and password.', 'error');
        return;
      }
      
      try {
        showStatus('Logging in...', 'info');
        
        // First check if login endpoint is available
        const isLoginEndpointAvailable = await checkLoginEndpoint();
        if (!isLoginEndpointAvailable) {
          throw new Error("Login service is currently unavailable. Please try again later.");
        }
        
        // Log what we're about to do
        console.log(`Attempting to login with email: ${email} to API: ${API_URL}/login`);
        
        // Add a timeout to the fetch request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
        
        try {
          // Call the API to login
          const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({ email, password }),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          console.log(`Login response status: ${response.status}`);
          
          // Check for errors
          if (!response.ok) {
            const errorText = await response.text();
            console.error("API error response:", errorText);
            
            let errorData;
            try {
              errorData = JSON.parse(errorText);
            } catch (e) {
              console.error("Failed to parse error response as JSON:", e);
              throw new Error(`Login failed: Server returned ${response.status} ${response.statusText}`);
            }
            
            throw new Error(errorData.detail || 'Login failed');
          }
          
          // Parse response data
          const responseText = await response.text();
          console.log("Login response text:", responseText);
          
          let data;
          try {
            data = JSON.parse(responseText);
          } catch (e) {
            console.error("Failed to parse response as JSON:", e);
            throw new Error("Invalid response from server");
          }
          
          console.log("Login successful, received data:", data);
          
          // Store token and user info in localStorage (for popup use)
          localStorage.setItem('auth_token', data.access_token);
          localStorage.setItem('user_id', data.user_id);
          localStorage.setItem('user_name', data.name);
          
          // Also store in chrome.storage.local (for content script access)
          chrome.storage.local.set({
            'auth_token': data.access_token,
            'user_id': data.user_id,
            'user_name': data.name
          }, () => {
            console.log("Auth data saved to chrome.storage.local");
          });
          
          // Update UI
          showStatus('Login successful!', 'success');
          checkAuthStatus();
          
          // Notify all open tabs that user logged in
          console.log("Notifying all tabs about successful login");
          chrome.tabs.query({}, (tabs) => {
            console.log(`Found ${tabs.length} tabs to notify`);
            const notificationPromises = tabs.map(tab => {
              return new Promise((resolve) => {
                try {
                  // Skip chrome:// and other restricted URLs
                  if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) {
                    console.log(`Skipping tab ${tab.id} with restricted URL: ${tab.url}`);
                    resolve(false);
                    return;
                  }
                  
                  console.log(`Sending login notification to tab ${tab.id}`);
                  chrome.tabs.sendMessage(tab.id, { action: "userLoggedIn" }, (response) => {
                    if (chrome.runtime.lastError) {
                      console.log(`No content script in tab ${tab.id}: ${chrome.runtime.lastError.message}`);
                      resolve(false);
                    } else {
                      console.log(`Tab ${tab.id} notified successfully:`, response);
                      resolve(true);
                    }
                  });
                } catch (err) {
                  console.error(`Error notifying tab ${tab.id}:`, err);
                  resolve(false);
                }
              });
            });
            
            // Wait for all notifications to complete
            Promise.all(notificationPromises).then(results => {
              const successCount = results.filter(Boolean).length;
              console.log(`Successfully notified ${successCount} of ${tabs.length} tabs`);
            });
          });
        } catch (fetchError) {
          clearTimeout(timeoutId);
          
          // Check for specific fetch errors
          if (fetchError.name === 'AbortError') {
            console.error("Fetch request timed out");
            throw new Error("Request timed out. The server might be overloaded or unreachable.");
          } else if (fetchError.message.includes('NetworkError') || fetchError.message.includes('Failed to fetch')) {
            console.error("Network error during login:", fetchError);
            
            // Try fallback method with XMLHttpRequest
            console.log("Trying login with XMLHttpRequest as fallback...");
            await loginWithXHR(email, password);
          } else {
            throw fetchError;
          }
        }
      } catch (error) {
        console.error('Login error:', error);
        showStatus('Login failed: ' + error.message, 'error');
      }
    });
  }

  // Fallback login function using XMLHttpRequest
  async function loginWithXHR(email, password) {
    return new Promise((resolve, reject) => {
      console.log("Attempting login with XMLHttpRequest");
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/login`, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Accept', 'application/json');
      
      xhr.timeout = 15000; // 15 second timeout
      
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
          console.log("XHR login response status:", xhr.status);
          
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              console.log("Login successful via XHR, received data:", data);
              
              // Store token and user info
              localStorage.setItem('auth_token', data.access_token);
              localStorage.setItem('user_id', data.user_id);
              localStorage.setItem('user_name', data.name);
              
              // Update UI
              showStatus('Login successful!', 'success');
              checkAuthStatus();
              
              // Notify all open tabs that user logged in
              chrome.tabs.query({}, (tabs) => {
                tabs.forEach((tab) => {
                  try {
                    chrome.tabs.sendMessage(tab.id, { action: "userLoggedIn" });
                  } catch (err) {
                    console.log("Could not send login message to tab:", tab.id, err);
                  }
                });
              });
              
              resolve(data);
            } catch (e) {
              console.error("XHR Login response parse error:", e);
              reject(new Error("Invalid response from server"));
            }
          } else if (xhr.status === 0) {
            console.error("XHR Login - No response from server (status 0)");
            reject(new Error("Unable to connect to the server. Please check your connection."));
          } else {
            console.error("XHR Login error response:", xhr.status, xhr.statusText, xhr.responseText);
            reject(new Error(`Login failed: Server returned ${xhr.status} ${xhr.statusText}`));
          }
        }
      };
      
      xhr.onerror = function() {
        console.error("XHR Login network error occurred");
        reject(new Error("Network error occurred. Please check your internet connection."));
      };
      
      xhr.ontimeout = function() {
        console.error("XHR Login request timed out");
        reject(new Error("Request timed out. The server might be overloaded or unreachable."));
      };
      
      xhr.send(JSON.stringify({ email, password }));
    });
  }

  // Handle registration
  if (registerBtn) {
    registerBtn.addEventListener('click', async () => {
      const name = document.getElementById('registerName')?.value || '';
      const email = document.getElementById('registerEmail')?.value || '';
      const password = document.getElementById('registerPassword')?.value || '';
      
      if (!name || !email || !password) {
        showStatus('Please fill in all fields.', 'error');
        return;
      }
      
      try {
        showStatus('Registering...', 'info');
        
        // Call the API to register
        const response = await fetch(`${API_URL}/register`, {
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
        
        // Store token and user info
        localStorage.setItem('auth_token', data.access_token);
        localStorage.setItem('user_id', data.user_id);
        localStorage.setItem('user_name', data.name);
        
        showStatus('Registration successful!', 'success');
        checkAuthStatus();
        
        // Notify all open tabs that user logged in
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach((tab) => {
            try {
              chrome.tabs.sendMessage(tab.id, { action: "userLoggedIn" });
            } catch (err) {
              console.log("Could not send login message to tab:", tab.id, err);
            }
          });
        });
        
      } catch (error) {
        console.error('Registration error:', error);
        showStatus('Registration failed: ' + error.message, 'error');
      }
    });
  }

  // Handle logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      // Clear authentication data from localStorage
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_id');
      localStorage.removeItem('user_name');
      
      // Also clear from chrome.storage.local
      chrome.storage.local.remove(['auth_token', 'user_id', 'user_name'], () => {
        console.log("Auth data removed from chrome.storage.local");
      });
      
      // Update UI
      checkAuthStatus();
      
      showStatus('Logged out successfully.', 'success');
    });
  }
  
  // Credits functionality
  
  // Fetch user credits
  async function fetchUserCredits() {
    if (!isLoggedIn()) {
      updateCreditsDisplay(0);
      return;
    }
    
    try {
      const token = localStorage.getItem('auth_token');
      
      const response = await fetch(`${API_URL}/user/credits`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.error('Failed to fetch credits:', await response.text());
        return;
      }
      
      const data = await response.json();
      updateCreditsDisplay(data.credits);
      
    } catch (error) {
      console.error('Error fetching credits:', error);
    }
  }
  
  // Update the credits display in the UI
  function updateCreditsDisplay(credits) {
    const creditsElement = document.getElementById('user-credits');
    if (creditsElement) {
      creditsElement.textContent = credits;
    }
  }
  
  // Display available credit packages
  async function displayCreditPackages() {
    if (!isLoggedIn()) {
      return;
    }
    
    try {
      const token = localStorage.getItem('auth_token');
      
      const response = await fetch(`${API_URL}/payments/credits/packages`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.error('Failed to fetch credit packages:', await response.text());
        return;
      }
      
      const data = await response.json();
      const packagesContainer = document.getElementById('credit-packages');
      
      if (!packagesContainer) return;
      
      // Clear existing packages
      packagesContainer.innerHTML = '';
      
      // Add packages to the UI
      for (const [id, pkg] of Object.entries(data.packages)) {
        const packageElement = document.createElement('div');
        packageElement.className = 'credit-package';
        packageElement.innerHTML = `
          <h3>${pkg.credits} Credits</h3>
          <p class="price">₹${(pkg.amount / 100).toFixed(2)}</p>
          <p class="description">${pkg.description}</p>
          <button class="buy-credits-btn" data-package="${id}" data-credits="${pkg.credits}">Buy Now</button>
        `;
        packagesContainer.appendChild(packageElement);
      }
      
    } catch (error) {
      console.error('Error displaying packages:', error);
    }
  }
  
  // Set up package option selection
  packageOptions.forEach(option => {
    option.addEventListener('click', () => {
      // Remove selected class from all options
      packageOptions.forEach(opt => opt.classList.remove('selected'));
      
      // Add selected class to clicked option
      option.classList.add('selected');
      
      // Update buy button text and enable it
      const packageId = option.getAttribute('data-package');
      const credits = option.getAttribute('data-credits');
      const amount = option.getAttribute('data-amount');
      
      buyCreditsBtn.textContent = `Buy ${credits} Credits`;
      buyCreditsBtn.disabled = false;
      
      // Store selected package data
      buyCreditsBtn.setAttribute('data-package', packageId);
      buyCreditsBtn.setAttribute('data-credits', credits);
      buyCreditsBtn.setAttribute('data-amount', amount);
    });
  });
  
  // Handle buy credits button click
  if (buyCreditsBtn) {
    buyCreditsBtn.addEventListener('click', async () => {
      try {
        const token = localStorage.getItem('auth_token');
        
        if (!token) {
          showStatus('Please log in to buy credits.', 'error');
          return;
        }
        
        const packageId = buyCreditsBtn.getAttribute('data-package');
        const credits = parseInt(buyCreditsBtn.getAttribute('data-credits'));
        const amount = parseInt(buyCreditsBtn.getAttribute('data-amount'));
        
        if (!packageId || !credits || !amount) {
          showStatus('Please select a package.', 'error');
          return;
        }
        
        showStatus('Creating payment order...', 'info');
        
        // Create order via API
        const orderResponse = await fetch(`${API_URL}/payments/create-order`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            package_id: packageId
          })
        });
        
        if (!orderResponse.ok) {
          const errorData = await orderResponse.json();
          throw new Error(errorData.detail || 'Failed to create order');
        }
        
        const orderData = await orderResponse.json();
        
        // Initialize Razorpay checkout
        const options = {
          key: RAZORPAY_KEY_ID,
          amount: orderData.amount,
          currency: orderData.currency || 'INR',
          name: 'Chess Position Analyzer',
          description: `${packageId.charAt(0).toUpperCase() + packageId.slice(1)} Package - ${credits} Credits`,
          order_id: orderData.id,
          handler: function(response) {
            // Handle successful payment
            verifyPayment(response, packageId, credits);
          },
          prefill: {
            name: localStorage.getItem('user_name') || '',
            email: '',
            contact: ''
          },
          theme: {
            color: '#4285f4'
          },
          modal: {
            ondismiss: function() {
              showStatus('Payment cancelled', 'info');
            }
          }
        };
        
        const rzp = new Razorpay(options);
        rzp.open();
        
      } catch (error) {
        console.error('Error buying credits:', error);
        showStatus(`Error: ${error.message}`, 'error');
      }
    });
  }
  
  // Verify payment with backend
  async function verifyPayment(paymentResponse, packageId, credits) {
    try {
      showStatus('Verifying payment...', 'info');
      
      const token = localStorage.getItem('auth_token');
      
      if (!token) {
        throw new Error('Authentication required');
      }
      
      // Verify payment with backend
      const verifyResponse = await fetch(`${API_URL}/payments/verify-payment`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          razorpay_payment_id: paymentResponse.razorpay_payment_id,
          razorpay_order_id: paymentResponse.razorpay_order_id,
          razorpay_signature: paymentResponse.razorpay_signature,
          package_id: packageId,
          credits: credits
        })
      });
      
      if (!verifyResponse.ok) {
        const errorData = await verifyResponse.json();
        throw new Error(errorData.detail || 'Payment verification failed');
      }
      
      const verifyData = await verifyResponse.json();
      
      // Update UI with success message
      showStatus(`Payment successful! Added ${verifyData.credits_added} credits.`, 'success');
      
      // Update credits display
      fetchUserCredits();
      
    } catch (error) {
      console.error('Error verifying payment:', error);
      showStatus(`Payment verification failed: ${error.message}`, 'error');
    }
  }

  // Status message display
  function showStatus(message, type = 'info') {
    console.log(`Status message: ${message} (${type})`);
    
    let statusContainer = document.getElementById('statusContainer');
    let statusMessage = document.getElementById('statusMessage');
    
    // If elements don't exist, create them
    if (!statusContainer) {
      console.log("Creating missing statusContainer element");
      statusContainer = document.createElement('div');
      statusContainer.id = 'statusContainer';
      statusContainer.className = 'status';
      document.body.appendChild(statusContainer);
    }
    
    if (!statusMessage) {
      console.log("Creating missing statusMessage element");
      statusMessage = document.createElement('p');
      statusMessage.id = 'statusMessage';
      statusContainer.appendChild(statusMessage);
    }
    
    // Set the message text
    statusMessage.textContent = message;
    
    // Remove existing status classes
    statusContainer.classList.remove('success', 'error', 'info', 'hidden');
    
    // Add appropriate class based on type
    statusContainer.classList.add(type);
    
    // Add extra styling for errors to make them more visible
    if (type === 'error') {
      statusMessage.style.fontWeight = 'bold';
      statusContainer.style.border = '2px solid #d32f2f';
      statusContainer.style.padding = '10px';
      // Don't auto-hide errors
    } else {
      statusMessage.style.fontWeight = 'normal';
      statusContainer.style.border = 'none';
      statusContainer.style.padding = '8px';
      
      // Auto-hide after 5 seconds for success and info messages
      setTimeout(() => {
        statusContainer.classList.add('hidden');
      }, 5000);
    }
  }

  // Test API connectivity
  async function testApiConnectivity() {
    try {
      console.log(`Testing API connectivity to ${API_URL}`);
      showStatus('Checking server connection...', 'info');
      
      const response = await fetch(`${API_URL}/`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Cache-Control': 'no-cache'
        },
        mode: 'cors',
        cache: 'no-cache'
      });
      
      console.log(`API connectivity test: Status ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        console.log('API server is reachable.');
        showStatus('Server connected!', 'success');
      } else {
        console.error(`API server returned error: ${response.status} ${response.statusText}`);
        showStatus('Warning: Server responded with an error.', 'error');
      }
    } catch (error) {
      console.error('API connectivity test failed:', error);
      showStatus('Error connecting to server. Login may not work.', 'error');
      
      // Try with XHR as fallback
      const xhr = new XMLHttpRequest();
      xhr.open('GET', `${API_URL}/`, true);
      xhr.timeout = 5000;
      
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
          if (xhr.status >= 200 && xhr.status < 300) {
            console.log('API server is reachable via XHR.');
            showStatus('Server connected via alternative method!', 'success');
          } else {
            console.error(`XHR test failed: ${xhr.status} ${xhr.statusText}`);
          }
        }
      };
      
      xhr.onerror = function() {
        console.error('XHR connection test failed with network error');
        showStatus('Cannot connect to server. Check your internet connection.', 'error');
      };
      
      xhr.send();
    }
  }

  // Check if login endpoint is available
  async function checkLoginEndpoint() {
    try {
      console.log("Testing login endpoint availability");
      
      // Use OPTIONS request to check if endpoint is available
      const response = await fetch(`${API_URL}/login`, {
        method: 'OPTIONS',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        mode: 'cors',
        cache: 'no-cache'
      });
      
      console.log(`Login endpoint check: Status ${response.status}`);
      
      // If we get any response, consider the endpoint available
      return true;
    } catch (error) {
      console.error("Login endpoint check failed:", error);
      
      // Try XHR as fallback
      try {
        return await new Promise((resolve) => {
          const xhr = new XMLHttpRequest();
          xhr.open('OPTIONS', `${API_URL}/login`, true);
          xhr.timeout = 5000;
          
          xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
              console.log(`XHR login endpoint check: Status ${xhr.status}`);
              resolve(true);  // If we get any response, endpoint is available
            }
          };
          
          xhr.onerror = function() {
            console.error("XHR login endpoint check failed");
            resolve(false);
          };
          
          xhr.ontimeout = function() {
            console.error("XHR login endpoint check timed out");
            resolve(false);
          };
          
          xhr.send();
        });
      } catch (xhrError) {
        console.error("XHR fallback also failed:", xhrError);
        return false;
      }
    }
  }
});