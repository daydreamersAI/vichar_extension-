document.addEventListener('DOMContentLoaded', async function() {
  const capturedBoardImg = document.getElementById('capturedBoard');
  const questionInput = document.getElementById('questionInput');
  const askButton = document.getElementById('askButton');
  const chatMessagesContainer = document.getElementById('chatMessages'); // Changed ID reference
  const gameInfo = document.getElementById('gameInfo');
  const fenDisplay = document.getElementById('fenDisplay');
  const pgnContainer = document.getElementById('pgnContainer');
  const pgnDisplay = document.getElementById('pgnDisplay');

  // API configuration
  const API_URL = "https://api.beekayprecision.com";

  let capturedBoard = null;
  let chatHistory = []; // Session chat history
  let isLoading = false; // Flag to prevent multiple submissions

  // --- Function to Render Chat History ---
  function renderChatHistory() {
    if (!chatMessagesContainer) return;

    chatMessagesContainer.innerHTML = ''; // Clear previous messages

    if (chatHistory.length === 0) {
        chatMessagesContainer.innerHTML = `<p style="text-align: center; color: #666; margin-top: 20px;">Ask a question below to start the analysis.</p>`;
        return;
    }


    chatHistory.forEach(message => {
      const messageDiv = document.createElement('div');
      messageDiv.classList.add('chat-message');

      if (message.sender === 'user') {
        messageDiv.classList.add('user-message');
        // Use textContent for user messages to prevent XSS if needed, though formatting is unlikely here
        messageDiv.textContent = message.text;
      } else { // assistant
        messageDiv.classList.add('assistant-message');
        // Format assistant messages using the existing function
        messageDiv.innerHTML = formatAPIResponse(message.text);
      }
      chatMessagesContainer.appendChild(messageDiv);
    });

    // Scroll to the bottom
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }

  // --- Function to show/hide loading indicator ---
  function showLoading(show) {
      let loadingIndicator = document.getElementById('loadingIndicator');
      if (show) {
          if (!loadingIndicator) {
              loadingIndicator = document.createElement('div');
              loadingIndicator.id = 'loadingIndicator';
              loadingIndicator.classList.add('loading-indicator');
              loadingIndicator.textContent = 'Analyzing...';
              chatMessagesContainer.appendChild(loadingIndicator);
              chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight; // Scroll down to show loader
          }
          isLoading = true;
          askButton.disabled = true; // Disable button while loading
      } else {
          if (loadingIndicator) {
              loadingIndicator.remove();
          }
          isLoading = false;
          askButton.disabled = false; // Re-enable button
      }
  }

  // --- Function to display errors within the chat area ---
  function displayError(errorMessage) {
     if (!chatMessagesContainer) return;
     const errorDiv = document.createElement('div');
     errorDiv.classList.add('error-message');
     errorDiv.innerHTML = `<strong>Error:</strong> ${errorMessage}`;
     chatMessagesContainer.appendChild(errorDiv);
     chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }


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
      // Clear chat history when a new board is loaded
      chatHistory = [];
      console.log("New board loaded, chat history cleared.");
      renderChatHistory(); // Initial render (will show 'Ask a question...')

    } else {
        // If no board, clear history and show message
        chatHistory = [];
        if (chatMessagesContainer) {
            chatMessagesContainer.innerHTML = `
                <div style="text-align: center; padding: 15px; color: #000; align-self: center; margin-top: 20px;">
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
        // Hide board/info sections if no board
        const boardContainer = document.querySelector('.board-container');
        if(boardContainer) boardContainer.style.display = 'none';
        if(gameInfo) gameInfo.style.display = 'none';

    }
  } catch (error) {
    console.error("Error loading captured board:", error);
    displayError(`Error loading the captured chess position: ${error.message}`);
  }

  // Format API responses (keep this function as is)
  function formatAPIResponse(response) {
    let formatted = response.replace(/\n/g, '<br>');
    formatted = formatted.replace(/(best move|advantage|winning|check|mate|fork|pin|skewer|discovered attack|zwischenzug|tempo|initiative|development|center control|king safety|pawn structure)/gi,'<span class="highlight">$1</span>');
    formatted = formatted.replace(/\b([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[\+#]?|O-O(?:-O)?)\b/g,'<span class="chess-notation">$1</span>');
    formatted = formatted.replace(/([+-])\d+\.?\d*/g,'<span class="evaluation">$&</span>');
    return formatted;
  }

  // Get base64 from image source (keep this function as is)
  function getBase64FromImageSrc(src) {
    if (src && src.startsWith('data:image/')) {
      return src.split(',')[1];
    }
    return null;
  }

  // --- Send Message Function ---
  async function sendMessage() {
    if (isLoading) return; // Prevent sending while loading

    const question = questionInput.value.trim();

    if (!question) {
      alert("Please enter a question."); // Simple alert for empty input
      return;
    }

    if (!capturedBoard) {
      alert("No chess position available to analyze.");
      return;
    }

    // Add user message to history and render immediately
    chatHistory.push({ text: question, sender: "user" });
    renderChatHistory();
    questionInput.value = ''; // Clear input

    showLoading(true); // Show loading indicator

    try {
      const imageData = getBase64FromImageSrc(capturedBoard.imageData);
      const responseText = await callAnalysisAPI(question, capturedBoard, imageData, chatHistory); // Pass history

      // Add assistant response to history
      chatHistory.push({ text: responseText, sender: "assistant" });

    } catch (error) {
      console.error("Error getting response:", error);
      // Add an error message to the chat instead of replacing everything
      displayError(`Failed to get analysis: ${error.message}`);
      // Optionally remove the user's last message if API failed
      // chatHistory.pop();

    } finally {
       showLoading(false); // Hide loading indicator
       renderChatHistory(); // Re-render chat including the new response or error
    }
  }


  // Handle clicking the send button
  askButton.addEventListener('click', sendMessage);

  // Handle pressing Enter in the textarea
  questionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Prevent newline
      sendMessage(); // Call the send function
    }
    // Auto-resize textarea (optional)
    // setTimeout(() => {
    //   questionInput.style.height = 'auto';
    //   questionInput.style.height = (questionInput.scrollHeight) + 'px';
    // }, 0);
  });

  // Initial render call after loading
   renderChatHistory();

}); // End DOMContentLoaded


// --- API Calling Functions (Keep as previously updated, accepting chatHistory) ---

async function callAnalysisAPI(question, capturedBoard, imageData = null, currentChatHistory = []) {
   // ... (keep the implementation from the previous step)
  try {
    console.log("Calling analysis API with history length:", currentChatHistory.length);
    const requestData = {
      message: question,
      fen: capturedBoard.fen,
      pgn: capturedBoard.pgn,
      image_data: imageData,
      chat_history: currentChatHistory
    };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`${API_URL}/analysis`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Accept': 'application/json'},
        body: JSON.stringify(requestData),
        signal: controller.signal,
        mode: 'cors'
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API response error: ${response.status} ${response.statusText} - ${errorText}`);
      }
      const data = await response.json();
      if (!data.response) { throw new Error("Invalid API response format - missing 'response' field"); }
      return data.response;
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') { throw new Error("Request timed out."); }
      if (fetchError.message.includes('NetworkError') || fetchError.message.includes('Failed to fetch')) {
        console.log("Fetch failed, falling back to XHR...");
        return await callAnalysisAPIWithXHR(question, capturedBoard, imageData, currentChatHistory);
      }
      throw fetchError;
    }
  } catch (error) {
    console.error("Error calling API:", error);
    throw error;
  }
}

function callAnalysisAPIWithXHR(question, capturedBoard, imageData = null, currentChatHistory = []) {
  // ... (keep the implementation from the previous step)
   return new Promise((resolve, reject) => {
    try {
      console.log("Calling API with XHR, history length:", currentChatHistory.length);
      const requestData = {
        message: question, fen: capturedBoard.fen, pgn: capturedBoard.pgn,
        image_data: imageData, chat_history: currentChatHistory
      };
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/analysis`, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.withCredentials = false;
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              if (data && data.response) { resolve(data.response); }
              else { reject(new Error("Invalid API response format")); }
            } catch (e) { reject(new Error(`Failed to parse response: ${e.message}`)); }
          } else if (xhr.status === 0) { reject(new Error("Network error (CORS or server down?)")); }
          else { reject(new Error(`API error: ${xhr.status} ${xhr.statusText}`)); }
        }
      };
      xhr.onerror = () => reject(new Error("Network error occurred."));
      xhr.timeout = 60000;
      xhr.ontimeout = () => reject(new Error("Request timed out."));
      xhr.send(JSON.stringify(requestData));
    } catch (error) { reject(error); }
  });
}