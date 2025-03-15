document.addEventListener('DOMContentLoaded', async function() {
  const capturedBoardImg = document.getElementById('capturedBoard');
  const questionInput = document.getElementById('questionInput');
  const askButton = document.getElementById('askButton');
  const responseArea = document.getElementById('responseArea');
  const gameInfo = document.getElementById('gameInfo');
  const fenDisplay = document.getElementById('fenDisplay');
  const pgnContainer = document.getElementById('pgnContainer');
  const pgnDisplay = document.getElementById('pgnDisplay');
  
  // API configuration - updated to your deployed API
  const API_URL = "https://api.beekayprecision.com"; // Updated to use HTTPS
  
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
        <div style="text-align: center; padding: 15px; color: #000;">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f44336" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <p style="margin-top: 10px; font-size: 16px;">No chess position has been captured yet.</p>
          <p style="color: #333;">Use the extension popup to capture a position first.</p>
        </div>
      `;
    }
  } catch (error) {
    console.error("Error loading captured board:", error);
    responseArea.innerHTML = `
      <div style="color: #d32f2f; padding: 15px; background-color: #fff; border-radius: 4px; border: 1px solid #ffcdd2;">
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
  
  // Extract base64 image data from the image source
  function getBase64FromImageSrc(src) {
    // Check if the src is already base64
    if (src.startsWith('data:image/')) {
      // Extract just the base64 part without the data URI prefix
      return src.split(',')[1];
    }
    return null;
  }
  
  // Handle asking a question
  askButton.addEventListener('click', async () => {
    const question = questionInput.value.trim();
    
    if (!question) {
      responseArea.innerHTML = `
        <div style="color: #d32f2f; padding: 15px; background-color: #fff; border-radius: 4px; border: 1px solid #ffcdd2;">
          Please enter a question about the position.
        </div>
      `;
      return;
    }
    
    if (!capturedBoard) {
      responseArea.innerHTML = `
        <div style="color: #d32f2f; padding: 15px; background-color: #fff; border-radius: 4px; border: 1px solid #ffcdd2;">
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
      
      // Extract base64 image data for vision model
      const imageData = getBase64FromImageSrc(capturedBoard.imageData);
      
      // Call the API with the question, board position, and image data
      const response = await callAnalysisAPI(question, capturedBoard, imageData);
      
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
        <div style="color: #d32f2f; padding: 15px; background-color: #fff; border-radius: 4px; border: 1px solid #ffcdd2; margin-bottom: 10px;">
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

// Function to call the API with the question and board data
async function callAnalysisAPI(question, capturedBoard, imageData = null) {
  try {
    console.log("Calling analysis API...");
    
    // Prepare the request payload with image data for vision model
    const requestData = {
      message: question,
      fen: capturedBoard.fen,
      pgn: capturedBoard.pgn,
      image_data: imageData,
      chat_history: chatHistory
    };
    
    console.log("Request data:", {
      message: question,
      fen: capturedBoard.fen,
      pgn: capturedBoard.pgn ? "Present" : "Not included",
      image_data: imageData ? "Present" : "Not included",
      chat_history: chatHistory
    });
    
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
      console.log("API response:", data);
      
      if (!data.response) {
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
    console.error("Error calling API:", error);
    throw error;
  }
}

// Alternative implementation using XMLHttpRequest
function callAnalysisAPIWithXHR(question, capturedBoard, imageData = null) {
  return new Promise((resolve, reject) => {
    try {
      console.log("Calling API with XMLHttpRequest");
      
      // Prepare the request payload
      const requestData = {
        message: question,
        fen: capturedBoard.fen,
        pgn: capturedBoard.pgn,
        image_data: imageData,
        chat_history: chatHistory
      };
      
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/analysis`, true);
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