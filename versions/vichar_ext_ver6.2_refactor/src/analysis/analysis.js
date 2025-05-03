// analysis.js - Script for the standalone analysis page (analysis.html)

document.addEventListener('DOMContentLoaded', async function() {
  // --- Get DOM Elements ---
  const capturedBoardImg = document.getElementById('capturedBoard');
  const boardContainer = document.querySelector('.board-container'); // Container for the image
  const gameInfoDiv = document.getElementById('gameInfo'); // Info container (FEN/PGN)
  const fenDisplay = document.getElementById('fenDisplay');
  const pgnContainer = document.getElementById('pgnContainer');
  const pgnDisplay = document.getElementById('pgnDisplay');
  const chatMessagesContainer = document.getElementById('chatMessages'); // Message display area
  const questionInput = document.getElementById('questionInput'); // Text input
  const askButton = document.getElementById('askButton'); // Send button
  const pageTitle = document.querySelector('h1'); // Page title element

  // API configuration
  const API_URL = "https://api.beekayprecision.com"; // Use HTTPS

  // --- State Variables ---
  let capturedBoardData = null; // Holds data loaded from storage {imageData, fen, pgn, ...}
  let chatHistory = []; // Stores the conversation {text, sender} for this session
  let isLoading = false; // Prevent multiple API calls simultaneously

  // --- Initial Load ---
  await loadAndDisplayBoardData();
  renderChatHistory(); // Render initial state (prompt or messages)


  // --- Core Functions ---

  /**
   * Loads captured board data from chrome.storage.local and updates the UI.
   */
  async function loadAndDisplayBoardData() {
      console.log("Analysis Page: Loading captured board data...");
      try {
          // Use 'capturedBoard' key consistent with scriptInjector.js
          const result = await chrome.storage.local.get(['capturedBoard']);
          capturedBoardData = result.capturedBoard;

          if (capturedBoardData && (capturedBoardData.imageData || capturedBoardData.fen)) {
              console.log("Analysis Page: Board data found.", capturedBoardData);

              // Display Image (if available)
              if (capturedBoardData.imageData && capturedBoardImg && boardContainer) {
                  capturedBoardImg.src = capturedBoardData.imageData;
                  capturedBoardImg.style.display = 'block';
                  boardContainer.style.display = 'block'; // Show image container
              } else if (boardContainer) {
                  boardContainer.style.display = 'none'; // Hide image container if no image
                  console.log("Analysis Page: No image data found.");
              }

              // Display FEN/PGN Info
              if (gameInfoDiv) gameInfoDiv.style.display = "block"; // Show info container
              if (fenDisplay && capturedBoardData.fen) {
                  fenDisplay.textContent = capturedBoardData.fen;
              } else if (fenDisplay) {
                  fenDisplay.textContent = "N/A"; // Indicate if FEN is missing
              }

              if (pgnContainer && pgnDisplay && capturedBoardData.pgn && capturedBoardData.pgn.trim()) {
                  pgnContainer.style.display = "block"; // Show PGN section only if PGN exists
                  pgnDisplay.textContent = capturedBoardData.pgn;
              } else if (pgnContainer) {
                  pgnContainer.style.display = "none"; // Hide PGN section if no PGN
              }

              // Enable input/button now that data is loaded
              if (questionInput) questionInput.disabled = false;
              if (askButton) askButton.disabled = false;

          } else {
              console.log("Analysis Page: No valid captured board data found in storage.");
              handleNoBoardData(); // Display message indicating no data
          }
      } catch (error) {
          console.error("Analysis Page: Error loading captured board:", error);
          handleNoBoardData(`Error loading captured position: ${error.message}`);
      }
  }

  /**
   * Updates the UI to show that no board data is available.
   * @param {string} [errorMessage] - Optional error message to display.
   */
  function handleNoBoardData(errorMessage = "") {
      if (pageTitle) pageTitle.textContent = "No Chess Position Loaded"; // Update title
      if (chatMessagesContainer) {
          chatMessagesContainer.innerHTML = `
              <div class="no-board-message">
                   ${errorMessage ? `<p class="error-text">${errorMessage}</p>` : ''}
                  <p>Please use the extension popup on a chess website (like Lichess.org or Chess.com) and click "Capture & Open in New Tab" first.</p>
              </div>
          `;
          // Add some basic styling for the error message
           const style = document.createElement('style');
           style.textContent = `
              .no-board-message { text-align: center; padding: 30px; color: #555; margin-top: 20px; border: 1px dashed #ccc; border-radius: 8px; background-color: #fafafa; }
              .no-board-message .error-text { color: #c62828; font-weight: bold; margin-bottom: 10px; }
           `;
           document.head.appendChild(style);
      }
      // Hide board/info/input elements
      if (boardContainer) boardContainer.style.display = 'none';
      if (gameInfoDiv) gameInfoDiv.style.display = 'none';
      if (questionInput) questionInput.disabled = true;
      if (askButton) askButton.disabled = true;
  }

  /**
   * Renders the current chatHistory array into the chat messages container.
   */
  function renderChatHistory() {
      if (!chatMessagesContainer) return;
      chatMessagesContainer.innerHTML = ''; // Clear previous messages

      if (chatHistory.length === 0 && capturedBoardData) {
          // Show initial prompt only if board data *is* loaded
          chatMessagesContainer.innerHTML = `<p class="chat-placeholder">Ask a question below to start the analysis.</p>`;
      } else if (!capturedBoardData) {
          // handleNoBoardData already shows a message if no board data
          return;
      } else {
          // Render actual messages
          chatHistory.forEach(message => {
              const messageDiv = document.createElement('div');
              messageDiv.classList.add('chat-message'); // Base class

              if (message.sender === 'user') {
                  messageDiv.classList.add('user-message');
                  messageDiv.textContent = message.text; // Use textContent for user input safety
              } else if (message.sender === 'assistant') {
                  messageDiv.classList.add('assistant-message');
                  messageDiv.innerHTML = formatAPIResponse(message.text); // Format trusted API response
              } else if (message.sender === 'error') {
                  messageDiv.classList.add('error-message'); // Special class for errors
                  // Display error message (already formatted potentially)
                  messageDiv.innerHTML = `<strong>Error:</strong> ${formatAPIResponse(message.text)}`;
              }
              chatMessagesContainer.appendChild(messageDiv);
          });
      }

      // Scroll to the bottom after rendering
      chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }

  /**
   * Shows or hides a loading indicator in the chat area.
   * @param {boolean} show - True to show, false to hide.
   */
  function showLoading(show) {
      let loadingIndicator = document.getElementById('loadingIndicator');
      if (show) {
          if (!loadingIndicator) { // Create if it doesn't exist
              loadingIndicator = document.createElement('div');
              loadingIndicator.id = 'loadingIndicator';
              loadingIndicator.classList.add('loading-indicator'); // Use class from analysis.css
              loadingIndicator.innerHTML = '<span>Analyzing...</span>'; // CSS handles spinner
              if (chatMessagesContainer) chatMessagesContainer.appendChild(loadingIndicator);
          }
           if(loadingIndicator) loadingIndicator.style.display = 'flex'; // Make sure it's visible
           if(chatMessagesContainer) chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight; // Scroll to show
          isLoading = true;
          if (askButton) askButton.disabled = true;
          if (questionInput) questionInput.disabled = true;
      } else {
          if (loadingIndicator) loadingIndicator.style.display = 'none'; // Hide it
          isLoading = false;
          // Re-enable only if board data is valid
          if (capturedBoardData) {
               if (askButton) askButton.disabled = false;
               if (questionInput) questionInput.disabled = false;
          }
      }
  }

  /**
   * Adds an error message to the chat history and renders it.
   * @param {string} errorMessage - The error message text.
   */
  function displayErrorInChat(errorMessage) {
       // Add error to chat history for display
       chatHistory.push({ text: errorMessage, sender: 'error' });
       renderChatHistory(); // Re-render to show the error message
  }

  /**
   * Sends the user's question to the backend API for analysis.
   */
  async function sendMessage() {
      if (isLoading || !askButton || askButton.disabled) return; // Prevent sending if loading or disabled

      const question = questionInput.value.trim();
      if (!question) { displayErrorInChat("Please enter a question."); return; }
      if (!capturedBoardData) { displayErrorInChat("Cannot analyze: No chess position is loaded."); return; }

      // Add user message to history and render immediately
      chatHistory.push({ text: question, sender: "user" });
      renderChatHistory();
      if (questionInput) questionInput.value = ''; // Clear input field

      showLoading(true); // Show loading, disable input

      try {
          // Determine vision use and model for this non-credit endpoint
          // For simplicity on this page, let's use vision if available and default models
          const useVision = !!capturedBoardData.imageData;
          const modelToUse = useVision ? 'gpt-4o' : 'gpt-4o-mini'; // Default model based on vision need
          const imageDataBase64 = useVision ? getBase64FromImageSrc(capturedBoardData.imageData) : null;

          // Call the simple /analysis endpoint (no credits, no login check here)
          const responseText = await callAnalysisAPI(
              question,
              capturedBoardData,
              imageDataBase64,
              chatHistory, // Send history including user's message
              modelToUse // Specify model
          );

          // Add assistant response to history
          chatHistory.push({ text: responseText, sender: "assistant" });

      } catch (error) {
          console.error("Error getting analysis:", error);
          // Display error message within the chat interface
          displayErrorInChat(`Failed to get analysis: ${error.message}`);
          // Optional: Remove the user's last message from history on failure?
          // chatHistory.pop();
      } finally {
          showLoading(false); // Hide loading, re-enable input
          renderChatHistory(); // Re-render chat with the new response or error
      }
  }

  // --- Event Listeners ---
  if (askButton) {
      askButton.addEventListener('click', sendMessage);
  }
  if (questionInput) {
      questionInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) { // Send on Enter (but not Shift+Enter)
              e.preventDefault(); // Prevent newline
              sendMessage();
          }
      });
  }

}); // End DOMContentLoaded


// --- Utility & API Functions ---

/**
* Formats the API response text for display (e.g., highlights, line breaks).
* @param {string} response - Raw text response from the API.
* @returns {string} - HTML formatted string.
*/
function formatAPIResponse(response) {
  // Basic sanitization: Convert potential HTML chars to entities
  const tempDiv = document.createElement('div');
  tempDiv.textContent = response;
  let sanitized = tempDiv.innerHTML;

  // Apply formatting rules
  let formatted = sanitized.replace(/\n/g, '<br>'); // Newlines to <br>
  // Keyword highlighting
  formatted = formatted.replace(/(best move|advantage|winning|check|mate|fork|pin|skewer|discovered attack|zwischenzug|tempo|initiative|development|center control|king safety|pawn structure)/gi,'<span class="highlight">$1</span>');
  // Chess Notation highlighting
  formatted = formatted.replace(/\b([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[\+#]?|O-O(?:-O)?)\b/g,'<span class="chess-notation">$1</span>');
  // Evaluation highlighting (+/- followed by numbers/decimal)
  formatted = formatted.replace(/([+-]\d+(?:\.\d+)?)/g,'<span class="evaluation">$1</span>');
  // Code block formatting (Markdown style ```) - Escape content inside
  formatted = formatted.replace(/```(\w*)\s*([\s\S]*?)```/g, (match, lang, code) => {
      const codeDiv = document.createElement('div'); codeDiv.textContent = code;
      return `<pre><code class="language-${lang || ''}">${codeDiv.innerHTML}</code></pre>`;
  });
  // Inline code formatting (Markdown style `) - Escape content inside
  formatted = formatted.replace(/`([^`]+)`/g, (match, code) => {
      const codeDiv = document.createElement('div'); codeDiv.textContent = code;
      return `<code>${codeDiv.innerHTML}</code>`;
  });
  return formatted;
}

/**
* Extracts base64 data from a data URL string.
* @param {string} src - The data URL (e.g., from image.src).
* @returns {string|null} - The base64 data string or null if invalid.
*/
function getBase64FromImageSrc(src) {
  if (src && typeof src === 'string' && src.startsWith('data:image/')) {
      try {
          return src.split(',')[1];
      } catch (e) {
          console.error("Error splitting data URL:", e);
          return null;
      }
  }
  return null;
}

/**
* Calls the backend's simple /analysis endpoint (no credits involved).
* @param {string} question - The user's question.
* @param {object} boardData - The captured board data {fen, pgn, ...}.
* @param {string|null} imageDataBase64 - Base64 image data or null.
* @param {Array<object>} currentChatHistory - The current chat history array.
* @param {string} modelId - The ID of the LLM to use (e.g., 'gpt-4o-mini').
* @returns {Promise<string>} - Promise resolving with the assistant's text response.
*/
async function callAnalysisAPI(question, boardData, imageDataBase64, currentChatHistory, modelId) {
  // API URL should be defined globally in the script
  const API_ANALYSIS_URL = `${API_URL}/analysis`;

  try {
      console.log(`Calling analysis API: ${API_ANALYSIS_URL} with model: ${modelId}`);
      const requestData = {
          message: question,
          fen: boardData.fen,
          pgn: boardData.pgn,
          image_data: imageDataBase64, // Pass base64 string or null
          chat_history: currentChatHistory, // Send history including the latest user message
          model: modelId // Specify the model to use
      };

      // Use AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

      const response = await fetch(API_ANALYSIS_URL, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json' // Explicitly accept JSON
          },
          body: JSON.stringify(requestData),
          signal: controller.signal, // Link fetch to AbortController
          mode: 'cors' // Required for cross-origin requests
      });
      clearTimeout(timeoutId); // Clear timeout if fetch completes

      if (!response.ok) {
          let errorDetail = `API Request Failed (${response.status})`;
          try {
              // Try to get more specific error from response body
              const errorJson = await response.json();
              errorDetail = errorJson.detail || errorDetail;
          } catch (e) { /* Ignore if response body isn't valid JSON */ }
          throw new Error(errorDetail);
      }

      const data = await response.json();
      if (!data || typeof data.response !== 'string') { // Check if response field exists and is a string
          throw new Error("Invalid or missing 'response' field in API data.");
      }
      return data.response; // Return just the text content

  } catch (error) {
      console.error("Error calling analysis API:", error);
      // Re-throw a potentially more user-friendly error message
      if (error.name === 'AbortError') {
           throw new Error("The analysis request timed out. Please try again.");
      } else {
           throw new Error(`API call failed: ${error.message}`);
      }
  }
}