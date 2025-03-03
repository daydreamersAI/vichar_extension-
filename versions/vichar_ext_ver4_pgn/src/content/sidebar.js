// Standalone sidebar module for chess position analysis
console.log("Chess Analysis Sidebar module loaded");

// Class to handle the sidebar functionality
class ChessAnalysisSidebar {
  constructor() {
    this.sidebarVisible = false;
    this.sidebarElement = null;
    this.capturedImageElement = null;
    this.questionInput = null;
    this.responseArea = null;
    this.capturedBoard = null;
    
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
      // We use the messaging API which works with both extension contexts
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
          this.responseArea.textContent = 'Position captured! Ask a question about this position.';
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
          this.capturedImageElement.src = this.capturedBoard.imageData;
          this.capturedImageElement.style.display = 'block';
        } else {
          console.log("No stored board data found");
          this.capturedImageElement.style.display = 'none';
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
      // In a real implementation, this would call an API
      const response = await this.getAIResponse(question, this.capturedBoard);
      this.responseArea.textContent = response;
    } catch (error) {
      console.error("Error getting response:", error);
      this.responseArea.textContent = "Sorry, there was an error analyzing this position.";
    }
  }
  
  // Get AI response (simulated for now)
  async getAIResponse(question, capturedBoard) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simple keyword matching to generate responses
    const questionLower = question.toLowerCase();
    
    // For the starting position
    if (capturedBoard.fen.includes("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR")) {
      if (questionLower.includes("best move") || questionLower.includes("good move")) {
        return "In the starting position, common strong opening moves include 1.e4, 1.d4, 1.c4, or 1.Nf3. These moves fight for central control and develop pieces.";
      } 
      else if (questionLower.includes("strategy") || questionLower.includes("plan")) {
        return "The main strategic goals in the opening are: 1) Control the center with pawns or pieces, 2) Develop your pieces quickly, 3) Castle early to protect your king, and 4) Connect your rooks.";
      }
    }
    
    // Generic responses for any position
    if (questionLower.includes("best move") || questionLower.includes("good move")) {
      return "To identify the best move, I would consider: 1) Piece activity and development, 2) Center control, 3) King safety, 4) Material balance, and 5) Tactical opportunities. Without a full analysis, I'd need to evaluate the specific position in more detail.";
    }
    else if (questionLower.includes("winning") || questionLower.includes("advantage")) {
      return "To determine who's winning, I'd evaluate: material balance, piece activity, king safety, pawn structure, and control of key squares. A thorough analysis would require deeper calculation of specific variations.";
    }
    else if (questionLower.includes("tactic") || questionLower.includes("combination")) {
      return "Look for tactical opportunities like forks, pins, skewers, discovered attacks, or potential sacrifices. Check if any pieces are undefended or if there are weaknesses around either king.";
    }
    
    // Default response
    return "To provide a detailed answer about this chess position, I'd need to analyze the specific arrangement of pieces, control of key squares, material balance, and potential threats. Consider factors like piece development, king safety, and pawn structure when evaluating chess positions.";
  }
}

// Initialize the sidebar
const sidebarInstance = new ChessAnalysisSidebar();

// Make it available globally for debugging
window.chessAnalysisSidebar = sidebarInstance;