document.addEventListener('DOMContentLoaded', function() {
  const captureButton = document.getElementById('captureBtn');
  const sidebarButton = document.getElementById('sidebarBtn');
  const statusDiv = document.getElementById('status');
  
  console.log("Popup initialized");

  // Helper function to ensure content script is loaded before sending messages
  async function ensureContentScriptLoaded(tabId) {
    return new Promise((resolve, reject) => {
      try {
        chrome.tabs.sendMessage(tabId, { action: "ping" }, response => {
          if (chrome.runtime.lastError) {
            console.log("Content script not ready, will try to inject it");
            // Content script not ready, inject it
            chrome.scripting.executeScript({
              target: { tabId: tabId },
              files: ['src/content/content-script.js']
            })
            .then(() => {
              console.log("Content script injected successfully");
              resolve();
            })
            .catch(error => {
              console.error("Failed to inject content script:", error);
              reject(error);
            });
          } else {
            // Content script already loaded
            console.log("Content script already loaded");
            resolve();
          }
        });
      } catch (error) {
        console.error("Error in ensureContentScriptLoaded:", error);
        reject(error);
      }
    });
  }
  
  // When the capture button is clicked (for standalone analysis page)
  captureButton.addEventListener('click', async () => {
    console.log("Capture button clicked");
    try {
      // Get the current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      console.log("Current tab:", tab);
      
      if (!tab) {
        showStatus('Could not determine current tab.', 'error');
        return;
      }
      
      // Check if we're on a supported chess site
      const url = tab.url || '';
      const isChessSite = url.includes('lichess.org') || url.includes('chess.com');
      
      if (!isChessSite) {
        showStatus('Please navigate to Lichess or Chess.com to capture a position.', 'error');
        return;
      }
      
      showStatus('Attempting to capture chess board...', 'info');
      
      // Use a Promise-based approach to handle the message response
      try {
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ 
            action: "captureBoard",
            tabId: tab.id 
          }, (response) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
              return;
            }
            resolve(response);
          });
        });
        
        console.log("Response from background script:", response);
        
        if (response && response.success) {
          showStatus('Chess position captured successfully!', 'success');
          
          // Open the analysis page after a short delay
          setTimeout(() => {
            chrome.tabs.create({ url: chrome.runtime.getURL('src/analysis/analysis.html') });
            window.close(); // Close the popup
          }, 1000);
        } else {
          const errorMsg = response && response.error ? response.error : 'Unknown error';
          showStatus('Error: ' + errorMsg, 'error');
        }
      } catch (error) {
        console.error("Message error:", error);
        showStatus(`Error: ${error.message}`, 'error');
      }
    } catch (error) {
      console.error("Error in popup.js:", error);
      showStatus(`Error: ${error.message}`, 'error');
    }
  });
  
  // When the sidebar button is clicked
  if (sidebarButton) {
    sidebarButton.addEventListener('click', async () => {
      console.log("Sidebar button clicked");
      try {
        // Get the current active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        console.log("Current tab for sidebar:", tab);
        
        if (!tab) {
          showStatus('Could not determine current tab.', 'error');
          return;
        }
        
        // Check if we're on a supported chess site
        const url = tab.url || '';
        const isChessSite = url.includes('lichess.org') || url.includes('chess.com');
        
        if (!isChessSite) {
          showStatus('Please navigate to Lichess or Chess.com to use the sidebar.', 'error');
          return;
        }
        
        showStatus('Opening analysis sidebar...', 'info');
        
        try {
          // First ensure the content script is loaded
          await ensureContentScriptLoaded(tab.id);
          
          // Send a message to the background script instead (which will relay to content script)
          // This avoids direct message port issues between popup and content script
          const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ 
              action: "showSidebar"
            }, (response) => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
              }
              resolve(response);
            });
          });
          
          console.log("Response from background script:", response);
          
          if (response && response.success) {
            window.close(); // Close the popup
          } else {
            const errorMsg = response && response.error ? response.error : 'Unknown error';
            showStatus('Error: ' + errorMsg, 'error');
          }
        } catch (error) {
          console.error("Error showing sidebar:", error);
          showStatus(`Error: ${error.message}. Try refreshing the chess page.`, 'error');
        }
      } catch (error) {
        console.error("Error in sidebar button handler:", error);
        showStatus(`Error: ${error.message}`, 'error');
      }
    });
  }
  
  // Helper function to show status messages
  function showStatus(message, type) {
    console.log("Status:", message, type);
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + (type || 'info');
    statusDiv.style.display = 'block';
  }
});