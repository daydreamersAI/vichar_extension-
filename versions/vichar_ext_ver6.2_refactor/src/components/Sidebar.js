/**
 * Sidebar component for chess analysis
 */

import { BoardCapture } from '../utils/boardCapture.js';

export class Sidebar {
  constructor() {
    this.sidebarElement = null;
    this.questionInput = null;
    this.responseArea = null;
    this.capturedImageElement = null;
    this.gameInfoContainer = null;
    this.isVisible = false;
  }

  /**
   * Initializes the sidebar
   */
  initialize() {
    this.createSidebarElement();
    document.body.appendChild(this.sidebarElement);
  }

  /**
   * Creates the sidebar DOM elements
   */
  createSidebarElement() {
    // Create the main sidebar container
    this.sidebarElement = document.createElement('div');
    this.sidebarElement.id = 'chess-analysis-sidebar';
    this.sidebarElement.className = 'sidebar-container';
    
    // Create toggle button
    const toggleButton = document.createElement('div');
    toggleButton.className = 'sidebar-toggle';
    toggleButton.innerHTML = '<span style="color: white; transform: rotate(-90deg);">▲</span>';
    toggleButton.addEventListener('click', () => this.toggleSidebar());
    
    // Create the sidebar content
    const content = document.createElement('div');
    content.className = 'sidebar-content';
    
    // Header
    const header = document.createElement('div');
    header.className = 'sidebar-header';
    header.innerHTML = '<h2 style="margin: 0; color: #333;">Chess Analysis</h2>';
    
    // Close button
    const closeButton = document.createElement('button');
    closeButton.className = 'sidebar-close-button';
    closeButton.textContent = 'X';
    closeButton.addEventListener('click', () => this.toggleSidebar());
    header.appendChild(closeButton);
    
    // Question input
    const questionContainer = document.createElement('div');
    questionContainer.className = 'question-container';
    
    const questionLabel = document.createElement('label');
    questionLabel.className = 'question-label';
    questionLabel.textContent = 'Ask about this position:';
    
    this.questionInput = document.createElement('textarea');
    this.questionInput.className = 'question-input';
    this.questionInput.placeholder = 'Example: What is the best move for white?';
    
    const askButton = document.createElement('button');
    askButton.className = 'ask-button';
    askButton.textContent = 'Ask Question';
    askButton.addEventListener('click', () => this.askQuestion());
    
    questionContainer.appendChild(questionLabel);
    questionContainer.appendChild(this.questionInput);
    questionContainer.appendChild(askButton);
    
    // Response area
    const responseContainer = document.createElement('div');
    responseContainer.className = 'response-container';
    
    const responseLabel = document.createElement('label');
    responseLabel.className = 'response-label';
    responseLabel.textContent = 'Analysis:';
    
    this.responseArea = document.createElement('div');
    this.responseArea.className = 'response-area';
    this.responseArea.textContent = 'Capture a position to begin analysis.';
    
    responseContainer.appendChild(responseLabel);
    responseContainer.appendChild(this.responseArea);
    
    // Capture button
    const captureButton = document.createElement('button');
    captureButton.className = 'capture-button';
    captureButton.textContent = 'Capture Current Position';
    captureButton.addEventListener('click', () => this.captureCurrentPosition());
    
    // Image container
    const imageContainer = document.createElement('div');
    imageContainer.className = 'image-container';
    this.capturedImageElement = document.createElement('img');
    this.capturedImageElement.className = 'captured-image';
    imageContainer.appendChild(this.capturedImageElement);
    
    // Game info container
    this.gameInfoContainer = document.createElement('div');
    this.gameInfoContainer.id = 'game-info-container';
    this.gameInfoContainer.className = 'game-info-container';
    
    // Assemble the sidebar
    content.appendChild(header);
    content.appendChild(questionContainer);
    content.appendChild(responseContainer);
    content.appendChild(captureButton);
    content.appendChild(imageContainer);
    content.appendChild(this.gameInfoContainer);
    
    this.sidebarElement.appendChild(content);
    document.body.appendChild(toggleButton);
  }

  /**
   * Toggles the sidebar visibility
   */
  toggleSidebar() {
    this.isVisible = !this.isVisible;
    this.sidebarElement.style.right = this.isVisible ? '0' : '-400px';
  }

  /**
   * Captures the current board position
   */
  async captureCurrentPosition() {
    try {
      const imageData = await BoardCapture.captureBoardFromPage();
      
      // Store the image data
      chrome.storage.local.set({ 'capturedBoard': imageData }, () => {
        console.log('Board position captured and stored');
        
        // Update the UI
        this.capturedImageElement.src = imageData;
        this.capturedImageElement.style.display = 'block';
        
        // Show the game info container
        this.gameInfoContainer.style.display = 'flex';
        
        // Clear any previous response
        this.responseArea.textContent = 'Position captured. Ask a question about this position.';
      });
    } catch (error) {
      console.error('Error capturing board:', error);
      this.responseArea.textContent = 'Error: ' + error.message;
    }
  }

  /**
   * Asks a question about the current position
   */
  askQuestion() {
    const question = this.questionInput.value.trim();
    
    if (!question) {
      this.responseArea.textContent = 'Please enter a question.';
      return;
    }
    
    // Get the stored board data
    chrome.storage.local.get(['capturedBoard'], (result) => {
      if (!result.capturedBoard) {
        this.responseArea.textContent = 'Please capture a position first.';
        return;
      }
      
      // Send the question and image to the background script
      chrome.runtime.sendMessage({
        action: 'analyzePosition',
        question: question,
        imageData: result.capturedBoard
      }, (response) => {
        if (response.error) {
          this.responseArea.textContent = 'Error: ' + response.error;
        } else {
          this.responseArea.textContent = response.analysis;
        }
      });
    });
  }

  /**
   * Loads the stored board data into the sidebar
   */
  loadStoredBoardData() {
    chrome.storage.local.get(['capturedBoard'], (result) => {
      if (result.capturedBoard) {
        this.capturedImageElement.src = result.capturedBoard;
        this.capturedImageElement.style.display = 'block';
        this.gameInfoContainer.style.display = 'flex';
      }
    });
  }
} 