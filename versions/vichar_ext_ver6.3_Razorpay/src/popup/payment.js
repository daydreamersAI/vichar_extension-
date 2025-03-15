// Razorpay integration for Chess Position Analyzer
console.log("Payment module loading...");

// Create namespace for payment functions
window.chessAnalyzerPayment = window.chessAnalyzerPayment || {};

// Credit package definitions
const CREDIT_PACKAGES = [
  { id: 'basic', name: 'Basic', credits: 50, amount: 29900 },  // ₹299
  { id: 'standard', name: 'Standard', credits: 120, amount: 59900 },  // ₹599
  { id: 'premium', name: 'Premium', credits: 300, amount: 99900 }   // ₹999
];

// API endpoint
//const API_URL = "https://api.beekayprecision.com";

// Razorpay API Key - this should be replaced with your actual key
//const RAZORPAY_KEY_ID = "rzp_test_JB7DxS1VpotPXc";

const API_URL = window.chessAnalyzerConfig.API_URL;
const RAZORPAY_KEY_ID = window.chessAnalyzerConfig.RAZORPAY_KEY_ID;

// Initialize the payment module
function initializePayment() {
  console.log("Initializing payment module...");
  
  // Setup event listeners after DOM has loaded
  document.addEventListener('DOMContentLoaded', () => {
    // Check if the user is logged in
    chrome.runtime.sendMessage({ action: 'get_auth_state' }, (response) => {
      if (response && response.isAuthenticated) {
        setupPaymentUI(response.user);
      }
    });
  });
  
  // Export public methods
  window.chessAnalyzerPayment = {
    initialize: initializePayment,
    openCheckout: openRazorpayCheckout,
    getPackages: () => CREDIT_PACKAGES
  };
}

// Function to set up the payment UI
function setupPaymentUI(user) {
  console.log("Setting up payment UI for user:", user);
  
  // Find the user info container
  const userInfoDiv = document.getElementById('user-info');
  
  if (!userInfoDiv) {
    console.error("User info div not found");
    return;
  }
  
  // Check if the user info div already has the logged-in view
  const userLoggedInDiv = userInfoDiv.querySelector('.user-logged-in');
  
  if (userLoggedInDiv) {
    // Add the buy credits button if it doesn't exist
    if (!userLoggedInDiv.querySelector('.buy-credits-btn')) {
      // Create the buy credits button
      const buyCreditsBtn = document.createElement('button');
      buyCreditsBtn.className = 'buy-credits-btn';
      buyCreditsBtn.id = 'buy-credits-btn';
      buyCreditsBtn.textContent = '+ Buy Credits';
      buyCreditsBtn.addEventListener('click', () => showCreditPackages(user));
      
      // Append the button to the user-logged-in div
      userLoggedInDiv.appendChild(buyCreditsBtn);
    }
  } else {
    // If we don't have the logged in view yet, wait for it
    console.log("Logged in view not found, will be created by auth module");
  }
}

// Show credit packages modal
function showCreditPackages(user) {
  console.log("Showing credit packages for user:", user);
  
  // Create modal overlay
  const modal = document.createElement('div');
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  modal.style.display = 'flex';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
  modal.style.zIndex = '1000';
  
  // Create modal content
  const modalContent = document.createElement('div');
  modalContent.style.backgroundColor = 'white';
  modalContent.style.padding = '20px';
  modalContent.style.borderRadius = '8px';
  modalContent.style.width = '280px';
  
  // Create modal header
  const modalHeader = document.createElement('div');
  modalHeader.style.display = 'flex';
  modalHeader.style.justifyContent = 'space-between';
  modalHeader.style.alignItems = 'center';
  modalHeader.style.marginBottom = '16px';
  
  const modalTitle = document.createElement('h2');
  modalTitle.textContent = 'Buy Credits';
  modalTitle.style.margin = '0';
  modalTitle.style.fontSize = '18px';
  
  const closeButton = document.createElement('button');
  closeButton.textContent = '×';
  closeButton.style.background = 'none';
  closeButton.style.border = 'none';
  closeButton.style.fontSize = '24px';
  closeButton.style.cursor = 'pointer';
  closeButton.style.padding = '0';
  closeButton.style.lineHeight = '1';
  closeButton.style.color = '#666';
  closeButton.onclick = () => {
    document.body.removeChild(modal);
  };
  
  modalHeader.appendChild(modalTitle);
  modalHeader.appendChild(closeButton);
  modalContent.appendChild(modalHeader);
  
  // Create package options
  CREDIT_PACKAGES.forEach(pkg => {
    const packageOption = document.createElement('div');
    packageOption.style.padding = '12px';
    packageOption.style.border = '1px solid #ddd';
    packageOption.style.borderRadius = '4px';
    packageOption.style.marginBottom = '10px';
    packageOption.style.cursor = 'pointer';
    packageOption.style.transition = 'background-color 0.2s';
    
    // Hover effect
    packageOption.onmouseover = () => {
      packageOption.style.backgroundColor = '#f5f9ff';
    };
    packageOption.onmouseout = () => {
      packageOption.style.backgroundColor = 'white';
    };
    
    // Click handler
    packageOption.onclick = () => {
      document.body.removeChild(modal);
      openRazorpayCheckout(pkg, user);
    };
    
    const packageHeader = document.createElement('div');
    packageHeader.style.display = 'flex';
    packageHeader.style.justifyContent = 'space-between';
    packageHeader.style.marginBottom = '8px';
    
    const packageName = document.createElement('div');
    packageName.textContent = pkg.name;
    packageName.style.fontWeight = 'bold';
    
    const packagePrice = document.createElement('div');
    packagePrice.textContent = `₹${(pkg.amount / 100).toFixed(2)}`;
    packagePrice.style.color = '#34a853';
    packagePrice.style.fontWeight = 'bold';
    
    packageHeader.appendChild(packageName);
    packageHeader.appendChild(packagePrice);
    
    const packageCredits = document.createElement('div');
    packageCredits.textContent = `${pkg.credits} credits`;
    packageCredits.style.fontSize = '14px';
    packageCredits.style.color = '#666';
    
    packageOption.appendChild(packageHeader);
    packageOption.appendChild(packageCredits);
    modalContent.appendChild(packageOption);
  });
  
  modal.appendChild(modalContent);
  document.body.appendChild(modal);
}

// Function to open Razorpay checkout
async function openRazorpayCheckout(package, user) {
  console.log("Opening Razorpay checkout for package:", package);
  
  try {
    // Show loading message
    showStatus('Initializing payment...', 'info');
    
    // Get the auth token
    const authData = await chrome.storage.local.get(['authToken']);
    const token = authData.authToken;
    
    if (!token) {
      throw new Error('Authentication required');
    }
    
    // Create order on the backend
    let orderData;
    try {
      // First, try to create an order through our backend
      const createOrderResponse = await fetch(`${API_URL}/payments/create-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: package.amount,
          currency: 'INR',
          packageId: package.id,
          credits: package.credits,
          receipt: `chess_credits_${Date.now()}`
        })
      });
      
      if (!createOrderResponse.ok) {
        throw new Error(`Failed to create order: ${createOrderResponse.status}`);
      }
      
      orderData = await createOrderResponse.json();
      console.log("Order created:", orderData);
    } catch (orderError) {
      console.error("Error creating order through backend:", orderError);
      
      // Fallback: Use direct Razorpay integration without backend
      // This is for development purposes only!
      if (true) { // Set to false in production
        console.log("Using fallback direct Razorpay integration");
        orderData = {
          id: `order_${Date.now()}`,
          amount: package.amount,
          currency: 'INR'
        };
      } else {
        throw orderError;
      }
    }
    
    // Initialize Razorpay options
    const options = {
      key: RAZORPAY_KEY_ID,
      amount: orderData.amount,
      currency: orderData.currency || 'INR',
      name: 'Chess Position Analyzer',
      description: `${package.name} Credits Package`,
      order_id: orderData.id,
      handler: function(response) {
        console.log("Payment successful:", response);
        processSuccessfulPayment(response, package);
      },
      prefill: {
        name: user ? user.full_name : '',
        email: user ? user.email : '',
        contact: ''
      },
      theme: {
        color: '#4285f4'
      },
      modal: {
        ondismiss: function() {
          console.log("Checkout form closed");
          showStatus('Payment cancelled', 'info');
        }
      }
    };
    
    console.log("Razorpay options:", options);
    
    // Open Razorpay checkout
    const rzp = new Razorpay(options);
    rzp.open();
    
    rzp.on('payment.failed', function(response) {
      console.error("Payment failed:", response.error);
      showStatus(`Payment failed: ${response.error.description}`, 'error');
    });
    
  } catch (error) {
    console.error("Error opening Razorpay checkout:", error);
    showStatus(`Error: ${error.message}`, 'error');
  }
}

// Process successful payment
async function processSuccessfulPayment(paymentData, package) {
  console.log("Processing successful payment:", paymentData);
  
  try {
    showStatus('Verifying payment...', 'info');
    
    // Get the auth token
    const authData = await chrome.storage.local.get(['authToken']);
    const token = authData.authToken;
    
    if (!token) {
      throw new Error('Authentication required');
    }
    
    // Verify payment with backend
    const verifyResponse = await fetch(`${API_URL}/payments/verify-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        razorpay_payment_id: paymentData.razorpay_payment_id,
        razorpay_order_id: paymentData.razorpay_order_id,
        razorpay_signature: paymentData.razorpay_signature,
        packageId: package.id,
        credits: package.credits
      })
    });
    
    if (!verifyResponse.ok) {
      throw new Error(`Failed to verify payment: ${verifyResponse.status}`);
    }
    
    const verifyData = await verifyResponse.json();
    
    if (verifyData.verified) {
      // Payment verified successfully
      showStatus('Payment successful! Credits added to your account.', 'success');
      
      // Update UI with new credits count
      updateCreditsDisplay(verifyData.updatedCredits || (package.credits + (authData.userData?.credits || 0)));
      
      // Refresh user data
      setTimeout(() => {
        chrome.runtime.sendMessage({ 
          action: 'fetchUserData',
          token: token
        });
      }, 1000);
      
    } else {
      throw new Error('Payment verification failed');
    }
  } catch (error) {
    console.error("Error processing payment:", error);
    
    // Even if verification fails on our end, the payment might still be successful
    // We should guide the user accordingly
    showStatus(`Payment received but verification had an issue. Please contact support if credits aren't added within a few minutes.`, 'error');
  }
}

// Update credits display in the UI
function updateCreditsDisplay(newCreditsCount) {
  const creditsCountElement = document.querySelector('.credits-count');
  
  if (creditsCountElement) {
    creditsCountElement.textContent = newCreditsCount;
    
    // Add animation effect
    creditsCountElement.style.transition = 'color 0.5s';
    creditsCountElement.style.color = '#34a853';
    
    setTimeout(() => {
      creditsCountElement.style.transition = 'color 1s';
      creditsCountElement.style.color = '#34a853';
    }, 500);
  }
}

// Helper function to show status messages (imported from popup.js)
function showStatus(message, type) {
  // If popup.js already defined this function, use that one
  if (typeof window.showStatus === 'function') {
    window.showStatus(message, type);
    return;
  }
  
  const statusDiv = document.getElementById('status');
  
  if (!statusDiv) {
    console.error("Status div not found");
    return;
  }
  
  if (!message) {
    statusDiv.style.display = 'none';
    return;
  }
  
  statusDiv.textContent = message;
  statusDiv.className = 'status ' + (type || 'info');
  statusDiv.style.display = 'block';
  
  console.log(`Status message (${type}): ${message}`);
}

// Initialize the payment module when the script loads
initializePayment();