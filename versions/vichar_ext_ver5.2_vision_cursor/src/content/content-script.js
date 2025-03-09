const CACHE_BUST = new Date().getTime();
console.log("Cache bust ID:", CACHE_BUST);

// This is the main content script that gets injected by Chrome
console.log("Chess analyzer content script loader initialized");

// Create a global variable to keep track of the sidebar state
let sidebarInitialized = false;
let sidebarVisible = false;

// API configuration - updated to match your deployment
const API_URL = "https://api.beekayprecision.com"; // Updated to use HTTPS

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
  
  // Question input - MOVED TO TOP
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
}

// Function to toggle sidebar visibility
function toggleSidebar() {
  const sidebar = document.getElementById('chess-analysis-sidebar');
  if (!sidebar) return;
  
  sidebarVisible = !sidebarVisible;
  sidebar.style.right = sidebarVisible ? '0' : '-400px';
  console.log("Sidebar visibility toggled:", sidebarVisible);
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
          // Format the response with better styling
          const formattedResponse = formatAPIResponse(response.data);
          responseArea.innerHTML = formattedResponse;
        } else {
          responseArea.innerHTML = `
            <div style="color: #d32f2f; padding: 10px; background-color: #ffebee; border-radius: 4px;">
              <strong>Error:</strong> ${response?.error || "Failed to analyze position"}
            </div>
          `;
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
      
      xhr.timeout = 60000; // 60 seconds timeout
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
          console.error("XHR test - Failed:", xhr.status, xhr.statusText, xhr.responseText);
          console.log("%c❌ XHR TEST FAILED", "color: red; font-weight: bold;");
        }
      }
    };
    
    xhr.onerror = function() {
      console.error("XHR test - Network error");
      console.log("%c❌ XHR TEST FAILED (Network error)", "color: red; font-weight: bold;");
      
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