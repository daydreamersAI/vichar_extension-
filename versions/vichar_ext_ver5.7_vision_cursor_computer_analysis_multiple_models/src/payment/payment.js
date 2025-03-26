// payment.js - Script for the payment popup window (payment.html)

document.addEventListener('DOMContentLoaded', async () => {
  // --- Get DOM Elements ---
  const packageNameElement = document.getElementById('package-name');
  const creditsAmountElement = document.getElementById('credits-amount');
  const priceElement = document.getElementById('price');
  const payButton = document.getElementById('pay-button');
  const cancelButton = document.getElementById('cancel-button');
  const loadingElement = document.getElementById('loading');
  const loadingTextElement = document.getElementById('loading-text');
  const statusMessageElement = document.getElementById('status-message');

  // --- State ---
  // Holds { key_id, order_id, amount, currency, description, packageName, credits, apiUrl, token, popupId, user_name }
  let paymentContext = null;

  console.log("Payment page script loaded.");

  // --- Helper Functions ---
  function showLoading(message = 'Processing...') {
      if (loadingElement) loadingElement.style.display = 'flex';
      if (loadingTextElement) loadingTextElement.textContent = message;
      if (payButton) payButton.disabled = true;
      if (cancelButton) cancelButton.disabled = true; // Disable cancel during critical processing
  }

  function hideLoading() {
      if (loadingElement) loadingElement.style.display = 'none';
      if (payButton) payButton.disabled = false;
      if (cancelButton) cancelButton.disabled = false;
  }

  function showStatus(message, type = 'info') {
      console.log(`Payment Popup Status [${type}]: ${message}`);
      if (statusMessageElement) {
          statusMessageElement.textContent = message;
          // Apply appropriate class based on type
          statusMessageElement.className = `status-message ${type}`;
          statusMessageElement.style.display = 'block';
      } else {
          // Fallback if element not found (shouldn't happen)
          alert(`[${type}] ${message}`);
      }
      // Adjust buttons based on final state
      if (type === 'success' || type === 'error') {
           if (payButton) payButton.style.display = 'none'; // Hide pay button on completion/error
           if (cancelButton) {
                cancelButton.textContent = 'Close'; // Change cancel to close
                cancelButton.disabled = false; // Ensure close button is always enabled
           }
      }
  }

  function showError(message) {
      showStatus(message, 'error');
  }

  function showSuccess(message) {
      showStatus(message, 'success');
  }

  // --- Initialization: Load Payment Context ---
  try {
      // Retrieve data stored by background script using session storage (clears automatically)
      const result = await chrome.storage.session.get(['paymentDataForPopup']);
      if (result.paymentDataForPopup) {
          paymentContext = result.paymentDataForPopup;
          console.log('Payment context loaded:', paymentContext);

          // Clear the temporary data immediately after retrieving it
          await chrome.storage.session.remove(['paymentDataForPopup']);
          console.log('Payment context cleared from session storage.');

          // --- Display Package Info in the UI ---
          if (packageNameElement) packageNameElement.textContent = paymentContext.packageName || 'Selected Package';
          if (creditsAmountElement) creditsAmountElement.textContent = `${paymentContext.credits || '?'} Credits`;
          if (priceElement) {
               const currencySymbol = paymentContext.currency === 'INR' ? '₹' : '$'; // Basic symbol handling
               const formattedAmount = (paymentContext.amount / 100).toFixed(2);
               priceElement.textContent = `${currencySymbol}${formattedAmount}`;
          }

      } else {
          // This should ideally not happen if the popup is opened correctly
          throw new Error('Payment details not found. This window may have been opened incorrectly. Please close it and try buying credits again.');
      }
  } catch (error) {
      console.error("Initialization Error:", error);
      showError(error.message);
      if (payButton) payButton.disabled = true; // Disable pay if context is missing
  }

  // --- Event Listeners ---
  if (payButton) {
      payButton.addEventListener('click', () => {
          if (!paymentContext) {
              showError('Cannot proceed: Payment details missing.');
              return;
          }
          // Check if Razorpay script is loaded (it's included in payment.html)
          if (typeof Razorpay === 'undefined') {
              showError('Payment gateway (Razorpay) failed to load. Please check your internet connection or refresh the extension.');
              // Optionally try to reload the script here if needed
              return;
          }
          initializeRazorpayCheckout(paymentContext);
      });
  }

  if (cancelButton) {
      cancelButton.addEventListener('click', () => {
          console.log("Payment action cancelled/window closed by user.");
          // No verification needed, just close the window
          window.close();
      });
  }

  // --- Razorpay Checkout Initialization ---
  function initializeRazorpayCheckout(context) {
      if (!context) {
           console.error("initializeRazorpayCheckout called without context.");
           return;
      }
      console.log('Initializing Razorpay checkout...');
      showLoading('Redirecting to payment gateway...'); // Update loading text

      try {
          // --- Validate essential context data ---
          if (!context.key_id) throw new Error('Missing Razorpay Key ID.');
          if (!context.order_id) throw new Error('Missing Order ID.');
          if (!context.amount) throw new Error('Missing Payment Amount.');
          if (!context.currency) throw new Error('Missing Payment Currency.');
          if (!context.description) throw new Error('Missing Payment Description.');
          if (!context.token) throw new Error('Missing Auth Token for verification.'); // Crucial for backend verification
          if (!context.apiUrl) throw new Error('Missing API URL for verification.');
          if (!context.credits) throw new Error('Missing Credits info.');
          if (!context.popupId) throw new Error('Missing Popup ID.');


          // --- Razorpay Options ---
          const options = {
              key: context.key_id,
              amount: context.amount, // Amount in paise/cents
              currency: context.currency,
              name: 'Chess Analyzer Credits', // Your Brand Name
              description: context.description, // e.g., "Standard Pack (300 Credits)"
              order_id: context.order_id, // Order ID obtained from your backend
              handler: function (response) {
                  // --- Payment Success Callback (Client-Side) ---
                  console.log('Razorpay payment successful (client-side):', response);
                  // **IMPORTANT**: DO NOT grant credits here. Send to background for server verification.
                  showLoading('Verifying payment with server...');

                  // Send necessary data to background script for verification
                  chrome.runtime.sendMessage({
                      action: "verifyPaymentFromPopup",
                      paymentResponse: { // Data from Razorpay
                          razorpay_payment_id: response.razorpay_payment_id,
                          razorpay_order_id: response.razorpay_order_id,
                          razorpay_signature: response.razorpay_signature
                      },
                      packageInfo: { // Context for background/content script notification
                          credits: context.credits,
                          name: context.packageName
                      },
                      popupId: context.popupId // Allow background to close this window
                  },
                  (verificationResponse) => {
                       // This callback receives the response from the background script's verification attempt
                       hideLoading(); // Hide loading once verification response is back
                       if (chrome.runtime.lastError) {
                            console.error("Error communicating with background for verification:", chrome.runtime.lastError.message);
                            showError(`Verification failed: ${chrome.runtime.lastError.message}`);
                       } else if (verificationResponse && verificationResponse.success) {
                            console.log("Verification successful response received from background.");
                            showSuccess('Payment Verified! Credits added. This window will close shortly.');
                            // Background script handles closing the window now
                       } else {
                            console.error("Verification failed response received from background:", verificationResponse?.error);
                            showError(`Payment Verification Failed: ${verificationResponse?.error || 'Unknown backend error'}`);
                       }
                  });
              },
              prefill: {
                  // Prefill user details if available
                  name: context.user_name || '',
                  // email: context.user_email || '', // Add if collected/available
                  // contact: ''
              },
              theme: {
                  color: '#4285F4' // Theme color
              },
              modal: {
                  escape: true, // Allow closing modal with Esc key
                  ondismiss: function() {
                      console.log('Razorpay checkout form dismissed by user.');
                      hideLoading(); // Hide loading indicator if user cancels
                      showStatus('Payment cancelled.', 'info');
                      // Do not close window immediately, let user see status/close manually
                  }
              }
          };

          // --- Create and Open Razorpay Instance ---
          console.log('Creating Razorpay instance...');
          const rzpInstance = new Razorpay(options);

          // Optional: Handle payment failure event from Razorpay
          rzpInstance.on('payment.failed', function (response) {
              console.error('Razorpay payment.failed event:', response.error);
              // response.error contains code, description, source, step, reason, metadata.order_id, metadata.payment_id
              showError(`Payment Failed: ${response.error.description || response.error.reason || 'Please try again'}`);
              hideLoading();
          });

          console.log('Opening Razorpay checkout...');
          rzpInstance.open();
          // Do *not* hide loading here - wait for handler, failed event, or dismiss

      } catch (error) {
          console.error('Error initializing or opening Razorpay checkout:', error);
          showError(`Payment Initialization Error: ${error.message}`);
          hideLoading(); // Hide loading on setup error
      }
  }

}); // End DOMContentLoaded