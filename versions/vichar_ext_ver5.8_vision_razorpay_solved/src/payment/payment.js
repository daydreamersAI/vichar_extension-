// payment.js - Script for the payment popup window
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
    let paymentData = null;
  
    console.log("Payment page script loaded.");
  
    // --- Helper Functions ---
    function showLoading(message = 'Processing...') {
        if (loadingElement) loadingElement.style.display = 'flex';
        if (loadingTextElement) loadingTextElement.textContent = message;
        if (payButton) payButton.disabled = true;
        if (cancelButton) cancelButton.disabled = true; // Also disable cancel during processing
    }
  
    function hideLoading() {
        if (loadingElement) loadingElement.style.display = 'none';
        if (payButton) payButton.disabled = false;
        if (cancelButton) cancelButton.disabled = false;
    }
  
    function showStatus(message, type = 'info') {
        console.log(`Payment Status [${type}]: ${message}`);
        if (statusMessageElement) {
            statusMessageElement.textContent = message;
            statusMessageElement.className = `status-message ${type}`;
            statusMessageElement.style.display = 'block';
        }
        
        // Adjust buttons based on final state
        if (type === 'success' || type === 'error') {
             if (payButton) payButton.style.display = 'none'; // Hide pay button
             if (cancelButton) {
                  cancelButton.textContent = 'Close'; // Change cancel to close
                  cancelButton.disabled = false; // Ensure close is enabled
             }
        }
    }
  
    function showError(message) {
        showStatus(message, 'error');
    }
  
    function showSuccess(message) {
        showStatus(message, 'success');
    }
  
    // --- Initialize: Load payment data ---
    try {
        // First try to get payment data from session storage (new mechanism)
        const sessionResult = await chrome.storage.session.get(['paymentDataForPopup']);
        
        if (sessionResult.paymentDataForPopup) {
            console.log('Payment data loaded from session storage');
            paymentData = sessionResult.paymentDataForPopup;
            // Clear session storage after retrieving
            await chrome.storage.session.remove(['paymentDataForPopup']);
        } else {
            // Fallback to local storage (old mechanism)
            console.log('Session storage empty, trying local storage');
            const localResult = await chrome.storage.local.get(['paymentData']);
            
            if (localResult.paymentData) {
                console.log('Payment data loaded from local storage');
                paymentData = localResult.paymentData;
                // Clear local storage after retrieving
                await chrome.storage.local.remove(['paymentData']);
            }
        }
        
        if (paymentData) {
            console.log('Payment data loaded:', paymentData);
            
            // Display package info
            if (packageNameElement) packageNameElement.textContent = paymentData.packageName || 'Selected Package';
            if (creditsAmountElement) creditsAmountElement.textContent = `${paymentData.credits || '?'} Credits`;
            if (priceElement) {
                 const currencySymbol = paymentData.currency === 'INR' ? '₹' : '$';
                 const formattedAmount = (paymentData.amount / 100).toFixed(2);
                 priceElement.textContent = `${currencySymbol}${formattedAmount}`;
            }
        } else {
            throw new Error('Payment details not found. Please try again.');
        }
    } catch (error) {
        console.error("Initialization Error:", error);
        showError(error.message);
        if (payButton) payButton.disabled = true;
    }
  
    // --- Event Listeners ---
    if (payButton) {
        payButton.addEventListener('click', () => {
            if (!paymentData) {
                showError('Cannot proceed: Payment details missing.');
                return;
            }
            
            // Check if Razorpay is available
            if (typeof Razorpay === 'undefined') {
                showError('Payment gateway failed to load. Please try refreshing the page.');
                return;
            }
            
            initializeRazorpayCheckout(paymentData);
        });
    }
  
    if (cancelButton) {
        cancelButton.addEventListener('click', () => {
            window.close();
        });
    }
  
    // --- Direct Razorpay Integration ---
    function initializeRazorpayCheckout(data) {
        console.log('Initializing Razorpay checkout...');
        showLoading('Connecting to payment gateway...');
  
        try {
            // Validate required data
            if (!data.key_id || !data.order_id || !data.amount) {
                throw new Error('Missing required payment information.');
            }
  
            // Configure Razorpay
            const options = {
                key: data.key_id,
                amount: data.amount,
                currency: data.currency,
                name: 'Chess Analyzer',
                description: data.description,
                order_id: data.order_id,
                handler: function (response) {
                    console.log('Payment successful:', response);
                    showLoading('Verifying payment...');
  
                    // Send to background for verification
                    chrome.runtime.sendMessage({
                        action: "verifyPaymentFromPopup",
                        paymentResponse: {
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_signature: response.razorpay_signature
                        },
                        packageInfo: {
                            credits: data.credits,
                            name: data.packageName
                        },
                        popupId: data.popupId
                    }, 
                    (verificationResponse) => {
                         hideLoading();
                         if (chrome.runtime.lastError) {
                              console.error("Error sending verification to background:", chrome.runtime.lastError);
                              showError(`Verification error: ${chrome.runtime.lastError.message}`);
                              return;
                         }
                         
                         if (verificationResponse && verificationResponse.success) {
                              showSuccess('Payment successful! Credits added. This window will close shortly.');
                              // Window will be closed by background script
                         } else {
                              showError(`Payment verification failed: ${verificationResponse?.error || 'Unknown error'}`);
                         }
                    });
                },
                prefill: {
                    name: data.user_name || '',
                    email: data.user_email || ''
                },
                theme: {
                    color: '#4285F4'
                },
                modal: {
                    ondismiss: function() {
                        console.log('Checkout form closed');
                        hideLoading();
                        showStatus('Payment cancelled by user', 'info');
                    }
                }
            };
  
            // Create and open Razorpay instance
            const rzp = new Razorpay(options);
            rzp.on('payment.failed', function (response) {
                console.error('Payment failed:', response.error);
                hideLoading();
                showError(`Payment failed: ${response.error.description}`);
            });
            
            rzp.open();
            
        } catch (error) {
            console.error('Error initializing Razorpay:', error);
            hideLoading();
            showError(`Payment error: ${error.message}`);
        }
    }
  });