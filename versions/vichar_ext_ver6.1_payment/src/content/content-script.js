// Updated content-script.js with authentication and payment integration
import { 
  isAuthenticated, 
  getCurrentUser, 
  loginWithGoogle, 
  openPaymentPage,
  getCreditPackages,
  fetchUserData,
  getAuthToken,
  updateUserData 
} from './auth-storage.js';

const CACHE_BUST = new Date().getTime();
console.log("Cache bust ID:", CACHE_BUST);

// This is the main content script that gets injected by Chrome
console.log("Chess analyzer content script loader initialized");

// Create a global variable to keep track of the sidebar state
let sidebarInitialized = false;
let sidebarVisible = false;

// API configuration - updated to match your deployment
const API_URL = "https://api.beekayprecision.com"; // Updated API server address

// Function to create and initialize the sidebar
function initializeSidebar() {
  if (sidebarInitialized) {
    return; // Don't initialize twice
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
  
  // Add user info panel
  const userInfoPanel = document.createElement('div');
  userInfoPanel.id = 'user-info-panel';
  userInfoPanel.style.cssText = `
    background-color: white;
    padding: 10px;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    margin-bottom: 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
  
  // Update the user panel based on auth state
  updateUserPanel(userInfoPanel);
  
  // Function to update user panel
  function updateUserPanel(panel) {
    if (isAuthenticated()) {
      const user = getCurrentUser();
      
      // Update panel content for logged-in user
      panel.innerHTML = `
        <div style="flex: 1;">
          <div style="font-weight: 600; font-size: 14px;">${user.full_name || user.email}</div>
          <div style="display: flex; align-items: center; margin-top: 5px;">
            <span style="color: #34a853; font-weight: 600;">${user.credits}</span>
            <span style="margin-left: 5px; font-size: 13px; color: #555;">credits</span>
          </div>
        </div>
        <button id="buy-credits-btn" style="
          padding: 6px 12px;
          background-color: #fbbc05;
          color: #333;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
        ">Buy Credits</button>
      `;
      
      // Add event listener for the buy credits button
      setTimeout(() => {
        const buyCreditsBtn = document.getElementById('buy-credits-btn');
        if (buyCreditsBtn) {
          buyCreditsBtn.addEventListener('click', () => {
            toggleCreditPackages();
          });
        }
      }, 0);
      
      // Make sure relevant containers are visible
      const creditPackagesContainer = document.getElementById('credit-packages-container');
      if (creditPackagesContainer) {
        // Start hidden, will be toggled by the button
        creditPackagesContainer.style.display = 'none';
      }
      
    } else {
      // Update panel content for logged-out user
      panel.innerHTML = `
        <div style="flex: 1;">
          <div style="font-weight: 600; font-size: 14px;">Not logged in</div>
          <div style="font-size: 13px; color: #555; margin-top: 5px;">Login to use AI chess analysis</div>
        </div>
        <button id="login-btn" style="
          padding: 6px 12px;
          background-color: #4285f4;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
        ">Login with Google</button>
      `;
      
      // Add event listener for the login button
      setTimeout(() => {
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
          loginBtn.addEventListener('click', handleLogin);
        }
      }, 0);
      
      // Hide credit packages when logged out
      const creditPackagesContainer = document.getElementById('credit-packages-container');
      if (creditPackagesContainer) {
        creditPackagesContainer.style.display = 'none';
      }
    }
    
    // Update ask button state
    updateAskButtonState();
  }
  
  // Question input
  const questionContainer = document.createElement('div');
  questionContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 10px;
    background-color: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  `;
  
  const questionLabel = document.createElement('label');
  questionLabel.textContent = 'Ask about this position:';
  questionLabel.style.cssText = `
    font-weight: 600;
    color: #333;
    font-size: 14px;
  `;
  
  const questionInput = document.createElement('textarea');
  questionInput.id = 'question-input';
  questionInput.placeholder = 'Example: What is the best move for white?';
  questionInput.style.cssText = `
    width: 100%;
    height: 80px;
    padding: 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    resize: vertical;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 14px;
    line-height: 1.4;
    color: #333;
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
  askButton.id = 'ask-question-btn';
  askButton.style.cssText = `
    padding: 10px 16px;
    background-color: #4285f4;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    align-self: flex-start;
    transition: background-color 0.2s;
  `;
  askButton.addEventListener('mouseenter', () => {
    askButton.style.backgroundColor = '#3367d6';
  });
  askButton.addEventListener('mouseleave', () => {
    askButton.style.backgroundColor = '#4285f4';
  });
  askButton.addEventListener('click', () => {
    if (isAuthenticated()) {
      const user = getCurrentUser();
      if (user.credits > 0) {
        askQuestion();
      } else {
        showInsufficientCreditsWarning();
      }
    } else {
      showLoginPrompt();
    }
  });
  
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
    padding: 15px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background-color: white;
    min-height: 120px;
    max-height: 200px;
    overflow-y: auto;
    line-height: 1.5;
    color: #333;
    font-size: 14px;
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
  
  // Credit packages container
  const creditPackagesContainer = document.createElement('div');
  creditPackagesContainer.id = 'credit-packages-container';
  creditPackagesContainer.style.cssText = `
    width: 100%;
    background-color: white;
    padding: 12px;
    border-radius: 8px;
    margin-top: 15px;
    display: none;
    flex-direction: column;
    gap: 10px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  `;
  
  const packagesHeader = document.createElement('div');
  packagesHeader.textContent = 'Add More Credits';
  packagesHeader.style.cssText = `
    font-weight: 600;
    color: #333;
    font-size: 16px;
    margin-bottom: 10px;
  `;
  
  creditPackagesContainer.appendChild(packagesHeader);
  
  // Package buttons will be added dynamically
  const packageButtonsContainer = document.createElement('div');
  packageButtonsContainer.id = 'package-buttons';
  packageButtonsContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 10px;
  `;
  
  creditPackagesContainer.appendChild(packageButtonsContainer);
  
  // Assemble the content
  content.appendChild(header);
  content.appendChild(userInfoPanel);     // New: User info panel
  content.appendChild(questionContainer);  // 1. Question input
  content.appendChild(responseContainer);  // 2. Response area
  content.appendChild(captureButton);      // 3. Capture button
  content.appendChild(imageContainer);     // 4. Captured image
  content.appendChild(gameInfoContainer);  // 5. Game info (FEN/PGN)
  content.appendChild(creditPackagesContainer); // 6. Credit packages
  
  // Add content to sidebar
  sidebar.appendChild(content);
  
  // Add the sidebar and toggle button to the page
  document.body.appendChild(sidebar);
  document.body.appendChild(toggleButton);
  
  sidebarInitialized = true;
  console.log("Sidebar elements created successfully");
  
  // Load credit packages if user is logged in
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

// Helper functions for authentication and credits
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
  
  loginWithGoogle()
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
}

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

function updateAskButtonState() {
  const askButton = document.getElementById('ask-question-btn');
  if (!askButton) return;
  
  if (isAuthenticated()) {
    const user = getCurrentUser();
    if (user.credits > 0) {
      askButton.disabled = false;
      askButton.title = "";
      askButton.style.opacity = "1";
    } else {
      askButton.disabled = true;
      askButton.title = "You need credits to analyze positions";
      askButton.style.opacity = "0.6";
    }
  } else {
    askButton.disabled = true;
    askButton.title = "Login to analyze positions";
    askButton.style.opacity = "0.6";
  }
}

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
    
    const packages = await getCreditPackages();
    
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
  
  openPaymentPage(packageId)
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

// Function to ask a question about the position - Updated with auth
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
  chrome.storage.local.get(['capturedBoard'], (result) => {
    const capturedBoard = result.capturedBoard;
    
    if (!capturedBoard) {
      responseArea.textContent = "Please capture a chess position first.";
      return;
    }
    
    // Determine if we should use vision
    const useVision = aiVisionToggle && aiVisionToggle.checked;
    
    // Get auth token
    const auth = getAuthToken();
    
    // Send request to background script to handle API call with auth token
    try {
      chrome.runtime.sendMessage({
        action: "analyzeChessPosition",
        question: question,
        capturedBoard: capturedBoard,
        useVision: useVision,
        authToken: auth ? auth.access_token : null
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
          // Check if user info was returned (to update credit count)
          if (response.user) {
            // Update user data
            updateUserData(response.user);
            
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
          // Handle errors based on type
          if (response?.error?.includes("Authentication required")) {
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
          } else if (response?.error?.includes("Insufficient credits")) {
            // Insufficient credits
            showInsufficientCreditsWarning();
          } else {
            // General error
            responseArea.innerHTML = `
              <div style="color: #d32f2f; padding: 10px; background-color: #ffebee; border-radius: 4px;">
                <strong>Error:</strong> ${response?.error || "Failed to analyze position"}
              </div>
            `;
          }
        }
      });
    } catch (error) {
      console.error("Error sending analysis message:", error);
      responseArea.innerHTML = `
        <div style="color: #d32f2f; padding: 10px; background-color: #ffebee; border-radius: 4px;">
          <strong>Error:</strong> ${error.message}
        </div>
      `;
    }
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
    '<span style="color: #188038; font-weight: 500;">            <p>Your credits have been updated. You now have ${userData.credits}</span>');
  
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
    
    // Get auth token
    const auth = getAuthToken();
    console.log("Auth token present:", !!auth);
    
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
    
    // Determine endpoint based on auth status
    const endpoint = auth ? `${API_URL}/analysis-with-credit` : `${API_URL}/chess/analysis`;
    
    // Prepare headers
    const headers = {
      'Content-Type': 'application/json',
    };
    
    // Add auth token if available
    if (auth) {
      headers['Authorization'] = `Bearer ${auth.access_token}`;
    }
    
    // Call our Python API with better error handling
    console.log("Initiating fetch to:", endpoint);
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestData)
    });
    
    console.log("Response status:", response.status, response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("API error response text:", errorText);
      
      // Handle specific error codes
      if (response.status === 401) {
        throw new Error("Authentication required. Please login to continue.");
      } else if (response.status === 402) {
        throw new Error("Insufficient credits. Please purchase more credits to continue.");
      } else {
        throw new Error(`API response error: ${response.status} ${response.statusText} - ${errorText}`);
      }
    }
    
    const data = await response.json();
    console.log("API response parsed successfully:", data);
    
    if (!data.response) {
      console.error("API response missing 'response' field:", data);
      throw new Error("Invalid API response format - missing 'response' field");
    }
    
    return {
      data: data.response,
      user: data.user || null
    };
  } catch (error) {
    console.error("API call error details:", error);
    throw error;
  }
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

// FIXED MESSAGE LISTENER - Add ping handler and improve response handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Content script received message:", request);
  
  // Add ping handler for extension health check
  if (request.action === "ping") {
    console.log("Ping received, responding immediately");
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === "showSidebar") {
    console.log("Show sidebar request received");
    
    try {
      // Initialize the sidebar if not already done
      if (!sidebarInitialized) {
        initializeSidebar();
      }
      
      // Show the sidebar
      sidebarVisible = true;
      const sidebar = document.getElementById('chess-analysis-sidebar');
      if (sidebar) {
        sidebar.style.right = '0';
        console.log("Sidebar displayed");
      } else {
        console.error("Sidebar element not found");
      }
      
      // Send response immediately
      sendResponse({ success: true });
    } catch (error) {
      console.error("Error showing sidebar:", error);
      sendResponse({ success: false, error: error.message });
    }
    
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
});

// Initialize the sidebar when the content script loads
// But wait for the page to be fully loaded first
document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM loaded, initializing sidebar");
  initializeSidebar();
});

// If the page is already loaded, initialize immediately
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  console.log("Page already loaded, initializing sidebar immediately");
  initializeSidebar();
}

// Listen for storage changes (like auth state changes)
window.addEventListener('storage', (event) => {
  if (event.key === 'chess_assistant_auth') {
    console.log('Auth data changed, updating UI');
    const userInfoPanel = document.getElementById('user-info-panel');
    if (userInfoPanel) {
      updateUserPanel(userInfoPanel);
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