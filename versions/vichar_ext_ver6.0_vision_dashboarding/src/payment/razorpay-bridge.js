// This script initializes Razorpay checkout from the options in session storage
document.addEventListener('DOMContentLoaded', async () => {
  const statusText = document.getElementById('status-text');
  
  try {
    // Get the Razorpay options and context from session storage
    const sessionData = await chrome.storage.session.get(['razorpayOptions', 'razorpayContext']);
    const options = sessionData.razorpayOptions;
    const context = sessionData.razorpayContext;
    
    if (!options || !context) {
      throw new Error('Payment data not found');
    }
    
    console.log('Razorpay bridge loaded with options:', options);
    statusText.textContent = 'Loading payment gateway...';
    
    // Add handlers to the options
    options.handler = function(response) {
      statusText.textContent = 'Payment successful! Verifying...';
      verifyPayment(response, context);
    };
    
    options.modal = {
      ondismiss: function() {
        console.log('Checkout form closed');
        // Notify the background script
        chrome.runtime.sendMessage({
          action: 'razorpayResult',
          success: false,
          cancelled: true
        });
        window.close();
      }
    };
    
    // Always load the Razorpay script dynamically
    statusText.textContent = 'Loading Razorpay script...';
    
    try {
      // Try to load the script dynamically from the extension
      await loadRazorpayScript();
      console.log('Razorpay script loaded successfully');
    } catch (scriptError) {
      console.error('Error loading Razorpay script:', scriptError);
      throw new Error('Failed to load payment gateway script');
    }
    
    // Check if Razorpay is defined
    if (typeof Razorpay === 'undefined') {
      throw new Error('Razorpay failed to load');
    }
    
    const rzp = new Razorpay(options);
    
    rzp.on('payment.failed', function(response) {
      console.error('Payment failed:', response.error);
      
      // Notify the background script
      chrome.runtime.sendMessage({
        action: 'razorpayResult',
        success: false,
        error: response.error.description || 'Payment processing failed'
      });
    });
    
    // Open the payment form
    rzp.open();
    statusText.textContent = 'Payment form opened';
    
  } catch (error) {
    console.error('Error in Razorpay bridge:', error);
    statusText.textContent = `Error: ${error.message}`;
    
    // Notify the background script
    chrome.runtime.sendMessage({
      action: 'razorpayResult',
      success: false,
      error: error.message
    });
  }
});

// Function to dynamically load the Razorpay script
function loadRazorpayScript() {
  return new Promise((resolve, reject) => {
    // Try multiple paths to find the script
    const paths = [
      '/lib/razorpay-checkout.js',
      'lib/razorpay-checkout.js',
      '../lib/razorpay-checkout.js',
      '../../lib/razorpay-checkout.js'
    ];
    
    let loadAttempts = 0;
    const tryNextPath = () => {
      if (loadAttempts >= paths.length) {
        reject(new Error(`Failed to load Razorpay script after trying ${loadAttempts} paths`));
        return;
      }
      
      const path = paths[loadAttempts];
      loadAttempts++;
      
      const script = document.createElement('script');
      const fullPath = chrome.runtime.getURL(path);
      
      console.log(`Attempting to load Razorpay from: ${fullPath}`);
      script.src = fullPath;
      
      script.onload = () => {
        console.log(`Successfully loaded Razorpay from: ${fullPath}`);
        resolve();
      };
      
      script.onerror = () => {
        console.warn(`Failed to load Razorpay from: ${fullPath}, trying next path...`);
        tryNextPath();
      };
      
      document.head.appendChild(script);
    };
    
    // Start trying paths
    tryNextPath();
  });
}

// Function to verify the payment with the API
async function verifyPayment(paymentResponse, context) {
  const statusText = document.getElementById('status-text');
  
  try {
    console.log('Verifying payment:', paymentResponse);
    statusText.textContent = 'Verifying payment...';
    
    // Make sure we have the correct API URL and token
    if (!context.apiUrl || !context.token) {
      throw new Error('Missing API URL or authentication token');
    }
    
    const response = await fetch(`${context.apiUrl}/credits/verify-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${context.token}`
      },
      body: JSON.stringify({
        razorpay_payment_id: paymentResponse.razorpay_payment_id,
        razorpay_order_id: paymentResponse.razorpay_order_id,
        razorpay_signature: paymentResponse.razorpay_signature
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Verification failed: ${response.status} - ${errorText}`);
    }
    
    const verificationResult = await response.json();
    console.log('Payment verification successful:', verificationResult);
    statusText.textContent = 'Payment verified successfully!';
    
    // Notify the background script
    chrome.runtime.sendMessage({
      action: 'razorpayResult',
      success: true,
      verificationResult: verificationResult
    });
    
    // Close this window after a delay
    setTimeout(() => {
      window.close();
    }, 1000);
    
  } catch (error) {
    console.error('Verification error:', error);
    statusText.textContent = `Verification error: ${error.message}`;
    
    // Notify the background script
    chrome.runtime.sendMessage({
      action: 'razorpayResult',
      success: false,
      error: error.message
    });
  }
} 