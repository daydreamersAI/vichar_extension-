// This is the main content script that gets injected by Chrome
console.log("Chess analyzer content script loader initialized");

// Create a global variable to keep track of the sidebar state
let sidebarInitialized = false;
let sidebarVisible = false;

// API configuration - change this to match your deployment
const API_URL = "http://localhost:8000"; // Update this to your FastAPI server address

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
    background-color: white;
    box-shadow: -2px 0 10px rgba(0, 0, 0, 0.2);
    z-index: 9999;
    overflow-y: auto;
    transition: right 0.3s ease;
    font-family: Arial, sans-serif;
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
    border-bottom: 1px solid #eee;
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
  header.innerHTML = '<h2 style="margin: 0;">Chess Analysis</h2>';
  
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
  
  // Capture button
  const captureButton = document.createElement('button');
  captureButton.textContent = 'Capture Current Position';
  captureButton.style.cssText = `
    padding: 8px 16px;
    background-color: #4285f4;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  `;
  captureButton.addEventListener('click', captureCurrentPosition);
  
  // Image container
  const imageContainer = document.createElement('div');
  imageContainer.style.cssText = `
    width: 100%;
    display: flex;
    justify-content: center;
    background-color: #f5f5f5;
    padding: 10px;
    border-radius: 4px;
  `;
  const capturedImage = document.createElement('img');
  capturedImage.id = 'captured-board-image';
  capturedImage.style.cssText = `
    max-width: 100%;
    max-height: 360px;
    display: none;
  `;
  imageContainer.appendChild(capturedImage);
  
  // Game info container
  const gameInfoContainer = document.createElement('div');
  gameInfoContainer.id = 'game-info-container';
  gameInfoContainer.style.cssText = `
    width: 100%;
    background-color: #f5f5f5;
    padding: 10px;
    border-radius: 4px;
    display: none;
    flex-direction: column;
    gap: 8px;
  `;
  
  // FEN display
  const fenContainer = document.createElement('div');
  fenContainer.style.cssText = `
    font-family: monospace;
    font-size: 12px;
    word-break: break-all;
    background-color: #fff;
    padding: 6px;
    border-radius: 3px;
    border: 1px solid #e0e0e0;
  `;
  const fenLabel = document.createElement('div');
  fenLabel.textContent = 'FEN:';
  fenLabel.style.fontWeight = 'bold';
  fenLabel.style.marginBottom = '3px';
  const fenValue = document.createElement('div');
  fenValue.id = 'fen-value';
  fenValue.textContent = '';
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
    padding: 6px;
    background-color: #e9e9e9;
    border-radius: 3px;
  `;
  
  const pgnLabel = document.createElement('div');
  pgnLabel.textContent = 'PGN (Game Moves)';
  pgnLabel.style.fontWeight = 'bold';
  
  const pgnToggle = document.createElement('span');
  pgnToggle.textContent = '▼';
  pgnToggle.style.transition = 'transform 0.3s';
  
  pgnHeader.appendChild(pgnLabel);
  pgnHeader.appendChild(pgnToggle);
  
  const pgnContent = document.createElement('div');
  pgnContent.id = 'pgn-value';
  pgnContent.style.cssText = `
    font-family: monospace;
    font-size: 12px;
    white-space: pre-wrap;
    word-break: break-all;
    background-color: #fff;
    padding: 6px;
    border-radius: 3px;
    border: 1px solid #e0e0e0;
    max-height: 150px;
    overflow-y: auto;
    display: none;
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
  
  // Question input
  const questionContainer = document.createElement('div');
  questionContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 5px;
  `;
  
  const questionLabel = document.createElement('label');
  questionLabel.textContent = 'Ask a question about this position:';
  questionLabel.style.fontWeight = 'bold';
  
  const questionInput = document.createElement('textarea');
  questionInput.id = 'question-input';
  questionInput.placeholder = 'Example: What is the best move for white?';
  questionInput.style.cssText = `
    width: 100%;
    height: 80px;
    padding: 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    resize: vertical;
    font-family: Arial, sans-serif;
  `;
  
  const askButton = document.createElement('button');
  askButton.textContent = 'Ask Question';
  askButton.style.cssText = `
    padding: 8px 16px;
    background-color: #4285f4;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    align-self: flex-start;
  `;
  askButton.addEventListener('click', askQuestion);
  
  questionContainer.appendChild(questionLabel);
  questionContainer.appendChild(questionInput);
  questionContainer.appendChild(askButton);
  
  // Response area
  const responseContainer = document.createElement('div');
  responseContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 5px;
    flex: 1;
  `;
  
  const responseLabel = document.createElement('label');
  responseLabel.textContent = 'Analysis:';
  responseLabel.style.fontWeight = 'bold';
  
  const responseArea = document.createElement('div');
  responseArea.id = 'response-area';
  responseArea.style.cssText = `
    flex: 1;
    padding: 15px;
    border: 1px solid #ddd;
    border-radius: 4px;
    background-color: #f9f9f9;
    min-height: 150px;
    overflow-y: auto;
  `;
  responseArea.textContent = 'Capture a position to begin analysis.';
  
  responseContainer.appendChild(responseLabel);
  responseContainer.appendChild(responseArea);
  
  // Assemble the content
  content.appendChild(header);
  content.appendChild(captureButton);
  content.appendChild(imageContainer);
  content.appendChild(gameInfoContainer);
  content.appendChild(questionContainer);
  content.appendChild(responseContainer);
  
  // Add content to sidebar
  sidebar.appendChild(content);
  
  // Add the sidebar and toggle button to the page
  document.body.appendChild(sidebar);
  document.body.appendChild(toggleButton);
  
  sidebarInitialized = true;
  console.log("Sidebar elements created successfully");
}

// Function to toggle sidebar visibility
function toggleSidebar() {
  const sidebar = document.getElementById('chess-analysis-sidebar');
  if (!sidebar) return;
  
  sidebarVisible = !sidebarVisible;
  sidebar.style.right = sidebarVisible ? '0' : '-400px';
  console.log("Sidebar visibility toggled:", sidebarVisible);
}

// Function to capture the current chess position
function captureCurrentPosition() {
  console.log("Capturing current position for sidebar");
  const responseArea = document.getElementById('response-area');
  if (responseArea) {
    responseArea.textContent = 'Capturing chess position...';
  }
  
  try {
    // Send a message to the background script to handle the capture
    // The background script has access to the tabs API
    chrome.runtime.sendMessage({ 
      action: "captureBoardForSidebar"
    }, (response) => {
      console.log("Capture response:", response);
      
      if (chrome.runtime.lastError) {
        console.error("Runtime error:", chrome.runtime.lastError);
        if (responseArea) {
          responseArea.textContent = 'Error: ' + chrome.runtime.lastError.message;
        }
        return;
      }
      
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
    console.error("Error loading stored board:", error);
  }
}

// Function to ask a question about the position
async function askQuestion() {
  const questionInput = document.getElementById('question-input');
  const responseArea = document.getElementById('response-area');
  
  if (!questionInput || !responseArea) {
    console.error("Question input or response area not found");
    return;
  }
  
  const question = questionInput.value.trim();
  
  if (!question) {
    responseArea.textContent = "Please enter a question about the position.";
    return;
  }
  
  // Check if we have a captured board
  chrome.storage.local.get(['capturedBoard'], async (result) => {
    const capturedBoard = result.capturedBoard;
    
    if (!capturedBoard) {
      responseArea.textContent = "Please capture a chess position first.";
      return;
    }
    
    responseArea.textContent = "Analyzing position...";
    
    try {
      // Call the API with the question and board position
      const response = await callAnalysisAPI(question, capturedBoard);
      responseArea.textContent = response;
    } catch (error) {
      console.error("Error getting response:", error);
      responseArea.textContent = "Sorry, there was an error analyzing this position: " + error.message;
    }
  });
}

// Function to call the backend API
async function callAnalysisAPI(question, capturedBoard) {
  try {
    // Prepare chat history (this could be extended to maintain conversation)
    const chatHistory = [
      { text: question, sender: "user" }
    ];
    
    // Call our Python API
    const response = await fetch(`${API_URL}/analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: question,
        fen: capturedBoard.fen,
        pgn: capturedBoard.pgn,
        chat_history: chatHistory
      })
    });
    
    if (!response.ok) {
      throw new Error(`API response error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.response;
  } catch (error) {
    console.error("API call error:", error);
    throw error;
  }
}

// Listen for messages from the popup and background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Content script received message:", request);
  
  if (request.action === "showSidebar") {
    console.log("Showing sidebar");
    // Initialize if needed
    if (!sidebarInitialized) {
      initializeSidebar();
    }
    // Show the sidebar
    if (!sidebarVisible) {
      toggleSidebar();
    }
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === "updateSidebarImage") {
    console.log("Updating sidebar image");
    // Initialize if needed
    if (!sidebarInitialized) {
      initializeSidebar();
    }
    // Load the image
    loadStoredBoardData();
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === "captureBoard") {
    // This is handled by the background script using the injector
    console.log("captureBoard message received in content script - this is now handled by the background script");
    sendResponse({ success: true });
    return true;
  }
});

// Initialize everything when the page is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM loaded, deferring sidebar initialization until needed");
  // We'll initialize the sidebar only when it's requested
});

// When the script loads outside DOMContentLoaded, log it
console.log("Chess analyzer content script ready and waiting for commands");