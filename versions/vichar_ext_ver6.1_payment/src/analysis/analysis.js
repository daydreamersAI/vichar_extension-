// Updated analysis.js with authentication support
import { 
  isAuthenticated, 
  getCurrentUser, 
  loginWithGoogle, 
  openPaymentPage,
  getCreditPackages 
} from '../auth-storage.js';

document.addEventListener('DOMContentLoaded', async function() {
  const capturedBoardImg = document.getElementById('capturedBoard');
  const questionInput = document.getElementById('questionInput');
  const askButton = document.getElementById('askButton');
  const responseArea = document.getElementById('responseArea');
  const gameInfo = document.getElementById('gameInfo');
  const fenDisplay = document.getElementById('fenDisplay');
  const pgnContainer = document.getElementById('pgnContainer');
  const pgnDisplay = document.getElementById('pgnDisplay');
  
  // Create user info panel at the top
  createUserInfoPanel();
  
  // API configuration - updated to your deployed API
  const API_URL = "https://api.beekayprecision.com";
  
  let capturedBoard = null;
  let chatHistory = []; // Store chat history for context
  
  // Load the captured board from storage
  try {
    const result = await chrome.storage.local.get(['capturedBoard']);
    capturedBoard = result.capturedBoard;
    
    if (capturedBoard && capturedBoard.imageData) {
      capturedBoardImg.src = capturedBoard.imageData;
      console.log("FEN data:", capturedBoard.fen);
      console.log("PGN data:", capturedBoard.pgn ? "Available" : "Not available");
      
      // Display FEN and PGN data
      if (capturedBoard.fen) {
        gameInfo.style.display = "block";
        fenDisplay.textContent = capturedBoard.fen;
      }
      
      if (capturedBoard.pgn && capturedBoard.pgn.trim().length > 0) {
        pgnContainer.style.display = "block";
        pgnDisplay.textContent = capturedBoard.pgn;
      }
    } else {
      responseArea.innerHTML = `
        <div style="text-align: center; padding: 15px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f44336" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <p style="margin-top: 10px; font-size: 16px;">No chess position has been captured yet.</p>
          <p style="color: #666;">Use the extension popup to capture a position first.</p>
        </div>
      `;
    }
  } catch (error) {
    console.error("Error loading captured board:", error);
    responseArea.innerHTML = `
      <div style="color: #d32f2f; padding: 15px; background-color: #ffebee; border-radius: 4px;">
        <strong>Error loading the captured chess position:</strong><br>
        ${error.message}
      </div>
    `;
  }
  
  // Create user info panel
  function createUserInfoPanel() {
    const container = document.querySelector('.container');
    const h1 = container.querySelector('h1');
    
    const userInfoPanel = document.createElement('div');
    userInfoPanel.id = 'userInfoPanel';
    userInfoPanel.className = 'user-info-panel';
    userInfoPanel.style.cssText = `
      background-color: white;
      padding: 15px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    
    // Insert after h1
    if (h1) {
      h1.insertAdjacentElement('afterend', userInfoPanel);
    } else {
      container.insertAdjacentElement('afterbegin', userInfoPanel);
    }
    
    // Add styles for credit packages
    const style = document.createElement('style');
    style.textContent = `
      .credit-packages {
        background-color: white;
        padding: 15px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        margin-top: 20px;
        display: none;
      }
      .package-btn {
        padding: 10px;
        background-color: white;
        border: 1px solid #ddd;
        border-radius: 4px;
        cursor: pointer;
        text-align: left;
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
        transition: background-color 0.2s;
      }
      .package-btn:hover {
        background-color: #f5f5f5;
      }
      .credit-packages-title {
        font-weight: 600;
        margin-bottom: 15px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
    `;
    document.head.appendChild(style);
    
    // Create credit packages container
    const creditPackagesContainer = document.createElement('div');
    creditPackagesContainer.id = 'creditPackagesContainer';
    creditPackagesContainer.className = 'credit-packages';
    
    // Add to the page
    container.appendChild(creditPackagesContainer);
    
    // Update the user panel based on auth state
    updateUserPanel();
  }
  
  // Update user panel
  function updateUserPanel() {
    const userInfoPanel = document.getElementById('userInfoPanel');
    if (!userInfoPanel) return;
    
    if (isAuthenticated()) {
      const user = getCurrentUser();
      
      userInfoPanel.innerHTML = `
        <div>
          <div style="font-weight: 600; font-size: 15px;">${user.full_name || user.email}</div>
          <div style="display: flex; align-items: center; margin-top: 5px;">
            <span style="color: #34a853; font-weight: 600;">${user.credits}</span>
            <span style="margin-left: 5px; font-size: 14px; color: #555;">credits</span>
          </div>
        </div>
        <div>
          <button id="buyCreditsBtn" style="
            padding: 8px 16px;
            background-color: #fbbc05;
            color: #333;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            margin-right: 10px;
          ">Buy Credits</button>
          <button id="logoutBtn" style="
            padding: 8px 16px;
            background-color: #f1f1f1;
            color: #333;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
          ">Logout</button>
        </div>
      `;
      
      // Add event listeners
      setTimeout(() => {
        const buyCreditsBtn = document.getElementById('buyCreditsBtn');
        if (buyCreditsBtn) {
          buyCreditsBtn.addEventListener('click', toggleCreditPackages);
        }
        
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
          logoutBtn.addEventListener('click', logout);
        }
      }, 0);
      
      // Update ask button state
      updateAskButtonState();
      
    } else {
      userInfoPanel.innerHTML = `
        <div>
          <div style="font-weight: 600; font-size: 15px;">Not logged in</div>
          <div style="font-size: 14px; color: #555; margin-top: 5px;">Login to use AI chess analysis</div>
        </div>
        <button id="loginBtn" style="
          padding: 8px 16px;
          background-color: #4285f4;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
        ">Login with Google</button>
      `;
      
      // Add event listener
      setTimeout(() => {
        const loginBtn = document.getElementById('loginBtn');
        if (loginBtn) {
          loginBtn.addEventListener('click', handleLogin);
        }
      }, 0);
      
      // Update ask button state
      updateAskButtonState();
    }
  }
  
  // Toggle credit packages
  function toggleCreditPackages() {
    const creditPackagesContainer = document.getElementById('creditPackagesContainer');
    if (!creditPackagesContainer) return;
    
    const isVisible = creditPackagesContainer.style.display === 'block';
    
    if (isVisible) {
      creditPackagesContainer.style.display = 'none';
    } else {
      creditPackagesContainer.style.display = 'block';
      loadCreditPackages();
    }
  }
  
  // Load credit packages
  async function loadCreditPackages() {
    const creditPackagesContainer = document.getElementById('creditPackagesContainer');
    if (!creditPackagesContainer) return;
    
    if (!isAuthenticated()) {
      creditPackagesContainer.innerHTML = `
        <div style="text-align: center; padding: 10px;">
          <p>Please login to purchase credits</p>
          <button id="loginPackagesBtn" style="
            padding: 8px 16px;
            background-color: #4285f4;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin-top: 10px;
          ">Login with Google</button>
        </div>
      `;
      
      setTimeout(() => {
        const loginBtn = document.getElementById('loginPackagesBtn');
        if (loginBtn) {
          loginBtn.addEventListener('click', handleLogin);
        }
      }, 0);
      
      return;
    }
    
    creditPackagesContainer.innerHTML = `
      <div style="text-align: center; padding: 15px;">
        <div style="display: inline-block; width: 24px; height: 24px; border-radius: 50%; border: 2px solid #4285f4; border-top-color: transparent; animation: spin 1s linear infinite;"></div>
        <p style="margin-top: 10px;">Loading credit packages...</p>
      </div>
    `;
    
    try {
      const packages = await getCreditPackages();
      
      if (packages && packages.packages && packages.packages.length > 0) {
        let html = `
          <div class="credit-packages-title">
            <span>Add More Credits</span>
            <button id="closePackagesBtn" style="
              background: none;
              border: none;
              font-size: 16px;
              cursor: pointer;
              color: #555;
            ">×</button>
          </div>
          <div id="packageButtons">
        `;
        
        // Add package buttons
        packages.packages.forEach(pkg => {
          html += `
            <button class="package-btn" data-package-id="${pkg.id}">
              <div>
                <div style="font-weight: 600;">${pkg.name}</div>
                <div style="color: #34a853; font-size: 14px; margin-top: 5px;">${pkg.credits} Credits</div>
              </div>
              <div style="font-weight: 600; color: #4285f4;">${pkg.amount_display}</div>
            </button>
          `;
        });
        
        html += `</div>`;
        creditPackagesContainer.innerHTML = html;
        
        // Add event listeners
        setTimeout(() => {
          const closeBtn = document.getElementById('closePackagesBtn');
          if (closeBtn) {
            closeBtn.addEventListener('click', () => {
              creditPackagesContainer.style.display = 'none';
            });
          }
          
          const packageButtons = creditPackagesContainer.querySelectorAll('.package-btn');
          packageButtons.forEach(btn => {
            btn.addEventListener('click', function() {
              const packageId = this.getAttribute('data-package-id');
              purchaseCredits(packageId);
            });
          });
        }, 0);
      } else {
        creditPackagesContainer.innerHTML = `
          <div class="credit-packages-title">
            <span>Add More Credits</span>
            <button id="closePackagesBtn" style="
              background: none;
              border: none;
              font-size: 16px;
              cursor: pointer;
              color: #555;
            ">×</button>
          </div>
          <div style="text-align: center; padding: 15px;">
            <p>No credit packages available at this time.</p>
          </div>
        `;
        
        setTimeout(() => {
          const closeBtn = document.getElementById('closePackagesBtn');
          if (closeBtn) {
            closeBtn.addEventListener('click', () => {
              creditPackagesContainer.style.display = 'none';
            });
          }
        }, 0);
      }
    } catch (error) {
      console.error("Error loading credit packages:", error);
      
      creditPackagesContainer.innerHTML = `
        <div class="credit-packages-title">
          <span>Add More Credits</span>
          <button id="closePackagesBtn" style="
            background: none;
            border: none;
            font-size: 16px;
            cursor: pointer;
            color: #555;
          ">×</button>
        </div>
        <div style="text-align: center; padding: 15px; color: #d32f2f;">
          <p>Error loading packages: ${error.message}</p>
          <button id="retryPackagesBtn" style="
            padding: 8px 16px;
            background-color: #4285f4;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin-top: 10px;
          ">Retry</button>
        </div>
      `;
      
      setTimeout(() => {
        const closeBtn = document.getElementById('closePackagesBtn');
        if (closeBtn) {
          closeBtn.addEventListener('click', () => {
            creditPackagesContainer.style.display = 'none';
          });
        }
        
        const retryBtn = document.getElementById('retryPackagesBtn');
        if (retryBtn) {
          retryBtn.addEventListener('click', loadCreditPackages);
        }
      }, 0);
    }
  }
  
  // Handle login
  function handleLogin() {
    responseArea.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100px;">
        <div style="display: inline-block; border-radius: 50%; border: 3px solid #4285f4; 
             border-top-color: transparent; width: 24px; height: 24px; animation: spin 1s linear infinite;"></div>
        <div style="margin-left: 15px; font-weight: 500;">Opening login window...</div>
      </div>
    `;
    
    loginWithGoogle()
      .then(authData => {
        console.log("Login successful:", authData);
        
        // Update the user panel
        updateUserPanel();
        
        // Update ask button state
        updateAskButtonState();
        
        responseArea.innerHTML = `
          <div style="padding: 15px; background-color: #e8f5e9; border-radius: 4px; color: #2e7d32;">
            <strong>Login Successful!</strong>
            <p>You have ${authData.user.credits} credits available. You can now analyze chess positions.</p>
          </div>
        `;
      })
      .catch(error => {
        console.error("Login error:", error);
        
        responseArea.innerHTML = `
          <div style="padding: 15px; background-color: #ffebee; border-radius: 4px; color: #c62828;">
            <strong>Login Error</strong>
            <p>${error.message}</p>
          </div>
        `;
      });
  }
  
  // Logout
  function logout() {
    // Clear auth data
    import('../auth-storage.js').then(module => {
      module.clearAuth();
      
      // Update the user panel
      updateUserPanel();
      
      // Update ask button state
      updateAskButtonState();
      
      // Close credit packages if open
      const creditPackagesContainer = document.getElementById('creditPackagesContainer');
      if (creditPackagesContainer) {
        creditPackagesContainer.style.display = 'none';
      }
      
      // Show logged out message
      responseArea.innerHTML = `
        <div style="padding: 15px; text-align: center;">
          <p>You have been logged out successfully.</p>
          <button id="loginAgainBtn" style="
            padding: 8px 16px;
            background-color: #4285f4;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin-top: 10px;
          ">Login Again</button>
        </div>
      `;
      
      setTimeout(() => {
        const loginBtn = document.getElementById('loginAgainBtn');
        if (loginBtn) {
          loginBtn.addEventListener('click', handleLogin);
        }
      }, 0);
    });
  }
  
  // Purchase credits
  function purchaseCredits(packageId) {
    const creditPackagesContainer = document.getElementById('creditPackagesContainer');
    
    if (!isAuthenticated()) {
      // Show login prompt
      if (creditPackagesContainer) {
        creditPackagesContainer.innerHTML = `
          <div style="text-align: center; padding: 15px;">
            <p>Please login to purchase credits</p>
            <button id="loginForPurchaseBtn" style="
              padding: 8px 16px;
              background-color: #4285f4;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 14px;
              margin-top: 10px;
            ">Login with Google</button>
          </div>
        `;
        
        setTimeout(() => {
          const loginBtn = document.getElementById('loginForPurchaseBtn');
          if (loginBtn) {
            loginBtn.addEventListener('click', handleLogin);
          }
        }, 0);
      }
      return;
    }
    
    if (creditPackagesContainer) {
      creditPackagesContainer.innerHTML = `
        <div style="text-align: center; padding: 15px;">
          <div style="display: inline-block; width: 24px; height: 24px; border-radius: 50%; border: 2px solid #4285f4; border-top-color: transparent; animation: spin 1s linear infinite;"></div>
          <p style="margin-top: 10px;">Opening payment window...</p>
        </div>
      `;
    }
    
    openPaymentPage(packageId)
      .then(userData => {
        console.log("Payment successful:", userData);
        
        // Update the user panel
        updateUserPanel();
        
        // Update ask button state
        updateAskButtonState();
        
        // Show success message
        responseArea.innerHTML = `
          <div style="padding: 15px; background-color: #e8f5e9; border-radius: 4px; color: #2e7d32;">
            <strong>Payment Successful!</strong>
            <p>Your credits have been updated. You now have ${userData.credits} credits.</p>
          </div>
        `;
        
        // Hide credit packages
        if (creditPackagesContainer) {
          creditPackagesContainer.style.display = 'none';
        }
      })
      .catch(error => {
        console.error("Payment error:", error);
        
        if (creditPackagesContainer) {
          creditPackagesContainer.innerHTML = `
            <div class="credit-packages-title">
              <span>Add More Credits</span>
              <button id="closePackagesBtn" style="
                background: none;
                border: none;
                font-size: 16px;
                cursor: pointer;
                color: #555;
              ">×</button>
            </div>
            <div style="text-align: center; padding: 15px; color: #d32f2f;">
              <p>Payment error: ${error.message}</p>
              <button id="retryPaymentBtn" style="
                padding: 8px 16px;
                background-color: #4285f4;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                margin-top: 10px;
              ">Try Again</button>
            </div>
          `;
          
          setTimeout(() => {
            const closeBtn = document.getElementById('closePackagesBtn');
            if (closeBtn) {
              closeBtn.addEventListener('click', () => {
                creditPackagesContainer.style.display = 'none';
              });
            }
            
            const retryBtn = document.getElementById('retryPaymentBtn');
            if (retryBtn) {
              retryBtn.addEventListener('click', () => purchaseCredits(packageId));
            }
          }, 0);
        }
      });
  }
  
  // Update ask button state
  function updateAskButtonState() {
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
  
  // Function to format API responses with better styling
  function formatAPIResponse(response) {
    // Replace newlines with HTML line breaks
    let formatted = response.replace(/\n/g, '<br>');
    
    // Bold key terms
    formatted = formatted.replace(/(best move|advantage|winning|check|mate|fork|pin|skewer|discovered attack|zwischenzug|tempo|initiative|development|center control|king safety|pawn structure)/gi, 
      '<span class="highlight">$1</span>');
    
    // Highlight chess moves (like e4, Nf3, etc.)
    formatted = formatted.replace(/\b([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[\+#]?)\b/g, 
      '<span class="chess-notation">$1</span>');
    
    // Highlight evaluations (+1.5, -0.7, etc.)
    formatted = formatted.replace(/(\+|-)\d+\.?\d*/g, 
      '<span class="evaluation">    } else { ask</span>');
  
    return formatted;
  }
  
  // Extract base64 image data from the image source
  function getBase64FromImageSrc(src) {
    // Check if the src is already base64
    if (src.startsWith('data:image/')) {
      // Extract just the base64 part without the data URI prefix
      return src.split(',')[1];
    }
    return null;
  }
  
  // Handle asking a question - Updated with auth
  askButton.addEventListener('click', async () => {
    const question = questionInput.value.trim();
    
    if (!question) {
      responseArea.innerHTML = `
        <div style="color: #f57c00; padding: 10px; background-color: #fff3e0; border-radius: 4px;">
          Please enter a question about the position.
        </div>
      `;
      return;
    }
    
    if (!capturedBoard) {
      responseArea.innerHTML = `
        <div style="color: #d32f2f; padding: 10px; background-color: #ffebee; border-radius: 4px;">
          No chess position available to analyze. Please capture a position first.
        </div>
      `;
      return;
    }
    
    // Check if user is authenticated and has credits
    if (!isAuthenticated()) {
      responseArea.innerHTML = `
        <div style="padding: 15px; text-align: center;">
          <div style="font-weight: 600; font-size: 16px; margin-bottom: 10px;">Login Required</div>
          <p>Please login with your Google account to use the chess analysis feature.</p>
          <button id="analysis-login-btn" style="
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
        const loginBtn = document.getElementById('analysis-login-btn');
        if (loginBtn) {
          loginBtn.addEventListener('click', handleLogin);
        }
      }, 0);
      
      return;
    }
    
    const user = getCurrentUser();
    if (user.credits <= 0) {
      responseArea.innerHTML = `
        <div style="padding: 15px; text-align: center;">
          <div style="font-weight: 600; font-size: 16px; margin-bottom: 10px; color: #f57c00;">Insufficient Credits</div>
          <p>You need at least 1 credit to analyze a chess position.</p>
          <button id="analysis-buy-credits-btn" style="
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
        const buyCreditsBtn = document.getElementById('analysis-buy-credits-btn');
        if (buyCreditsBtn) {
          buyCreditsBtn.addEventListener('click', () => {
            toggleCreditPackages();
          });
        }
      }, 0);
      
      return;
    }
    
    responseArea.innerHTML = `
      <div class="loading">
        Analyzing position and generating response...
      </div>
    `;
    
    try {
      // Add user's question to chat history
      chatHistory.push({ 
        text: question, 
        sender: "user" 
      });
      
      // Extract base64 image data for vision model
      const imageData = getBase64FromImageSrc(capturedBoard.imageData);
      
      // Get auth token
      const auth = await import('../auth-storage.js').then(module => module.getAuthToken());
      
      // Call the API with the question, board position, and image data
      const response = await callAnalysisAPI(question, capturedBoard, imageData, auth?.access_token);
      
      // Check if response includes updated user info
      if (response.user) {
        // Update user info in storage
        await import('../auth-storage.js').then(module => {
          module.updateUserData(response.user);
          // Update the user panel
          updateUserPanel();
        });
      }
      
      // Add the assistant's response to chat history
      chatHistory.push({
        text: response.data,
        sender: "assistant"
      });
      
      // Format the response with improved styling
      responseArea.innerHTML = formatAPIResponse(response.data);
    } catch (error) {
      console.error("Error getting response:", error);
      
      // Handle specific error types
      if (error.message.includes("Authentication required")) {
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
      } else if (error.message.includes("Insufficient credits")) {
        // Credit error
        responseArea.innerHTML = `
          <div style="padding: 15px; text-align: center;">
            <div style="font-weight: 600; font-size: 16px; margin-bottom: 10px; color: #f57c00;">Insufficient Credits</div>
            <p>You need more credits to continue analyzing chess positions.</p>
            <button id="buy-more-credits-btn" style="
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
          const buyMoreCreditsBtn = document.getElementById('buy-more-credits-btn');
          if (buyMoreCreditsBtn) {
            buyMoreCreditsBtn.addEventListener('click', () => {
              toggleCreditPackages();
            });
          }
        }, 0);
      } else {
        // General error
        responseArea.innerHTML = `
          <div style="color: #d32f2f; padding: 10px; background-color: #ffebee; border-radius: 4px; margin-bottom: 10px;">
            <strong>Error analyzing position:</strong>
          </div>
          <div>${error.message}</div>
        `;
      }
    }
  });
  
  // Allow pressing Enter to submit question
  questionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      askButton.click();
    }
  });
});

// Function to call the backend API with authentication
async function callAnalysisAPI(question, capturedBoard, imageData = null, authToken = null) {
  try {
    const API_URL = "https://api.beekayprecision.com";
    
    // Prepare the request payload with image data for vision model
    const requestData = {
      message: question,
      fen: capturedBoard.fen,
      pgn: capturedBoard.pgn || null,
      image_data: imageData, // Include the base64 image data
      chat_history: [] // You could pass the chat history here if needed
    };
    
    console.log("Sending API request with image data:", imageData ? "Included" : "Not included");
    console.log("Auth token provided:", !!authToken);
    
    // Determine the API endpoint based on auth status
    const endpoint = authToken 
      ? `${API_URL}/analysis-with-credit` 
      : `${API_URL}/chess/analysis`;
    
    // Prepare headers
    const headers = {
      'Content-Type': 'application/json',
    };
    
    // Add auth token if available
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    // Call our Python API
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestData)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("API response error:", response.status, errorText);
      
      // Handle specific error codes
      if (response.status === 401) {
        throw new Error("Authentication required. Please login to continue.");
      } else if (response.status === 402) {
        throw new Error("Insufficient credits. Please purchase more credits to continue.");
      } else {
        throw new Error(`API response error: ${response.status} ${response.statusText}${errorText ? ' - ' + errorText : ''}`);
      }
    }
    
    const data = await response.json();
    console.log("API response:", data);
    
    return {
      data: data.response,
      user: data.user || null
    };
  } catch (error) {
    console.error("API call error:", error);
    throw error;
  }
}