const CACHE_BUST = new Date().getTime();
console.log("Cache bust ID:", CACHE_BUST);

// Helper function to validate FEN string format - Moved to top-level scope
function isValidFENFormat(fen) {
  if (!fen || typeof fen !== 'string') return false;

  const fields = fen.trim().split(/\s+/);
  if (fields.length !== 6) return false;

  const ranks = fields[0].split('/');
  if (ranks.length !== 8) return false;

  for (const rank of ranks) {
    let fileCount = 0;
    for (const char of rank) {
      if (/\d/.test(char)) {
        const num = parseInt(char, 10);
        if (num < 1 || num > 8) return false;
        fileCount += num;
      } else if (/[prnbqkPRNBQK]/.test(char)) {
        fileCount += 1;
      } else {
        return false;
      }
    }
    if (fileCount !== 8) return false;
  }

  if (!/^[wb]$/.test(fields[1])) return false;
  if (!/^(KQ?k?q?|Qk?q?|kq?|q|-)$/.test(fields[2].replace(/[^KQkq-]/g, ''))) return false;
  if (!/^(-|[a-h][36])$/.test(fields[3])) return false;

  return true;
}

// Make the function available globally
window.isValidFENFormat = isValidFENFormat;

// Block data URL font loading that would violate CSP
(function blockDataURLFonts() {
  // Override the FontFace constructor to block data: URLs
  if (window.FontFace) {
    const originalFontFace = window.FontFace;
    window.FontFace = function(family, source, descriptors) {
      // Check if source contains a data: URL for fonts
      if (typeof source === 'string' && 
          (source.includes('data:application/font-woff') || 
           source.includes('data:application/font-woff2') ||
           source.includes('data:font/woff') ||
           source.includes('data:font/woff2') ||
           (family === 'Roboto'))) {
        console.log(`Blocked loading of data URL font: ${family}`);
        // Replace with system font fallback
        source = 'local("-apple-system"), local("BlinkMacSystemFont"), local("Segoe UI")';
      }
      return new originalFontFace(family, source, descriptors);
    };
  }
  
  // Also override CSS's @font-face rule by monitoring style insertions
  const originalInsertRule = CSSStyleSheet.prototype.insertRule;
  if (originalInsertRule) {
    CSSStyleSheet.prototype.insertRule = function(rule, index) {
      if ((rule.includes('@font-face') && 
          (rule.includes('data:application/font-woff') || 
           rule.includes('data:application/font-woff2') ||
           rule.includes('data:font/woff') ||
           rule.includes('data:font/woff2') ||
           rule.includes('Roboto'))) ||
          rule.includes('fonts.googleapis.com') ||
          rule.includes('fonts.gstatic.com')) {
        console.log('Blocked @font-face rule with data URL or Google Fonts');
        return 0; // Return index to avoid errors
      }
      return originalInsertRule.call(this, rule, index);
    };
  }
})();

// This is the main content script that gets injected by Chrome
console.log("Chess analyzer content script loader initialized - Integrated Sidebar Version");

// Global variables for sidebar state and data
let sidebarInitialized = false;
let sidebarVisible = false;
let sidebarChatHistory = []; // History specifically for the sidebar session
let sidebarIsLoading = false; // Loading state for sidebar analysis
let sidebarCapturedBoard = null; // Store board data used by the sidebar
// Load saved model preference or use default. Ensure default matches backend/MODEL_MAP
let selectedModel = localStorage.getItem('selectedChessModel') || 'gpt-4o-mini';

// API configuration (used for credit purchase options, mainly)
const API_URL = "https://api.beekayprecision.com"; // Use HTTPS

// Model Definitions (User-friendly name -> API ID used in communication)
// Ensure these API IDs match the keys in `MODEL_MAP` in main2.py
const AVAILABLE_MODELS = {
    "GPT-4o Mini": "gpt-4o-mini",
    "GPT-4o": "gpt-4o",
    "Claude 3.5 Sonnet": "claude-3-5-sonnet-20240620",
    "Gemini 1.5 Flash": "gemini-1.5-flash-latest"
    // Add more models here if supported by the backend
};

// --- Login Status Check ---
function checkLoginStatus() {
  return new Promise((resolve) => {
    // Prioritize localStorage for speed, fallback to chrome.storage
    const token = localStorage.getItem('auth_token');
    if (token) {
      // Optional: Verify token validity with backend here if needed frequently
      resolve(true); return;
    }
    // Fallback check in chrome.storage.local
    chrome.storage.local.get(['auth_token'], (result) => {
      if (result && result.auth_token) {
        // Sync to localStorage if found for faster access next time
        localStorage.setItem('auth_token', result.auth_token);
        chrome.storage.local.get(['user_id', 'user_name'], (userInfo) => {
          if (userInfo.user_id) localStorage.setItem('user_id', userInfo.user_id);
          if (userInfo.user_name) localStorage.setItem('user_name', userInfo.user_name);
          console.log("Auth data synced from chrome.storage to localStorage");
        });
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

// --- Sidebar UI Creation and Initialization ---
async function initializeSidebar() {
  // Inject custom CSS needed for the sidebar and its components
  injectCustomCSS();

  if (sidebarInitialized) {
    console.log("Sidebar already initialized.");
    return;
  }

  const isUserLoggedIn = await checkLoginStatus();
  if (!isUserLoggedIn) {
    console.log("User not logged in, sidebar not initializing.");
    // Optionally, still create a basic sidebar that prompts login
    return;
  }

  console.log("Initializing sidebar UI...");

  // --- Create Sidebar Structure ---
  const sidebar = document.createElement('div');
  sidebar.id = 'chess-analysis-sidebar';
  // CSS is now primarily handled by injectCustomCSS

  // --- Create Toggle Button ---
  const toggleButton = document.createElement('div');
  toggleButton.id = 'sidebar-toggle';
  toggleButton.innerHTML = `<span style="transform: rotate(-90deg); font-size: 16px; line-height: 1;">▲</span>`; // Open icon
  toggleButton.title = "Open Analysis Sidebar";
  toggleButton.addEventListener('click', toggleSidebar);

  // --- Sidebar Content Wrapper ---
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'sidebar-content-wrapper'; // Use class for easier CSS targeting

  // --- Header ---
  const header = document.createElement('div');
  header.className = 'sidebar-header';
  header.innerHTML = '<h2>Chess Analysis</h2>';
  const closeButton = document.createElement('button');
  closeButton.className = 'sidebar-close-button';
  closeButton.textContent = '✕';
  closeButton.title = "Close Sidebar";
  closeButton.addEventListener('click', toggleSidebar);
  header.appendChild(closeButton);

  // --- User Section (Welcome, Credits, Logout) ---
  const userSection = document.createElement('div');
  userSection.className = 'sidebar-user-section';
  // User Info Row
  const userInfoRow = document.createElement('div');
  userInfoRow.className = 'sidebar-user-info-row';
  const welcomeMessage = document.createElement('div');
  welcomeMessage.id = 'sidebar-welcome-message';
  const logoutButton = document.createElement('button');
  logoutButton.id = 'sidebar-logout-button';
  logoutButton.textContent = 'Logout';
  logoutButton.addEventListener('click', handleLogout);
  userInfoRow.appendChild(welcomeMessage);
  userInfoRow.appendChild(logoutButton);
  // Credits Row
  const creditsSection = document.createElement('div');
  creditsSection.className = 'sidebar-credits-section';
  const creditsDisplay = document.createElement('div');
  creditsDisplay.id = 'sidebar-credits-display';
  creditsDisplay.innerHTML = `<span>Credits: </span><span id="sidebar-credits-value">Loading...</span>`;
  const buyCreditsButton = document.createElement('button');
  buyCreditsButton.id = 'sidebar-buy-credits-button';
  buyCreditsButton.textContent = 'Buy Credits';
  buyCreditsButton.addEventListener('click', showCreditPurchaseOptions);
  creditsSection.appendChild(creditsDisplay);
  creditsSection.appendChild(buyCreditsButton);
  // Assemble User Section
  userSection.appendChild(userInfoRow);
  userSection.appendChild(creditsSection);
  // Update welcome message async
  updateWelcomeMessage(welcomeMessage);

  // --- Capture Button ---
  const captureButton = document.createElement('button');
  captureButton.id = 'sidebar-capture-button';
  captureButton.textContent = 'Capture Current Position';
  captureButton.addEventListener('click', captureCurrentPosition);

  // --- Chat Messages Area ---
  const chatMessagesContainer = document.createElement('div');
  chatMessagesContainer.id = 'sidebar-chat-messages';
  // Initial message set by renderSidebarChatHistory

  // --- Captured Board Preview ---
  const boardPreviewContainer = document.createElement('div');
  boardPreviewContainer.id = 'sidebar-board-preview-container';
  boardPreviewContainer.style.display = 'none'; // Hidden initially
  const boardPreviewLabel = document.createElement('div');
  boardPreviewLabel.className = 'sidebar-preview-label';
  boardPreviewLabel.textContent = 'Current Position:';
  const boardPreviewImage = document.createElement('img');
  boardPreviewImage.id = 'sidebar-captured-board-image';
  boardPreviewImage.title = 'Captured board preview';
  boardPreviewContainer.appendChild(boardPreviewLabel);
  boardPreviewContainer.appendChild(boardPreviewImage);

  // --- Controls Area (Vision Toggle + Model Select) ---
  const controlsContainer = document.createElement('div');
  controlsContainer.className = 'sidebar-controls-container';

  // AI Vision Toggle
  const aiVisionContainer = document.createElement('div');
  aiVisionContainer.className = 'sidebar-control-row';
  const aiVisionToggle = document.createElement('input');
  aiVisionToggle.type = 'checkbox';
  aiVisionToggle.id = 'sidebar-ai-vision-toggle';
  aiVisionToggle.checked = true; // Default ON
  const aiVisionLabel = document.createElement('label');
  aiVisionLabel.htmlFor = 'sidebar-ai-vision-toggle';
  aiVisionLabel.textContent = 'Use AI Vision (if image captured)';
  aiVisionContainer.appendChild(aiVisionToggle);
  aiVisionContainer.appendChild(aiVisionLabel);

  // Model Selection Dropdown
  const modelSelectionContainer = document.createElement('div');
  modelSelectionContainer.className = 'sidebar-control-row';
  const modelSelectLabel = document.createElement('label');
  modelSelectLabel.htmlFor = 'sidebar-model-select';
  modelSelectLabel.textContent = 'Model:';
  const modelSelect = document.createElement('select');
  modelSelect.id = 'sidebar-model-select';
  // Populate options from AVAILABLE_MODELS
  for (const [name, id] of Object.entries(AVAILABLE_MODELS)) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = name;
      if (id === selectedModel) { // Set the loaded/default preference
          option.selected = true;
      }
      modelSelect.appendChild(option);
  }
  // Save selection on change
  modelSelect.addEventListener('change', (event) => {
      selectedModel = event.target.value;
      localStorage.setItem('selectedChessModel', selectedModel); // Persist selection
      console.log("Analysis Model selection changed to:", selectedModel);
      // Optionally, add a visual confirmation or clear chat history on model change?
      // E.g., sidebarChatHistory = []; renderSidebarChatHistory();
  });
  modelSelectionContainer.appendChild(modelSelectLabel);
  modelSelectionContainer.appendChild(modelSelect);

  controlsContainer.appendChild(aiVisionContainer);
  controlsContainer.appendChild(modelSelectionContainer);


  // --- Chat Input Area ---
  const chatInputArea = document.createElement('div');
  chatInputArea.className = 'sidebar-chat-input-area';
  const questionInput = document.createElement('textarea');
  questionInput.id = 'sidebar-question-input';
  questionInput.placeholder = 'Ask about the position...';
  questionInput.rows = 1;
  const askButton = document.createElement('button');
  askButton.id = 'sidebar-ask-button';
  askButton.innerHTML = `
     <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
       <line x1="22" y1="2" x2="11" y2="13"></line>
       <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
     </svg>`; // Send icon
  askButton.title = "Send message";
  // Event listeners for input/button
  askButton.addEventListener('click', handleSidebarSendMessage);
  questionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSidebarSendMessage();
    }
    // Auto-resize textarea
    setTimeout(() => { // Timeout ensures value is updated before calculating scrollHeight
        questionInput.style.height = 'auto'; // Temporarily shrink
        let scrollHeight = questionInput.scrollHeight;
        const maxHeight = 80; // Match max-height in CSS
        questionInput.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }, 0);
  });

  chatInputArea.appendChild(questionInput);
  chatInputArea.appendChild(askButton);

  // --- Assemble Sidebar Content ---
  contentWrapper.appendChild(header);
  contentWrapper.appendChild(userSection);
  contentWrapper.appendChild(captureButton);
  contentWrapper.appendChild(chatMessagesContainer);
  contentWrapper.appendChild(boardPreviewContainer);
  contentWrapper.appendChild(controlsContainer); // Add controls container
  contentWrapper.appendChild(chatInputArea);

  sidebar.appendChild(contentWrapper);

  // --- Add Elements to Page ---
  // Ensure old elements are removed if re-initializing (e.g., during development HMR)
  document.getElementById('chess-analysis-sidebar')?.remove();
  document.getElementById('sidebar-toggle')?.remove();

  document.body.appendChild(sidebar);
  document.body.appendChild(toggleButton);

  sidebarInitialized = true;
  console.log("Sidebar UI initialized successfully.");

  // Initial setup calls after UI is in DOM
  fetchUserCredits();
  loadStoredBoardData(true); // Load initial board data and render chat state
  // Check if sidebar should be opened based on session state
  if (sessionStorage.getItem('sidebarWasVisible') === 'true' && !sidebarVisible) {
       toggleSidebar();
  }
}

// --- Helper Function to Update Welcome Message ---
async function updateWelcomeMessage(element) {
    if (!element) return; // Element might not exist if sidebar init failed
    let userName = localStorage.getItem('user_name') || 'User';
    // Fallback to chrome.storage if not in localStorage
    if (userName === 'User') {
        try {
            const result = await new Promise((resolve) => chrome.storage.local.get(['user_name'], resolve));
            userName = result?.user_name || 'User';
        } catch(e) { console.error("Error getting username from storage", e); }
    }
    element.innerHTML = `<span>Welcome, </span><span class="sidebar-username">${userName}</span>`;
}

// --- Sidebar Visibility Toggle ---
function toggleSidebar() {
  const sidebar = document.getElementById('chess-analysis-sidebar');
  const toggleButton = document.getElementById('sidebar-toggle');
  if (!sidebar || !toggleButton) return;

  sidebarVisible = !sidebarVisible;
  if (sidebarVisible) {
    sidebar.classList.add('visible'); // Use class for visibility
    toggleButton.classList.add('shifted');
    toggleButton.innerHTML = `<span style="font-size: 18px; line-height: 1;">✕</span>`; // Close icon
    toggleButton.title = "Close Sidebar";
    sessionStorage.setItem('sidebarWasVisible', 'true'); // Store state
  } else {
    sidebar.classList.remove('visible');
    toggleButton.classList.remove('shifted');
    toggleButton.innerHTML = `<span style="transform: rotate(-90deg); font-size: 16px; line-height: 1;">▲</span>`; // Open icon
    toggleButton.title = "Open Analysis Sidebar";
    sessionStorage.setItem('sidebarWasVisible', 'false'); // Store state
  }
  console.log("Sidebar visibility toggled:", sidebarVisible);
}

// --- Sidebar Specific Chat Handling ---

// Render chat history in the sidebar
function renderSidebarChatHistory() {
  const container = document.getElementById('sidebar-chat-messages');
  if (!container) return;
  container.innerHTML = ''; // Clear existing

  // Determine initial message based on state
  if (!sidebarCapturedBoard) {
     container.innerHTML = `<p class="sidebar-chat-placeholder">Capture a board position using the button above to start analysis.</p>`;
  } else if (sidebarChatHistory.length === 0) {
      container.innerHTML = `<p class="sidebar-chat-placeholder">Position captured. Select an analysis model and ask a question below.</p>`;
  } else {
    // Render actual chat messages
    sidebarChatHistory.forEach(message => {
      const messageDiv = document.createElement('div');
      messageDiv.classList.add('sidebar-chat-message', message.sender === 'user' ? 'user-message' : 'assistant-message');
      if (message.sender === 'error') {
          messageDiv.classList.add('error-message');
          messageDiv.innerHTML = `<strong>Error:</strong> ${message.text}`;
      } else {
          // Display which model responded for assistant messages
          const modelTag = message.sender === 'assistant' && message.model
              ? `<span class="model-tag">(${Object.keys(AVAILABLE_MODELS).find(key => AVAILABLE_MODELS[key] === message.model) || message.model})</span>`
              : '';
          // Use textContent for user, formatted HTML for assistant
          messageDiv.innerHTML = message.sender === 'user'
              ? message.text // Let CSS handle formatting/wrapping
              : formatAPIResponse(message.text) + modelTag;
      }
      container.appendChild(messageDiv);
    });
  }
  // Scroll to bottom after rendering
  requestAnimationFrame(() => { // Ensure rendering is complete
     container.scrollTop = container.scrollHeight;
  });
}

// Show/Hide loading indicator in sidebar chat
function showSidebarLoading(show) {
  const container = document.getElementById('sidebar-chat-messages');
  let loadingIndicator = document.getElementById('sidebar-loading-indicator');
  const askButton = document.getElementById('sidebar-ask-button');
  const questionInput = document.getElementById('sidebar-question-input');
  const modelSelect = document.getElementById('sidebar-model-select');

  if (show) {
    if (!loadingIndicator && container) {
      loadingIndicator = document.createElement('div');
      loadingIndicator.id = 'sidebar-loading-indicator';
      loadingIndicator.className = 'sidebar-loading-indicator'; // Use class for styling via CSS
      loadingIndicator.innerHTML = `<div class="spinner"></div><span>Analyzing...</span>`;
      container.appendChild(loadingIndicator);
      container.scrollTop = container.scrollHeight; // Scroll down to show loader
    } else if (loadingIndicator) {
        loadingIndicator.style.display = 'flex'; // Show existing one
        container.scrollTop = container.scrollHeight;
    }
    sidebarIsLoading = true;
    if (askButton) askButton.disabled = true;
    if (questionInput) questionInput.disabled = true;
    if (modelSelect) modelSelect.disabled = true; // Disable model selection during analysis
  } else {
    if (loadingIndicator) {
      loadingIndicator.style.display = 'none'; // Hide existing one
    }
    sidebarIsLoading = false;
    if (askButton) askButton.disabled = false;
    if (questionInput) questionInput.disabled = false;
    if (modelSelect) modelSelect.disabled = false; // Re-enable model selection
  }
}

// Display error in sidebar chat (adds to history)
function displaySidebarError(errorMessage) {
   // Use the currently selected model for context, though error might be before model call
   sidebarChatHistory.push({ text: errorMessage, sender: 'error', model: selectedModel });
   renderSidebarChatHistory(); // Re-render to show the error message
}

// Handle sending a message from the sidebar input
async function handleSidebarSendMessage() {
  if (sidebarIsLoading) return; // Prevent multiple submissions

  const input = document.getElementById('sidebar-question-input');
  const question = input.value.trim();
  const modelSelect = document.getElementById('sidebar-model-select');
  // Read the currently selected model ID from the dropdown
  const selectedModelId = modelSelect ? modelSelect.value : DEFAULT_MODEL_ID; // Use stored default if select fails

  if (!question) return; // Don't send empty messages
  if (!sidebarCapturedBoard) {
    displaySidebarError("Please capture a board position first.");
    return;
  }

  // Add user message to history and render immediately
  sidebarChatHistory.push({ text: question, sender: 'user' });
  renderSidebarChatHistory(); // Show user message
  input.value = ''; // Clear input
  input.style.height = 'auto'; // Reset height

  showSidebarLoading(true); // Show loading indicator, disable inputs

  const useVisionToggle = document.getElementById('sidebar-ai-vision-toggle');
  const useVision = (useVisionToggle ? useVisionToggle.checked : true) && sidebarCapturedBoard.imageData;

  // Store the model used for this specific request for accurate display later
  const modelUsedForThisRequest = selectedModelId;

  try {
    // Send message to background script for analysis, including the selected model
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: "analyzeChessPosition",
        question: question,
        capturedBoard: sidebarCapturedBoard,
        useVision: useVision,
        chatHistory: sidebarChatHistory, // Send history including the latest user message
        model: modelUsedForThisRequest   // Pass the selected model ID
      }, (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || "Runtime error sending analysis request"));
        } else if (res && res.success) {
          resolve(res);
        } else {
          // Construct error message, including potential error codes from backend
          let errorMsg = res?.error || "Analysis failed";
          if (res?.errorCode) errorMsg += ` (Code: ${res.errorCode})`;
          reject(new Error(errorMsg));
        }
      });
    });

    // Add assistant response to history, including which model provided it
    sidebarChatHistory.push({
        text: response.data,
        sender: 'assistant',
        model: modelUsedForThisRequest // Store model used for this response
    });

    // Update credits display based on response from backend
     if (response.credits && typeof response.credits.remaining === 'number') {
        updateCreditsDisplay(response.credits.remaining);
     }

  } catch (error) {
    console.error(`Error during sidebar analysis (${modelUsedForThisRequest}):`, error);
    // Add error message to chat history, indicating the model attempted
    displaySidebarError(`Analysis with ${Object.keys(AVAILABLE_MODELS).find(key => AVAILABLE_MODELS[key] === modelUsedForThisRequest) || modelUsedForThisRequest} failed: ${error.message}`);
  } finally {
    showSidebarLoading(false); // Hide loading indicator, re-enable inputs
    // Render history again to show the response or the error message
    renderSidebarChatHistory();
  }
}

// --- Logout ---
function handleLogout() {
  console.log("Logout action triggered");
  localStorage.clear(); // Clear all localStorage for this domain (includes token, maybe prefs)
  sessionStorage.removeItem('sidebarWasVisible'); // Clear session state too
  chrome.storage.local.clear(() => { // Clear all extension storage (token, cached user info, board)
    console.log("Auth data and all extension storage cleared.");
    // Remove sidebar UI elements
    document.getElementById('chess-analysis-sidebar')?.remove();
    document.getElementById('sidebar-toggle')?.remove();
    // Reset state variables
    sidebarInitialized = false;
    sidebarVisible = false;
    sidebarChatHistory = [];
    sidebarCapturedBoard = null;
    selectedModel = 'gpt-4o-mini'; // Reset model preference on logout

    alert("You have been logged out. The sidebar will be removed.");
    // Consider reloading the page if the site relies heavily on logged-in state
    // window.location.reload();
  });
}

// --- Credits Handling ---
function fetchUserCredits() {
  console.log("Fetching user credits for sidebar");
  const creditsValueElement = document.getElementById('sidebar-credits-value');
  if (!creditsValueElement) { console.error("Sidebar credits value element not found"); return; }

  const token = localStorage.getItem('auth_token');
  if (!token) { creditsValueElement.textContent = "N/A"; console.log("No auth token found for credits."); return; }

  console.log("Using token for credits fetch (length: " + token.length + ")");

  // Show cached value immediately if available, otherwise 'Loading...'
  const cachedCredits = localStorage.getItem('user_credits');
  creditsValueElement.textContent = cachedCredits || 'Loading...';

  // Use cors mode so we can properly read the response
  fetch(`${API_URL}/credits/balance`, { 
    method: 'GET',
    headers: { 
      'Authorization': token, 
      'Content-Type': 'application/json'
    },
    mode: 'cors'
  })
  .then(response => {
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Authentication required");
      } else if (response.status === 500) {
        throw new Error("Server error");
      } else {
        throw new Error(`Server returned ${response.status}`);
      }
    }
    return response.json();
  })
  .then(data => {
    if (data && typeof data.balance === 'number') {
      // Update displayed credit value
      creditsValueElement.textContent = data.balance;
      // Store in localStorage for instant display on next load
      localStorage.setItem('user_credits', data.balance.toString());
      // Also sync with chrome.storage.local for potential use elsewhere
      chrome.storage.local.set({ 'user_credits': data.balance });
    } else {
      console.error("Invalid credits data format:", data);
      creditsValueElement.textContent = cachedCredits || "Use popup";
    }
  })
  .catch(error => {
    console.error("Error fetching credits:", error);
    creditsValueElement.textContent = cachedCredits || "Use popup";
    
    // Show the popup explanation dialog if not shown in this session
    if (!sessionStorage.getItem('creditsPopupMessageShown')) {
      sessionStorage.setItem('creditsPopupMessageShown', 'true');
      alert("Please click the extension icon in your browser toolbar to check your balance and purchase credits.");
    }
  });
}

function updateCreditsDisplay(credits) {
    const creditsValueElement = document.getElementById('sidebar-credits-value');
    if (creditsValueElement) {
        creditsValueElement.textContent = credits;
    }
    // Store in localStorage for instant display on next load
    localStorage.setItem('user_credits', credits.toString());
    // Also sync with chrome.storage.local for potential use elsewhere
    chrome.storage.local.set({ 'user_credits': credits });
}

// Trigger opening the popup for credit purchase
function showCreditPurchaseOptions() {
    console.log("Buy Credits button clicked in sidebar");
    
    // Show small notification in sidebar first
    const creditsValueElement = document.getElementById('sidebar-credits-value');
    if (creditsValueElement) {
        creditsValueElement.textContent = "Loading...";
    }
    
    // First try to get token from localStorage
    let token = localStorage.getItem('auth_token');
    console.log("Retrieved token from localStorage:", token ? "Token exists (length: " + token.length + ")" : "No token found");
    
    // If not in localStorage, try chrome.storage
    if (!token) {
        console.log("No token in localStorage, checking chrome.storage...");
        chrome.storage.local.get(['auth_token'], function(result) {
            if (result && result.auth_token) {
                console.log("Token found in chrome.storage, using it");
                processWithToken(result.auth_token);
            } else {
                // No token found anywhere
                console.error("No authentication token found");
                alert("Please log in to purchase credits.");
                if (creditsValueElement) {
                    creditsValueElement.textContent = "Login required";
                }
            }
        });
    } else {
        // We have a token from localStorage
        processWithToken(token);
    }
    
    // Function to handle the actual window opening with a token
    function processWithToken(authToken) {
        try {
            // Get the full URL to the packages.html file and append token as URL parameter
            const packageUrl = chrome.runtime.getURL('src/payment/packages.html') + `?token=${encodeURIComponent(authToken)}`;
            console.log("Opening package window with URL containing token");
            
            // Open a separate window with package options from our HTML file
            const packageWindow = window.open(packageUrl, 'ChessAnalyzerPackages', 'width=500,height=650,resizable=yes');
            
            if (!packageWindow) {
                alert("Pop-up blocked! Please allow pop-ups for this site to purchase credits.");
                if (creditsValueElement) {
                    creditsValueElement.textContent = "Error";
                }
                return;
            }

            // Monitor window close
            const windowCheckInterval = setInterval(function() {
                if (packageWindow.closed) {
                    clearInterval(windowCheckInterval);
                    console.log("Package window was closed by user");
                    // Refresh credit display
                    fetchUserCredits();
                }
            }, 500);
            
        } catch (error) {
            console.error("Error opening package window:", error);
            alert("An error occurred while opening the payment window. Please try again.");
            if (creditsValueElement) {
                creditsValueElement.textContent = "Error";
            }
        }
    }
}

// --- Board Capture & Loading ---
function captureCurrentPosition() {
  console.log("Sidebar: Requesting board capture");
  const captureButton = document.getElementById('sidebar-capture-button');
  const originalText = captureButton ? captureButton.textContent : 'Capture';
  if (captureButton) {
    captureButton.textContent = 'Capturing...';
    captureButton.disabled = true;
  }

  // Clear previous capture-related error messages from chat
  sidebarChatHistory = sidebarChatHistory.filter(msg => !(msg.sender === 'error' && msg.text.includes('Capture failed')));
  renderSidebarChatHistory(); // Re-render without old capture errors

  try {
    // Check if extension context is still valid
    if (!chrome.runtime?.id) {
      throw new Error("Extension context invalidated. Please refresh the page.");
    }

    // Send message to background script to handle injection and capture
    chrome.runtime.sendMessage({ action: "captureBoardForSidebar" }, (response) => {
      // Re-enable button regardless of outcome
      if (captureButton) {
        captureButton.textContent = originalText;
        captureButton.disabled = false;
      }

      // Handle extension context invalidation
      if (chrome.runtime.lastError) {
        console.error("Sidebar capture runtime error:", chrome.runtime.lastError);
        if (chrome.runtime.lastError.message.includes("Extension context invalidated")) {
          displaySidebarError("Extension context invalidated. Please refresh the page.");
          // Add refresh button
          const refreshButton = document.createElement('button');
          refreshButton.textContent = 'Refresh Page';
          refreshButton.onclick = () => window.location.reload();
          refreshButton.style.marginTop = '10px';
          const errorContainer = document.querySelector('.sidebar-error-message');
          if (errorContainer) {
            errorContainer.appendChild(refreshButton);
          }
        } else {
          displaySidebarError(`Capture failed: ${chrome.runtime.lastError.message}`);
        }
        return;
      }

      // Handle response
      if (!response) {
        console.error("No response received from capture request");
        displaySidebarError("Capture failed: No response received");
        return;
      }

      console.log("Sidebar: Received capture response:", response);

      if (!response.success) {
        console.error("Capture failed:", response.error);
        displaySidebarError(`Capture failed: ${response.error || 'Unknown error'}`);
        return;
      }

      if (!response.data) {
        console.error("Capture response missing data");
        displaySidebarError("Capture failed: Invalid response data");
        return;
      }

      // Validate required fields and FEN format
      if (!response.data.fen) {
        console.error("Capture response missing FEN");
        displaySidebarError("Capture failed: Could not determine board position");
        return;
      }

      // Validate FEN format with our global function
      if (!window.isValidFENFormat(response.data.fen)) {
        console.error("Capture response contains invalid FEN format:", response.data.fen);
        displaySidebarError("Capture failed: Invalid board position format");
        return;
      }

      // Success case
      console.log("Sidebar: Capture request successful via background.");
      
      // Update the sidebar's board data directly
      sidebarCapturedBoard = response.data;
      
      // Update the UI
      const previewContainer = document.getElementById('sidebar-board-preview-container');
      const previewImage = document.getElementById('sidebar-captured-board-image');
      
      if (previewContainer && previewImage) {
        if (response.data.imageData) {
          previewImage.src = response.data.imageData;
          previewImage.style.display = 'inline-block';
          previewContainer.style.display = 'block';
        } else {
          console.warn("No image data in capture response");
          previewImage.style.display = 'none';
          previewContainer.style.display = 'block';
          previewImage.alt = response.data.fen;
        }
        
        // Clear chat history for new position
        sidebarChatHistory = [];
        renderSidebarChatHistory();
        
        // Store the captured board data
        chrome.storage.local.set({ capturedBoard: response.data }, () => {
          if (chrome.runtime.lastError) {
            console.error("Failed to store captured board:", chrome.runtime.lastError);
          } else {
            console.log("Successfully stored captured board data");
          }
        });
      } else {
        console.error("Missing UI elements for board preview");
        displaySidebarError("Failed to update board preview");
      }
    });
  } catch (error) {
    console.error("Sidebar capture error:", error);
    if (captureButton) {
      captureButton.textContent = originalText;
      captureButton.disabled = false;
    }
    displaySidebarError(error.message || "An unexpected error occurred during capture.");
  }
}

async function loadStoredBoardData(isNewCapture = false) {
  console.log(`Sidebar: Loading stored board data. New capture: ${isNewCapture}`);
  try {
    // Load data directly from chrome.storage.local where injectCaptureScript saves it
    const result = await new Promise((resolve) => chrome.storage.local.get(['capturedBoard'], resolve));
    const boardData = result.capturedBoard;

    const previewContainer = document.getElementById('sidebar-board-preview-container');
    const previewImage = document.getElementById('sidebar-captured-board-image');

    if (boardData && (boardData.imageData || boardData.fen) && previewContainer && previewImage) {
        // Check if board actually changed compared to current sidebar board state
        const boardChanged = !sidebarCapturedBoard ||
                             sidebarCapturedBoard.fen !== boardData.fen ||
                             sidebarCapturedBoard.timestamp !== boardData.timestamp; // Use timestamp

        sidebarCapturedBoard = boardData; // Update sidebar's internal reference

        console.log(`Sidebar: Loaded board FEN: ${boardData.fen}`);
        if (boardData.imageData) {
            previewImage.src = boardData.imageData;
            previewImage.style.display = 'inline-block'; // Show image if available
            previewContainer.style.display = 'block';
        } else {
            previewImage.style.display = 'none'; // Hide image if not available
            // Optionally show FEN in preview area if no image?
             previewContainer.style.display = 'block'; // Still show container for label
             previewImage.alt = boardData.fen || "FEN not available"; // Use alt text
        }

        // If it's a brand new capture initiated from this sidebar OR the board FEN changed, clear history
        if (isNewCapture || boardChanged) {
            console.log("Sidebar: New or changed board detected, clearing chat history.");
            sidebarChatHistory = [];
        }
         renderSidebarChatHistory(); // Render chat (shows initial prompt if history cleared)

    } else {
      console.log("Sidebar: No valid stored board data found or UI elements missing.");
      if (previewContainer) previewContainer.style.display = 'none';
      sidebarCapturedBoard = null;
      // If this was triggered by a new capture attempt that failed to produce data
      if (isNewCapture) {
          sidebarChatHistory = []; // Clear history
          renderSidebarChatHistory(); // Show initial placeholder
      }
    }
  } catch (error) {
    console.error("Sidebar: Error loading stored board data:", error);
    displaySidebarError("Failed to load captured board data.");
    sidebarCapturedBoard = null;
    sidebarChatHistory = []; // Clear history on error
    renderSidebarChatHistory();
  }
}

// --- Message Listener (Handles messages from background/popup) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Sidebar content script received message:", request.action);
  let isAsync = false; // Flag to indicate async response

  switch (request.action) {
    case "ping": // Check if content script is alive and initialized
      console.log("Received ping request from background script");
      sendResponse({ success: true, initialized: sidebarInitialized, message: "Content script is running" });
      break;

    case "userLoggedIn": // User logged in via popup
      isAsync = true;
      checkLoginStatus().then(async isLoggedIn => {
        if (isLoggedIn) {
            if (!sidebarInitialized) {
                console.log("User logged in, initializing sidebar now.");
                await initializeSidebar(); // Initialize if not already done
            } else {
                console.log("User logged in, sidebar already initialized. Updating info.");
                // Sidebar exists, just update user info/credits
                fetchUserCredits();
                const welcomeEl = document.getElementById('sidebar-welcome-message');
                if (welcomeEl) updateWelcomeMessage(welcomeEl);
            }
        } else {
            console.log("Received userLoggedIn message, but checkLoginStatus is false?");
        }
        sendResponse({ success: true });
      });
      break;

    case "showSidebar": // Request from popup to open sidebar
      isAsync = true;
      checkLoginStatus().then(async isLoggedIn => {
        if (!isLoggedIn) {
           alert("Please log in via the extension popup to use the sidebar.");
           sendResponse({ success: false, message: "Login required" }); return;
        }
        if (!sidebarInitialized) {
            console.log("Initializing sidebar on show request.");
            await initializeSidebar(); // Ensure sidebar is created
        }
        // Ensure sidebar is initialized before trying to open
        // Use timeout to allow potential init to finish rendering
        setTimeout(() => {
             if (sidebarInitialized && !sidebarVisible) {
                 toggleSidebar(); // Open if initialized and hidden
             } else if (!sidebarInitialized) {
                  console.error("Failed to initialize sidebar on show request.");
             }
              sendResponse({ success: true }); // Respond after attempting toggle
        }, 100); // Small delay
      });
      break;

    case "updateSidebarImage": // Triggered by background script AFTER capture succeeds & data is stored
       console.log("Sidebar: Received request to update image from background.");
       // Load data, isNewCapture=true ensures chat history is reset for the new board
       loadStoredBoardData(true);
       sendResponse({ success: true });
       break;

    case "paymentCompleted": // Received from background after popup verification
       console.log("Sidebar: Payment completed message received", request);
       // Update credits display in the sidebar
       if (request.success && typeof request.currentBalance === 'number') {
           alert(`Payment successful! ${request.creditsAdded || 'Credits'} added. Your new balance is ${request.currentBalance}.`);
           updateCreditsDisplay(request.currentBalance);
       } else if (!request.success) {
           alert(`Payment failed: ${request.error || "Unknown error"}`);
           fetchUserCredits(); // Refresh credits even on failure, just in case
       }
       sendResponse({ success: true }); // Acknowledge message
       break;

    default:
      console.log("Sidebar: Unknown message action received:", request.action);
      // Optionally send response for unhandled actions
      // sendResponse({ success: false, error: "Unknown action" });
      break;
  }
   return isAsync; // Return true ONLY if sendResponse is asynchronous
});

// --- Initial Load Logic ---
function initOnLoad() {
    console.log("Content script initOnLoad - Checking login status...");
    
    // Ensure our utility function is available globally
    if (typeof window.isValidFENFormat !== 'function') {
        window.isValidFENFormat = isValidFENFormat;
        console.log("FEN validation function set in global scope");
    }
    
    checkLoginStatus().then(isLoggedIn => {
        if (isLoggedIn) {
            if (!sidebarInitialized) {
                console.log("User logged in, initializing sidebar on page load.");
                initializeSidebar();
            } else {
                 console.log("User logged in, sidebar already initialized (possibly from previous interaction). Updating info.");
                 fetchUserCredits(); // Refresh credits/user info
            }
        } else {
            console.log("User not logged in, sidebar will not initialize automatically.");
            // Sidebar can still be initialized later via "showSidebar" message if user logs in via popup
        }
    });
}

// Execute init check once the DOM is ready or already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOnLoad);
} else {
    initOnLoad(); // DOM already ready
}


// --- CSS Injection ---
function injectCustomCSS() {
  const styleId = 'vichar-sidebar-styles';
  if (document.getElementById(styleId)) {
      // console.log("Sidebar CSS already injected.");
      return; // Inject only once
  }

  console.log("Injecting custom CSS with system fonts");
  const css = `
    /* Basic Reset and Box Sizing */
    #chess-analysis-sidebar, #chess-analysis-sidebar *, #sidebar-toggle, #sidebar-toggle * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji" !important;
        line-height: 1.4;
    }

    /* Sidebar Container */
    #chess-analysis-sidebar {
        position: fixed !important;
        top: 0 !important;
        right: -400px !important; /* Start hidden */
        width: 380px !important;
        height: 100vh !important;
        max-height: 100vh !important; /* Ensure it doesn't exceed viewport */
        background-color: #f8f9fa !important;
        box-shadow: -2px 0 10px rgba(0, 0, 0, 0.2) !important;
        z-index: 2147483646 !important; /* Max - 1 */
        transition: right 0.3s ease !important;
        display: flex !important;
        flex-direction: column !important;
        border-left: 1px solid #ccc !important;
        color: #333 !important;
    }
    #chess-analysis-sidebar.visible {
        right: 0 !important;
    }

    /* Toggle Button */
    #sidebar-toggle {
        position: fixed !important;
        top: 50% !important;
        right: 0px !important; /* Initial position */
        transform: translateY(-50%) !important;
        width: 30px !important;
        height: 60px !important;
        background-color: #4285f4 !important;
        border: none !important;
        border-radius: 5px 0 0 5px !important;
        cursor: pointer !important;
        z-index: 2147483647 !important; /* Max z-index */
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        box-shadow: -2px 0 5px rgba(0, 0, 0, 0.1) !important;
        color: white !important;
        transition: right 0.3s ease !important;
        padding: 0 !important; /* Override button padding */
    }
    #sidebar-toggle.shifted {
        right: 380px !important; /* Move with sidebar */
    }
    #sidebar-toggle span {
         display: inline-block; /* Needed for transform */
    }


    /* Sidebar Content Wrapper */
    .sidebar-content-wrapper {
        flex: 1 !important;
        display: flex !important;
        flex-direction: column !important;
        overflow: hidden !important; /* Prevents content breaking out */
    }

    /* Header */
    .sidebar-header {
        padding: 10px 15px !important;
        border-bottom: 1px solid #ddd !important;
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        flex-shrink: 0 !important;
        background-color: #fff !important;
    }
    .sidebar-header h2 {
        margin: 0 !important;
        color: #333 !important;
        font-size: 18px !important;
        font-weight: 600 !important;
    }
    .sidebar-close-button {
        all: revert !important; /* Reset site styles */
        background: none !important;
        border: none !important;
        font-size: 20px !important;
        cursor: pointer !important;
        color: #555 !important;
        padding: 0 5px !important;
        line-height: 1 !important;
        font-family: inherit !important;
    }

    /* User Section */
    .sidebar-user-section {
        padding: 10px 15px !important;
        background-color: #e8f0fe !important;
        border-bottom: 1px solid #ddd !important;
        flex-shrink: 0 !important;
    }
    .sidebar-user-info-row {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        margin-bottom: 8px !important;
    }
    #sidebar-welcome-message {
        font-size: 13px !important;
        color: #333 !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
        flex-grow: 1 !important;
        margin-right: 10px !important;
    }
    .sidebar-username {
         font-weight: 700 !important;
         color: #4285f4 !important;
    }
    #sidebar-logout-button {
        all: revert !important; /* Reset */
        padding: 4px 8px !important; background-color: #f44336 !important; color: white !important;
        border: none !important; border-radius: 4px !important; cursor: pointer !important;
        font-size: 12px !important; font-weight: 600 !important; transition: background-color 0.2s !important;
        flex-shrink: 0 !important; font-family: inherit !important; line-height: 1.2 !important;
    }
    .sidebar-credits-section {
        display: flex !important; justify-content: space-between !important; align-items: center !important;
        padding-top: 8px !important; border-top: 1px solid #cce4ff !important;
    }
    #sidebar-credits-display {
        font-size: 13px !important; color: #333 !important;
    }
    #sidebar-credits-display span:first-child { font-weight: 600 !important; }
    #sidebar-credits-value { font-weight: 700 !important; color: #34a853 !important; }
    #sidebar-buy-credits-button {
        all: revert !important; /* Reset */
        padding: 4px 8px !important; background-color: #34a853 !important; color: white !important;
        border: none !important; border-radius: 4px !important; cursor: pointer !important;
        font-size: 12px !important; font-weight: 600 !important; transition: background-color 0.2s !important;
        flex-shrink: 0 !important; font-family: inherit !important; line-height: 1.2 !important;
    }

    /* Capture Button */
    #sidebar-capture-button {
        all: revert !important; /* Reset */
        padding: 8px 12px !important; background-color: #34a853 !important; color: white !important;
        border: none !important; border-radius: 4px !important; cursor: pointer !important;
        font-size: 14px !important; font-weight: 500 !important;
        width: calc(100% - 30px) !important; margin: 10px 15px 0 15px !important;
        transition: background-color 0.2s, opacity 0.2s !important; flex-shrink: 0 !important;
        box-shadow: 0 1px 2px rgba(0,0,0,0.1) !important; font-family: inherit !important;
        line-height: 1.2 !important;
    }
    #sidebar-capture-button:hover { background-color: #2d9249 !important; }
    #sidebar-capture-button:disabled { background-color: #34a853 !important; opacity: 0.6 !important; cursor: not-allowed !important; }

    /* Chat Messages Area */
    #sidebar-chat-messages {
        flex-grow: 1 !important;
        padding: 15px !important;
        overflow-y: auto !important;
        background-color: #f0f0f0 !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 12px !important;
        min-height: 150px !important; /* Ensure minimum height */
    }
    /* Scrollbar for chat */
    #sidebar-chat-messages::-webkit-scrollbar { width: 6px !important; }
    #sidebar-chat-messages::-webkit-scrollbar-track { background: #e9ecef !important; }
    #sidebar-chat-messages::-webkit-scrollbar-thumb { background: #adb5bd !important; border-radius: 3px !important;}
    #sidebar-chat-messages::-webkit-scrollbar-thumb:hover { background: #6c757d !important; }

    /* Placeholder Text */
    .sidebar-chat-placeholder {
        text-align: center !important; color: #666 !important; margin: 20px auto !important;
        font-size: 14px !important; max-width: 80% !important; font-style: italic !important;
    }

    /* Individual Chat Message Bubbles */
    .sidebar-chat-message {
      padding: 8px 12px !important; border-radius: 12px !important; max-width: 85% !important;
      word-wrap: break-word !important; line-height: 1.45 !important; font-size: 14px !important;
      box-shadow: 0 1px 1px rgba(0,0,0,0.08) !important; margin-bottom: 2px !important;
    }
    .user-message {
      background-color: #d1e7fd !important; color: #084298 !important; align-self: flex-end !important;
      border-bottom-right-radius: 4px !important; margin-left: auto !important;
    }
    .assistant-message {
      background-color: #ffffff !important; color: #212529 !important; align-self: flex-start !important;
      border: 1px solid #e9ecef !important; border-bottom-left-radius: 4px !important; margin-right: auto !important;
    }
    /* Error Message Specific Style */
    .error-message { /* Applied to .sidebar-chat-message */
      background-color: #f8d7da !important; color: #842029 !important; border: 1px solid #f5c2c7 !important;
      align-self: stretch !important; max-width: 95% !important; text-align: left !important; font-size: 13px !important;
      margin-top: 5px !important; border-radius: 4px !important; /* More rectangular error */
    }
    .error-message strong { color: #6a1a21 !important; display: block; margin-bottom: 3px;}

    /* Loading Indicator */
    .sidebar-loading-indicator {
         display: flex; align-items: center; justify-content: center; gap: 8px;
         padding: 10px; color: #666; font-style: italic; font-size: 13px;
         align-self: center; /* Center loading indicator */ margin-top: 10px;
    }
    .spinner {
        display: inline-block; width: 14px; height: 14px;
        border-radius: 50%; border: 2px solid #b0bec5; border-top-color: #546e7a;
        animation: spin 1s linear infinite;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

    /* Formatting inside Assistant Messages */
    .assistant-message .chess-notation { color: #0d6efd; font-weight: 500; }
    .assistant-message .evaluation { color: #198754; font-weight: 500; }
    .assistant-message .highlight { font-weight: 600; }
    .assistant-message strong { font-weight: 600; }
    .assistant-message code { background-color: #e9ecef; padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.9em;}
    .assistant-message pre { background-color: #e9ecef; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 0.85em; margin: 5px 0; white-space: pre-wrap; word-wrap: break-word; }
    .assistant-message pre code { background-color: transparent; padding: 0; border-radius: 0; font-size: inherit; }
    .model-tag { display: inline-block; font-size: 0.75em; color: #6c757d; margin-left: 8px; font-style: italic; }

    /* Board Preview */
    #sidebar-board-preview-container {
        padding: 10px 15px !important; border-top: 1px solid #ddd !important; flex-shrink: 0 !important;
        background-color: #fff !important; text-align: center !important;
    }
    .sidebar-preview-label {
        font-size: 12px !important; color: #555 !important; margin-bottom: 5px !important; font-weight: 500 !important;
    }
    #sidebar-captured-board-image {
        max-width: 100px !important; max-height: 100px !important; border-radius: 4px !important;
        border: 1px solid #ccc !important; display: inline-block !important; cursor: default !important; /* No action on click for now */
        vertical-align: middle !important;
    }

    /* Controls Container (Vision + Model) */
    .sidebar-controls-container {
         background-color: #fff !important; border-top: 1px solid #ddd !important;
         padding: 5px 15px 10px 15px !important; /* Padding around controls */
         flex-shrink: 0 !important; display: flex; flex-direction: column; gap: 8px;
    }
    .sidebar-control-row {
         display: flex !important; align-items: center !important; gap: 8px !important;
    }
    /* Vision Toggle */
    #sidebar-ai-vision-toggle {
        margin: 0 !important; height: 14px !important; width: 14px !important; cursor: pointer !important; flex-shrink: 0;
    }
    .sidebar-control-row label[for="sidebar-ai-vision-toggle"] {
        font-size: 12px !important; color: #555 !important; cursor: pointer !important; flex-grow: 1 !important;
    }
    /* Model Select */
     .sidebar-control-row label[for="sidebar-model-select"] {
         font-size: 12px !important; color: #555 !important; font-weight: 600 !important; flex-shrink: 0 !important;
     }
    #sidebar-model-select {
        flex-grow: 1 !important; padding: 4px 8px !important; font-size: 12px !important; border: 1px solid #ccc !important;
        border-radius: 4px !important; background-color: white !important; cursor: pointer !important;
        font-family: inherit !important; line-height: 1.2 !important; height: 28px; /* Explicit height */
    }
    #sidebar-model-select:disabled { background-color: #e9ecef !important; cursor: not-allowed !important; }


    /* Fix for model selector dropdown */
    #sidebar-model-select {
        width: 100% !important;
        max-width: 100% !important;
        z-index: 2147483647 !important; /* Maximum z-index to ensure dropdown appears above everything */
        background-color: #ffffff !important;
        color: #000000 !important; 
        border-radius: 4px !important;
        cursor: pointer !important;
        -webkit-appearance: menulist !important; /* Force native dropdown appearance */
        appearance: menulist !important;
    }
    #sidebar-model-select option {
        padding: 8px !important;
        background-color: #f8f9fa !important; /* Lighter background */
        color: #000000 !important; /* Darker text for better contrast */
        font-size: 12px !important;
        font-weight: 500 !important; /* Make text slightly bolder */
        white-space: nowrap !important; /* Prevent text wrapping in dropdown */
    }
    /* Style for hover state on options */
    #sidebar-model-select option:hover {
        background-color: #4285f4 !important;
        color: #ffffff !important;
    }
    /* Ensure the dropdown container is visible */
    .sidebar-control-row {
        position: relative !important;
        overflow: visible !important; /* Allow dropdown to overflow */
    }

    /* Chat Input Area */
    .sidebar-chat-input-area {
        padding: 10px 15px !important; border-top: 1px solid #ccc !important;
        display: flex !important; gap: 10px !important; align-items: center !important;
        flex-shrink: 0 !important; background-color: #f8f9fa !important;
    }
    #sidebar-question-input {
        flex-grow: 1 !important; padding: 8px 12px !important; border: 1px solid #ccc !important; border-radius: 18px !important;
        resize: none !important; font-family: inherit !important; font-size: 14px !important; line-height: 1.4 !important;
        max-height: 80px !important; overflow-y: auto !important;
        box-shadow: inset 0 1px 2px rgba(0,0,0,0.05) !important; outline: none !important;
    }
    #sidebar-question-input:focus { border-color: #86b7fe !important; box-shadow: inset 0 1px 2px rgba(0,0,0,0.05), 0 0 0 0.2rem rgba(13, 110, 253, 0.25) !important; }
    #sidebar-ask-button {
        all: revert !important; /* Reset */
        padding: 0 !important; background-color: #4285f4 !important; color: white !important; border: none !important; border-radius: 50% !important;
        cursor: pointer !important; flex-shrink: 0 !important; width: 36px !important; height: 36px !important;
        display: flex !important; align-items: center !important; justify-content: center !important; transition: background-color 0.2s !important;
        box-shadow: 0 1px 2px rgba(0,0,0,0.1) !important; font-family: inherit !important;
    }
     #sidebar-ask-button svg { width: 18px; height: 18px; fill: currentColor; } /* Style SVG */
    #sidebar-ask-button:hover { background-color: #3367d6 !important; }
    #sidebar-ask-button:disabled { background-color: #a0c3ff !important; cursor: not-allowed !important; }

    /* General Button Disabled State */
     #chess-analysis-sidebar button:disabled { opacity: 0.6 !important; cursor: not-allowed !important; }


  `;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = css;
  document.head.appendChild(style);
  console.log("Custom CSS injected");
}


// --- Utility function for formatting API response (copied) ---
function formatAPIResponse(response) {
   // Basic sanitization (prevent raw HTML injection, very basic)
   const tempDiv = document.createElement('div');
   tempDiv.textContent = response;
   let sanitized = tempDiv.innerHTML; // Convert text content to basic HTML entities (< etc.)

   // Apply formatting AFTER basic sanitization
   let formatted = sanitized.replace(/\n/g, '<br>');
   // Highlighting keywords
   formatted = formatted.replace(/(best move|advantage|winning|check|mate|fork|pin|skewer|discovered attack|zwischenzug|tempo|initiative|development|center control|king safety|pawn structure)/gi,'<span class="highlight">$1</span>');
   // Highlighting chess notation (improved regex)
   formatted = formatted.replace(/\b([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[\+#]?|O-O(?:-O)?)\b/g,'<span class="chess-notation">$1</span>');
   // Highlighting evaluations (handles decimals)
   formatted = formatted.replace(/([+-]\d+(?:\.\d+)?)/g,'<span class="evaluation">$1</span>');
   // Simple code block formatting (Markdown style ```) - Escape content inside
   formatted = formatted.replace(/```(\w*)\s*([\s\S]*?)```/g, (match, lang, code) => {
      const codeDiv = document.createElement('div');
      codeDiv.textContent = code; // Let browser handle text escaping
      const escapedCode = codeDiv.innerHTML;
      return `<pre><code class="language-${lang || ''}">${escapedCode}</code></pre>`;
   });
   // Inline code formatting (Markdown style `) - Escape content inside
   formatted = formatted.replace(/`([^`]+)`/g, (match, code) => {
      const codeDiv = document.createElement('div');
      codeDiv.textContent = code;
      const escapedCode = codeDiv.innerHTML;
      return `<code>${escapedCode}</code>`;
   });
   return formatted;
}

// --- Utility to get base64 data from image src ---
function getBase64FromImageSrc(src) {
   if (src && src.startsWith('data:image/')) { return src.split(',')[1]; }
   return null;
}