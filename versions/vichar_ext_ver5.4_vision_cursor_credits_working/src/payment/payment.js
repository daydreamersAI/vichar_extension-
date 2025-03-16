// Payment page script

// Get DOM elements
const packageNameElement = document.getElementById('package-name');
const creditsAmountElement = document.getElementById('credits-amount');
const priceElement = document.getElementById('price');
const payButton = document.getElementById('pay-button');
const cancelButton = document.getElementById('cancel-button');
const loadingElement = document.getElementById('loading');
const loadingTextElement = document.getElementById('loading-text');
const statusMessageElement = document.getElementById('status-message');

// Variables to store payment information
let paymentData = null;
let popupId = null;
let razorpayLoaded = false;

// Function to load Razorpay script dynamically
const loadRazorpayScript = () => {
  return new Promise((resolve, reject) => {
    // If already loaded, resolve immediately
    if (window.Razorpay) {
      razorpayLoaded = true;
      resolve();
      return;
    }
    
    try {
      // Create script element
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      
      // Handle script load events
      script.onload = () => {
        console.log('Razorpay script loaded successfully');
        razorpayLoaded = true;
        resolve();
      };
      
      script.onerror = (error) => {
        console.error('Error loading Razorpay script:', error);
        reject(new Error('Failed to load Razorpay script'));
      };
      
      // Append script to head
      document.head.appendChild(script);
    } catch (error) {
      console.error('Error creating script element:', error);
      reject(error);
    }
  });
};

// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
  // Get elements
  const packageNameElement = document.getElementById('package-name');
  const creditsAmountElement = document.getElementById('credits-amount');
  const priceElement = document.getElementById('price');
  const payButton = document.getElementById('pay-button');
  const cancelButton = document.getElementById('cancel-button');
  const loadingElement = document.getElementById('loading');
  const loadingTextElement = document.getElementById('loading-text');
  const statusMessageElement = document.getElementById('status-message');

  let paymentData = null;

  // Initialize the page with data passed from the content script
  chrome.storage.local.get(['paymentData'], (result) => {
    if (result.paymentData) {
      paymentData = result.paymentData;
      
      // Display package info
      packageNameElement.textContent = paymentData.packageName;
      creditsAmountElement.textContent = `${paymentData.credits} Credits`;
      priceElement.textContent = `₹${paymentData.amount / 100}`;
      
      console.log('Payment data loaded:', paymentData);
    } else {
      showError('No payment data found. Please try again.');
      console.error('No payment data found in storage');
    }
  });

  // Handle payment button click
  payButton.addEventListener('click', () => {
    if (!paymentData) {
      showError('Payment data not loaded. Please try again.');
      return;
    }
    
    initializeRazorpayCheckout(paymentData);
  });

  // Handle cancel button click
  cancelButton.addEventListener('click', () => {
    window.close();
  });

  // Initialize Razorpay checkout
  function initializeRazorpayCheckout(paymentData) {
    try {
      console.log('Initializing Razorpay checkout with:', paymentData);
      
      // Show loading indicator
      loadingElement.style.display = 'flex';
      loadingTextElement.textContent = 'Initializing payment...';
      
      // Check if Razorpay is defined
      if (typeof Razorpay === 'undefined') {
        throw new Error('Razorpay script not loaded. Please refresh and try again.');
      }

      // Validate required payment data
      if (!paymentData.key_id) {
        console.error('Missing key_id in payment data:', paymentData);
        throw new Error('Payment configuration error: Missing API key');
      }

      if (!paymentData.order_id) {
        console.error('Missing order_id in payment data:', paymentData);
        throw new Error('Payment configuration error: Missing order ID');
      }

      console.log('Creating Razorpay options with key:', paymentData.key_id);
      console.log('Order ID:', paymentData.order_id);
      
      // Razorpay options
      const options = {
        key: paymentData.key_id,
        amount: paymentData.amount,
        currency: paymentData.currency,
        name: 'Chess Analyzer',
        description: paymentData.description,
        order_id: paymentData.order_id,
        handler: function (response) {
          console.log('Payment successful:', response);
          verifyPayment(response, paymentData);
        },
        prefill: {
          name: paymentData.user_name || '',
          email: paymentData.user_email || '',
        },
        theme: {
          color: '#4285F4'
        },
        modal: {
          ondismiss: function() {
            console.log('Checkout form closed');
            hideLoading();
          }
        }
      };

      console.log('Razorpay options created:', options);
      const rzp = new Razorpay(options);
      
      rzp.on('payment.failed', function (response) {
        console.error('Payment failed:', response.error);
        showError(`Payment failed: ${response.error.description}`);
      });

      rzp.open();
      hideLoading();
      
    } catch (error) {
      console.error('Error initializing Razorpay:', error);
      showError(`Failed to initialize payment: ${error.message}`);
      hideLoading();
    }
  }

  // Verify payment with the server
  function verifyPayment(paymentResponse, paymentData) {
    showLoading('Verifying payment...');
    
    fetch(`${paymentData.apiUrl}/credits/verify-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${paymentData.token}`
      },
      body: JSON.stringify({
        razorpay_payment_id: paymentResponse.razorpay_payment_id,
        razorpay_order_id: paymentResponse.razorpay_order_id,
        razorpay_signature: paymentResponse.razorpay_signature
      })
    })
    .then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          throw new Error(`Failed to verify payment: ${text}`);
        });
      }
      return response.json();
    })
    .then(data => {
      console.log('Payment verified:', data);
      showSuccess('Payment successful! Credits have been added to your account.');
      
      // Notify the content script that payment was successful
      chrome.runtime.sendMessage({
        action: 'paymentComplete',
        success: true,
        credits: paymentData.credits
      });
      
      // Close the window after a delay
      setTimeout(() => {
        window.close();
      }, 3000);
    })
    .catch(error => {
      console.error('Error verifying payment:', error);
      showError(`Verification failed: ${error.message}`);
      
      // Notify the content script that payment failed
      chrome.runtime.sendMessage({
        action: 'paymentComplete',
        success: false,
        error: error.message
      });
    })
    .finally(() => {
      hideLoading();
    });
  }

  // Helper functions
  function showLoading(message) {
    loadingElement.style.display = 'flex';
    loadingTextElement.textContent = message || 'Processing...';
  }

  function hideLoading() {
    loadingElement.style.display = 'none';
  }

  function showSuccess(message) {
    statusMessageElement.textContent = message;
    statusMessageElement.className = 'status-message success';
    statusMessageElement.style.display = 'block';
  }

  function showError(message) {
    statusMessageElement.textContent = message;
    statusMessageElement.className = 'status-message error';
    statusMessageElement.style.display = 'block';
  }
}); 