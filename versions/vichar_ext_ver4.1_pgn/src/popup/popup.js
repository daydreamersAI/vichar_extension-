document.addEventListener('DOMContentLoaded', function() {
  const captureButton = document.getElementById('captureBtn');
  const sidebarButton = document.getElementById('sidebarBtn');
  const statusDiv = document.getElementById('status');
  
  console.log("Popup initialized");
  
  // When the capture button is clicked (for standalone analysis page)
  captureButton.addEventListener('click', async () => {
    console.log("Capture button clicked");
    try {
      // Get the current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      console.log("Current tab:", tab);
      
      // Check if we're on a supported chess site
      const url = tab.url || '';
      const isChessSite = url.includes('lichess.org') || url.includes('chess.com');
      
      if (!isChessSite) {
        showStatus('Please navigate to Lichess or Chess.com to capture a position.', 'error');
        return;
      }
      
      showStatus('Attempting to capture chess board...', 'info');
      
      // Send a message directly to the background script
      chrome.runtime.sendMessage({ 
        action: "captureBoard",
        tabId: tab.id 
      }, (response) => {
        console.log("Response from background script:", response);
        
        if (chrome.runtime.lastError) {
          console.error("Runtime error:", chrome.runtime.lastError);
          showStatus('Error: ' + chrome.runtime.lastError.message, 'error');
          return;
        }
        
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
      });
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
        
        // Send a message to the content script to show the sidebar
        chrome.tabs.sendMessage(tab.id, { action: "showSidebar" }, (response) => {
          console.log("Response from content script:", response);
          
          if (chrome.runtime.lastError) {
            console.error("Runtime error:", chrome.runtime.lastError);
            showStatus('Error: Make sure you refresh the chess page first. ' + chrome.runtime.lastError.message, 'error');
            return;
          }
          
          if (response && response.success) {
            window.close(); // Close the popup
          } else {
            const errorMsg = response && response.error ? response.error : 'Unknown error';
            showStatus('Error: ' + errorMsg, 'error');
          }
        });
      } catch (error) {
        console.error("Error showing sidebar:", error);
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