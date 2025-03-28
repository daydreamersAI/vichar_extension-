// Import the script injector functionality
// Ensure the path is correct relative to your background script location
import { injectCaptureScript } from './scriptInjector.js';

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
                            message: question,
                            fen: capturedBoard.fen,
                            pgn: capturedBoard.pgn || "",
                            image_data: imageDataBase64, // Send base64 string or null
                            chat_history: chatHistory || [],
                            model: model, // *** Pass the selected model ID ***
                            // Add computer_evaluation/variation here if available
                            computer_evaluation: capturedBoard.computerEvaluation || null,
                            computer_variation: capturedBoard.computerVariation || null
                        })
                    });

                    console.log("Backend analysis response status:", response.status);

                    // Handle non-OK responses cleanly
                    if (!response.ok) {
                        let errorDetail = `API Error: ${response.status}`;
                        let errorCode = `HTTP_${response.status}`;
                        try {
                            const errorJson = await response.json();
                            errorDetail = errorJson.detail || errorDetail;
                            if (response.status === 401) errorCode = "AUTH_REQUIRED";
                            if (response.status === 402) errorCode = "INSUFFICIENT_CREDITS";
                            // Add more specific error codes if the backend provides them
                        } catch (e) { /* Ignore if error response is not JSON */ }
                        console.error("Backend analysis error:", errorDetail);
                        // Send structured error back to content script
                        sendResponse({ success: false, error: errorDetail, errorCode: errorCode });
                        return;
                    }

                    // Process successful response
                    const data = await response.json();
                    console.log("Backend analysis successful.");

                    if (!data.response) { // Ensure 'response' field exists
                        throw new Error("Invalid API response format - missing 'response' field");
                    }

                    // Send successful analysis and credit info back to content script
                    sendResponse({
                        success: true,
                        data: data.response,
                        credits: data.credits // Pass the {used, remaining} object
                    });

                } catch (error) {
                    console.error("Error in analyzeChessPosition handler:", error);
                    sendResponse({
                        success: false,
                        // Provide specific error codes if possible
                        error: error.message || "Failed to analyze position",
                        errorCode: error.message.includes("Authentication required") ? "AUTH_REQUIRED" : "ANALYSIS_FAILED"
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
                     const userInfo = await chrome.storage.local.get(['user_name', /* 'user_email' */]);

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
                         // user_email: userInfo?.user_email || ''
                     };

                     // Store data temporarily using session storage (clears on browser close)
                     await chrome.storage.session.set({ 'paymentDataForPopup': paymentDataForPopup });
                     console.log("Payment context stored in session storage for popup ID:", popupWindow.id);

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

                    // Create the order via the API
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
                        console.error("Create order API error:", errorText);
                        sendResponse({ success: false, error: `Failed to create order: ${response.status}` });
                        return;
                    }

                    // Process the order data
                    const orderData = await response.json();
                    console.log("Order created successfully:", orderData);

                    // Add the token to the order data for later use
                    orderData.token = token;

                    // Send back the order data to the popup
                    sendResponse({ 
                        success: true, 
                        orderData: orderData,
                        packageInfo: request.packageInfo
                    });

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
                     const { auth_token: token } = await chrome.storage.local.get(['auth_token']);
                     if (!token) throw new Error("Authentication token not found.");

                     const { paymentResponse, packageInfo } = request;
                     if (!paymentResponse?.razorpay_payment_id || !paymentResponse?.razorpay_order_id || !paymentResponse?.razorpay_signature) {
                         throw new Error("Incomplete payment response from popup.");
                     }
                     if (!packageInfo?.credits) {
                          throw new Error("Missing package info (credits) from popup.");
                     }

                     // Call backend to verify payment
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

                     verificationResult = await response.json(); // Should contain { success, credits_added, current_balance }
                     console.log("Payment verification successful (backend):", verificationResult);
                     verificationSuccess = true;

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