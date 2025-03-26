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
  closeButton.addEventListener('click', () => this.toggleSidebar());
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
  
  this.questionInput = document.createElement('textarea');
  this.questionInput.placeholder = 'Example: What is the best move for white?';
  this.questionInput.style.cssText = `
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
  askButton.addEventListener('click', () => this.askQuestion());
  
  questionContainer.appendChild(questionLabel);
  questionContainer.appendChild(this.questionInput);
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
  
  this.responseArea = document.createElement('div');
  this.responseArea.style.cssText = `
    padding: 15px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background-color: white;
    min-height: 120px;
    max-height: 200px;
    overflow-y: auto;
    line-height: 1.5;
    color: #333;
    font-size: 14px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  `;
  this.responseArea.textContent = 'Capture a position to begin analysis.';
  
  responseContainer.appendChild(responseLabel);
  responseContainer.appendChild(this.responseArea);
  
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
  captureButton.addEventListener('click', () => this.captureCurrentPosition());
  
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
  this.capturedImageElement = document.createElement('img');
  this.capturedImageElement.style.cssText = `
    max-width: 100%;
    max-height: 300px;
    display: none;
    border-radius: 4px;
  `;
  imageContainer.appendChild(this.capturedImageElement);
  
  // Game info container (for FEN and PGN)
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
  
  // Add components to the game info container
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
  this.sidebarElement.appendChild(content);
  
  // Add the sidebar and toggle button to the page
  document.body.appendChild(this.sidebarElement);
  document.body.appendChild(toggleButton);
  
  console.log("Sidebar elements created");
}