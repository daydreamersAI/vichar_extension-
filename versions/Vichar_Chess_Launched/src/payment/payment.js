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
            
            initializeRazorpayCheckout(paymentData);
        });
    }
  
    if (cancelButton) {
        cancelButton.addEventListener('click', () => {
            window.close();
        });
    }
  
    // --- Using Background Script as Bridge for Razorpay ---
    function initializeRazorpayCheckout(data) {
        console.log('Initializing Razorpay checkout via background script...');
        showLoading('Connecting to payment gateway...');
  
        try {
            // Validate required data
            if (!data.key_id || !data.order_id || !data.amount) {
                throw new Error('Missing required payment information.');
            }
            
            // Configure Razorpay through the background script
            const options = {
                key: data.key_id,
                amount: data.amount,
                currency: data.currency,
                name: 'Chess Analyzer',
                description: data.description,
                order_id: data.order_id,
                prefill: {
                    name: data.user_name || '',
                    email: data.user_email || ''
                },
                theme: {
                    color: '#4285F4'
                },
                handler: function(response) {
                    // This handler will be called in the background script context
                    // We'll use a message listener to catch the response
                }
            };
            
            // Request the background page to handle the Razorpay checkout
            chrome.runtime.sendMessage({
                action: "handleRazorpayCheckout",
                options: options,
                popupId: data.popupId,
                packageInfo: {
                    credits: data.credits,
                    name: data.packageName
                }
            });
            
            // Set up listener for verification result
            chrome.runtime.onMessage.addListener(function paymentListener(message) {
                if (message.action === "paymentResult") {
                    // Remove this listener once we've received a result
                    chrome.runtime.onMessage.removeListener(paymentListener);
                    
                    hideLoading();
                    
                    if (message.success) {
                        showSuccess('Payment successful! Credits added. This window will close shortly.');
                        // The background script will close this window after a delay
                    } else {
                        if (message.cancelled) {
                            showStatus('Payment cancelled by user', 'info');
                        } else {
                            showError(`Payment failed: ${message.error || 'Unknown error'}`);
                        }
                    }
                }
            });
            
        } catch (error) {
            console.error('Error initializing Razorpay:', error);
            hideLoading();
            showError(`Payment error: ${error.message}`);
        }
    }
  });