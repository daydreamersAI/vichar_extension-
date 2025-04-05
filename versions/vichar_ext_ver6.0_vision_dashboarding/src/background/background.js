// Import the script injector functionality
// Ensure the path is correct relative to your background script location
import { injectCaptureScript } from './scriptInjector.js';

// Define our own tracking function 
function trackEvent(eventName, properties = {}) {
  console.log(`[Analytics] Background tracked: ${eventName}`, properties);
  
  // Attempt to send to PostHog API directly if needed
  try {
    const API_KEY = 'phc_adv1CiTCnHjOooqSr6WC7qFCADeuv4SFJasGXKiRmAe';
    const API_HOST = 'https://us.posthog.com';
    
    const payload = {
      api_key: API_KEY,
      event: eventName,
      properties: {
        ...properties,
        $lib: 'chess-extension-background',
        distinct_id: properties.user_id || 'anonymous'
      },
      timestamp: new Date().toISOString()
    };
    
    // Use the connect-src permission to send data
    fetch(`${API_HOST}/capture/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }).catch(err => {
      console.warn('[PostHog] Failed to send event:', err);
    });
  } catch (err) {
    console.warn('Error tracking event:', err);
  }
}

// API configuration
const API_URL = "https://api.beekayprecision.com"; // Use HTTPS

// Initialize the background script
console.log("Background script initialized (v2 - Model Selection)");

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Log incoming messages with more detail
    const senderType = sender.tab ? `tab ${sender.tab.id}` : (sender.url?.includes('popup.html') ? 'popup' : (sender.url?.includes('payment.html') ? 'payment_popup' : 'other_extension_page'));
    console.log(`Background received message: ${request.action} from ${senderType}`, request);

    let isAsync = false; // Flag to indicate if sendResponse will be called asynchronously

    switch (request.action) {

        // --- Board Capture Actions ---

        case "captureBoard": // Used by popup for "Capture & Open in New Tab"
            console.log("Received captureBoard request for tab:", request.tabId);
            isAsync = true;
            (async () => {
                try {
                    let targetTabId = request.tabId;
                    if (!targetTabId) { // Fallback to active tab if not specified
                        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                        if (activeTab) targetTabId = activeTab.id;
                        else throw new Error("No active tab found");
                    }
                    console.log("Targeting tab for capture (new tab analysis):", targetTabId);

                    // injectCaptureScript handles injection, capture, and saving to storage['capturedBoard']
                    const result = await injectCaptureScript(targetTabId);
                    console.log("Capture result (for new tab):", result);
                    sendResponse(result); // Send success/failure back to popup

                } catch (error) {
                    console.error("Error in captureBoard process:", error);
                    sendResponse({ success: false, error: error.message });
                }
            })();
            break;

        case "captureBoardForSidebar": // Used by content script's sidebar capture button
            console.log("Received captureBoardForSidebar request");
            isAsync = true;
            (async () => {
                try {
                    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (!activeTab) throw new Error("No active tab found");
                    const tabId = activeTab.id;
                    console.log("Targeting active tab for sidebar capture:", tabId);

                    // injectCaptureScript handles capture and saving to storage
                    const result = await injectCaptureScript(tabId);
                    console.log("Capture result (for sidebar):", result);

                    // If capture succeeded, notify the content script to update its UI
                    if (result.success) {
                        try {
                            // Use promise wrapper for reliable error handling with sendMessage
                            await new Promise((resolve, reject) => {
                                chrome.tabs.sendMessage(tabId, { action: "updateSidebarImage" }, (response) => {
                                    if (chrome.runtime.lastError) {
                                        // Log error but don't fail the overall process, capture still worked
                                        console.error(`Error sending updateSidebarImage: ${chrome.runtime.lastError.message}`);
                                        resolve({ success: false, error: chrome.runtime.lastError.message });
                                    } else {
                                        console.log("updateSidebarImage acknowledged by content script:", response);
                                        resolve(response);
                                    }
                                });
                            });
                        } catch (msgError) {
                            // Catch potential errors from the promise wrapper itself
                             console.error("Caught error trying to send updateSidebarImage:", msgError);
                        }
                    }
                    sendResponse(result); // Respond to the content script about capture success/fail

                } catch (error) {
                    console.error("Error in captureBoardForSidebar process:", error);
                    sendResponse({ success: false, error: error.message });
                }
            })();
            break;

        // --- Sidebar Interaction ---

        case "showSidebar": // Used by popup to request sidebar opening
            console.log("Received showSidebar request");
            isAsync = true;
            (async () => {
                try {
                    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (!activeTab) throw new Error("No active tab found");
                    const tabId = activeTab.id;
                    
                    // First check if content script is already running with a ping
                    try {
                        await new Promise((resolve, reject) => {
                            // Try sending a ping message with a short timeout
                            const timeoutId = setTimeout(() => {
                                reject(new Error("Content script ping timed out"));
                            }, 300);
                            
                            chrome.tabs.sendMessage(tabId, { action: "ping" }, (response) => {
                                clearTimeout(timeoutId);
                                if (chrome.runtime.lastError) {
                                    reject(new Error(chrome.runtime.lastError.message));
                                } else {
                                    console.log("Content script ping successful:", response);
                                    resolve(response);
                                }
                            });
                        });
                        
                        // If we reach here, ping was successful - content script is loaded
                        console.log("Content script is already running, showing sidebar directly");
                    } catch (pingError) {
                        // Content script not running, inject it
                        console.log("Content script not detected, injecting now:", pingError.message);
                        
                        await chrome.scripting.executeScript({
                            target: { tabId: tabId },
                            files: ["src/content/content-script.js"]
                        });
                        
                        // Wait a moment for script to initialize
                        console.log("Content script injected, waiting for initialization...");
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }

                    // Now try to show the sidebar
                    await new Promise((resolve, reject) => {
                        chrome.tabs.sendMessage(tabId, { action: "showSidebar" }, (response) => {
                            if (chrome.runtime.lastError) {
                                reject(new Error(chrome.runtime.lastError.message || "Cannot connect to content script"));
                            } else if (response && response.success) {
                                resolve(response);
                            } else {
                                reject(new Error(response?.message || "Content script failed to show sidebar"));
                            }
                        });
                    });
                    sendResponse({ success: true }); // Success back to popup

                } catch (error) {
                    console.error("Error sending showSidebar message:", error);
                    sendResponse({ success: false, error: error.message });
                }
            })();
            break;

        // --- Analysis ---

        case "analyzeChessPosition": // Used by content script's sidebar "Ask" button
            console.log("Received analyzeChessPosition request");
            isAsync = true;
            (async () => {
                try {
                    // Destructure request, now including the 'model'
                    const { question, capturedBoard, useVision, chatHistory, model } = request;

                    console.log("Analysis Request Details:", {
                        model: model || "Default", // Log the requested model
                        fen: capturedBoard?.fen,
                        useVision,
                        historyLength: chatHistory?.length || 0
                    });

                    // Basic validation
                    if (!question || !capturedBoard?.fen) {
                        throw new Error("Missing required data for analysis (question or FEN).");
                    }
                    
                    // Track analysis request
                    trackEvent('chess_analysis_requested', {
                        model: model || "Default",
                        use_vision: useVision,
                        has_history: chatHistory?.length > 0
                    });

                    // Prepare image data if needed
                    let imageDataBase64 = null;
                    if (useVision && capturedBoard.imageData) {
                        if (capturedBoard.imageData.startsWith('data:image/')) {
                            imageDataBase64 = capturedBoard.imageData.split(',')[1];
                        } else {
                            imageDataBase64 = capturedBoard.imageData; // Assume it's already base64
                        }
                        console.log(`Including image data (approx length: ${imageDataBase64.length})`);
                    }

                    // Get auth token
                    const { auth_token: token } = await chrome.storage.local.get(['auth_token']);
                    if (!token) {
                        throw new Error("Authentication required. Please log in.");
                    }

                    console.log(`Calling backend analysis with model: ${model || 'Default'}`);

                    // Call the backend endpoint that handles credits and model dispatching
                    const response = await fetch(`${API_URL}/analysis-with-credit`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            question: question,
                            fen: capturedBoard.fen,
                            pgn: capturedBoard.pgn || "",
                            image_data: imageDataBase64, // Send base64 string or null
                            chat_history: chatHistory || [],
                            model: model, // *** Pass the selected model ID ***
                            use_vision: useVision
                        })
                    });

                    console.log("Backend analysis response status:", response.status);

                    // Handle non-OK responses cleanly
                    if (!response.ok) {
                        let errorDetail = `API Error: ${response.status}`;
                        let errorCode = `HTTP_${response.status}`;
                        
                        try {
                            // For 422 errors, we need more detailed information
                            if (response.status === 422) {
                                console.log("Received 422 Unprocessable Entity error - attempting to get detailed error info");
                                const errorJson = await response.json();
                                console.error("422 Error response:", JSON.stringify(errorJson, null, 2));
                                
                                // Extract useful details for debugging
                                errorDetail = errorJson.detail || "Validation error with request data";
                                
                                // If the API returns specific validation errors, include them
                                if (errorJson.validation_errors) {
                                    const validationErrors = Array.isArray(errorJson.validation_errors) 
                                        ? errorJson.validation_errors.join(', ')
                                        : JSON.stringify(errorJson.validation_errors);
                                    errorDetail += `: ${validationErrors}`;
                                }
                                
                                errorCode = "VALIDATION_ERROR";
                            } else {
                                // Handle other error types
                                const errorJson = await response.json();
                                errorDetail = errorJson.detail || errorDetail;
                                if (response.status === 401) errorCode = "AUTH_REQUIRED";
                                if (response.status === 402) errorCode = "INSUFFICIENT_CREDITS";
                            }
                        } catch (e) {
                            console.error("Error parsing error response:", e);
                        }
                        
                        console.error("Backend analysis error:", errorDetail);
                        
                        // Send structured error back to content script
                        sendResponse({ 
                            success: false, 
                            error: errorDetail, 
                            errorCode: errorCode,
                            requestData: {
                                model: model,
                                useVision: useVision,
                                hasHistory: chatHistory && chatHistory.length > 0,
                                hasFen: !!capturedBoard.fen,
                                hasImageData: !!imageDataBase64
                            }
                        });
                        return;
                    }

                    // Process successful response
                    const data = await response.json();
                    console.log("Backend analysis successful.");

                    if (!data.response) { // Ensure 'response' field exists
                        throw new Error("Invalid API response format - missing 'response' field");
                    }

                    // Track analysis completion
                    trackEvent('chess_analysis_completed', {
                        model: model || "Default",
                        success: true
                    });
                    
                    sendResponse({
                        success: true,
                        data: data.response,
                        credits: data.credits // Pass the {used, remaining} object
                    });

                } catch (error) {
                    console.error("Error in analyzeChessPosition handler:", error);
                    
                    // Track analysis failure
                    trackEvent('chess_analysis_failed', {
                        model: model || "Default",
                        error_type: error.message
                    });
                    
                    // Format the error message for the UI
                    const errorMsg = formatErrorMessage(error);
                    sendResponse({
                        success: false,
                        error: errorMsg
                    });
                }
            })();
            break;

        // --- Payment Flow ---

        case "openPaymentPopup": // Used by popup 'Buy Credits'
             console.log("Received openPaymentPopup request");
             isAsync = true;
             (async () => {
                 try {
                     // Optional: Get user info for prefill
                     const userInfo = await chrome.storage.local.get(['user_name', 'user_email']);

                     // Create the popup window
                     const popupWindow = await chrome.windows.create({
                         url: chrome.runtime.getURL('src/payment/payment.html'),
                         type: 'popup',
                         width: 500,
                         height: 650
                     });

                     if (!popupWindow || !popupWindow.id) {
                          throw new Error("Failed to create payment popup window.");
                     }

                     // Prepare data needed by payment.js (retrieved from session storage there)
                     const paymentDataForPopup = {
                         // Order details from backend response passed in request.orderData
                         key_id: request.orderData.razorpay_key_id,
                         order_id: request.orderData.razorpay_order_id,
                         amount: request.orderData.amount,
                         currency: request.orderData.currency,
                         description: request.orderData.description,
                         // Package context passed in request.packageInfo
                         packageName: request.packageInfo.name,
                         credits: request.packageInfo.credits,
                         // Context for verification callback
                         apiUrl: API_URL,
                         token: request.token, // User's auth token for verification
                         popupId: popupWindow.id, // ID to allow closing the window later
                         // Prefill info
                         user_name: userInfo?.user_name || '',
                         user_email: userInfo?.user_email || ''
                     };

                     // Store data temporarily using both session storage (for newer mechanism) and local storage (for backward compatibility)
                     await chrome.storage.session.set({ 'paymentDataForPopup': paymentDataForPopup });
                     await chrome.storage.local.set({ 'paymentData': paymentDataForPopup });
                     
                     // Also store payment data specifically for verification later
                     await chrome.storage.local.set({ 'payment_data': { 
                         packageInfo: request.packageInfo 
                     }});
                     
                     console.log("Payment context stored in session and local storage for popup ID:", popupWindow.id);

                     sendResponse({ success: true, popupId: popupWindow.id }); // Respond to popup

                 } catch (error) {
                     console.error("Error creating payment popup:", error);
                     sendResponse({ success: false, error: error.message });
                 }
             })();
             break;

        case "createPaymentOrder": // Received from popup to create an order
            console.log("Received createPaymentOrder request");
            isAsync = true;
            (async () => {
                try {
                    // Get the authentication token
                    const { auth_token: token } = await chrome.storage.local.get(['auth_token']);
                    if (!token) {
                        sendResponse({ success: false, error: "Authentication required" });
                        return;
                    }

                    // First try with the /payments/create-order endpoint (v5.4 method)
                    try {
                        console.log("Trying order creation with /payments/create-order endpoint");
                        const response = await fetch(`${API_URL}/payments/create-order`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                package: request.packageInfo.id
                            })
                        });

                        // If this succeeds, use it
                        if (response.ok) {
                            const orderData = await response.json();
                            console.log("Order created successfully with /payments/create-order endpoint:", orderData);
                            
                            // Add the token to the order data for later use
                            orderData.token = token;

                            // Send back the order data to the popup
                            sendResponse({ 
                                success: true, 
                                orderData: orderData,
                                packageInfo: request.packageInfo
                            });
                            return;
                        } else {
                            // If it fails with a 404 (not found), try the /credits/ endpoint
                            if (response.status === 404) {
                                throw new Error("Endpoint not found, trying alternative");
                            } else {
                                const errorText = await response.text();
                                console.error("Create order API error:", errorText);
                                throw new Error(`Failed to create order: ${response.status}`);
                            }
                        }
                    } catch (firstError) {
                        // If the first attempt fails, try with the /credits/create-order endpoint (v5.8 method)
                        console.log("First order creation attempt failed, trying with /credits/create-order endpoint:", firstError.message);
                        
                        const response = await fetch(`${API_URL}/credits/create-order`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                package: request.packageInfo.id
                            })
                        });

                        // Handle API errors
                        if (!response.ok) {
                            const errorText = await response.text();
                            console.error("Create order API error (fallback):", errorText);
                            sendResponse({ success: false, error: `Failed to create order: ${response.status}` });
                            return;
                        }

                        // Process the order data
                        const orderData = await response.json();
                        console.log("Order created successfully with /credits/create-order endpoint:", orderData);

                        // Add the token to the order data for later use
                        orderData.token = token;

                        // Send back the order data to the popup
                        sendResponse({ 
                            success: true, 
                            orderData: orderData,
                            packageInfo: request.packageInfo
                        });
                    }
                } catch (error) {
                    console.error("Error creating payment order:", error);
                    sendResponse({ success: false, error: error.message });
                }
            })();
            break;

        case "verifyPaymentFromPopup": // Received FROM payment.js after Razorpay success
             console.log("Received verifyPaymentFromPopup request");
             isAsync = true;
             (async () => {
                 let verificationSuccess = false;
                 let verificationResult = {};
                 let errorMsg = "Verification failed.";

                 try {
                     const storageData = await chrome.storage.local.get(['auth_token', 'payment_data']);
                     const token = storageData.auth_token;
                     const paymentData = storageData.payment_data;
                     
                     if (!token) throw new Error("Authentication token not found.");

                     const { paymentResponse, packageInfo } = request;
                     if (!paymentResponse?.razorpay_payment_id || !paymentResponse?.razorpay_order_id || !paymentResponse?.razorpay_signature) {
                         throw new Error("Incomplete payment response from popup.");
                     }
                     if (!packageInfo?.credits) {
                         throw new Error("Missing package info (credits) from popup.");
                     }

                     // First try with the /payments/verify-payment endpoint (v5.4 method)
                     try {
                         console.log("Trying payment verification with /payments/verify-payment endpoint");
                         const response = await fetch(`${API_URL}/payments/verify-payment`, {
                             method: 'POST',
                             headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                             body: JSON.stringify({
                                 razorpay_payment_id: paymentResponse.razorpay_payment_id,
                                 razorpay_order_id: paymentResponse.razorpay_order_id,
                                 razorpay_signature: paymentResponse.razorpay_signature
                             })
                         });

                         // If this succeeds, use it
                         if (response.ok) {
                             verificationResult = await response.json();
                             console.log("Payment verification successful using /payments/verify-payment endpoint:", verificationResult);
                             verificationSuccess = true;
                         } else {
                             // If it fails with a 404 (not found), try the /credits/ endpoint
                             if (response.status === 404) {
                                 throw new Error("Endpoint not found, trying alternative");
                             } else {
                                 // For other errors, get error details and throw
                                 let detail = `Verification API Error: ${response.status}`;
                                 try { detail = (await response.json()).detail || detail; } catch(e){}
                                 throw new Error(detail);
                             }
                         }
                     } catch (firstError) {
                         // If the first attempt fails, try with the /credits/verify-payment endpoint (v5.8 method)
                         console.log("First verification attempt failed, trying with /credits/verify-payment endpoint:", firstError.message);
                         
                         const response = await fetch(`${API_URL}/credits/verify-payment`, {
                             method: 'POST',
                             headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                             body: JSON.stringify({
                                 razorpay_payment_id: paymentResponse.razorpay_payment_id,
                                 razorpay_order_id: paymentResponse.razorpay_order_id,
                                 razorpay_signature: paymentResponse.razorpay_signature
                             })
                         });

                         if (!response.ok) {
                             let detail = `Verification API Error: ${response.status}`;
                             try { detail = (await response.json()).detail || detail; } catch(e){}
                             throw new Error(detail);
                         }

                         verificationResult = await response.json();
                         console.log("Payment verification successful using /credits/verify-payment endpoint:", verificationResult);
                         verificationSuccess = true;
                     }

                     // Send success message back to the popup
                     sendResponse({ success: true, verificationData: verificationResult });

                 } catch (error) {
                     console.error("Error during payment verification:", error);
                     errorMsg = error.message;
                     // Send failure message back to the popup
                     sendResponse({ success: false, error: errorMsg });
                 }

                 // --- Notify Content Script (Regardless of verification success/failure for UI update) ---
                 try {
                     const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                     if (activeTab && activeTab.id) {
                         const messageToSend = verificationSuccess
                             ? {
                                   action: "paymentCompleted",
                                   success: true,
                                   creditsAdded: verificationResult.credits_added || request.packageInfo.credits, // Use verified amount or fallback
                                   currentBalance: verificationResult.current_balance
                               }
                             : { action: "paymentCompleted", success: false, error: errorMsg };

                         await new Promise((resolve, reject) => {
                              chrome.tabs.sendMessage(activeTab.id, messageToSend, (response) => {
                                   if (chrome.runtime.lastError) {
                                        console.error(`Error notifying content script: ${chrome.runtime.lastError.message}`);
                                        // Don't reject, just log
                                        resolve();
                                   } else {
                                        console.log("Content script notified of payment result.");
                                        resolve();
                                   }
                              });
                         });
                     } else {
                          console.log("No active tab found to notify about payment completion.");
                     }
                 } catch(notifyError) {
                      console.error("Error trying to notify content script:", notifyError);
                 }

                 // --- Close Popup Window ---
                 if (request.popupId) {
                      const delay = verificationSuccess ? 3000 : 5000; // Shorter delay for success
                      setTimeout(() => {
                          chrome.windows.remove(request.popupId)
                              .then(() => console.log("Payment popup closed."))
                              .catch(err => console.error("Error closing popup:", err.message)); // Log error but don't crash
                      }, delay);
                 }

             })();
             break;

        // Support for direct Razorpay loading in content scripts (avoiding CSP issues)
        case "loadRazorpayCheckout":
            console.log("Loading Razorpay checkout from background script");
            isAsync = true;
            (async () => {
                try {
                    // Get the current active tab
                    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    
                    if (!activeTab) {
                        sendResponse({ success: false, error: "No active tab found" });
                        return;
                    }
                    
                    const tabId = activeTab.id;
                    const options = request.options;
                    
                    // Inject a script to create Razorpay checkout
                    await chrome.scripting.executeScript({
                        target: { tabId },
                        func: injectRazorpayCheckout,
                        args: [options]
                    });
                    
                    sendResponse({ success: true });
                } catch (error) {
                    console.error("Error loading Razorpay:", error);
                    sendResponse({ success: false, error: error.message });
                }
            })();
            return true;

        // New handler for payment popup Razorpay integration
        case "handleRazorpayCheckout":
            console.log("Handling Razorpay checkout via background script bridge");
            isAsync = true;
            (async () => {
                try {
                    // Service workers don't have access to document, so we can't create iframes
                    // Instead, we'll create a new popup window with Razorpay directly loaded
                    
                    // First get the authentication token
                    const tokenResult = await chrome.storage.local.get(['auth_token']);
                    const token = tokenResult.auth_token;
                    
                    if (!token) {
                        throw new Error('Authentication token not found');
                    }
                    
                    // Store the Razorpay options in session storage for the bridge page to use
                    await chrome.storage.session.set({
                        'razorpayOptions': request.options,
                        'razorpayContext': {
                            popupId: request.popupId,
                            packageInfo: request.packageInfo,
                            token: token,
                            apiUrl: API_URL
                        }
                    });
                    
                    // Create a new window that will load Razorpay directly
                    const razorpayPopup = await chrome.windows.create({
                        url: chrome.runtime.getURL('src/payment/razorpay-bridge.html'),
                        type: 'popup',
                        width: 450,
                        height: 600
                    });
                    
                    console.log("Created Razorpay bridge popup with ID:", razorpayPopup.id);
                    
                } catch (error) {
                    console.error("Error in handleRazorpayCheckout:", error);
                    
                    // Notify the payment popup of the error
                    await chrome.runtime.sendMessage({
                        action: "paymentResult",
                        success: false,
                        error: error.message
                    });
                }
            })();
            return true;

        // Handle Razorpay result from the bridge page
        case "razorpayResult":
            console.log("Received Razorpay result:", request.success ? "success" : "failure");
            isAsync = true;
            (async () => {
                try {
                    // Get the context info from session storage
                    const sessionData = await chrome.storage.session.get(['razorpayContext']);
                    const context = sessionData.razorpayContext;
                    
                    if (!context) {
                        console.error("Missing razorpayContext in session storage");
                        return;
                    }
                    
                    // Forward the result to the payment popup
                    await chrome.runtime.sendMessage({
                        action: "paymentResult",
                        success: request.success,
                        cancelled: request.cancelled || false,
                        error: request.error || null
                    });
                    
                    // If payment was successful, close the payment popup after a delay
                    if (request.success && context.popupId) {
                        setTimeout(() => {
                            chrome.windows.remove(context.popupId).catch(err => {
                                console.error("Error closing payment popup:", err);
                            });
                        }, 3000); // 3 seconds
                    }
                    
                    // Clean up
                    await chrome.storage.session.remove(['razorpayOptions', 'razorpayContext']);
                    
                } catch (error) {
                    console.error("Error handling Razorpay result:", error);
                }
            })();
            return true;

        default:
            console.log("Background received unknown message action:", request.action);
            // Optionally send a response for unhandled actions
            // sendResponse({ success: false, error: "Unknown action" });
            break;
    }

    // Return true if sendResponse will be called asynchronously
    return isAsync;
});


// --- Utility Functions ---

// Function to be injected into the page to create Razorpay checkout
function injectRazorpayCheckout(options) {
    // We need to inject our own local version of Razorpay
    // Create a blob URL with a script that will load our extension's Razorpay script
    const initScript = `
        // Function to load Razorpay from extension
        function loadRazorpayFromExtension() {
            const options = ${JSON.stringify(options)};
            
            if (window.Razorpay) {
                const rzp = new window.Razorpay(options);
                rzp.open();
                return;
            }
            
            // Look for the extension's script
            const extensionId = '${chrome.runtime.id}';
            const script = document.createElement('script');
            script.src = 'chrome-extension://' + extensionId + '/lib/razorpay-checkout.js';
            script.onload = function() {
                const rzp = new window.Razorpay(options);
                rzp.open();
            };
            script.onerror = function() {
                alert("Could not load payment gateway. Please try again later.");
                const overlay = document.getElementById('credits-modal-overlay');
                if (overlay) {
                    document.body.removeChild(overlay);
                }
            };
            document.head.appendChild(script);
        }

        // Execute immediately
        loadRazorpayFromExtension();
    `;
    
    // Inject this script
    const script = document.createElement('script');
    const blob = new Blob([initScript], { type: 'text/javascript' });
    script.src = URL.createObjectURL(blob);
    script.onload = function() {
        // Clean up the URL once the script is loaded
        URL.revokeObjectURL(script.src);
    };
    
    document.head.appendChild(script);
    
    return true;
}

// Test API connectivity at startup (optional but helpful)
function testApiConnection() {
    console.log("Testing API connection...");
    fetch(`${API_URL}/`, { method: 'HEAD', mode: 'cors', cache: 'no-cache' }) // HEAD request is efficient
        .then(response => {
            console.log(`API connectivity test: Status ${response.status}`);
            if (!response.ok) {
                 console.warn(`API server might be down or unreachable (Status: ${response.status})`);
            } else {
                 console.log("API connection test successful.");
            }
        })
        .catch(error => {
            console.error("API connection test failed:", error.message);
        });
}

// --- Lifecycle Events ---
chrome.runtime.onInstalled.addListener(details => {
    if (details.reason === 'install') {
        console.log('Chess Analyzer extension installed.');
        // Perform first-time setup, e.g., open options page or tutorial
    } else if (details.reason === 'update') {
        const thisVersion = chrome.runtime.getManifest().version;
        console.log(`Chess Analyzer extension updated from ${details.previousVersion} to ${thisVersion}.`);
        // Perform migration tasks if necessary
        // Consider clearing old storage items if format changed significantly
    }
});

chrome.runtime.onStartup.addListener(() => {
    console.log("Browser startup detected. Chess Analyzer background script running.");
    testApiConnection(); // Test connection on browser start
});

// Initial connection test when the background script loads
testApiConnection();

// Format error messages for the UI
function formatErrorMessage(error) {
    // If the error is an HTTP error response, handle it specially
    if (error.status === 401 || error.message.includes("Authentication")) {
        return "Authentication required. Please log in again.";
    } else if (error.status === 402 || error.message.includes("Insufficient credits")) {
        return "You've run out of credits. Please purchase more to continue.";
    } else if (error.status === 429 || error.message.includes("Too many requests")) {
        return "Too many requests. Please try again later.";
    } else if (error.status === 500 || error.message.includes("server error")) {
        return "Server error. Our team has been notified.";
    }
    
    // For other errors, use the message directly
    return error.message || "An unknown error occurred";
}