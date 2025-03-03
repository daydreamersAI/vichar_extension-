document.addEventListener('DOMContentLoaded', async function() {
  const capturedBoardImg = document.getElementById('capturedBoard');
  const questionInput = document.getElementById('questionInput');
  const askButton = document.getElementById('askButton');
  const responseArea = document.getElementById('responseArea');
  
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
    } else {
      responseArea.textContent = "No chess position has been captured yet.";
    }
  } catch (error) {
    console.error("Error loading captured board:", error);
    responseArea.textContent = "Error loading the captured chess position.";
  }
  
  // Handle asking a question
  askButton.addEventListener('click', async () => {
    const question = questionInput.value.trim();
    
    if (!question) {
      responseArea.textContent = "Please enter a question about the position.";
      return;
    }
    
    if (!capturedBoard) {
      responseArea.textContent = "No chess position available to analyze.";
      return;
    }
    
    responseArea.innerHTML = '<p class="loading">Analyzing position and generating response...</p>';
    
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
      
      responseArea.textContent = response;
    } catch (error) {
      console.error("Error getting response:", error);
      responseArea.textContent = "Sorry, there was an error analyzing this position: " + error.message;
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
      throw new Error(`API response error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log("API response:", data);
    
    return data.response;
  } catch (error) {
    console.error("API call error:", error);
    throw error;
  }
}