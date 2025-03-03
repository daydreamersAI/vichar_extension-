// Standalone sidebar module for chess position analysis
console.log("Chess Analysis Sidebar module loaded");

// API configuration - change this to match your deployment
const API_URL = "http://localhost:8000"; // Update this to your FastAPI server address

// Export the sidebar instance for use in the content script
let sidebarInstance;

// Class to handle the sidebar functionality
class ChessAnalysisSidebar {
  constructor() {
    this.sidebarVisible = false;
    this.sidebarElement = null;
    this.capturedImageElement = null;
    this.questionInput = null;
    this.responseArea = null;
    this.capturedBoard = null;
    this.chatHistory = []; // Store chat history for context
    
    // Initialize immediately
    this.initialize();
    
    // Listen for toggle events from the content script
    document.addEventListener('chess-extension-toggle-sidebar', () => {
      console.log("Received toggle sidebar event");
      this.toggleSidebar();
    });
    
    // Listen for update image events
    document.addEventListener('chess-extension-update-image', () => {
      console.log("Received update image event");
      this.loadStoredBoardData();
    });
  }
  
  // Initialize the sidebar (create DOM elements)
  initialize() {
    console.log("Initializing sidebar");
    
    // Create the sidebar element if it doesn't exist
    if (!this.sidebarElement) {
      this.createSidebarElement();
    }
}

// Initialize the sidebar
sidebarInstance = new ChessAnalysisSidebar();

// Export the sidebar instance
export { sidebarInstance };

// Make it available globally for debugging
window.chessAnalysisSidebar = sidebarInstance;

    // Load any stored board data
    this.loadStoredBoardData();
  }
  
  // Create the sidebar DOM elements
  createSidebarElement() {
    // Create the main sidebar container
    this.sidebarElement = document.createElement('div');
    this.sidebarElement.id = 'chess-analysis-sidebar';
    this.sidebarElement.style.cssText = `
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
    toggleButton.addEventListener('click', () => this.toggleSidebar());
    
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
    closeButton.addEventListener('click', () => this.toggleSidebar());
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
    captureButton.addEventListener('click', () => this.captureCurrentPosition());
    
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
    this.capturedImageElement = document.createElement('img');
    this.capturedImageElement.style.cssText = `
      max-width: 100%;
      max-height: 360px;
      display: none;
    `;
    imageContainer.appendChild(this.capturedImageElement);
    
    // Game info container (for FEN and PGN)
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
    
    // Add components to the game info container
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
    
    this.questionInput = document.createElement('textarea');
    this.questionInput.placeholder = 'Example: What is the best move for white?';
    this.questionInput.style.cssText = `
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
    askButton.addEventListener('click', () => this.askQuestion());
    
    questionContainer.appendChild(questionLabel);
    questionContainer.appendChild(this.questionInput);
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
    
    this.responseArea = document.createElement('div');
    this.responseArea.style.cssText = `
      flex: 1;
      padding: 15px;
      border: 1px solid #ddd;
      border-radius: 4px;
      background-color: #f9f9f9;
      min-height: 150px;
      overflow-y: auto;
    `;
    this.responseArea.textContent = 'Capture a position to begin analysis.';
    
    responseContainer.appendChild(responseLabel);
    responseContainer.appendChild(this.responseArea);
    
    // Assemble the content
    content.appendChild(header);
    content.appendChild(captureButton);
    content.appendChild(imageContainer);
    content.appendChild(gameInfoContainer);
    content.appendChild(questionContainer);
    content.appendChild(responseContainer);
    
    // Add content to sidebar
    this.sidebarElement.appendChild(content);
    
    // Add the sidebar and toggle button to the page
    document.body.appendChild(this.sidebarElement);
    document.body.appendChild(toggleButton);
    
    console.log("Sidebar elements created");
  }
  
  // Toggle the sidebar visibility
  toggleSidebar() {
    this.sidebarVisible = !this.sidebarVisible;
    
    if (this.sidebarVisible) {
      this.sidebarElement.style.right = '0';
    } else {
      this.sidebarElement.style.right = '-400px';
    }
    
    console.log("Sidebar visibility:", this.sidebarVisible);
  }
  
  // Capture the current chess position
  async captureCurrentPosition() {
    console.log("Capturing current position for sidebar");
    this.responseArea.textContent = 'Capturing chess position...';
    
    try {
      // Send a message to the background script to capture the board
      chrome.runtime.sendMessage({ 
        action: "captureBoardForSidebar"
      }, (response) => {
        console.log("Capture response:", response);
        
        if (chrome.runtime.lastError) {
          console.error("Runtime error:", chrome.runtime.lastError);
          this.responseArea.textContent = 'Error: ' + chrome.runtime.lastError.message;
          return;
        }
        
        if (response && response.success) {
          // The background script will tell the content script to update the image
          this.loadStoredBoardData();
          this.responseArea.textContent = 'Position captured! Ask a question about this position.';
          // Reset chat history when capturing a new position
          this.chatHistory = [];
        } else {
          const errorMsg = response && response.error ? response.error : 'Unknown error';
          this.responseArea.textContent = 'Error capturing position: ' + errorMsg;
        }
      });
    } catch (error) {
      console.error("Error capturing position:", error);
      this.responseArea.textContent = 'Error: ' + error.message;
    }
  }
  
  // Load stored board data from extension storage
  async loadStoredBoardData() {
    try {
      // The storage API works in both contexts
      chrome.storage.local.get(['capturedBoard'], (result) => {
        this.capturedBoard = result.capturedBoard;
        
        if (this.capturedBoard && this.capturedBoard.imageData) {
          console.log("Loaded stored board data");
          console.log("FEN data:", this.capturedBoard.fen);
          console.log("PGN data:", this.capturedBoard.pgn ? "Available" : "Not available");
          
          // Update the image
          this.capturedImageElement.src = this.capturedBoard.imageData;
          this.capturedImageElement.style.display = 'block';
          
          // Update game info if available
          const gameInfoContainer = document.getElementById('game-info-container');
          const fenValue = document.getElementById('fen-value');
          const pgnValue = document.getElementById('pgn-value');
          
          if (gameInfoContainer) {
            gameInfoContainer.style.display = 'flex';
            
            // Update FEN
            if (fenValue && this.capturedBoard.fen) {
              fenValue.textContent = this.capturedBoard.fen;
            }
            
            // Update PGN
            if (pgnValue) {
              if (this.capturedBoard.pgn && this.capturedBoard.pgn.trim().length > 0) {
                pgnValue.textContent = this.capturedBoard.pgn;
                pgnValue.style.display = 'block';
              } else {
                pgnValue.textContent = "No move history available";
                pgnValue.style.display = 'block';
              }
            }
          }
        } else {
          console.log("No stored board data found");
          this.capturedImageElement.style.display = 'none';
          
          const gameInfoContainer = document.getElementById('game-info-container');
          if (gameInfoContainer) {
            gameInfoContainer.style.display = 'none';
          }
          
          this.responseArea.textContent = 'Capture a position to begin analysis.';
        }
      });
    } catch (error) {
      console.error("Error loading stored board:", error);
    }
  }
  
  // Ask a question about the captured position
  async askQuestion() {
    const question = this.questionInput.value.trim();
    
    if (!question) {
      this.responseArea.textContent = "Please enter a question about the position.";
      return;
    }
    
    if (!this.capturedBoard) {
      this.responseArea.textContent = "Please capture a chess position first.";
      return;
    }
    
    this.responseArea.textContent = "Analyzing position...";
    
    try {
      // Add the user's question to chat history
      this.chatHistory.push({
        text: question,
        sender: "user"
      });
      
      // Call the API
      const response = await this.callAnalysisAPI(question, this.capturedBoard);
      
      // Add the assistant's response to chat history
      this.chatHistory.push({
        text: response,
        sender: "assistant"
      });
      
      this.responseArea.textContent = response;
    } catch (error) {
      console.error("Error getting response:", error);
      this.responseArea.textContent = "Sorry, there was an error analyzing this position: " + error.message;
    }
  }
  
  // Call the analysis API
  async callAnalysisAPI(question, capturedBoard) {
    try {
      console.log("Calling analysis API with FEN:", capturedBoard.fen);
      
      // Format request data
      const requestData = {
        message: question,
        fen: capturedBoard.fen,
        pgn: capturedBoard.pgn || null,
        chat_history: this.chatHistory
      };
      
      console.log("Sending API request:", requestData);
      
      // Call the API endpoint
      const response = await fetch(`${API_URL}/analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API response error: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log("API response:", data);
      
      return data.response;
    } catch (error) {
      console.error("API call error:", error);
      throw error;
    }
  }