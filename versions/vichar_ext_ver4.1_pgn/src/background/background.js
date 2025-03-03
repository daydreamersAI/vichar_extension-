// Import the script injector functionality
import { injectCaptureScript } from './scriptInjector.js';

// Initialize the background script
console.log("Background script initialized");

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background received message:", request);
  
  if (request.action === "captureBoard") {
    console.log("Received captureBoard request for tab:", request.tabId);
    
    // Inject and execute the capture script in the tab
    injectCaptureScript(request.tabId)
      .then(result => {
        console.log("Capture result:", result);
        sendResponse(result);
      })
      .catch(error => {
        console.error("Error in capture process:", error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Indicates we'll send a response asynchronously
  }
  
  // New action for capturing board for sidebar
  if (request.action === "captureBoardForSidebar") {
    console.log("Capture request for sidebar");
    
    // Get the current active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        sendResponse({ success: false, error: "No active tab found" });
        return;
      }
      
      const tabId = tabs[0].id;
      console.log("Using active tab:", tabId);
      
      // Inject and execute the capture script
      injectCaptureScript(tabId)
        .then(result => {
          console.log("Capture result for sidebar:", result);
          
          // If successful, notify the content script to update the sidebar
          if (result.success) {
            chrome.tabs.sendMessage(tabId, { action: "updateSidebarImage" });
          }
          
          sendResponse(result);
        })
        .catch(error => {
          console.error("Error in sidebar capture:", error);
          sendResponse({ success: false, error: error.message });
        });
    });
    
    return true; // Indicates we'll send a response asynchronously
  }
  
  if (request.action === "processImage") {
    console.log("Processing image data of length:", request.imageData?.length || 0);
    
    processChessboardImage(request.imageData)
      .then(result => {
        console.log("Image processing result:", result);
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error("Error processing image:", error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Indicates we'll send a response asynchronously
  }
  
  // Handle showing the sidebar
  if (request.action === "showSidebar") {
    console.log("Show sidebar request received");
    
    // Get the current active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        sendResponse({ success: false, error: "No active tab found" });
        return;
      }
      
      const tabId = tabs[0].id;
      
      // Send a message to the content script to show the sidebar
      chrome.tabs.sendMessage(tabId, { action: "showSidebar" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Error showing sidebar:", chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        
        sendResponse({ success: true });
      });
    });
    
    return true; // Indicates we'll send a response asynchronously
  }
});

// Process the captured chessboard image
async function processChessboardImage(captureResult) {
  if (!captureResult) {
    throw new Error("No capture result received");
  }
  
  // Extract data from the capture result
  const { imageData, pgn, fen, orientation, site } = captureResult;
  
  if (!imageData) {
    throw new Error("No image data received");
  }
  
  try {
    console.log("Storing captured board data");
    console.log("PGN data:", pgn ? "Found" : "Not found");
    console.log("FEN data:", fen ? fen : "Not found");
    
    // Store the image data and game information for use in the analysis page
    await chrome.storage.local.set({ 
      capturedBoard: {
        imageData: imageData,
        pgn: pgn || "",
        fen: fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", // Default if not found
        orientation: orientation || "white",
        site: site || "unknown",
        timestamp: Date.now()
      }
    });
    
    console.log("Board data stored successfully");
    return { success: true };
  } catch (error) {
    console.error("Error storing chess position:", error);
    throw error;
  }
}