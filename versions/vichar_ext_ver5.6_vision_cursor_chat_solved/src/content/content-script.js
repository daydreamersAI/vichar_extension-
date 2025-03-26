const CACHE_BUST = new Date().getTime();
console.log("Cache bust ID:", CACHE_BUST);

// This is the main content script that gets injected by Chrome
console.log("Chess analyzer content script loader initialized - Integrated Sidebar Version");

// Global variables for sidebar state and data
let sidebarInitialized = false;
let sidebarVisible = false;
let sidebarChatHistory = []; // History specifically for the sidebar session
let sidebarIsLoading = false; // Loading state for sidebar analysis
let sidebarCapturedBoard = null; // Store board data used by the sidebar

// API configuration
const API_URL = "https://api.beekayprecision.com"; // Use HTTPS

// --- Login Status Check ---
function checkLoginStatus() {
  return new Promise((resolve) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      resolve(true); return;
    }
    // Fallback check in chrome.storage.local
    chrome.storage.local.get(['auth_token'], (result) => {
      if (result && result.auth_token) {
        // Sync to localStorage if found
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
  // Inject custom CSS (ensure styles for chat are included)
  injectCustomCSS(); // Make sure this includes styles from analysis.html adaption

  if (sidebarInitialized) {
    console.log("Sidebar already initialized.");
    return;
  }

  const isUserLoggedIn = await checkLoginStatus();
  if (!isUserLoggedIn) {
    console.log("User not logged in, sidebar not initializing.");
    return;
  }

  console.log("Initializing sidebar with chat UI");

  // --- Create Sidebar Structure ---
  const sidebar = document.createElement('div');
  sidebar.id = 'chess-analysis-sidebar';
  sidebar.style.cssText = `
    position: fixed; top: 0; right: -400px; /* Start hidden */
    width: 380px; height: 100vh; background-color: #f8f9fa;
    box-shadow: -2px 0 10px rgba(0, 0, 0, 0.2); z-index: 99999; /* High z-index */
    transition: right 0.3s ease; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    display: flex; flex-direction: column; /* Important for layout */
    border-left: 1px solid #ccc;
    box-sizing: border-box;
   `;

  // --- Create Toggle Button ---
  const toggleButton = document.createElement('div');
  toggleButton.id = 'sidebar-toggle';
  toggleButton.style.cssText = `
    position: fixed; top: 50%; right: 0px; transform: translateY(-50%);
    width: 30px; height: 60px; background-color: #4285f4;
    border-radius: 5px 0 0 5px; cursor: pointer; z-index: 100000; /* Higher than sidebar */
    display: flex; align-items: center; justify-content: center;
    box-shadow: -2px 0 5px rgba(0, 0, 0, 0.1);
    color: white; transition: right 0.3s ease; /* Match sidebar transition */
  `;
  toggleButton.innerHTML = `<span style="transform: rotate(-90deg); font-size: 16px; line-height: 1;">▲</span>`; // Use ▲ or similar
  toggleButton.title = "Open Analysis Sidebar";
  toggleButton.addEventListener('click', toggleSidebar);

  // --- Sidebar Content Wrapper ---
  const contentWrapper = document.createElement('div');
  contentWrapper.style.cssText = `
    flex: 1; /* Take remaining height */
    display: flex; flex-direction: column;
    overflow: hidden; /* Prevent content overflow */
    padding: 0; /* Remove padding from main sidebar div */
  `;

  // --- Header ---
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 10px 15px; border-bottom: 1px solid #ddd;
    display: flex; justify-content: space-between; align-items: center;
    flex-shrink: 0; /* Prevent header shrinking */
    background-color: #fff; /* Header background */
  `;
  header.innerHTML = '<h2 style="margin: 0; color: #333; font-size: 18px;">Chess Analysis</h2>';
  const closeButton = document.createElement('button');
  closeButton.textContent = '✕'; // Use multiplication sign for close
  closeButton.style.cssText = `background: none; border: none; font-size: 20px; cursor: pointer; color: #555; padding: 0 5px; line-height: 1;`;
  closeButton.title = "Close Sidebar";
  closeButton.addEventListener('click', toggleSidebar);
  header.appendChild(closeButton);

  // --- User Section (Welcome, Credits, Logout) ---
  const userSection = document.createElement('div');
  userSection.style.cssText = `
    padding: 10px 15px; background-color: #e8f0fe;
    border-bottom: 1px solid #ddd; flex-shrink: 0;
  `;
  // User Info Row
  const userInfoRow = document.createElement('div');
  userInfoRow.style.cssText = `display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;`;
  const welcomeMessage = document.createElement('div');
  welcomeMessage.id = 'sidebar-welcome-message'; // Add ID for updating name
  welcomeMessage.style.cssText = `font-size: 13px; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-grow: 1; margin-right: 10px;`;
  const logoutButton = document.createElement('button');
  logoutButton.textContent = 'Logout';
  logoutButton.style.cssText = `padding: 4px 8px; background-color: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600; transition: background-color 0.2s; flex-shrink: 0;`;
  logoutButton.addEventListener('click', handleLogout);
  userInfoRow.appendChild(welcomeMessage);
  userInfoRow.appendChild(logoutButton);
  // Credits Row
  const creditsSection = document.createElement('div');
  creditsSection.style.cssText = `display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px solid #cce4ff;`;
  const creditsDisplay = document.createElement('div');
  creditsDisplay.id = 'sidebar-credits-display';
  creditsDisplay.style.cssText = `font-size: 13px; color: #333;`;
  creditsDisplay.innerHTML = `<span style="font-weight: 600;">Credits: </span><span id="sidebar-credits-value" style="font-weight: 700; color: #34a853;">Loading...</span>`;
  const buyCreditsButton = document.createElement('button');
  buyCreditsButton.textContent = 'Buy Credits';
  buyCreditsButton.style.cssText = `padding: 4px 8px; background-color: #34a853; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600; transition: background-color 0.2s; flex-shrink: 0;`;
  buyCreditsButton.addEventListener('click', showCreditPurchaseOptions);
  creditsSection.appendChild(creditsDisplay);
  creditsSection.appendChild(buyCreditsButton);
  // Assemble User Section
  userSection.appendChild(userInfoRow);
  userSection.appendChild(creditsSection);
  // Update welcome message async
  updateWelcomeMessage(welcomeMessage); // Call helper to set the name

  // --- Capture Button ---
  const captureButton = document.createElement('button');
  captureButton.id = 'sidebar-capture-button';
  captureButton.textContent = 'Capture Current Position';
  captureButton.style.cssText = `
    padding: 8px 12px; background-color: #34a853; color: white;
    border: none; border-radius: 4px; cursor: pointer; font-size: 14px;
    font-weight: 500; width: calc(100% - 30px); /* Full width minus padding */
    transition: background-color 0.2s; margin: 10px 15px 0 15px; /* Add margin */
    flex-shrink: 0; box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  `;
   captureButton.addEventListener('click', captureCurrentPosition);


  // --- Chat Messages Area ---
  const chatMessagesContainer = document.createElement('div');
  chatMessagesContainer.id = 'sidebar-chat-messages';
  chatMessagesContainer.style.cssText = `
    flex-grow: 1; /* Takes up available vertical space */
    padding: 15px; overflow-y: auto; /* Scrollable */
    background-color: #f0f0f0; /* Light background for chat */
    display: flex; flex-direction: column; gap: 12px;
    min-height: 150px; /* Minimum chat height */
  `;
  // Initial message set by renderSidebarChatHistory

  // --- Captured Board Preview ---
  const boardPreviewContainer = document.createElement('div');
  boardPreviewContainer.id = 'sidebar-board-preview-container';
  boardPreviewContainer.style.cssText = `
      padding: 10px 15px; border-top: 1px solid #ddd; flex-shrink: 0;
      background-color: #fff; text-align: center; display: none; /* Hidden initially */
   `;
  const boardPreviewLabel = document.createElement('div');
   boardPreviewLabel.textContent = 'Current Position:';
   boardPreviewLabel.style.cssText = `font-size: 12px; color: #555; margin-bottom: 5px; font-weight: 500;`;
  const boardPreviewImage = document.createElement('img');
  boardPreviewImage.id = 'sidebar-captured-board-image';
  boardPreviewImage.style.cssText = `
      max-width: 100px; max-height: 100px; border-radius: 4px;
      border: 1px solid #ccc; display: inline-block; cursor: pointer;
  `;
   boardPreviewImage.title = 'Click to see full size (Not implemented)';
   // Optional: Add click listener later
   boardPreviewContainer.appendChild(boardPreviewLabel);
   boardPreviewContainer.appendChild(boardPreviewImage);

  // --- AI Vision Toggle ---
   const aiVisionContainer = document.createElement('div');
   aiVisionContainer.style.cssText = `
       display: flex; align-items: center; gap: 8px; flex-shrink: 0;
       padding: 8px 15px 10px 15px; border-top: 1px solid #ddd; background-color: #fff;
   `;
   const aiVisionToggle = document.createElement('input');
   aiVisionToggle.type = 'checkbox';
   aiVisionToggle.id = 'sidebar-ai-vision-toggle';
   aiVisionToggle.checked = true; // Default ON
   aiVisionToggle.style.cssText = `margin: 0; height: 14px; width: 14px; cursor: pointer;`;
   const aiVisionLabel = document.createElement('label');
   aiVisionLabel.htmlFor = 'sidebar-ai-vision-toggle';
   aiVisionLabel.textContent = 'Use AI Vision (if image captured)';
   aiVisionLabel.style.cssText = `font-size: 12px; color: #555; cursor: pointer; flex-grow: 1;`;
   aiVisionContainer.appendChild(aiVisionToggle);
   aiVisionContainer.appendChild(aiVisionLabel);

  // --- Chat Input Area ---
  const chatInputArea = document.createElement('div');
  chatInputArea.style.cssText = `
    padding: 10px 15px; border-top: 1px solid #ccc;
    display: flex; gap: 10px; align-items: center; /* Align items vertically */
    flex-shrink: 0; background-color: #f8f9fa; /* Match sidebar bg */
  `;
  const questionInput = document.createElement('textarea');
  questionInput.id = 'sidebar-question-input';
  questionInput.placeholder = 'Ask about the position...';
  questionInput.rows = 1; // Start small
  questionInput.style.cssText = `
    flex-grow: 1; padding: 8px 12px; border: 1px solid #ccc; border-radius: 18px; /* More rounded */
    resize: none; font-family: inherit; font-size: 14px; line-height: 1.4;
    max-height: 80px; /* Limit growth */ overflow-y: auto; /* Scroll if needed */
    box-shadow: inset 0 1px 2px rgba(0,0,0,0.05); outline: none;
  `;
  const askButton = document.createElement('button');
  askButton.id = 'sidebar-ask-button';
  askButton.innerHTML = `
     <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
       <line x1="22" y1="2" x2="11" y2="13"></line>
       <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
     </svg>`; // Send icon (filled)
  askButton.style.cssText = `
    padding: 0; background-color: #4285f4; color: white; border: none; border-radius: 50%; /* Circle */
    cursor: pointer; font-size: 14px; flex-shrink: 0; width: 36px; height: 36px;
    display: flex; align-items: center; justify-content: center; transition: background-color 0.2s;
    box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  `;
  askButton.title = "Send message";
  // Event listeners for input/button
  askButton.addEventListener('click', handleSidebarSendMessage);
  questionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSidebarSendMessage();
    }
    // Auto-resize textarea
    setTimeout(() => {
        questionInput.style.height = 'auto';
        let scrollHeight = questionInput.scrollHeight;
        questionInput.style.height = `${Math.min(scrollHeight, 80)}px`; // Use min with max-height
    }, 0);
  });

  chatInputArea.appendChild(questionInput);
  chatInputArea.appendChild(askButton);

  // --- Assemble Sidebar Content ---
  contentWrapper.appendChild(header);
  contentWrapper.appendChild(userSection);
  contentWrapper.appendChild(captureButton); // Capture button below user section
  contentWrapper.appendChild(chatMessagesContainer); // Chat messages fill middle
  contentWrapper.appendChild(boardPreviewContainer); // Board preview below chat
  contentWrapper.appendChild(aiVisionContainer); // Vision toggle
  contentWrapper.appendChild(chatInputArea); // Input at bottom

  sidebar.appendChild(contentWrapper);

  // --- Add Elements to Page ---
  // Ensure old elements are removed if re-initializing
  const oldSidebar = document.getElementById('chess-analysis-sidebar');
  const oldToggle = document.getElementById('sidebar-toggle');
  if (oldSidebar) oldSidebar.remove();
  if (oldToggle) oldToggle.remove();

  document.body.appendChild(sidebar);
  document.body.appendChild(toggleButton);


  sidebarInitialized = true;
  console.log("Sidebar with chat UI initialized successfully.");

  // Initial setup calls
  fetchUserCredits();
  loadStoredBoardData(true); // Load initial board data and render chat state
}

// --- Helper Function to Update Welcome Message ---
async function updateWelcomeMessage(element) {
    let userName = localStorage.getItem('user_name') || 'User';
    if (userName === 'User') { // Fetch if not in localStorage
        try {
            const result = await new Promise((resolve) => chrome.storage.local.get(['user_name'], resolve));
            userName = result?.user_name || 'User';
        } catch(e) { console.error("Error getting username from storage", e); }
    }
     // Ensure element exists before setting innerHTML
     if (element) {
         element.innerHTML = `<span style="font-weight: 600;">Welcome, </span><span style="font-weight: 700; color: #4285f4;">${userName}</span>`;
     } else {
         console.error("Welcome message element not found during update.");
     }
}

// --- Sidebar Visibility Toggle ---
function toggleSidebar() {
  const sidebar = document.getElementById('chess-analysis-sidebar');
  const toggleButton = document.getElementById('sidebar-toggle');
  if (!sidebar || !toggleButton) return;

  sidebarVisible = !sidebarVisible;
  if (sidebarVisible) {
    sidebar.style.right = '0';
    toggleButton.style.right = '380px'; // Move toggle left with sidebar
    toggleButton.innerHTML = `<span style="font-size: 18px; line-height: 1;">✕</span>`; // Show close icon
    toggleButton.title = "Close Sidebar";
  } else {
    sidebar.style.right = '-400px';
    toggleButton.style.right = '0px'; // Move toggle back to edge
    toggleButton.innerHTML = `<span style="transform: rotate(-90deg); font-size: 16px; line-height: 1;">▲</span>`; // Show open icon
    toggleButton.title = "Open Analysis Sidebar";
  }
  console.log("Sidebar visibility toggled:", sidebarVisible);
}

// --- Sidebar Specific Chat Handling ---

// Render chat history in the sidebar
function renderSidebarChatHistory() {
  const container = document.getElementById('sidebar-chat-messages');
  if (!container) return;
  container.innerHTML = ''; // Clear existing

  if (sidebarChatHistory.length === 0 && !sidebarCapturedBoard) {
     container.innerHTML = `<p style="text-align: center; color: #666; margin: 20px auto; font-size: 14px; max-width: 80%;">Capture a board position using the button above to start analysis.</p>`;
  } else if (sidebarChatHistory.length === 0 && sidebarCapturedBoard){
      container.innerHTML = `<p style="text-align: center; color: #666; margin: 20px auto; font-size: 14px; max-width: 80%;">Position captured. Ask a question below.</p>`;
  } else {
    sidebarChatHistory.forEach(message => {
      const messageDiv = document.createElement('div');
      messageDiv.classList.add('sidebar-chat-message'); // Use generic class
      // Add user/assistant specific classes and content
      if (message.sender === 'user') {
        messageDiv.classList.add('user-message');
        messageDiv.textContent = message.text; // Basic text for user
      } else { // 'assistant' or 'error'
        messageDiv.classList.add(message.sender === 'error' ? 'error-message' : 'assistant-message');
        messageDiv.innerHTML = formatAPIResponse(message.text); // Format assistant/error response HTML
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

  if (show) {
    if (!loadingIndicator && container) {
      loadingIndicator = document.createElement('div');
      loadingIndicator.id = 'sidebar-loading-indicator';
      loadingIndicator.classList.add('sidebar-chat-message', 'assistant-message'); // Style like assistant message
      loadingIndicator.style.cssText += `font-style: italic; color: #666; align-self: center;`; // Center it
      loadingIndicator.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; gap: 8px;"><span class="spinner"></span><span>Analyzing...</span></div>`;
      container.appendChild(loadingIndicator);
      container.scrollTop = container.scrollHeight;
    }
    sidebarIsLoading = true;
    if (askButton) askButton.disabled = true;
    if (questionInput) questionInput.disabled = true; // Disable input too
  } else {
    if (loadingIndicator) {
      loadingIndicator.remove();
    }
    sidebarIsLoading = false;
    if (askButton) askButton.disabled = false;
    if (questionInput) questionInput.disabled = false; // Re-enable input
  }
}

// Display error in sidebar chat (adds to history)
function displaySidebarError(errorMessage) {
   sidebarChatHistory.push({ text: errorMessage, sender: 'error' });
   renderSidebarChatHistory(); // Re-render to show the error message
}

// Handle sending a message from the sidebar input
async function handleSidebarSendMessage() {
  if (sidebarIsLoading) return;
  const input = document.getElementById('sidebar-question-input');
  const question = input.value.trim();

  if (!question) return; // Don't send empty messages

  if (!sidebarCapturedBoard) {
    // Add error directly instead of alert
    displaySidebarError("Please capture a board position first using the 'Capture Current Position' button.");
    return;
  }

  // Add user message to history and render immediately
  sidebarChatHistory.push({ text: question, sender: 'user' });
  renderSidebarChatHistory(); // Show user message
  input.value = ''; // Clear input
  input.style.height = 'auto'; // Reset height

  showSidebarLoading(true);

  const useVisionToggle = document.getElementById('sidebar-ai-vision-toggle');
  // Use vision only if toggle is checked AND an image is available
  const useVision = (useVisionToggle ? useVisionToggle.checked : true) && sidebarCapturedBoard.imageData;

  try {
    // Send message to background script for analysis
    // The history sent includes the latest user message
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: "analyzeChessPosition",
        question: question,
        capturedBoard: sidebarCapturedBoard,
        useVision: useVision,
        chatHistory: sidebarChatHistory // Send current history state
      }, (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || "Runtime error"));
        } else if (res && res.success) {
          resolve(res);
        } else {
          // Construct error message, including potential error codes
          let errorMsg = res?.error || "Analysis failed";
          if (res?.errorCode) {
             errorMsg += ` (Code: ${res.errorCode})`;
          }
          reject(new Error(errorMsg));
        }
      });
    });

    // Add assistant response to history
    sidebarChatHistory.push({ text: response.data, sender: 'assistant' });

    // Update credits display based on response
     if (response.credits) {
        updateCreditsDisplay(response.credits.remaining);
     }

  } catch (error) {
    console.error("Error during sidebar analysis call:", error);
    // Add error message to chat history
    displaySidebarError(error.message); // displaySidebarError adds to history and renders
  } finally {
    showSidebarLoading(false);
    // Render history again after loading is complete (either response or error is now in history)
    renderSidebarChatHistory();
  }
}

// --- Logout ---
function handleLogout() {
  console.log("Logout action triggered");
  localStorage.clear(); // Clear all local storage for this domain
  chrome.storage.local.clear(() => { // Clear extension storage
    console.log("Auth data and all extension storage cleared.");
    const sidebar = document.getElementById('chess-analysis-sidebar');
    const toggle = document.getElementById('sidebar-toggle');
    if (sidebar) sidebar.remove();
    if (toggle) toggle.remove();
    sidebarInitialized = false;
    sidebarVisible = false;
    sidebarChatHistory = [];
    sidebarCapturedBoard = null;
    // Optionally, display a message or reload the page
    alert("You have been logged out. The sidebar will be removed.");
    // window.location.reload(); // Uncomment to force reload
  });
}

// --- Credits Handling ---
function fetchUserCredits() {
  console.log("Fetching user credits for sidebar");
  const creditsValueElement = document.getElementById('sidebar-credits-value');
  const token = localStorage.getItem('auth_token');

  if (!creditsValueElement) { console.error("Sidebar credits value element not found"); return; }
  if (!token) { creditsValueElement.textContent = "N/A"; console.log("No auth token found for credits."); return; }

  // Show cached value immediately
  creditsValueElement.textContent = localStorage.getItem('user_credits') || '...';

  fetch(`${API_URL}/credits/balance`, { headers: { 'Authorization': `Bearer ${token}` } })
    .then(response => {
        if (!response.ok) {
             // Try to parse error message from backend
             return response.json().then(err => Promise.reject(new Error(err.detail || `HTTP ${response.status}`))).catch(() => Promise.reject(new Error(`HTTP ${response.status}`)));
        }
        return response.json();
    })
    .then(data => {
      const credits = data.balance;
      console.log("Credits received:", credits);
      updateCreditsDisplay(credits);
    })
    .catch(error => {
      console.error("Error fetching credits:", error);
      creditsValueElement.textContent = "Error";
      if (error.message.includes("401")) { // Unauthorized
          creditsValueElement.textContent = "N/A";
          // Optionally trigger logout or login prompt
          console.warn("Unauthorized fetching credits. Token might be invalid.");
      }
      // Add XHR fallback if needed
      // fetchCreditsWithXHR();
    });
}

function updateCreditsDisplay(credits) {
    const creditsValueElement = document.getElementById('sidebar-credits-value');
    if (creditsValueElement) {
        creditsValueElement.textContent = credits;
    }
    localStorage.setItem('user_credits', credits.toString());
    chrome.storage.local.set({ 'user_credits': credits }); // Sync with extension storage
}

function fetchCreditsWithXHR() { /* ... implementation if needed ... */ }
function showCreditPurchaseOptions() { /* ... keep implementation ... */ }
function initiateRazorpayPayment(packageInfo) { /* ... keep implementation ... */ }
function verifyPayment(paymentResponse, packageInfo) { /* ... keep implementation ... */ }

// --- Board Capture & Loading ---
function captureCurrentPosition() {
  console.log("Sidebar: Requesting board capture");
  const captureButton = document.getElementById('sidebar-capture-button');
  const originalText = captureButton ? captureButton.textContent : 'Capture';
  if(captureButton) {
      captureButton.textContent = 'Capturing...';
      captureButton.disabled = true;
  }

  // Clear previous error messages related to capture
   const existingError = document.querySelector('#sidebar-chat-messages .capture-error');
   if(existingError) existingError.remove();


  chrome.runtime.sendMessage({ action: "captureBoardForSidebar" }, (response) => {
    if(captureButton) {
      captureButton.textContent = originalText;
      captureButton.disabled = false;
    }
    if (chrome.runtime.lastError) {
      console.error("Sidebar capture runtime error:", chrome.runtime.lastError);
      displaySidebarError(`Capture failed: ${chrome.runtime.lastError.message}`);
    } else if (response && response.success) {
      console.log("Sidebar: Capture successful via background.");
      // Message listener below handles 'updateSidebarImage' which calls loadStoredBoardData
    } else {
      console.error("Sidebar capture failed:", response?.error);
      displaySidebarError(`Capture failed: ${response?.error || 'Unknown error'}`);
    }
  });
}

async function loadStoredBoardData(isNewCapture = false) {
  console.log(`Sidebar: Loading stored board data. New capture: ${isNewCapture}`);
  try {
    const result = await new Promise((resolve) => chrome.storage.local.get(['capturedBoard'], resolve));
    const boardData = result.capturedBoard;

    const previewContainer = document.getElementById('sidebar-board-preview-container');
    const previewImage = document.getElementById('sidebar-captured-board-image');
    const chatContainer = document.getElementById('sidebar-chat-messages');

    if (boardData && boardData.imageData && previewContainer && previewImage && chatContainer) {
        // Check if board actually changed compared to current sidebar board
        const boardChanged = !sidebarCapturedBoard || sidebarCapturedBoard.fen !== boardData.fen || sidebarCapturedBoard.timestamp !== boardData.timestamp;

        sidebarCapturedBoard = boardData; // Update sidebar's reference

        console.log(`Sidebar: Loaded board FEN: ${boardData.fen}`);
        previewImage.src = boardData.imageData;
        previewContainer.style.display = 'block';

        // If it's a new capture OR the board changed significantly, clear history
        if (isNewCapture || boardChanged) {
            console.log("Sidebar: New or changed board detected, clearing chat history.");
            sidebarChatHistory = [];
        }
         renderSidebarChatHistory(); // Render chat (will show initial prompt if history cleared)

    } else {
      console.log("Sidebar: No valid stored board data found or UI elements missing.");
      if (previewContainer) previewContainer.style.display = 'none';
      sidebarCapturedBoard = null;
      if(isNewCapture) { // Clear history if capture resulted in no board
          sidebarChatHistory = [];
          renderSidebarChatHistory();
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

// --- Message Listener ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Sidebar content script received message:", request.action);
  let isAsync = false; // Flag to indicate async response

  switch (request.action) {
    case "ping":
      sendResponse({ success: true, initialized: sidebarInitialized });
      break;

    case "userLoggedIn":
      isAsync = true;
      checkLoginStatus().then(async isLoggedIn => {
        if (!sidebarInitialized && isLoggedIn) {
          await initializeSidebar();
          // Restore visibility state if needed (use toggleSidebar logic)
           if (sessionStorage.getItem('sidebarWasVisible') === 'true') { // Example using sessionStorage
               if (!sidebarVisible) toggleSidebar(); // Open it
           }
        } else if (sidebarInitialized && isLoggedIn) {
            // Sidebar exists, just update user info/credits if needed
            fetchUserCredits();
            const welcomeEl = document.getElementById('sidebar-welcome-message');
            if (welcomeEl) updateWelcomeMessage(welcomeEl);
        }
        sendResponse({ success: true });
      });
      break;

    case "showSidebar":
      isAsync = true;
      checkLoginStatus().then(async isLoggedIn => {
        if (!isLoggedIn) {
           alert("Please log in via the extension popup to use the sidebar.");
           sendResponse({ success: false, message: "Login required" }); return;
        }
        if (!sidebarInitialized) {
            console.log("Initializing sidebar on show request.");
            await initializeSidebar();
        }
        // Ensure sidebar is initialized before trying to open
        if (sidebarInitialized && !sidebarVisible) {
            toggleSidebar(); // Open if initialized and hidden
        } else if (!sidebarInitialized) {
             console.error("Failed to initialize sidebar on show request.");
        }
        // Store intended state
        sessionStorage.setItem('sidebarWasVisible', 'true');
        sendResponse({ success: true });
      });
      break;

    case "updateSidebarImage":
       // Triggered by background script AFTER capture succeeds
       console.log("Sidebar: Received request to update image.");
       loadStoredBoardData(true); // Load data, indicate it's a new capture (clears chat)
       sendResponse({ success: true });
      break;

    case "paymentCompleted":
       console.log("Sidebar: Payment completed message received", request);
       const overlay = document.getElementById('credits-modal-overlay');
       if (overlay) overlay.remove(); // Remove purchase modal

       if (request.success) {
           alert(`Payment successful! ${request.creditsAdded || 'Credits'} added. Your new balance is ${request.currentBalance}.`);
           updateCreditsDisplay(request.currentBalance); // Update display with final balance
       } else {
           alert(`Payment failed: ${request.error || "Unknown error"}`);
       }
       // Acknowledge message, no async needed here generally
       sendResponse({ success: true });
       break;

    default:
      console.log("Sidebar: Unknown message action:", request.action);
      // sendResponse({ success: false, error: "Unknown action" }); // Optional: Indicate not handled
      break;
  }
   return isAsync; // Return true only if response is sent asynchronously
});

// --- Initial Load ---
function initOnLoad() {
    console.log("Content script: Checking login status on load...");
    checkLoginStatus().then(isLoggedIn => {
        if (isLoggedIn && !sidebarInitialized) { // Check init flag
            console.log("User logged in, initializing sidebar.");
            initializeSidebar();
        } else if (isLoggedIn && sidebarInitialized) {
             console.log("User logged in, sidebar already initialized.");
             // Maybe just update credits?
             fetchUserCredits();
        } else {
            console.log("User not logged in, sidebar not initialized.");
        }
    });
}

// Try initializing on DOMContentLoaded or if already interactive/complete
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initOnLoad();
} else {
    document.addEventListener('DOMContentLoaded', initOnLoad);
}


// --- CSS Injection ---
function injectCustomCSS() {
  const styleId = 'vichar-sidebar-styles';
  if (document.getElementById(styleId)) return; // Inject only once

  const css = `
    /* Ensure sidebar is above most site elements */
    #chess-analysis-sidebar { z-index: 2147483646 !important; }
    #sidebar-toggle { z-index: 2147483647 !important; }

    /* Chat message base styles */
    .sidebar-chat-message {
      padding: 8px 12px; border-radius: 12px; max-width: 85%;
      word-wrap: break-word; line-height: 1.45; font-size: 14px;
      box-shadow: 0 1px 1px rgba(0,0,0,0.08); margin-bottom: 2px; /* Small gap */
    }
    /* User message styling */
    .user-message {
      background-color: #d1e7fd; color: #084298; align-self: flex-end;
      border-bottom-right-radius: 4px; margin-left: auto; /* Push right */
    }
    /* Assistant message styling */
    .assistant-message {
      background-color: #ffffff; color: #212529; align-self: flex-start;
      border: 1px solid #e9ecef; border-bottom-left-radius: 4px; margin-right: auto; /* Push left */
    }
    /* Error message styling */
    .error-message {
      background-color: #f8d7da; color: #842029; border: 1px solid #f5c2c7;
      align-self: stretch; max-width: 100%; text-align: left;
      font-size: 13px; padding: 10px; margin-top: 5px;
    }
    .error-message strong { color: #6a1a21; }

     /* Loading spinner */
    .spinner {
        display: inline-block; width: 14px; height: 14px;
        border-radius: 50%; border: 2px solid #b0bec5; border-top-color: #546e7a; /* Grey spinner */
        animation: spin 1s linear infinite;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

    /* Formatted response styles within chat */
    .assistant-message .chess-notation, .error-message .chess-notation { color: #0d6efd; font-weight: 500; }
    .assistant-message .evaluation, .error-message .evaluation { color: #198754; font-weight: 500; }
    .assistant-message .highlight, .error-message .highlight { font-weight: 600; }
    .assistant-message strong, .error-message strong { font-weight: 600; } /* Ensure bold works */
    .assistant-message code { background-color: #e9ecef; padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.9em;}

    /* Ensure system fonts */
    #chess-analysis-sidebar, #chess-analysis-sidebar * {
       font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif !important;
    }
    #chess-analysis-sidebar button { font-weight: 500; }
    #chess-analysis-sidebar h2 { font-weight: 600; font-size: 1.1rem; } /* Slightly smaller header */

    /* Scrollbar for chat */
    #sidebar-chat-messages::-webkit-scrollbar { width: 6px; }
    #sidebar-chat-messages::-webkit-scrollbar-track { background: #e9ecef; }
    #sidebar-chat-messages::-webkit-scrollbar-thumb { background: #adb5bd; border-radius: 3px;}
    #sidebar-chat-messages::-webkit-scrollbar-thumb:hover { background: #6c757d; }

     /* Input area adjustments */
     #sidebar-question-input { outline: none; }
     #sidebar-question-input:focus { border-color: #86b7fe; box-shadow: 0 0 0 0.2rem rgba(13, 110, 253, 0.25); }
     #sidebar-ask-button:hover { background-color: #3367d6; }
     #sidebar-ask-button:disabled { background-color: #a0c3ff; cursor: not-allowed; }

     /* Small fix for logout/buy buttons alignment if needed */
     #sidebar-credits-display ~ button, #sidebar-welcome-message ~ button { line-height: 1.2; }

     /* Ensure buttons don't inherit weird site styles */
     #chess-analysis-sidebar button { all: revert; /* Reset most styles */
        /* Re-apply desired styles */
        cursor: pointer; border: none; border-radius: 4px; color: white;
        font-family: inherit; font-size: 12px; font-weight: 600;
        padding: 4px 8px; transition: background-color 0.2s, opacity 0.2s;
        display: inline-flex; align-items: center; justify-content: center;
     }
      /* Re-apply specific button styles */
     #sidebar-toggle { all: revert; /* Reset toggle specific */
        position: fixed; top: 50%; right: 0px; transform: translateY(-50%);
        width: 30px; height: 60px; background-color: #4285f4;
        border-radius: 5px 0 0 5px; cursor: pointer; z-index: 100000;
        display: flex; align-items: center; justify-content: center;
        box-shadow: -2px 0 5px rgba(0, 0, 0, 0.1); color: white;
        transition: right 0.3s ease;
     }
     #sidebar-ask-button { padding: 0; width: 36px; height: 36px; border-radius: 50%; background-color: #4285f4; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
     #sidebar-capture-button { width: calc(100% - 30px); margin: 10px 15px 0 15px; background-color: #34a853; font-size: 14px; padding: 8px 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
     #sidebar-credits-display + button { background-color: #34a853; } /* Buy credits button */
     #sidebar-welcome-message + button { background-color: #f44336; } /* Logout button */
     #chess-analysis-sidebar h2 + button { background: none; font-size: 20px; color: #555; padding: 0 5px; width: auto; height: auto; box-shadow: none;} /* Close button */
     #chess-analysis-sidebar button:disabled { opacity: 0.6; cursor: not-allowed; }


  `;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = css;
  document.head.appendChild(style);
  console.log("Sidebar custom CSS injected/updated");
}


// --- Utility functions (keep formatAPIResponse, getBase64FromImageSrc) ---
function formatAPIResponse(response) {
   let formatted = response.replace(/\n/g, '<br>');
   formatted = formatted.replace(/(best move|advantage|winning|check|mate|fork|pin|skewer|discovered attack|zwischenzug|tempo|initiative|development|center control|king safety|pawn structure)/gi,'<span class="highlight">$1</span>');
   formatted = formatted.replace(/\b([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[\+#]?|O-O(?:-O)?)\b/g,'<span class="chess-notation">$1</span>');
   formatted = formatted.replace(/([+-])\d+\.?\d*/g,'<span class="evaluation">$&</span>');
   // Simple code block formatting
   formatted = formatted.replace(/```(\w*)\s*([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>'); // Basic markdown code blocks
   formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>'); // Inline code
   return formatted;
}

function getBase64FromImageSrc(src) {
   if (src && src.startsWith('data:image/')) { return src.split(',')[1]; }
   return null;
}