document.addEventListener('DOMContentLoaded', async function() {
  const capturedBoardImg = document.getElementById('capturedBoard');
  const questionInput = document.getElementById('questionInput');
  const askButton = document.getElementById('askButton');
  const responseArea = document.getElementById('responseArea');
  const gameInfo = document.getElementById('gameInfo');
  const fenDisplay = document.getElementById('fenDisplay');
  const pgnContainer = document.getElementById('pgnContainer');
  const pgnDisplay = document.getElementById('pgnDisplay');
  
  // API configuration - change this to match your deployment
  const API_URL = "http://localhost:8000"; // Update this to your FastAPI server address
  
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
      '<span class="evaluation">$&</span>');
    
    return formatted;
  }
  
  // Handle asking a question
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
      
      // Call the API with the question and board position
      const response = await callAnalysisAPI(question, capturedBoard);
      
      // Add the assistant's response to chat history
      chatHistory.push({
        text: response,
        sender: "assistant"
      });
      
      // Format the response with improved styling
      responseArea.innerHTML = formatAPIResponse(response);
    } catch (error) {
      console.error("Error getting response:", error);
      responseArea.innerHTML = `
        <div style="color: #d32f2f; padding: 10px; background-color: #ffebee; border-radius: 4px; margin-bottom: 10px;">
          <strong>Error analyzing position:</strong>
        </div>
        <div>${error.message}</div>
      `;
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

// Function to call the backend API
async function callAnalysisAPI(question, capturedBoard) {
  try {
    const API_URL = "http://localhost:8000"; // Update this to match your FastAPI server address
    
    // Prepare the request payload
    const requestData = {
      message: question,
      fen: capturedBoard.fen,
      pgn: capturedBoard.pgn || null,
      chat_history: [] // You could pass the chat history here if needed
    };
    
    console.log("Sending API request:", requestData);
    
    // Call our Python API
    const response = await fetch(`${API_URL}/analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API response error: ${response.status} ${response.statusText}${errorText ? ' - ' + errorText : ''}`);
    }
    
    const data = await response.json();
    console.log("API response:", data);
    
    return data.response;
  } catch (error) {
    console.error("API call error:", error);
    throw error;
  }
}