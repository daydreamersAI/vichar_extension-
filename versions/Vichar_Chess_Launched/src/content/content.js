// Main content script
console.log("Chess analyzer content script loaded");

// Import the sidebar module
import { Sidebar } from '../components/Sidebar.js';
import { BoardCapture } from '../utils/boardCapture.js';

// Create a single instance of the sidebar
const sidebarInstance = new Sidebar();

// Initialize when the page is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log("Initializing chess analyzer content script");
  
  // Initialize the sidebar
  sidebarInstance.initialize();
});

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Content script received message:", request);
  
  if (request.action === "captureBoard") {
    BoardCapture.captureBoardFromPage()
      .then(result => {
        // Send both image and PGN data to the background script
        chrome.runtime.sendMessage({
          action: "processImage",
          imageData: result.imageData,
          pgn: result.pgn
        }, (response) => {
          // Forward the response back to the popup
          sendResponse(response);
        });
        
        return true; // Indicates we'll send a response asynchronously
      })
      .catch(error => {
        console.error("Error capturing board:", error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Indicates we'll send a response asynchronously
  }
  
  // New action to show the sidebar
  if (request.action === "showSidebar") {
    console.log("Showing sidebar");
    
    // Make sure the sidebar is initialized
    if (!sidebarInstance.sidebarElement) {
      sidebarInstance.initialize();
    }
    
    // Show the sidebar
    sidebarInstance.toggleSidebar();
    
    sendResponse({ success: true });
    return false;
  }
  
  // Action to update captured image in sidebar
  if (request.action === "updateSidebarImage") {
    console.log("Updating sidebar image");
    sidebarInstance.loadStoredBoardData();
    sendResponse({ success: true });
    return false;
  }
});

// Function to capture the chess board from the page
async function captureBoardFromPage() {
  // Detect which chess site we're on and get the appropriate board selector
  const boardSelector = detectChessSite();
  
  if (!boardSelector) {
    throw new Error("Could not detect a supported chess site");
  }
  
  const boardElement = document.querySelector(boardSelector);
  
  if (!boardElement) {
    throw new Error("Chess board element not found on page");
  }
  
  // Use html2canvas to capture the board as an image
  try {
    const canvas = await html2canvas(boardElement, {
      backgroundColor: null,
      logging: false,
      useCORS: true
    });
    
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error("Error capturing canvas:", error);
    throw new Error("Failed to capture the chess board");
  }
}

// Function to detect which chess site we're on
function detectChessSite() {
  const hostname = window.location.hostname;
  
  if (hostname.includes('lichess.org')) {
    return '.cg-wrap'; // Lichess board container
  } else if (hostname.includes('chess.com')) {
    return '.board-container'; // Chess.com board container
  }
  
  // Not a supported chess site
  return null;
}