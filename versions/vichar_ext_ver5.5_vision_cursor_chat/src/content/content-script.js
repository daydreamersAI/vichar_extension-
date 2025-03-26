const CACHE_BUST = new Date().getTime();
console.log("Cache bust ID:", CACHE_BUST);

// This is the main content script that gets injected by Chrome
console.log("Chess analyzer content script loader initialized");

// Create a global variable to keep track of the sidebar state
let sidebarInitialized = false;
let sidebarVisible = false;

// API configuration - updated to match your deployment
const API_URL = "https://api.beekayprecision.com"; // Using HTTPS for security

// Function to check if user is logged in
function isLoggedIn() {
  // Check both localStorage and chrome.storage.local
  const token = localStorage.getItem('auth_token');
  if (token) {
    console.log("Found auth token in localStorage");
    return true;
  }
  
  // If not found in localStorage, we'll return false for now
  // We'll handle chrome.storage.local separately since it's asynchronous
  console.log("No auth token found in localStorage");
  return false;
}

// Async version of isLoggedIn that checks both localStorage and chrome.storage.local
function checkLoginStatus() {
  return new Promise((resolve) => {
    // First check localStorage
    const token = localStorage.getItem('auth_token');
    if (token) {
      console.log("Found auth token in localStorage");
      resolve(true);
      return;
    }
    
    // If not in localStorage, check chrome.storage.local
    chrome.storage.local.get(['auth_token'], (result) => {
      if (result && result.auth_token) {
        console.log("Found auth token in chrome.storage.local");
        // Save to localStorage for future checks
        localStorage.setItem('auth_token', result.auth_token);
        
        // Also get and save user info if available
        chrome.storage.local.get(['user_id', 'user_name'], (userInfo) => {
          if (userInfo.user_id) localStorage.setItem('user_id', userInfo.user_id);
          if (userInfo.user_name) localStorage.setItem('user_name', userInfo.user_name);
          console.log("Sync'd auth data from chrome.storage to localStorage");
        });
        
        resolve(true);
      } else {
        console.log("No auth token found in chrome.storage.local either");
        resolve(false);
      }
    });
  });
}

// Check chrome.storage.local for token (asynchronous version)
// This function is kept for backward compatibility but uses the new checkLoginStatus internally
function checkChromeStorage() {
  console.log("Using updated checkChromeStorage that leverages checkLoginStatus");
  checkLoginStatus().then(isLoggedIn => {
    if (isLoggedIn && !sidebarInitialized) {
      initializeSidebar();
    }
  });
}

// Function to create and initialize the sidebar
async function initializeSidebar() {
  // First inject custom CSS to ensure proper styling
  injectCustomCSS();
  
  if (sidebarInitialized) {
    return; // Don't initialize twice
  }
  
  // Check if user is logged in before initializing sidebar
  const isUserLoggedIn = await checkLoginStatus();
  if (!isUserLoggedIn) {
    console.log("User not logged in, not initializing sidebar");
    return; // Don't initialize the sidebar if not logged in
  }
  
  console.log("Initializing sidebar elements");
  
  // Create the sidebar element
  const sidebar = document.createElement('div');
  sidebar.id = 'chess-analysis-sidebar';
  sidebar.style.cssText = `
    position: fixed;
    top: 0;
    right: -400px; /* Start off-screen */
    width: 380px;
    height: 100vh;
    background-color: #f8f9fa;
    box-shadow: -2px 0 10px rgba(0, 0, 0, 0.2);
    z-index: 9999;
    overflow-y: auto;
    transition: right 0.3s ease;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    padding: 10px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
  `;
  
  // Create toggle button
  const toggleButton = document.createElement('div');
  toggleButton.id = 'sidebar-toggle';
  toggleButton.style.cssText = `
    position: fixed;
    top: 50%;
    right: 0;
    width: 30px;
    height: 60px;
    background-color: #4285f4;
    border-radius: 5px 0 0 5px;
    cursor: pointer;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: -2px 0 5px rgba(0, 0, 0, 0.1);
  `;
  toggleButton.innerHTML = '<span style="color: white; transform: rotate(-90deg);">▲</span>';
  toggleButton.addEventListener('click', toggleSidebar);
  
  // Create the sidebar content
  const content = document.createElement('div');
  content.style.cssText = `
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 15px;
  `;
  
  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    padding-bottom: 10px;
    border-bottom: 1px solid #ddd;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
  header.innerHTML = '<h2 style="margin: 0; color: #333;">Chess Analysis</h2>';
  
  // Close button
  const closeButton = document.createElement('button');
  closeButton.textContent = 'X';
  closeButton.style.cssText = `
    background: none;
    border: none;
    font-size: 16px;
    cursor: pointer;
    color: #555;
  `;
  closeButton.addEventListener('click', toggleSidebar);
  header.appendChild(closeButton);
  
  // User welcome and logout section
  const userSection = document.createElement('div');
  userSection.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px 15px;
    background-color: #e8f0fe;
    border-radius: 8px;
    margin-bottom: 15px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  `;
  
  // User info row (welcome message and logout)
  const userInfoRow = document.createElement('div');
  userInfoRow.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
  
  // Get user name from storage
  let userName = localStorage.getItem('user_name') || 'User';
  
  // If not in localStorage, try chrome.storage.local
  if (userName === 'User') {
    chrome.storage.local.get(['user_name'], (result) => {
      if (result && result.user_name) {
        userName = result.user_name;
        // Update the welcome message
        welcomeMessage.innerHTML = `<span style="font-weight: 600;">Welcome back, </span><span style="font-weight: 700; color: #4285f4;">${userName}</span>`;
      }
    });
  }
  
  // Welcome message
  const welcomeMessage = document.createElement('div');
  welcomeMessage.style.cssText = `
    font-size: 14px;
    color: #333;
  `;
  welcomeMessage.innerHTML = `<span style="font-weight: 600;">Welcome back, </span><span style="font-weight: 700; color: #4285f4;">${userName}</span>`;
  
  // Logout button
  const logoutButton = document.createElement('button');
  logoutButton.textContent = 'Logout';
  logoutButton.style.cssText = `
    padding: 5px 10px;
    background-color: #f44336;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    transition: background-color 0.2s;
  `;
  logoutButton.addEventListener('mouseenter', () => {
    logoutButton.style.backgroundColor = '#d32f2f';
  });
  logoutButton.addEventListener('mouseleave', () => {
    logoutButton.style.backgroundColor = '#f44336';
  });
  logoutButton.addEventListener('click', handleLogout);
  
  userInfoRow.appendChild(welcomeMessage);
  userInfoRow.appendChild(logoutButton);
  
  // Credits section
  const creditsSection = document.createElement('div');
  creditsSection.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 8px;
    border-top: 1px solid #cce4ff;
  `;
  
  // Credits display
  const creditsDisplay = document.createElement('div');
  creditsDisplay.id = 'sidebar-credits-display';
  creditsDisplay.style.cssText = `
    font-size: 14px;
    color: #333;
  `;
  creditsDisplay.innerHTML = `<span style="font-weight: 600;">Credits: </span><span id="credits-value" style="font-weight: 700; color: #34a853;">Loading...</span>`;
  
  // Buy credits button
  const buyCreditsButton = document.createElement('button');
  buyCreditsButton.textContent = 'Buy Credits';
  buyCreditsButton.style.cssText = `
    padding: 5px 10px;
    background-color: #34a853;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    transition: background-color 0.2s;
  `;
  buyCreditsButton.addEventListener('mouseenter', () => {
    buyCreditsButton.style.backgroundColor = '#2d9249';
  });
  buyCreditsButton.addEventListener('mouseleave', () => {
    buyCreditsButton.style.backgroundColor = '#34a853';
  });
  buyCreditsButton.addEventListener('click', showCreditPurchaseOptions);
  
  creditsSection.appendChild(creditsDisplay);
  creditsSection.appendChild(buyCreditsButton);
  
  // Add the user info row and credits section to user section
  userSection.appendChild(userInfoRow);
  userSection.appendChild(creditsSection);
  
  // Question input - MOVED TO TOP
  const questionContainer = document.createElement('div');
  questionContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 15px;
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    margin-bottom: 15px;
  `;
  
  const questionLabel = document.createElement('label');
  questionLabel.textContent = 'Ask about this position:';
  questionLabel.style.cssText = `
    font-weight: 600;
    color: #000;
    font-size: 15px;
    margin-bottom: 5px;
  `;
  
  const questionInput = document.createElement('textarea');
  questionInput.id = 'question-input';
  questionInput.placeholder = 'Example: What is the best move for white?';
  questionInput.style.cssText = `
    width: 100%;
    height: 120px;
    padding: 15px;
    border: 1px solid #ddd;
    border-radius: 4px;
    resize: vertical;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 15px;
    line-height: 1.6;
    color: #000;
    background-color: white;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  `;
  
  // Add the AI vision toggle
  const aiVisionContainer = document.createElement('div');
  aiVisionContainer.style.cssText = `
    display: flex;
    align-items: center;
    margin-top: 5px;
    gap: 8px;
  `;
  
  const aiVisionToggle = document.createElement('input');
  aiVisionToggle.type = 'checkbox';
  aiVisionToggle.id = 'ai-vision-toggle';
  aiVisionToggle.checked = true; // Default to using vision
  aiVisionToggle.style.cssText = `
    margin: 0;
  `;
  
  const aiVisionLabel = document.createElement('label');
  aiVisionLabel.htmlFor = 'ai-vision-toggle';
  aiVisionLabel.textContent = 'Use AI Vision for board analysis';
  aiVisionLabel.style.cssText = `
    font-size: 13px;
    color: #555;
    cursor: pointer;
  `;
  
  aiVisionContainer.appendChild(aiVisionToggle);
  aiVisionContainer.appendChild(aiVisionLabel);
  
  const askButton = document.createElement('button');
  askButton.textContent = 'Ask Question';
  askButton.style.cssText = `
    padding: 12px 20px;
    background-color: #4285f4;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 15px;
    font-weight: 600;
    align-self: flex-start;
    transition: background-color 0.2s;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  `;
  askButton.addEventListener('mouseenter', () => {
    askButton.style.backgroundColor = '#3367d6';
  });
  askButton.addEventListener('mouseleave', () => {
    askButton.style.backgroundColor = '#4285f4';
  });
  askButton.addEventListener('click', askQuestion);
  
  questionContainer.appendChild(questionLabel);
  questionContainer.appendChild(questionInput);
  questionContainer.appendChild(aiVisionContainer);
  questionContainer.appendChild(askButton);
  
  // Response area - MOVED UP below question
  const responseContainer = document.createElement('div');
  responseContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 5px;
    flex: 0 0 auto;
    margin-bottom: 15px;
  `;
  
  const responseLabel = document.createElement('label');
  responseLabel.textContent = 'Analysis:';
  responseLabel.style.cssText = `
    font-weight: 600;
    color: #333;
    font-size: 14px;
  `;
  
  const responseArea = document.createElement('div');
  responseArea.id = 'response-area';
  responseArea.style.cssText = `
    padding: 20px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background-color: white;
    min-height: 200px;
    max-height: 300px;
    overflow-y: auto;
    line-height: 1.6;
    color: #000;
    font-size: 15px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  `;
  responseArea.textContent = 'Capture a position to begin analysis.';
  
  responseContainer.appendChild(responseLabel);
  responseContainer.appendChild(responseArea);
  
  // Capture button
  const captureButton = document.createElement('button');
  captureButton.textContent = 'Capture Current Position';
  captureButton.style.cssText = `
    padding: 10px 16px;
    background-color: #34a853;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    width: 100%;
    transition: background-color 0.2s;
    margin-bottom: 10px;
  `;
  captureButton.addEventListener('mouseenter', () => {
    captureButton.style.backgroundColor = '#2d9249';
  });
  captureButton.addEventListener('mouseleave', () => {
    captureButton.style.backgroundColor = '#34a853';
  });
  captureButton.addEventListener('click', captureCurrentPosition);
  
  // Image container
  const imageContainer = document.createElement('div');
  imageContainer.style.cssText = `
    width: 100%;
    display: flex;
    justify-content: center;
    background-color: white;
    padding: 10px;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  `;
  const capturedImage = document.createElement('img');
  capturedImage.id = 'captured-board-image';
  capturedImage.style.cssText = `
    max-width: 100%;
    max-height: 300px;
    display: none;
    border-radius: 4px;
  `;
  imageContainer.appendChild(capturedImage);
  
  // Game info container
  const gameInfoContainer = document.createElement('div');
  gameInfoContainer.id = 'game-info-container';
  gameInfoContainer.style.cssText = `
    width: 100%;
    background-color: white;
    padding: 12px;
    border-radius: 8px;
    display: none;
    flex-direction: column;
    gap: 10px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  `;
  
  // FEN display
  const fenContainer = document.createElement('div');
  fenContainer.style.cssText = `
    font-family: 'Courier New', monospace;
    font-size: 13px;
    word-break: break-all;
    background-color: #f5f5f5;
    padding: 8px;
    border-radius: 4px;
    border: 1px solid #e0e0e0;
  `;
  const fenLabel = document.createElement('div');
  fenLabel.textContent = 'FEN:';
  fenLabel.style.cssText = `
    font-weight: 600;
    margin-bottom: 4px;
    color: #333;
  `;
  const fenValue = document.createElement('div');
  fenValue.id = 'fen-value';
  fenValue.textContent = '';
  fenValue.style.cssText = `
    line-height: 1.4;
  `;
  fenContainer.appendChild(fenLabel);
  fenContainer.appendChild(fenValue);
  
  // PGN display (collapsible)
  const pgnContainer = document.createElement('div');
  pgnContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 3px;
  `;
  
  const pgnHeader = document.createElement('div');
  pgnHeader.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    padding: 8px;
    background-color: #f0f0f0;
    border-radius: 4px;
  `;
  
  const pgnLabel = document.createElement('div');
  pgnLabel.textContent = 'PGN (Game Moves)';
  pgnLabel.style.cssText = `
    font-weight: 600;
    color: #333;
  `;
  
  const pgnToggle = document.createElement('span');
  pgnToggle.textContent = '▼';
  pgnToggle.style.transition = 'transform 0.3s';
  
  pgnHeader.appendChild(pgnLabel);
  pgnHeader.appendChild(pgnToggle);
  
  const pgnContent = document.createElement('div');
  pgnContent.id = 'pgn-value';
  pgnContent.style.cssText = `
    font-family: 'Courier New', monospace;
    font-size: 13px;
    white-space: pre-wrap;
    word-break: break-all;
    background-color: #f5f5f5;
    padding: 8px;
    border-radius: 4px;
    border: 1px solid #e0e0e0;
    max-height: 150px;
    overflow-y: auto;
    display: none;
    line-height: 1.4;
  `;
  
  // Toggle PGN visibility when header is clicked
  pgnHeader.addEventListener('click', () => {
    const isVisible = pgnContent.style.display !== 'none';
    pgnContent.style.display = isVisible ? 'none' : 'block';
    pgnToggle.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(180deg)';
  });
  
  pgnContainer.appendChild(pgnHeader);
  pgnContainer.appendChild(pgnContent);
  
  // Add game info components to the container
  gameInfoContainer.appendChild(fenContainer);
  gameInfoContainer.appendChild(pgnContainer);
  
  // Assemble the content - NEW ORDER
  content.appendChild(header);
  content.appendChild(userSection);
  content.appendChild(questionContainer);     // 1. Question input
  content.appendChild(responseContainer);     // 2. Response area
  content.appendChild(captureButton);         // 3. Capture button
  content.appendChild(imageContainer);        // 4. Captured image
  content.appendChild(gameInfoContainer);     // 5. Game info (FEN/PGN)
  
  // Add content to sidebar
  sidebar.appendChild(content);
  
  // Add the sidebar and toggle button to the page
  document.body.appendChild(sidebar);
  document.body.appendChild(toggleButton);
  
  sidebarInitialized = true;
  console.log("Sidebar elements created successfully");
  
  // Fetch user credits
  fetchUserCredits();
}

// Function to toggle sidebar visibility
function toggleSidebar() {
  const sidebar = document.getElementById('chess-analysis-sidebar');
  if (!sidebar) return;
  
  sidebarVisible = !sidebarVisible;
  sidebar.style.right = sidebarVisible ? '0' : '-400px';
  console.log("Sidebar visibility toggled:", sidebarVisible);
}

// Function to handle logout from sidebar
function handleLogout() {
  console.log("Logout clicked in sidebar");
  
  // Clear authentication data from localStorage
  localStorage.removeItem('auth_token');
  localStorage.removeItem('user_id');
  localStorage.removeItem('user_name');
  
  // Also clear from chrome.storage.local
  chrome.storage.local.remove(['auth_token', 'user_id', 'user_name'], () => {
    console.log("Auth data removed from chrome.storage.local");
    
    // Hide the sidebar
    const sidebar = document.getElementById('chess-analysis-sidebar');
    if (sidebar) {
      sidebarVisible = false;
      sidebar.style.right = '-400px';
    }
    
    // Reset sidebar initialization flag so it can be recreated if user logs in again
    sidebarInitialized = false;
    
    // Remove sidebar elements from DOM
    const sidebarElement = document.getElementById('chess-analysis-sidebar');
    const toggleButton = document.getElementById('sidebar-toggle');
    if (sidebarElement) sidebarElement.remove();
    if (toggleButton) toggleButton.remove();
    
    // Show a notification that user has been logged out
    alert("You have been logged out successfully");
  });
}

// Function to fetch and display user credits
function fetchUserCredits() {
  console.log("Fetching user credits");
  const creditsValueElement = document.getElementById('credits-value');
  
  if (!creditsValueElement) {
    console.error("Credits value element not found");
    return;
  }
  
  const token = localStorage.getItem('auth_token');
  if (!token) {
    console.error("No auth token found, cannot fetch credits");
    creditsValueElement.textContent = "Login required";
    return;
  }
  
  // First try getting from local storage cache to display immediately
  const cachedCredits = localStorage.getItem('user_credits');
  if (cachedCredits) {
    creditsValueElement.textContent = cachedCredits;
  }
  
  // Then fetch from server to get updated count
  fetch(`${API_URL}/credits/balance`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`Failed to fetch credits: ${response.status} ${response.statusText}`);
    }
    return response.json();
  })
  .then(data => {
    console.log("Credits data received:", data);
    
    // Use the actual balance from the server
    const credits = data.balance;
    
    // Update the credits display
    creditsValueElement.textContent = credits;
    
    // Cache the credits in localStorage
    localStorage.setItem('user_credits', credits.toString());
    
    // Also store in chrome.storage.local for background script access
    chrome.storage.local.set({ 'user_credits': credits });
  })
  .catch(error => {
    console.error("Error fetching credits:", error);
    creditsValueElement.textContent = "Error";
    
    // If fetch fails, try with XMLHttpRequest
    fetchCreditsWithXHR();
  });
}

// Function to fetch credits using XMLHttpRequest as fallback
function fetchCreditsWithXHR() {
  console.log("Fetching credits with XMLHttpRequest");
  const creditsValueElement = document.getElementById('credits-value');
  
  const token = localStorage.getItem('auth_token');
  if (!token) {
    console.error("No auth token found, cannot fetch credits");
    return;
  }
  
  const xhr = new XMLHttpRequest();
  xhr.open('GET', `${API_URL}/credits/balance`, true);
  xhr.setRequestHeader('Authorization', `Bearer ${token}`);
  xhr.setRequestHeader('Content-Type', 'application/json');
  
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          console.log("Credits data received via XHR:", data);
          
          // Use the actual balance from the server
          const credits = data.balance;
          
          // Update the credits display
          creditsValueElement.textContent = credits;
          
          // Cache the credits in localStorage
          localStorage.setItem('user_credits', credits.toString());
          
          // Also store in chrome.storage.local for background script access
          chrome.storage.local.set({ 'user_credits': credits });
        } catch (e) {
          console.error("Failed to parse credits response:", e);
          creditsValueElement.textContent = "Error";
        }
      } else {
        console.error("XHR error fetching credits:", xhr.status, xhr.statusText);
        creditsValueElement.textContent = "Error";
      }
    }
  };
  
  xhr.onerror = function() {
    console.error("Network error in XHR credits fetch");
    creditsValueElement.textContent = "Network Error";
  };
  
  xhr.send();
}

// Function to show credit purchase options
function showCreditPurchaseOptions() {
  console.log("Showing credit purchase options");
  
  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'credits-modal-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
  `;
  
  // Create modal
  const modal = document.createElement('div');
  modal.style.cssText = `
    background-color: white;
    border-radius: 8px;
    width: 90%;
    max-width: 500px;
    padding: 25px;
    box-shadow: 0 5px 20px rgba(0, 0, 0, 0.2);
    max-height: 80vh;
    overflow-y: auto;
    position: relative;
  `;
  
  // Modal header
  const modalHeader = document.createElement('div');
  modalHeader.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  `;
  
  const modalTitle = document.createElement('h2');
  modalTitle.textContent = 'Purchase Credits';
  modalTitle.style.cssText = `
    margin: 0;
    font-size: 22px;
    color: #333;
  `;
  
  const closeButton = document.createElement('button');
  closeButton.innerHTML = '&times;';
  closeButton.style.cssText = `
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #999;
    padding: 0;
    line-height: 1;
  `;
  
  closeButton.addEventListener('click', () => {
    document.body.removeChild(overlay);
  });
  
  modalHeader.appendChild(modalTitle);
  modalHeader.appendChild(closeButton);
  
  // Modal content
  const modalContent = document.createElement('div');
  
  // Package selection section
  const packagesContainer = document.createElement('div');
  packagesContainer.id = 'credit-packages-container';
  packagesContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 15px;
    margin-bottom: 20px;
  `;
  
  // Loading indicator while fetching packages
  const loadingText = document.createElement('div');
  loadingText.textContent = 'Loading available packages...';
  loadingText.style.cssText = `
    text-align: center;
    padding: 20px;
    color: #666;
  `;
  packagesContainer.appendChild(loadingText);
  
  // Fetch packages from the server
  const token = localStorage.getItem('auth_token');
  if (token) {
    fetch(`${API_URL}/payments/credits/packages`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to fetch packages: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log("Packages received:", data);
      
      // Clear loading indicator
      packagesContainer.innerHTML = '';
      
      // Create package options
      Object.entries(data.packages).forEach(([id, pkg]) => {
        const packageOption = document.createElement('div');
        packageOption.className = 'credit-package-option';
        packageOption.style.cssText = `
          border: 1px solid #ddd;
          border-radius: 6px;
          padding: 15px;
          cursor: pointer;
          transition: all 0.2s;
          position: relative;
          overflow: hidden;
        `;
        
        const currency = pkg.currency === 'USD' ? '$' : '₹';
        const formattedPrice = (pkg.amount / 100).toFixed(2);
        
        packageOption.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-weight: 600; font-size: 16px; color: #333;">${pkg.description.split(' - ')[0]}</div>
              <div style="color: #666; margin-top: 5px;">${pkg.credits.toLocaleString()} credits</div>
            </div>
            <div style="font-weight: 700; font-size: 18px; color: #34a853;">${currency}${formattedPrice}</div>
          </div>
        `;
        
        // Add hover effect
        packageOption.addEventListener('mouseenter', () => {
          packageOption.style.borderColor = '#34a853';
          packageOption.style.backgroundColor = '#f0f9f4';
        });
        
        packageOption.addEventListener('mouseleave', () => {
          packageOption.style.borderColor = '#ddd';
          packageOption.style.backgroundColor = 'white';
        });
        
        // Add click handler to initiate payment
        packageOption.addEventListener('click', () => {
          initiateRazorpayPayment({
            id: id,
            credits: pkg.credits,
            price: formattedPrice,
            currency: pkg.currency
          });
        });
        
        packagesContainer.appendChild(packageOption);
      });
    })
    .catch(error => {
      console.error("Error fetching packages:", error);
      packagesContainer.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #d32f2f;">
          Failed to load packages. Please try again later.
        </div>
      `;
    });
  }
  
  modalContent.appendChild(packagesContainer);
  
  // Information text
  const infoText = document.createElement('div');
  infoText.style.cssText = `
    font-size: 14px;
    color: #666;
    margin-bottom: 20px;
    line-height: 1.5;
    padding: 10px;
    background-color: #f8f9fa;
    border-radius: 4px;
  `;
  infoText.innerHTML = `
    <p style="margin: 0 0 10px 0;">1,000 credits = 1,000 API calls to analyze chess positions</p>
    <p style="margin: 0;">Payments are processed securely via Razorpay.</p>
  `;
  
  modalContent.appendChild(infoText);
  
  // Assemble modal
  modal.appendChild(modalHeader);
  modal.appendChild(modalContent);
  
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

// Function to initiate Razorpay payment
function initiateRazorpayPayment(packageInfo) {
  console.log("Initiating payment for package:", packageInfo);
  
  // Show loading indicator
  const creditsModal = document.getElementById('credits-modal-content');
  if (creditsModal) {
    creditsModal.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <div style="display: inline-block; width: 40px; height: 40px; border: 4px solid #f3f3f3; 
             border-top: 4px solid #3498db; border-radius: 50%; animation: spin 2s linear infinite;"></div>
        <p style="margin-top: 20px;">Processing your payment request...</p>
      </div>
      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `;
  }
  
  // Create order via background script to avoid CORS issues
  chrome.runtime.sendMessage({
    action: "createPaymentOrder",
    packageInfo: packageInfo
  }, function(response) {
    if (chrome.runtime.lastError) {
      console.error("Error creating order:", chrome.runtime.lastError);
      showPaymentError("Failed to create payment order. Please try again later.");
      return;
    }
    
    if (!response || !response.success) {
      console.error("Failed to create order:", response ? response.error : "Unknown error");
      showPaymentError(response && response.error ? response.error : "Failed to create payment order. Please try again later.");
      return;
    }
    
    const orderData = response.orderData;
    console.log("Order created successfully:", orderData);
    console.log("Order data detail - key_id:", orderData.razorpay_key_id);
    console.log("Order data detail - order_id:", orderData.razorpay_order_id);
    
    // Use the background script to handle the payment to avoid CSP issues
    chrome.runtime.sendMessage({
      action: "loadRazorpayCheckout",
      orderData: orderData,
      packageInfo: packageInfo
    }, function(checkoutResponse) {
      if (chrome.runtime.lastError) {
        console.error("Error loading checkout:", chrome.runtime.lastError);
        showPaymentError("Failed to load payment interface. Please try again later.");
        return;
      }
      
      if (!checkoutResponse || !checkoutResponse.success) {
        console.error("Failed to load checkout:", checkoutResponse ? checkoutResponse.error : "Unknown error");
        showPaymentError(checkoutResponse && checkoutResponse.error ? checkoutResponse.error : "Failed to load payment interface. Please try again later.");
      }
    });
  });
  
  // Helper function to show payment errors
  function showPaymentError(errorMessage) {
    if (creditsModal) {
      creditsModal.innerHTML = `
        <div style="text-align: center; padding: 20px;">
          <div style="color: #d32f2f; background-color: #ffebee; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
            <strong>Payment Error</strong><br>
            ${errorMessage}
          </div>
          <button id="try-again-btn" style="padding: 10px 20px; background-color: #4285f4; color: white; 
                 border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">
            Try Again
          </button>
        </div>
      `;
      
      // Add event listener to the try again button
      setTimeout(() => {
        const tryAgainBtn = document.getElementById('try-again-btn');
        if (tryAgainBtn) {
          tryAgainBtn.addEventListener('click', () => {
            showCreditPurchaseOptions();
          });
        }
      }, 0);
    }
  }
}

// Function to verify payment with the server
function verifyPayment(paymentResponse, packageInfo) {
  console.log("Verifying payment:", paymentResponse);
  
  const token = localStorage.getItem('auth_token');
  if (!token) {
    alert("Authentication error. Please log in again.");
    return;
  }
  
  // Show verification status
  const overlay = document.getElementById('credits-modal-overlay');
  if (overlay) {
    overlay.innerHTML = `
      <div style="background-color: white; padding: 40px; border-radius: 8px; text-align: center;">
        <div style="display: inline-block; border-radius: 50%; border: 3px solid #4285f4; 
             border-top-color: transparent; width: 30px; height: 30px; animation: spin 1s linear infinite;"></div>
        <div style="margin-top: 20px; font-weight: 500; color: #333;">Verifying payment...</div>
      </div>
    `;
  }
  
  // Verify the payment with the server
  fetch(`${API_URL}/credits/verify-payment`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      razorpay_payment_id: paymentResponse.razorpay_payment_id,
      razorpay_order_id: paymentResponse.razorpay_order_id,
      razorpay_signature: paymentResponse.razorpay_signature
    })
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`Payment verification failed: ${response.status} ${response.statusText}`);
    }
    return response.json();
  })
  .then(data => {
    console.log("Payment verified:", data);
    
    // Create a success overlay
    const overlay = document.createElement('div');
    overlay.id = 'success-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.7);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    `;
    
    // Create success message
    const successBox = document.createElement('div');
    successBox.style.cssText = `
      background-color: white;
      padding: 30px;
      border-radius: 10px;
      text-align: center;
      max-width: 400px;
    `;
    
    successBox.innerHTML = `
      <h2 style="color: #34a853; margin-bottom: 20px;">Payment Successful!</h2>
      <p style="font-size: 16px; margin-bottom: 15px;">Thank you for your purchase.</p>
      <p style="font-size: 18px; font-weight: bold; margin-bottom: 20px;">
        ${data.credits_added} credits have been added to your account!
      </p>
      <p style="font-size: 14px; color: #666; margin-bottom: 25px;">
        Your current balance: ${data.current_balance} credits
      </p>
      <button id="close-success-btn" style="
        background-color: #4285f4;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 5px;
        font-weight: bold;
        cursor: pointer;
      ">Close</button>
    `;
    
    overlay.appendChild(successBox);
    document.body.appendChild(overlay);
    
    // Add event listener to close button
    setTimeout(() => {
      const closeBtn = document.getElementById('close-success-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          document.body.removeChild(overlay);
          
          // Update credits display
          fetchUserCredits();
        });
      }
    }, 0);
    
    // Update credits in localStorage with the actual server-provided balance
    localStorage.setItem('user_credits', data.current_balance.toString());
    
    // Also store in chrome.storage.local for background script access
    chrome.storage.local.set({ 'user_credits': data.current_balance });
    
    // Update credits display
    const creditsValueElement = document.getElementById('credits-value');
    if (creditsValueElement) {
      creditsValueElement.textContent = data.current_balance.toString();
    }
  })
  .catch(error => {
    console.error("Payment verification error:", error);
    
    // Show error message
    if (overlay) {
      overlay.innerHTML = `
        <div style="background-color: white; padding: 40px; border-radius: 8px; text-align: center;">
          <div style="width: 60px; height: 60px; background-color: #ea4335; border-radius: 50%; 
               display: flex; align-items: center; justify-content: center; margin: 0 auto 20px auto;">
            <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" 
                 stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </div>
          <div style="font-size: 20px; font-weight: 600; color: #333; margin-bottom: 10px;">Payment Failed</div>
          <div style="font-size: 16px; color: #666; margin-bottom: 20px;">${error.message}</div>
          <button id="close-error-btn" style="padding: 10px 20px; background-color: #4285f4; color: white; 
                 border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500;">Close</button>
        </div>
      `;
      
      // Add event listener to close button
      setTimeout(() => {
        const closeBtn = document.getElementById('close-error-btn');
        if (closeBtn) {
          closeBtn.addEventListener('click', () => {
            document.body.removeChild(overlay);
          });
        }
      }, 0);
    }
  });
}

// Function to capture the current chess position - FIXED
function captureCurrentPosition() {
  console.log("Capturing current position for sidebar");
  const responseArea = document.getElementById('response-area');
  if (responseArea) {
    responseArea.textContent = 'Capturing chess position...';
  }
  
  try {
    // Send a message to the background script to handle the capture
    chrome.runtime.sendMessage({ 
      action: "captureBoardForSidebar"
    }, (response) => {
      // Immediately check for runtime errors
      if (chrome.runtime.lastError) {
        console.error("Runtime error in capture:", chrome.runtime.lastError);
        if (responseArea) {
          responseArea.textContent = 'Error: ' + chrome.runtime.lastError.message;
        }
        return;
      }
      
      console.log("Capture response:", response);
      
      // Add logging to verify the FEN
      chrome.storage.local.get(['capturedBoard'], (result) => {
        console.log("CAPTURED FEN:", result.capturedBoard?.fen);
      });
      
      if (response && response.success) {
        // Load the newly captured board
        loadStoredBoardData();
        if (responseArea) {
          responseArea.textContent = 'Position captured! Ask a question about this position.';
        }
      } else {
        const errorMsg = response && response.error ? response.error : 'Unknown error';
        if (responseArea) {
          responseArea.textContent = 'Error capturing position: ' + errorMsg;
        }
      }
    });
  } catch (error) {
    console.error("Error capturing position:", error);
    if (responseArea) {
      responseArea.textContent = 'Error: ' + error.message;
    }
  }
}

// Extract base64 image data from the image source
function getBase64FromImageSrc(src) {
  // Check if the src is already a data URL
  if (src.startsWith('data:image/')) {
    // Extract just the base64 part without the data URI prefix
    return src.split(',')[1];
  }
  return null;
}

// Function to ask a question about the position - FIXED
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
  
  // First, show a loading indicator
  responseArea.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; padding: 20px;">
      <div style="border: 3px solid #f3f3f3; border-top: 3px solid #3498db; border-radius: 50%; width: 20px; height: 20px; margin-right: 10px; animation: spin 1s linear infinite;"></div>
      <span>Analyzing position...</span>
    </div>
    <style>
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
  `;
  
  // Get user credits from both localStorage and chrome.storage.local
  chrome.storage.local.get(['user_credits'], function(storageResult) {
    const localCredits = parseInt(localStorage.getItem('user_credits') || '0');
    const storageCredits = parseInt(storageResult.user_credits || '0');
    
    // Use the higher value to be safe
    const credits = Math.max(localCredits, storageCredits);
    
    if (credits <= 0) {
      responseArea.innerHTML = `
        <div style="color: #d32f2f; padding: 10px; background-color: #ffebee; border-radius: 4px; margin-bottom: 15px;">
          <strong>Out of credits!</strong> Please purchase more credits to continue analyzing positions.
        </div>
        <button id="buy-credits-now" style="padding: 10px 16px; background-color: #34a853; color: white;
           border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500;">
          Buy Credits Now
        </button>
      `;
      
      // Add event listener to the buy credits button
      setTimeout(() => {
        const buyCreditsNowButton = document.getElementById('buy-credits-now');
        if (buyCreditsNowButton) {
          buyCreditsNowButton.addEventListener('click', showCreditPurchaseOptions);
        }
      }, 0);
      
      return;
    }
    
    // Continue with API call
    chrome.storage.local.get(['capturedBoard'], (result) => {
      const capturedBoard = result.capturedBoard;
      
      if (!capturedBoard) {
        responseArea.innerHTML = `
          <div style="color: #d32f2f; padding: 10px; background-color: #ffebee; border-radius: 4px;">
            <strong>Error:</strong> No chess position has been captured. Please capture a position first.
          </div>
        `;
        return;
      }
      
      const useVision = document.getElementById('ai-vision-toggle') && 
                       document.getElementById('ai-vision-toggle').checked;
      
      // Send request to background script to handle API call
      try {
        chrome.runtime.sendMessage({
          action: "analyzeChessPosition",
          question: question,
          capturedBoard: capturedBoard,
          useVision: useVision
        }, (response) => {
          // Immediately check for runtime errors
          if (chrome.runtime.lastError) {
            console.error("Runtime error in analysis:", chrome.runtime.lastError);
            responseArea.innerHTML = `
              <div style="color: #d32f2f; padding: 10px; background-color: #ffebee; border-radius: 4px;">
                <strong>Error:</strong> ${chrome.runtime.lastError.message}
              </div>
            `;
            return;
          }
          
          if (response && response.success) {
            // Update credits from the API response if available
            if (response.credits) {
              const remainingCredits = response.credits.remaining;
              localStorage.setItem('user_credits', remainingCredits.toString());
              
              // Update credits display
              const creditsValueElement = document.getElementById('credits-value');
              if (creditsValueElement) {
                creditsValueElement.textContent = remainingCredits.toString();
              }
              
              // Also update in chrome.storage.local
              chrome.storage.local.set({ 'user_credits': remainingCredits });
            } else {
              // Fallback to decrementing locally if API doesn't provide credit info
              const newCredits = credits - 1;
              localStorage.setItem('user_credits', newCredits.toString());
              
              // Update credits display
              const creditsValueElement = document.getElementById('credits-value');
              if (creditsValueElement) {
                creditsValueElement.textContent = newCredits.toString();
              }
              
              // Also update in chrome.storage.local
              chrome.storage.local.set({ 'user_credits': newCredits });
            }
            
            // Format the response with better styling
            const formattedResponse = formatAPIResponse(response.data);
            responseArea.innerHTML = formattedResponse;
            
            // Add a small indicator that credits were used
            const creditFooter = document.createElement('div');
            creditFooter.style.cssText = `
              margin-top: 20px;
              font-size: 12px;
              color: #666;
              text-align: right;
              padding-top: 10px;
              border-top: 1px solid #eee;
            `;
            
            // Use the credit information from the API if available
            if (response.credits) {
              creditFooter.textContent = `${response.credits.used} credit(s) used. ${response.credits.remaining} credits remaining.`;
            } else {
              creditFooter.textContent = `1 credit used. ${localStorage.getItem('user_credits')} credits remaining.`;
            }
            
            responseArea.appendChild(creditFooter);
          } else if (response && !response.success) {
            // Handle specific error codes
            if (response.errorCode === "INSUFFICIENT_CREDITS") {
              responseArea.innerHTML = `
                <div style="color: #d32f2f; padding: 10px; background-color: #ffebee; border-radius: 4px; margin-bottom: 15px;">
                  <strong>Out of credits!</strong> Please purchase more credits to continue analyzing positions.
                </div>
                <button id="buy-credits-now" style="padding: 10px 16px; background-color: #34a853; color: white;
                   border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500;">
                  Buy Credits Now
                </button>
              `;
              
              // Add event listener to the buy credits button
              setTimeout(() => {
                const buyCreditsNowButton = document.getElementById('buy-credits-now');
                if (buyCreditsNowButton) {
                  buyCreditsNowButton.addEventListener('click', showCreditPurchaseOptions);
                }
              }, 0);
            } else if (response.errorCode === "AUTH_REQUIRED") {
              responseArea.innerHTML = `
                <div style="color: #d32f2f; padding: 10px; background-color: #ffebee; border-radius: 4px; margin-bottom: 15px;">
                  <strong>Authentication required!</strong> Please log in to use the analysis feature.
                </div>
                <button id="login-now-btn" style="padding: 10px 16px; background-color: #4285f4; color: white;
                   border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500;">
                  Log In
                </button>
              `;
              
              // Add event listener to the login button
              setTimeout(() => {
                const loginButton = document.getElementById('login-now-btn');
                if (loginButton) {
                  loginButton.addEventListener('click', showLoginForm);
                }
              }, 0);
            } else {
              // General error
              responseArea.innerHTML = `
                <div style="color: #d32f2f; padding: 10px; background-color: #ffebee; border-radius: 4px;">
                  <strong>Error:</strong> ${response.error || "Unknown error occurred"}
                </div>
              `;
            }
          } else {
            // Handle case where response is undefined or doesn't have success property
            responseArea.innerHTML = `
              <div style="color: #d32f2f; padding: 10px; background-color: #ffebee; border-radius: 4px;">
                <strong>Error:</strong> Unknown error processing your request
              </div>
            `;
          }
        });
      } catch (error) {
        console.error("Error sending analysis request:", error);
        responseArea.innerHTML = `
          <div style="color: #d32f2f; padding: 10px; background-color: #ffebee; border-radius: 4px;">
            <strong>Error:</strong> ${error.message || "Failed to send analysis request"}
          </div>
        `;
      }
    });
  });
}

// Function to format API responses with better styling
function formatAPIResponse(response) {
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
    '<span style="color: #188038; font-weight: 500;">$&</span>');
  
  return formatted;
}

// Function to call the backend API with enhanced debugging
async function callAnalysisAPI(question, capturedBoard, imageData = null) {
  try {
    // Log the data being sent to API
    console.log("Sending to API - URL:", `${API_URL}/analysis`);
    console.log("Sending to API - FEN:", capturedBoard.fen);
    console.log("Sending to API - PGN:", capturedBoard.pgn ? "Present (length: " + capturedBoard.pgn.length + ")" : "Not included");
    console.log("Sending to API - Image data:", imageData ? "Present (length: " + imageData.length + ")" : "Not included");
    
    // Prepare chat history
    const chatHistory = [
      { text: question, sender: "user" }
    ];
    
    // Prepare the request payload
    const requestData = {
      message: question,
      fen: capturedBoard.fen,
      pgn: capturedBoard.pgn,
      image_data: imageData,
      chat_history: chatHistory
    };
    
    console.log("Request payload structure:", Object.keys(requestData));
    
    // Call our Python API with better error handling
    console.log("Initiating fetch to:", `${API_URL}/analysis`);
    
    // Add a timeout to the fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    try {
      const response = await fetch(`${API_URL}/analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestData),
        signal: controller.signal,
        mode: 'cors' // Explicitly set CORS mode
      });
      
      clearTimeout(timeoutId);
      
      console.log("Response status:", response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("API error response text:", errorText);
        throw new Error(`API response error: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log("API response parsed successfully:", data);
      
      if (!data.response) {
        console.error("API response missing 'response' field:", data);
        throw new Error("Invalid API response format - missing 'response' field");
      }
      
      return data.response;
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      // Check for specific fetch errors
      if (fetchError.name === 'AbortError') {
        console.error("Fetch request timed out");
        throw new Error("Request timed out. The server might be overloaded or unreachable.");
      } else if (fetchError.message.includes('NetworkError') || fetchError.message.includes('Failed to fetch')) {
        console.error("Network error - possibly CORS or SSL issue:", fetchError);
        
        // Fall back to XHR
        console.log("Falling back to XMLHttpRequest method...");
        return await callAnalysisAPIWithXHR(question, capturedBoard, imageData);
      } else {
        throw fetchError;
      }
    }
  } catch (error) {
    console.error("API call error details:", error);
    throw error;
  }
}

// Alternative implementation using XMLHttpRequest instead of fetch
// This can be more reliable in extension contexts
function callAnalysisAPIWithXHR(question, capturedBoard, imageData = null) {
  return new Promise((resolve, reject) => {
    try {
      console.log("Calling API with XMLHttpRequest");
      const url = `${API_URL}/analysis`;
      
      // Prepare chat history
      const chatHistory = [
        { text: question, sender: "user" }
      ];
      
      // Prepare the request payload
      const requestData = {
        message: question,
        fen: capturedBoard.fen,
        pgn: capturedBoard.pgn,
        image_data: imageData,
        chat_history: chatHistory
      };
      
      console.log("XHR Request URL:", url);
      
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Accept', 'application/json');
      
      // Add withCredentials for CORS if needed
      xhr.withCredentials = false;
      
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
          console.log("XHR Response received - Status:", xhr.status);
          
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              console.log("XHR Response parsed:", data);
              if (data && data.response) {
                resolve(data.response);
              } else {
                reject(new Error("Invalid API response format - missing 'response' field"));
              }
            } catch (e) {
              console.error("XHR Response parse error:", e);
              reject(new Error(`Failed to parse response: ${e.message}`));
            }
          } else if (xhr.status === 0) {
            // Status 0 often indicates CORS or network issues
            console.error("XHR Error: Status 0 received - likely CORS or network issue");
            reject(new Error("Network error: Cannot connect to the server. This may be due to CORS restrictions or the server being unavailable."));
          } else {
            console.error("XHR Error response:", xhr.status, xhr.statusText, xhr.responseText);
            reject(new Error(`API response error: ${xhr.status} ${xhr.statusText} - ${xhr.responseText}`));
          }
        }
      };
      
      xhr.onerror = function() {
        console.error("XHR Network error occurred");
        reject(new Error("Network error occurred. Please check your internet connection and ensure the API server is accessible."));
      };
      
      xhr.timeout = 60000;
      xhr.ontimeout = function() {
        console.error("XHR Request timed out");
        reject(new Error("Request timed out. The server might be overloaded or unreachable."));
      };
      
      // Convert and send the data
      const jsonData = JSON.stringify(requestData);
      console.log("Sending XHR request with data length:", jsonData.length);
      xhr.send(jsonData);
      
    } catch (error) {
      console.error("XHR Setup error:", error);
      reject(error);
    }
  });
}

// Function to load stored board data
async function loadStoredBoardData() {
  try {
    chrome.storage.local.get(['capturedBoard'], (result) => {
      const capturedBoard = result.capturedBoard;
      const capturedImage = document.getElementById('captured-board-image');
      const gameInfoContainer = document.getElementById('game-info-container');
      const fenValue = document.getElementById('fen-value');
      const pgnValue = document.getElementById('pgn-value');
      
      if (capturedBoard && capturedBoard.imageData && capturedImage) {
        console.log("Loaded stored board data");
        console.log("PGN data:", capturedBoard.pgn);
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
              console.log("Displaying PGN in sidebar:", capturedBoard.pgn);
              pgnValue.textContent = capturedBoard.pgn;
              pgnValue.style.display = 'block';
            } else {
              console.log("No PGN data to display");
              pgnValue.textContent = "No move history available";
              pgnValue.style.display = 'block';
            }
          }
        }
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
      }
    });
  } catch (error) {
    console.error("Error loading stored board data:", error);
  }
}

// Listen for messages from popup or background scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Content script received message:", request.action);
  
  // Add ping handler for extension health check - prioritize this
  if (request.action === "ping") {
    console.log("Ping received, responding immediately");
    sendResponse({ success: true, initialized: sidebarInitialized });
    return true;
  }
  
  // Handle user login event
  if (request.action === "userLoggedIn") {
    console.log("User logged in, initializing sidebar if needed");
    
    checkLoginStatus().then(async isLoggedIn => {
      if (!sidebarInitialized && isLoggedIn) {
        await initializeSidebar();
        
        // If sidebar was visible before, show it again
        if (sidebarVisible) {
          const sidebar = document.getElementById('chess-analysis-sidebar');
          if (sidebar) {
            sidebar.style.right = '0';
          }
        }
      }
      
      sendResponse({ success: true });
    });
    
    return true;
  }
  
  if (request.action === "showSidebar") {
    console.log("Show sidebar request received");
    
    // Use async login check
    checkLoginStatus().then(async isLoggedIn => {
      try {
        // If user is not logged in, show error
        if (!isLoggedIn) {
          console.log("User not logged in, cannot show sidebar");
          sendResponse({ 
            success: false, 
            message: "Please log in to use this feature." 
          });
          return;
        }
        
        // Initialize the sidebar if not already done
        if (!sidebarInitialized) {
          console.log("Initializing sidebar before showing it");
          await initializeSidebar();
        }
        
        // Show the sidebar if it was initialized successfully
        if (sidebarInitialized) {
          sidebarVisible = true;
          const sidebar = document.getElementById('chess-analysis-sidebar');
          if (sidebar) {
            sidebar.style.right = '0';
            console.log("Sidebar displayed");
            sendResponse({ success: true });
          } else {
            console.error("Sidebar element not found after initialization");
            sendResponse({ 
              success: false, 
              message: "Failed to create sidebar. Please reload the page and try again." 
            });
          }
        } else {
          console.error("Failed to initialize sidebar");
          sendResponse({ 
            success: false, 
            message: "Failed to initialize sidebar. Please reload the page and try again." 
          });
        }
      } catch (error) {
        console.error("Error showing sidebar:", error);
        sendResponse({ 
          success: false, 
          error: error.message 
        });
      }
    });
    
    return true; // Keep the message channel open
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
    
    return true; // Keep the message channel open
  }
  
  if (request.action === "paymentCompleted") {
    console.log("Payment completed message received", request);
    
    // Remove the overlay
    const overlay = document.getElementById('credits-modal-overlay');
    if (overlay) {
      document.body.removeChild(overlay);
    }
    
    if (request.success) {
      // Show success message
      alert(`Payment successful! ${request.creditsAdded} credits have been added to your account.`);
      
      // Update credits in localStorage
      const currentCredits = parseInt(localStorage.getItem('user_credits') || '0');
      localStorage.setItem('user_credits', (currentCredits + request.creditsAdded).toString());
      
      // Update credits display
      const creditsValueElement = document.getElementById('credits-value');
      if (creditsValueElement) {
        creditsValueElement.textContent = (currentCredits + request.creditsAdded).toString();
      }
    } else {
      // Show error message
      alert(`Payment failed: ${request.error || "Unknown error"}`);
    }
  }
  
  // Keep existing listeners running
  return true;
});

// Initialize the sidebar when the content script loads
// But wait for the page to be fully loaded first
document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM loaded, checking login status before initializing sidebar");
  
  // Use the async login check
  checkLoginStatus().then(isLoggedIn => {
    if (isLoggedIn) {
      console.log("User is logged in, initializing sidebar");
      initializeSidebar(); // async function, no need to await here
      
      // Load Razorpay script for payment processing
      loadRazorpayScript();
    } else {
      console.log("User is not logged in, sidebar will not be initialized");
    }
  });
});

// If the page is already loaded, initialize immediately if logged in
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  console.log("Page already loaded, checking login status");
  
  // Use the async login check
  checkLoginStatus().then(isLoggedIn => {
    if (isLoggedIn) {
      console.log("User is logged in, initializing sidebar immediately");
      initializeSidebar(); // async function, no need to await here
      
      // Load Razorpay script for payment processing
      loadRazorpayScript();
    } else {
      console.log("User is not logged in, sidebar will not be initialized");
    }
  });
}

// Function to load the Razorpay script
function loadRazorpayScript() {
  // We won't load Razorpay directly in the content script due to CSP restrictions
  // Instead, we'll use the background script to handle payments
  console.log("Using background script for payments to avoid CSP violations");
  
  // We'll keep track of whether we can handle payments
  window.canHandlePayments = true;
  
  // When initiating payments, we'll send a message to the background script
  // This is handled in the initiateRazorpayPayment function
}

// Add this code to the bottom of your content-script.js for a one-time test
// This will help verify if the API is accessible from the browser context

// Test API connectivity with both fetch and XMLHttpRequest
function testAPIDirectly() {
  console.log("Testing API connectivity directly...");
  
  const testData = {
    message: "What is the best move in this position?",
    fen: "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
    pgn: "1. e4 c5 2. Nf3",
    chat_history: []
  };
  
  // Test with fetch first
  console.log("Testing with fetch API...");
  fetch(`${API_URL}/analysis`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(testData),
    mode: 'cors',
    cache: 'no-cache'
  })
  .then(response => {
    console.log("Fetch test - Status:", response.status, response.statusText);
    if (!response.ok) {
      return response.text().then(text => {
        throw new Error(`API error: ${response.status} ${response.statusText} - ${text}`);
      });
    }
    return response.json();
  })
  .then(data => {
    console.log("Fetch test - Success!", data);
    console.log("%c✅ FETCH TEST SUCCEEDED", "color: green; font-weight: bold;");
    console.log("%cAPI Response:", "font-weight: bold;", data.response);
  })
  .catch(error => {
    console.error("Fetch test - Failed:", error);
    console.log("%c❌ FETCH TEST FAILED", "color: red; font-weight: bold;");
    
    // If fetch fails, try with XMLHttpRequest
    testWithXHR();
  });
  
  // Test with XMLHttpRequest as a backup
  function testWithXHR() {
    console.log("Testing with XMLHttpRequest...");
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/analysis`, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'application/json');
    
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        console.log("XHR test - Status:", xhr.status);
        
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            console.log("XHR test - Success!", data);
            console.log("%c✅ XHR TEST SUCCEEDED", "color: green; font-weight: bold;");
            console.log("%cAPI Response:", "font-weight: bold;", data.response);
          } catch (e) {
            console.error("XHR test - Parse error:", e);
            console.log("%c❌ XHR TEST FAILED (Parse error)", "color: red; font-weight: bold;");
          }
        } else {
          console.error("XHR test - Failed:", xhr.status, xhr.statusText);
          console.log("%c❌ XHR TEST FAILED", "color: red; font-weight: bold;");
        }
      }
    };
    
    xhr.onerror = function() {
      console.error("XHR test - Network error");
      console.log("%c❌ XHR TEST FAILED", "color: red; font-weight: bold;");
      
      // Provide troubleshooting guidance
      console.log("%c🔍 TROUBLESHOOTING SUGGESTIONS:", "color: blue; font-weight: bold;");
      console.log("1. Check if the API server is running");
      console.log(`2. Verify the API URL is correct: ${API_URL}`);
      console.log("3. Ensure CORS is properly configured on the server");
      console.log("4. Check if the server's SSL certificate is valid");
      console.log("5. Try accessing the API URL directly in your browser");
    };
    
    xhr.timeout = 30000;
    xhr.ontimeout = function() {
      console.error("XHR test - Timeout");
      console.log("%c❌ XHR TEST FAILED (Timeout)", "color: red; font-weight: bold;");
    };
    
    xhr.send(JSON.stringify(testData));
  }
}

// Run the test after a delay to ensure the page is fully loaded
setTimeout(testAPIDirectly, 3000);

// Simple ping test to see if the server is accessible at all
function pingApiServer() {
  console.log("Pinging API server...");
  
  // Try a simple GET request to the root endpoint
  fetch(`${API_URL}/`, {
    method: 'GET',
    headers: { 
      'Accept': 'application/json, text/plain, */*',
      'Cache-Control': 'no-cache'
    },
    mode: 'cors',
    cache: 'no-cache'
  })
    .then(response => {
      console.log("Ping response status:", response.status, response.statusText);
      if (!response.ok) {
        console.log("%c⚠️ PING RECEIVED ERROR RESPONSE", "color: orange; font-weight: bold;");
      } else {
        console.log("%c✅ PING SUCCESSFUL", "color: green; font-weight: bold;");
      }
      return response.text();
    })
    .then(text => {
      console.log("Ping response text:", text ? text.substring(0, 100) + "..." : "(empty)");
    })
    .catch(error => {
      console.error("Ping failed:", error);
      console.log("%c❌ PING FAILED - SERVER MIGHT BE UNREACHABLE", "color: red; font-weight: bold;");
      
      // Try with XMLHttpRequest as a fallback
      console.log("Trying ping with XMLHttpRequest...");
      const xhr = new XMLHttpRequest();
      xhr.open('GET', `${API_URL}/`, true);
      xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
      xhr.setRequestHeader('Cache-Control', 'no-cache');
      
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
          if (xhr.status >= 200 && xhr.status < 300) {
            console.log("%c✅ XHR PING SUCCESSFUL", "color: green; font-weight: bold;");
            console.log("XHR Ping response:", xhr.responseText ? xhr.responseText.substring(0, 100) + "..." : "(empty)");
          } else {
            console.log("%c❌ XHR PING FAILED", "color: red; font-weight: bold;");
            console.error("XHR Ping error:", xhr.status, xhr.statusText);
          }
        }
      };
      
      xhr.onerror = function() {
        console.log("%c❌ XHR PING NETWORK ERROR", "color: red; font-weight: bold;");
        console.error("XHR Ping network error - server might be unreachable or CORS issues");
        
        // Provide troubleshooting guidance
        console.log("%c🔍 TROUBLESHOOTING SUGGESTIONS:", "color: blue; font-weight: bold;");
        console.log("1. Check if the API server is running");
        console.log(`2. Verify the API URL is correct: ${API_URL}`);
        console.log("3. Ensure CORS is properly configured on the server");
        console.log("4. Check if the server's SSL certificate is valid");
        console.log("5. Try accessing the API URL directly in your browser");
      };
      
      xhr.timeout = 10000;
      xhr.ontimeout = function() {
        console.log("%c❌ XHR PING TIMED OUT", "color: red; font-weight: bold;");
      };
      
      xhr.send();
    });
}

// Run the ping test after a short delay
setTimeout(pingApiServer, 1000);

// Add this function to check if your SSL is working correctly
function checkSSLCertificate() {
  console.log("Checking SSL certificate...");
  
  fetch(`${API_URL}/`, {
    method: 'GET',
    headers: { 
      'Accept': 'application/json, text/plain, */*',
      'Cache-Control': 'no-cache'
    },
    mode: 'cors',
    cache: 'no-cache'
  })
  .then(response => {
    console.log("SSL Certificate check - Status:", response.status);
    
    // Check for certificate information in the request
    const securityInfo = window.performance && 
                         window.performance.getEntriesByType && 
                         window.performance.getEntriesByType("resource").find(r => 
                           r.name.includes(API_URL.replace("https://", ""))
                         );
    
    if (securityInfo) {
      console.log("Resource metrics for API:", securityInfo);
    }
    
    return response.text();
  })
  .then(() => {
    console.log("%c✅ SSL CONNECTION SUCCESSFUL", "color: green; font-weight: bold;");
  })
  .catch(error => {
    console.error("SSL Certificate check failed:", error);
    console.log("%c❌ SSL CONNECTION FAILED", "color: red; font-weight: bold;");
    
    // If the fetch fails, we'll try an alternative approach
    const img = new Image();
    const startTime = Date.now();
    
    img.onload = function() {
      console.log("%c✅ ALTERNATIVE SSL CHECK PASSED", "color: green; font-weight: bold;");
      console.log("Image loaded in", Date.now() - startTime, "ms");
    };
    
    img.onerror = function() {
      console.log("%c❌ ALTERNATIVE SSL CHECK FAILED", "color: red; font-weight: bold;");
      console.error("Server may have SSL issues or certificate problems");
      
      // Display specific error guidance
      console.log("%c🔍 DEBUGGING SUGGESTIONS:", "color: blue; font-weight: bold;");
      console.log("1. Check if certificate is properly installed on server");
      console.log("2. Verify certificate isn't self-signed (browsers block these)");
      console.log("3. Ensure certificate hasn't expired");
      console.log("4. Check if certificate domain matches your API domain");
      console.log("5. Try accessing the API URL directly in your browser");
      console.log(`6. Current API URL: ${API_URL}`);
      
      // Suggest checking CORS configuration
      console.log("%c🔍 CORS CONFIGURATION:", "color: blue; font-weight: bold;");
      console.log("Ensure your server has the following CORS headers:");
      console.log("- Access-Control-Allow-Origin: *");
      console.log("- Access-Control-Allow-Methods: GET, POST, OPTIONS");
      console.log("- Access-Control-Allow-Headers: Content-Type, Accept");
    };
    
    // Try loading a tiny image from the server to test SSL
    img.src = `${API_URL}/favicon.ico?` + new Date().getTime();
  });
}

// Run SSL check after a short delay
setTimeout(checkSSLCertificate, 2000);

// Display instructions on how to inspect SSL issues
console.log("%c🔒 SSL/HTTPS DEBUGGING HELP:", "color: purple; font-weight: bold;");
console.log("1. Click the padlock icon in your browser address bar when visiting your API");
console.log("2. Check for 'Certificate (Invalid)' or other warnings");
console.log("3. For self-signed certificates, consider using a free Let's Encrypt certificate");
console.log("4. Verify your Nginx configuration is correct for SSL");

// Function to inject custom CSS with web-safe fonts
function injectCustomCSS() {
  const css = `
    /* Use only system fonts to avoid Content Security Policy issues */
    .chess-analyzer-sidebar,
    .chess-analyzer-sidebar * {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif !important;
    }
    
    .chess-analyzer-sidebar h1,
    .chess-analyzer-sidebar h2,
    .chess-analyzer-sidebar h3,
    .chess-analyzer-sidebar h4 {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif !important;
    }
    
    .chess-analyzer-sidebar button {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif !important;
      font-weight: bold;
    }
    
    /* Success and error message styling */
    .success-message {
      color: #34a853;
      font-weight: bold;
    }
    
    .error-message {
      color: #ea4335;
      font-weight: bold;
    }
    
    /* Remove any external resources that might cause CSP violations */
    @font-face {
      font-family: 'Chess';
      src: local('Chess');
      font-display: block;
    }
  `;
  
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  console.log("Custom CSS with system fonts injected");
}