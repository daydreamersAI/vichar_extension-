// Import the script injector functionality
import { injectCaptureScript } from './scriptInjector.js';

// Initialize the background script
console.log("Background script initialized");

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background received message:", request);
  
  if (request.action === "captureBoard") {
    console.log("Received captureBoard request for tab:", request.tabId);
    
    // Execute this in a separate async context to avoid message port issues
    (async () => {
      try {
        const result = await injectCaptureScript(request.tabId);
        console.log("Capture result:", result);
        
        // Check the FEN that was captured
        const storageResult = await chrome.storage.local.get(['capturedBoard']);
        console.log("Stored FEN:", storageResult.capturedBoard?.fen);
        
        sendResponse(result);
      } catch (error) {
        console.error("Error in capture process:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true; // Indicates we'll send a response asynchronously
  }
  
  // New action for capturing board for sidebar
  if (request.action === "captureBoardForSidebar") {
    console.log("Capture request for sidebar");
    
    // Execute this in a separate async context to avoid message port issues
    (async () => {
      try {
        // Get the current active tab
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (tabs.length === 0) {
          sendResponse({ success: false, error: "No active tab found" });
          return;
        }
        
        const tabId = tabs[0].id;
        console.log("Using active tab:", tabId);
        
        // Inject and execute the capture script
        const result = await injectCaptureScript(tabId);
        console.log("Capture result for sidebar:", result);
        
        // Check the FEN that was captured
        const storageResult = await chrome.storage.local.get(['capturedBoard']);
        console.log("Stored FEN for sidebar:", storageResult.capturedBoard?.fen);
        
        // If successful, notify the content script to update the sidebar
        if (result.success) {
          try {
            await chrome.tabs.sendMessage(tabId, { action: "updateSidebarImage" });
          } catch (msgError) {
            console.error("Error sending update message:", msgError);
            // Continue anyway, as the capture was successful
          }
        }
        
        sendResponse(result);
      } catch (error) {
        console.error("Error in sidebar capture:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true; // Indicates we'll send a response asynchronously
  }
  
  if (request.action === "processImage") {
    console.log("Processing image data of length:", request.imageData?.length || 0);
    
    (async () => {
      try {
        const result = await processChessboardImage(request.imageData);
        console.log("Image processing result:", result);
        
        // Check the FEN that was processed
        const storageResult = await chrome.storage.local.get(['capturedBoard']);
        console.log("Processed FEN:", storageResult.capturedBoard?.fen);
        
        sendResponse({ success: true });
      } catch (error) {
        console.error("Error processing image:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true; // Indicates we'll send a response asynchronously
  }
  
  // Handle showing the sidebar
  if (request.action === "showSidebar") {
    console.log("Show sidebar request received");
    
    (async () => {
      try {
        // Get the current active tab
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (tabs.length === 0) {
          sendResponse({ success: false, error: "No active tab found" });
          return;
        }
        
        const tabId = tabs[0].id;
        
        // Send a message to the content script to show the sidebar
        // Use a promise wrapper around sendMessage to handle errors properly
        try {
          await new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(tabId, { action: "showSidebar" }, (response) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
              }
              resolve(response);
            });
          });
          
          sendResponse({ success: true });
        } catch (error) {
          console.error("Error showing sidebar:", error);
          sendResponse({ success: false, error: error.message });
        }
      } catch (error) {
        console.error("Error in tab query:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true; // Indicates we'll send a response asynchronously
  }
  
  // Improved implementation for analyzing chess positions
  if (request.action === "analyzeChessPosition") {
    console.log("Analyze chess position request received");
    
    (async () => {
      try {
        const { question, capturedBoard, useVision } = request;
        
        console.log("Analysis request details:", {
          question,
          fen: capturedBoard.fen,
          pgn: capturedBoard.pgn ? "Present (length: " + capturedBoard.pgn.length + ")" : "Not included",
          useVision
        });
        
        // Prepare chat history
        const chatHistory = [
          { text: question, sender: "user" }
        ];
        
        // Prepare the image data if vision is enabled
        let imageData = null;
        if (useVision && capturedBoard.imageData) {
          // Extract just the base64 part if it's a data URL
          if (capturedBoard.imageData.startsWith('data:image/')) {
            imageData = capturedBoard.imageData.split(',')[1];
          } else {
            imageData = capturedBoard.imageData;
          }
          console.log("Including image data for analysis, length:", imageData?.length || 0);
        }
        
        // Prepare the request payload
        const requestData = {
          message: question,
          fen: capturedBoard.fen,
          pgn: capturedBoard.pgn || "",
          image_data: imageData,
          chat_history: chatHistory
        };
        
        console.log("Calling API at:", "https://api.beekayprecision.com/analysis");
        
        // Call the API
        const response = await fetch("https://api.beekayprecision.com/analysis", {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestData)
        });
        
        console.log("API response status:", response.status);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error("API error response:", errorText);
          throw new Error(`API error: ${response.status} - ${errorText || response.statusText}`);
        }
        
        const data = await response.json();
        console.log("API response received:", data);
        
        if (!data.response) {
          console.error("API response missing 'response' field:", data);
          throw new Error("Invalid API response format - missing 'response' field");
        }
        
        // Send the actual API response back
        sendResponse({
          success: true,
          data: data.response
        });
        
      } catch (error) {
        console.error("Error analyzing position:", error);
        sendResponse({ 
          success: false, 
          error: error.message || "Failed to analyze the chess position"
        });
      }
    })();
    
    return true; // Indicates we'll send a response asynchronously
  }

  if (message.action === "openRazorpayCheckout") {
    const orderData = message.orderData;

    // Open a new tab for Razorpay checkout
    chrome.tabs.create({
        url: `https://checkout.razorpay.com/v1/checkout.js?order_id=${orderData.razorpay_order_id}`
    });
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

// Test API connectivity at startup
function testApiConnection() {
  console.log("Testing API connection...");
  
  fetch("https://api.beekayprecision.com/")
    .then(response => {
      console.log("API test response status:", response.status);
      return response.text();
    })
    .then(text => {
      console.log("API test response:", text);
      console.log("API connection successful!");
    })
    .catch(error => {
      console.error("API connection test failed:", error);
    });
}

// Run connectivity test at startup
testApiConnection();