document.addEventListener('DOMContentLoaded', function() {
    // --- Get DOM Elements ---
    const captureButton = document.getElementById('captureBtn'); // For New Tab analysis
    const sidebarButton = document.getElementById('sidebarBtn'); // For toggling sidebar
    // Auth Elements
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
    // Credits Elements
    const creditsContainerEl = document.getElementById('creditsContainer'); // Main container for credits info+purchase
    const userCreditsSpan = document.getElementById('user-credits'); // Span showing current balance
    const creditPackagesDiv = document.getElementById('credit-packages'); // Div where package buttons are added
    // Status Elements
    const statusContainer = document.getElementById('statusContainer');
    const statusMessage = document.getElementById('statusMessage');
  
    // --- Configuration ---
    const API_URL = "https://api.beekayprecision.com"; // Use HTTPS
  
    console.log("Popup script loaded.");
  
    // --- Initial Setup ---
    testApiConnectivity(); // Check backend connection on load
    checkAuthStatus(); // Update UI based on login state
  
  
    // --- Helper Functions ---
  
    function showStatus(message, type = 'info', duration = 5000) {
        console.log(`Status: [${type}] ${message}`);
        if (!statusContainer || !statusMessage) {
            console.error("Status elements not found!");
            alert(`[${type}] ${message}`); // Fallback alert
            return;
        }
        statusMessage.textContent = message;
        statusContainer.className = 'status'; // Base class
        statusContainer.classList.add(type); // Add type class (info, success, error)
        statusContainer.classList.remove('hidden'); // Make visible
  
        // Auto-hide for info and success, keep error visible longer
        if ((type === 'info' || type === 'success') && duration > 0) {
            setTimeout(() => {
                // Hide only if the message hasn't changed in the meantime
                if (statusMessage.textContent === message) {
                    statusContainer.classList.add('hidden');
                }
            }, duration);
        } else if (type === 'error') {
             // Keep errors visible longer (e.g., 10 seconds) or indefinitely (duration=0)
             if (duration > 0) {
                 setTimeout(() => {
                     if (statusMessage.textContent === message) {
                          statusContainer.classList.add('hidden');
                     }
                 }, duration);
             }
        }
    }
  
    async function getCurrentTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) throw new Error("Could not find active tab.");
            if (!tab.id) throw new Error("Active tab has no ID.");
             // Check if the URL is accessible (basic check)
             if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) {
                 throw new Error("Cannot interact with the current page type.");
             }
            return tab;
        } catch (error) {
            showStatus(`Error getting current tab: ${error.message}`, 'error');
            throw error; // Re-throw to stop the calling function
        }
    }
  
    // --- Authentication Logic ---
  
    function isLoggedIn() {
        // Check localStorage first for quick access
        return !!localStorage.getItem('auth_token');
    }
  
    async function checkAuthStatus() {
        console.log("Checking auth status...");
        let loggedIn = isLoggedIn();
        let userName = localStorage.getItem('user_name');
  
        // If not in localStorage, check chrome.storage.local (might have been set by background)
        if (!loggedIn) {
            try {
                 const result = await chrome.storage.local.get(['auth_token', 'user_name']);
                 if (result.auth_token) {
                      loggedIn = true;
                      userName = result.user_name || 'User';
                      // Sync back to localStorage for consistency
                      localStorage.setItem('auth_token', result.auth_token);
                      if (userName) localStorage.setItem('user_name', userName);
                 }
            } catch (storageError) {
                 console.error("Error accessing chrome.storage.local:", storageError);
            }
        }
  
        // Update UI based on login status
        if (loggedIn && userName) {
            console.log("User is logged in:", userName);
            if (userNameSpan) userNameSpan.textContent = userName;
            if (userInfoDiv) userInfoDiv.classList.remove('hidden');
            if (authContainerDiv) authContainerDiv.classList.add('hidden');
            if (captureButton) captureButton.disabled = false;
            if (sidebarButton) sidebarButton.disabled = false;
            if (creditsContainerEl) creditsContainerEl.classList.remove('hidden');
            await fetchUserCredits(); // Fetch credits only when logged in
            await displayCreditPackages(); // Display packages only when logged in
        } else {
            console.log("User is not logged in");
            if (userInfoDiv) userInfoDiv.classList.add('hidden');
            if (authContainerDiv) authContainerDiv.classList.remove('hidden');
            if (loginForm) loginForm.classList.remove('hidden');
            if (registerForm) registerForm.classList.add('hidden');
            if (captureButton) captureButton.disabled = true;
            if (sidebarButton) sidebarButton.disabled = true;
            if (creditsContainerEl) creditsContainerEl.classList.add('hidden');
            if (userCreditsSpan) userCreditsSpan.textContent = '0'; // Show 0 credits when logged out
            if (creditPackagesDiv) creditPackagesDiv.innerHTML = ''; // Clear packages
        }
    }
  
    // Helper to format token for storage (ensures Bearer prefix if needed by backend, otherwise remove)
    function formatToken(token) {
        if (!token) return token;
        // ** Adjust this based on what your backend expects in the Authorization header **
        // Option 1: Add 'Bearer ' if missing
        // return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
        // Option 2: Remove 'Bearer ' if present (if backend adds it)
         return token.startsWith('Bearer ') ? token.substring(7) : token;
    }
  
    async function handleLoginSuccess(data) {
        if (!data || !data.access_token) {
            showStatus('Login error: Invalid response from server', 'error');
            console.error('Login error: Invalid response (missing token)');
            return;
        }
  
        const formattedToken = formatToken(data.access_token); // Use formatted token
  
        try {
            // Store in localStorage for quick access
            localStorage.setItem('auth_token', formattedToken);
            localStorage.setItem('user_id', data.user_id);
            localStorage.setItem('user_name', data.name);
  
            // Also store in chrome.storage for persistence
            await chrome.storage.local.set({
                'auth_token': formattedToken,
                'user_id': data.user_id,
                'user_name': data.name
            });
  
            showStatus('Login successful!', 'success');
            await checkAuthStatus(); // Update UI (fetches credits, shows packages)
  
            // Notify content scripts about login
            chrome.tabs.query({}, (tabs) => {
                tabs.forEach((tab) => {
                    if (tab.id && tab.url && !tab.url.startsWith("chrome")) {
                        chrome.tabs.sendMessage(tab.id, { action: "userLoggedIn" }, resp => {
                            if (chrome.runtime.lastError) { /* Ignore errors like "no receiving end" */ }
                        });
                    }
                });
            });
  
        } catch (error) {
            console.error('Login error:', error);
            const errorMsg = (error.name === 'AbortError') ? "Request timed out." : error.message;
            showStatus(`Login failed: ${errorMsg}`, 'error');
        }
    }
  
    // Login Handler
    if (loginBtn) loginBtn.addEventListener('click', async () => {
        const emailInput = document.getElementById('loginEmail');
        const passwordInput = document.getElementById('loginPassword');
        const email = emailInput ? emailInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';
        if (!email || !password) { showStatus('Please enter email and password.', 'error'); return; }
  
        loginBtn.disabled = true;
        loginBtn.textContent = 'Logging in...';
        showStatus('Logging in...', 'info');
  
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
            const response = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ email, password }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
  
            const data = await response.json(); // Always try to parse JSON
  
            if (!response.ok) {
                 throw new Error(data.detail || `Login failed (${response.status})`);
            }
  
            console.log("Login successful:", data);
            await handleLoginSuccess(data);
  
        } catch (error) {
            console.error('Login error:', error);
            const errorMsg = (error.name === 'AbortError') ? "Request timed out." : error.message;
            showStatus(`Login failed: ${errorMsg}`, 'error');
        } finally {
             loginBtn.disabled = false;
             loginBtn.textContent = 'Login';
        }
    });
  
    // Registration Handler
    if (registerBtn) registerBtn.addEventListener('click', async () => {
        const nameInput = document.getElementById('registerName');
        const emailInput = document.getElementById('registerEmail');
        const passwordInput = document.getElementById('registerPassword');
        const name = nameInput ? nameInput.value.trim() : '';
        const email = emailInput ? emailInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';
        if (!name || !email || !password) { showStatus('Please fill all fields.', 'error'); return; }
  
        registerBtn.disabled = true;
        registerBtn.textContent = 'Registering...';
        showStatus('Registering...', 'info');
  
        try {
            const response = await fetch(`${API_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password })
            });
            const data = await response.json();
            if (!response.ok) { throw new Error(data.detail || 'Registration failed'); }
  
            console.log("Register successful:", data);
            await handleLoginSuccess(data); // Use the same login success handler
  
        } catch (error) {
            console.error('Registration error:', error);
            showStatus(`Registration failed: ${error.message}`, 'error');
        } finally {
            registerBtn.disabled = false;
            registerBtn.textContent = 'Register';
        }
    });
  
    // Logout Handler
    if (logoutBtn) logoutBtn.addEventListener('click', async () => {
        console.log("Logout clicked");
        // Clear all relevant storage
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_id');
        localStorage.removeItem('user_name');
        localStorage.removeItem('user_credits'); // Clear cached credits
        await chrome.storage.local.remove(['auth_token', 'user_id', 'user_name', 'user_credits']);
        await chrome.storage.session.remove(['paymentDataForPopup']); // Clear any pending payment context
        showStatus('Logged out.', 'success');
        await checkAuthStatus(); // Update UI immediately
        // Optionally notify content scripts about logout
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach((tab) => {
                if (tab.id && tab.url && !tab.url.startsWith("chrome")) {
                    chrome.tabs.sendMessage(tab.id, { action: "userLoggedOut" }, resp => {
                        if (chrome.runtime.lastError) { /* Ignore errors */ }
                    });
                }
            });
        });
    });
  
    // Toggle between Login/Register Forms
    if (showRegisterBtn) showRegisterBtn.addEventListener('click', () => {
        if (loginForm) loginForm.classList.add('hidden');
        if (registerForm) registerForm.classList.remove('hidden');
    });
    if (showLoginBtn) showLoginBtn.addEventListener('click', () => {
        if (registerForm) registerForm.classList.add('hidden');
        if (loginForm) loginForm.classList.remove('hidden');
    });
  
    // --- Main Extension Actions ---
  
    // Capture Button (New Tab Analysis)
    if (captureButton) {
        captureButton.addEventListener('click', async () => {
            console.log("Capture button (new tab) clicked");
            if (!isLoggedIn()) { showStatus('Please log in first.', 'error'); return; }
            showStatus('Requesting board capture...', 'info');
            captureButton.disabled = true;
            try {
                const tab = await getCurrentTab(); // Use helper to get validated tab
  
                // Send message to background script to handle capture
                chrome.runtime.sendMessage({ action: "captureBoard", tabId: tab.id }, (response) => {
                    captureButton.disabled = false; // Re-enable button
                    if (chrome.runtime.lastError) {
                        showStatus(`Error: ${chrome.runtime.lastError.message}`, 'error');
                    } else if (response && response.success) {
                        showStatus('Board captured! Opening analysis...', 'success');
                        // Background script's injectCaptureScript saves data. Open the page.
                        chrome.tabs.create({ url: chrome.runtime.getURL("src/analysis/analysis.html") });
                        window.close(); // Close popup
                    } else {
                        showStatus(`Capture failed: ${response?.error || 'Unknown error'}`, 'error');
                    }
                });
            } catch (error) {
                // Error from getCurrentTab or sendMessage setup
                showStatus(`Capture error: ${error.message}`, 'error');
                captureButton.disabled = false;
            }
        });
    }
  
    // Sidebar Button
    if (sidebarButton) {
        sidebarButton.addEventListener('click', async () => {
            console.log("Sidebar button clicked");
            if (!isLoggedIn()) { showStatus('Please log in first.', 'error'); return; }
            showStatus('Requesting sidebar...', 'info');
            sidebarButton.disabled = true;
            try {
                const tab = await getCurrentTab(); // Get validated tab
  
                // Send message to background script to request sidebar toggle
                chrome.runtime.sendMessage({ action: "showSidebar", tabId: tab.id }, (response) => {
                    sidebarButton.disabled = false; // Re-enable button
                    if (chrome.runtime.lastError) {
                        showStatus(`Error: ${chrome.runtime.lastError.message}`, 'error');
                    } else if (response && response.success) {
                        showStatus('Sidebar requested.', 'success');
                        window.close(); // Close popup after successful request
                    } else {
                        showStatus(`Failed to open sidebar: ${response?.error || 'Communication error'}`, 'error');
                    }
                });
            } catch (error) {
                showStatus(`Sidebar error: ${error.message}`, 'error');
                sidebarButton.disabled = false;
            }
        });
    }
  
    // --- Credits & Payment ---
  
    async function fetchUserCredits() {
        const token = localStorage.getItem('auth_token');
        if (!token || !userCreditsSpan) return;
  
        userCreditsSpan.textContent = localStorage.getItem('user_credits') || 'Loading...'; // Show cached or loading state
  
        try {
            const response = await fetch(`${API_URL}/credits/balance`, {
                headers: { 'Authorization': token } // Use token directly
            });
            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Failed to fetch credits (${response.status}): ${errText}`);
            }
            const data = await response.json();
            if (typeof data.balance === 'number') {
                 updateCreditsDisplay(data.balance);
                 localStorage.setItem('user_credits', data.balance.toString()); // Cache
                 await chrome.storage.local.set({'user_credits': data.balance}); // Sync
            } else {
                 throw new Error("Invalid balance data received");
            }
        } catch (error) {
            console.error('Error fetching credits:', error);
            if(userCreditsSpan) userCreditsSpan.textContent = "Error";
        }
    }
  
    function updateCreditsDisplay(credits) {
        if (userCreditsSpan) userCreditsSpan.textContent = credits;
    }
  
    async function displayCreditPackages() {
        const token = localStorage.getItem('auth_token');
        if (!token || !creditPackagesDiv) return;
  
        creditPackagesDiv.innerHTML = '<p style="font-style: italic; color: #666;">Loading packages...</p>';
        creditPackagesDiv.parentElement.classList.remove('hidden'); // Show the container
  
        try {
            const response = await fetch(`${API_URL}/payments/credits/packages`, {
                headers: { 'Authorization': token } // Use token directly
            });
            if (!response.ok) throw new Error(`Failed to load packages (${response.status})`);
            const data = await response.json();
  
            creditPackagesDiv.innerHTML = ''; // Clear loading
            if (!data.packages || Object.keys(data.packages).length === 0) {
                creditPackagesDiv.innerHTML = '<p>No credit packages available.</p>';
                return;
            }
  
            // Create buttons for each package
            for (const [id, pkg] of Object.entries(data.packages)) {
                const packageElement = document.createElement('div');
                packageElement.className = 'credit-package'; // Add class for styling
                packageElement.style.border = "1px solid #eee";
                packageElement.style.padding = "10px";
                packageElement.style.marginBottom = "10px";
                packageElement.style.borderRadius = "4px";
                packageElement.style.textAlign = "left";
  
                const currencySymbol = pkg.currency === 'INR' ? '₹' : '$';
                const formattedAmount = (pkg.amount / 100).toFixed(2);
  
                packageElement.innerHTML = `
                  <strong style="font-size: 1.1em; display: block; margin-bottom: 2px;">${pkg.credits} Credits</strong>
                  <p style="margin: 2px 0; font-size: 1.2em; color: #34a853; font-weight: bold;">
                      ${currencySymbol}${formattedAmount} ${pkg.currency}
                  </p>
                  <p style="margin: 2px 0 8px; font-size: 0.9em; color: #555;">${pkg.description}</p>
                  <button class="buy-credits-btn" data-package-id="${id}" data-credits="${pkg.credits}" data-name="${pkg.description}" style="background-color: #34a853; width: auto; padding: 6px 12px; font-size: 13px; cursor: pointer;">Buy Now</button>
                `;
                creditPackagesDiv.appendChild(packageElement);
            }
  
            // Add event listeners to the newly created buttons
            creditPackagesDiv.querySelectorAll('.buy-credits-btn').forEach(button => {
                button.addEventListener('click', handleBuyCreditsClick);
            });
  
        } catch (error) {
            console.error('Error displaying packages:', error);
            creditPackagesDiv.innerHTML = '<p style="color: red;">Error loading packages.</p>';
        }
    }
  
    async function handleBuyCreditsClick(event) {
        const button = event.target;
        const packageId = button.getAttribute('data-package-id');
        const credits = parseInt(button.getAttribute('data-credits'), 10);
        const name = button.getAttribute('data-name'); // Using description as name for now
        const token = localStorage.getItem('auth_token');
  
        if (!packageId || !token || !credits || !name) {
             showStatus('Error: Missing purchase details.', 'error'); return;
        }
  
        // Disable all buy buttons to prevent multiple clicks
        document.querySelectorAll('.buy-credits-btn').forEach(btn => {
            btn.disabled = true;
            btn.textContent = 'Processing...';
        });
        showStatus('Preparing payment...', 'info');
  
        try {
            // Send message to background script to handle order creation AND popup opening
            chrome.runtime.sendMessage({
                action: "openPaymentPopup", // Reusing this action name, background handles order creation first
                packageId: packageId,
                packageName: name, // Pass name/description
                credits: credits,
                token: token // Pass token needed for order creation and verification
            }, (response) => {
                // Re-enable buttons once background responds
                 document.querySelectorAll('.buy-credits-btn').forEach(btn => {
                     btn.disabled = false;
                     btn.textContent = 'Buy Now';
                 });
  
                if (chrome.runtime.lastError) {
                    showStatus(`Error opening payment window: ${chrome.runtime.lastError.message}`, 'error');
                } else if (response && response.success) {
                    showStatus('Payment window opening...', 'success');
                    // Don't close popup yet, let user see message. Background handles popup window.
                    // window.close(); // No need to close here
                } else {
                    showStatus(`Failed to initiate payment: ${response?.error || 'Unknown error'}`, 'error');
                }
            });
  
        } catch (error) {
            console.error('Error initiating credit purchase:', error);
            showStatus(`Purchase Error: ${error.message}`, 'error');
            // Re-enable buttons on error
             document.querySelectorAll('.buy-credits-btn').forEach(btn => {
                 btn.disabled = false;
                 btn.textContent = 'Buy Now';
             });
        }
    }
  
  
    // --- API Connectivity Test ---
    async function testApiConnectivity() {
        try {
            const response = await fetch(`${API_URL}/`, { method: 'HEAD', mode: 'cors', cache: 'no-cache' });
            console.log(`API connectivity test: Status ${response.status}`);
            if (!response.ok) {
                 console.warn(`API server unreachable or returned error: ${response.status}`);
            } else {
                 console.log('API server is reachable.');
                 if (statusMessage && statusMessage.textContent.includes('Cannot connect')) {
                      statusContainer.classList.add('hidden');
                 }
            }
        } catch (error) {
            console.error('API connectivity test failed:', error);
        }
    }
  
  }); // End DOMContentLoaded