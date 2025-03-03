document.addEventListener('DOMContentLoaded', async function() {
    const capturedBoardImg = document.getElementById('capturedBoard');
    const questionInput = document.getElementById('questionInput');
    const askButton = document.getElementById('askButton');
    const responseArea = document.getElementById('responseArea');
    
    let capturedBoard = null;
    
    // Load the captured board from storage
    try {
      const result = await chrome.storage.local.get(['capturedBoard']);
      capturedBoard = result.capturedBoard;
      
      if (capturedBoard && capturedBoard.imageData) {
        capturedBoardImg.src = capturedBoard.imageData;
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
        // In a full implementation, this would call an AI API
        // For now, we'll simulate a response
        const response = await simulateAIResponse(question, capturedBoard.fen);
        responseArea.textContent = response;
      } catch (error) {
        console.error("Error getting response:", error);
        responseArea.textContent = "Sorry, there was an error analyzing this position.";
      }
    });
  });
  
  // Simulate an AI response (in a real implementation, this would call an API)
  async function simulateAIResponse(question, fen) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // For the basic implementation, return a simple response
    // In the future, this would be replaced with a real API call
    
    const responses = [
      "This position appears to be the starting position in chess. Both sides have equal chances.",
      "In this position, controlling the center with pawns or pieces would be a good strategic approach.",
      "This is a balanced position. Development of minor pieces (knights and bishops) should be prioritized.",
      "The position looks even. Focus on castling early to ensure king safety.",
      "This position has potential for both sides. Consider developing with 1.e4 or 1.d4 for White."
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
    
    // In a real implementation, you would have code like this:
    /*
    const response = await fetch('https://your-ai-api-endpoint.com/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_API_KEY'
      },
      body: JSON.stringify({
        question: question,
        fen: fen,
        // You might also include the image data
        // imageData: capturedBoard.imageData
      })
    });
    
    const data = await response.json();
    return data.analysis;
    */
  }