// // --- START OF FILE scriptInjector.js ---

// // This script injects capture functionality and handles sending data for analysis
// console.log("Script injector initialized - v2 (for new backend)");

// // Define the backend URL (make this configurable if needed)
// const API_BASE_URL = "http://127.0.0.1:8000"; // Or your deployed backend URL

// // Function to inject the capture script when needed
// async function injectCaptureScript(tabId, userPromptForAnalysis = "Analyze this position.") { // Added optional user prompt
//   console.log("Injecting capture script into tab:", tabId);

//   try {
//     // Inject CSS first (no changes needed here)
//     await chrome.scripting.executeScript({
//       target: { tabId: tabId },
//       func: injectCustomCSS
//     });
//     console.log("Custom CSS injected successfully");

//     // Inject html2canvas (no changes needed here)
//     await chrome.scripting.executeScript({
//       target: { tabId: tabId },
//       files: ['lib/html2canvas.min.js']
//     });
//     console.log("html2canvas injected successfully");

//     // Inject and execute the capture code
//     const captureExecutionResult = await chrome.scripting.executeScript({
//       target: { tabId: tabId },
//       func: captureChessBoard // The main capture function
//     });

//     console.log("Capture script injection result (raw):", captureExecutionResult);

//     // Handle the promise potentially returned by captureChessBoard
//     let finalCaptureData;
//     if (captureExecutionResult && captureExecutionResult[0] && captureExecutionResult[0].result) {
//         if (typeof captureExecutionResult[0].result.then === 'function') {
//             // It returned a promise, await it
//             finalCaptureData = await captureExecutionResult[0].result;
//             console.log("Capture script final result (after promise):", finalCaptureData);
//         } else {
//             // It returned data directly (less likely with async html2canvas, but handle)
//             finalCaptureData = captureExecutionResult[0].result;
//             console.log("Capture script result (direct):", finalCaptureData);
//         }
//     } else if (captureExecutionResult && captureExecutionResult[0] && captureExecutionResult[0].error) {
//          throw new Error(`Capture script execution error: ${captureExecutionResult[0].error.message || captureExecutionResult[0].error}`);
//     } else {
//         console.error("Unexpected capture script result structure:", captureExecutionResult);
//         throw new Error("Failed to capture chess board - unexpected result structure.");
//     }

//     // --- Process the captured data and send for analysis ---
//     if (finalCaptureData && finalCaptureData.imageData) {
//         console.log("Capture successful, proceeding to analysis request.");
//         // Call the function that handles the API request
//         const analysisApiResult = await sendAnalysisRequest(finalCaptureData, userPromptForAnalysis);
//         return analysisApiResult; // Return the result from the API call attempt
//     } else {
//         throw new Error("Capture process did not return valid image data.");
//     }

//   } catch (error) {
//     console.error("Error in injectCaptureScript flow:", error);
//     // Improved error handling messages
//     let errorMessage = error.message || "An unknown error occurred during capture/analysis.";
//     if (error.message) {
//         if (error.message.includes("Could not establish connection") && error.message.includes("Receiving end does not exist")) {
//             errorMessage = "Cannot connect to the tab. It might be closed, reloading, or a special page (e.g., chrome://).";
//         } else if (error.message.includes("No target with given id")) {
//             errorMessage = "The target tab could not be found. It might have been closed.";
//         } else if (error.message.includes("Cannot access contents of url")) {
//              const restrictedUrl = error.message.split('"')[1] || 'URL restricted';
//              errorMessage = `Cannot access this page due to browser restrictions (${restrictedUrl}). Try on a different page.`;
//         } else if (error.message.includes("Insufficient credits")) {
//              errorMessage = "Insufficient credits to perform analysis. Please purchase more.";
//              // Return a specific structure for insufficient credits
//              return { success: false, error: errorMessage, insufficientCredits: true };
//         } else if (error.message.includes("Authentication required")) {
//              errorMessage = "Authentication required. Please log in.";
//              return { success: false, error: errorMessage, authRequired: true };
//         }
//     }
//     // Return a generic failure structure
//     return { success: false, error: errorMessage };
//   }
// }

// // Function to inject custom CSS (no changes needed)
// function injectCustomCSS() {
//   // ... (keep the existing injectCustomCSS function content as it was) ...
//   console.log("Injecting custom CSS with system fonts");

//   try {
//     // Remove existing style if present
//     const existingStyle = document.getElementById('vichar-custom-css');
//     if (existingStyle) {
//       existingStyle.remove();
//     }

//     // Create a style element
//     const style = document.createElement('style');
//     style.id = 'vichar-custom-css';

//     // Add CSS rules to use system fonts and avoid external font loading
//     // Also includes styles needed for custom board rendering
//     style.textContent = `
//       /* Use system fonts to avoid CSP violations */
//       #vichar-temp-board-container,
//       #vichar-temp-board-container *,
//       .vichar-custom-board, /* Added class for custom board */
//       .vichar-custom-board * {
//         font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif !important;
//         font-weight: normal !important;
//         font-style: normal !important;
//         box-sizing: border-box; /* Ensure consistent sizing */
//       }

//       /* Ensure no external resources are loaded */
//       #vichar-temp-board-container,
//       .vichar-custom-board {
//         background-image: none !important;
//         background-color: transparent !important; /* Ensure container bg is transparent */
//       }

//       /* Hide potentially problematic elements during capture */
//       #vichar-temp-board-container .coords,
//       #vichar-temp-board-container .promotion-choice,
//       #vichar-temp-board-container .piece-promotion {
//         display: none !important;
//       }

//       /* Styling for the custom generated board */
//       .vichar-custom-board {
//         width: 600px !important;
//         height: 600px !important;
//         position: relative !important;
//         overflow: visible !important;
//         background-color: #f0f0f0 !important; /* Light gray background around board */
//         padding: 20px !important; /* Padding for coordinates */
//       }
//       .vichar-board-background {
//         width: 560px !important;
//         height: 560px !important;
//         position: absolute !important;
//         top: 20px !important;
//         left: 20px !important;
//         display: grid !important;
//         grid-template-columns: repeat(8, 1fr) !important;
//         grid-template-rows: repeat(8, 1fr) !important;
//         border: 1px solid #555; /* Add a border around the squares */
//       }
//       .vichar-board-square {
//         width: 100% !important;
//         height: 100% !important;
//         position: relative !important;
//       }
//       .vichar-board-square.light {
//         background-color: #f0d9b5 !important;
//       }
//       .vichar-board-square.dark {
//         background-color: #b58863 !important;
//       }
//       .vichar-coordinate {
//         position: absolute !important;
//         font-size: 12px !important;
//         color: #333 !important; /* Darker color for better visibility */
//         text-align: center !important;
//         line-height: 1 !important; /* Ensure tight line height */
//       }
//       .vichar-file-coord {
//         bottom: 2px !important; /* Position files at the bottom */
//         height: 16px; /* Ensure space below board */
//         width: 70px; /* Width of a square */
//         display: flex;
//         align-items: center;
//         justify-content: center;
//       }
//       .vichar-rank-coord {
//         left: 2px !important; /* Position ranks on the left */
//         width: 16px; /* Ensure space left of board */
//         height: 70px; /* Height of a square */
//         display: flex;
//         align-items: center;
//         justify-content: center;
//       }
//       .vichar-piece {
//         position: absolute !important;
//         width: 70px !important; /* 560 / 8 */
//         height: 70px !important; /* 560 / 8 */
//         z-index: 2 !important;
//         display: flex !important; /* Use flex to center SVG */
//         align-items: center !important;
//         justify-content: center !important;
//         pointer-events: none; /* Prevent pieces from interfering with capture */
//       }
//       .vichar-piece svg {
//         width: 85% !important; /* Adjust SVG size within square */
//         height: 85% !important;
//         display: block !important; /* Ensure SVG behaves like a block element */
//       }
//     `;

//     // Add the style element to the document head
//     document.head.appendChild(style);

//     console.log("Custom CSS injected");
//     return true;
//   } catch (error) {
//     console.error("Error injecting custom CSS:", error);
//     return false;
//   }
// }


// // Renamed and refactored function to handle the API call
// async function sendAnalysisRequest(captureResult, userPrompt) {
//   console.log("Preparing analysis request with captured data");

//   const { imageData, pgn, fen, site, orientation } = captureResult;

//   if (!imageData) {
//     throw new Error("No image data provided for analysis request.");
//   }

//   try {
//     // 1. Get Auth Token
//     const tokenData = await chrome.storage.local.get('authToken');
//     const token = tokenData?.authToken;
//     if (!token) {
//       console.error("Authentication token not found.");
//       throw new Error("Authentication required. Please log in.");
//     }

//     // 2. Get Model Preference (using a default key 'selectedModel')
//     const modelData = await chrome.storage.local.get('selectedModel');
//     // Use the model ID from storage, or default to 'gpt-4o-mini' as per backend default
//     const selectedModelId = modelData?.selectedModel || 'gpt-4o-mini';
//     console.log("Using model:", selectedModelId);

//     // 3. Get Chat History (using a default key 'chatHistory')
//     const historyData = await chrome.storage.local.get('chatHistory');
//     // Ensure history is an array, default to empty if not found or invalid
//     let chatHistory = Array.isArray(historyData?.chatHistory) ? historyData.chatHistory : [];
//     console.log(`Retrieved ${chatHistory.length} messages from history.`);

//     // --- Construct the Request Payload ---
//     const requestPayload = {
//       message: userPrompt, // The current question/prompt from the user
//       fen: fen || null, // Send null if FEN is empty/undefined
//       pgn: pgn || null, // Send null if PGN is empty/undefined
//       // Send image data only if it exists (backend uses this to trigger vision)
//       image_data: imageData ? imageData : null,
//       // chat_history should contain the messages BEFORE the current userPrompt
//       chat_history: chatHistory,
//       model: selectedModelId,
//       // computer_evaluation and computer_variation are omitted for now
//     };

//     // --- Make the API Call to the new endpoint ---
//     console.log("Sending request to /analysis-with-credit");
//     const response = await fetch(`${API_BASE_URL}/analysis-with-credit`, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         'Authorization': `Bearer ${token}` // Add the auth token
//       },
//       body: JSON.stringify(requestPayload)
//     });

//     // --- Handle the Response ---
//     if (response.ok) {
//       const result = await response.json();
//       console.log("Analysis successful:", result);

//       // Store the new assistant response and update history
//       const assistantMessage = { text: result.response, sender: 'assistant' };
//       const newUserMessage = { text: userPrompt, sender: 'user' }; // Store the user prompt too
//       const updatedHistory = [...chatHistory, newUserMessage, assistantMessage];

//       await chrome.storage.local.set({ chatHistory: updatedHistory });
//       console.log("Chat history updated.");

//       // Update credit balance display if needed (can be done in popup based on this event/data)
//       if (result.credits) {
//         console.log(`Credits Update: Used ${result.credits.used}, Remaining ${result.credits.remaining}`);
//         // Optionally store remaining credits or notify the popup
//          await chrome.storage.local.set({ userCredits: result.credits.remaining });
//       }

//       // Return success with the assistant's response
//       return { success: true, response: result.response, credits: result.credits };

//     } else {
//       // Handle specific error status codes
//       let errorDetail = `API request failed with status: ${response.status}`;
//       try {
//           const errorJson = await response.json();
//           errorDetail = errorJson.detail || errorDetail; // Use backend detail message if available
//       } catch (e) {
//           // Could not parse JSON body
//           errorDetail = `${errorDetail} - ${response.statusText}`;
//       }

//       console.error("Analysis API Error:", errorDetail);

//       if (response.status === 401) {
//         // Unauthorized - token might be invalid or expired
//         // Clear the potentially invalid token? Or prompt re-login in UI.
//         await chrome.storage.local.remove('authToken');
//         throw new Error("Authentication required. Please log in again.");
//       } else if (response.status === 402) {
//         // Insufficient Credits
//         throw new Error("Insufficient credits. Please purchase more credits.");
//       } else {
//         // Other errors (400, 5xx, etc.)
//         throw new Error(`Analysis failed: ${errorDetail}`);
//       }
//     }
//   } catch (error) {
//     console.error("Error sending analysis request:", error);
//     // Re-throw the error so injectCaptureScript's catch block can handle it
//     // and potentially provide more specific user feedback (like auth required / insufficient credits flags)
//     throw error;
//   }
// }

// // Function to capture the chess board (Runs in the page context)
// // No major changes needed here, keep the robust capture logic
// function captureChessBoard() {
//   console.log("Capture function running in page context");

//   // Check if html2canvas is available
//   if (typeof html2canvas === 'undefined') {
//      console.error("html2canvas is not loaded!");
//      return Promise.reject(new Error("html2canvas library failed to load. Cannot capture board."));
//   }

//   // Site detection
//   const isLichess = window.location.hostname.includes('lichess.org');
//   const isChessCom = window.location.hostname.includes('chess.com');
//   console.log("Site detection:", { isLichess, isChessCom });

//   // Extract PGN
//   let pgn = extractPGN(isLichess, isChessCom); // This helper is defined below

//   // --- Site-Specific Capture Logic ---
//   if (isLichess) {
//     return captureLichessBoard(pgn); // This helper is defined below and returns a Promise
//   } else if (isChessCom) {
//     return captureChessComBoard(pgn); // This helper is defined below and returns a Promise
//   } else {
//     return Promise.reject(new Error("Unsupported chess site for capture."));
//   }

//   // --- Start of Helper Functions within captureChessBoard scope ---

//   // --- extractPGN ---
//   function extractPGN(isLichess, isChessCom) {
//     // ... (keep the existing extractPGN function content as it was)
//     try {
//       let pgn = "";

//       if (isLichess) {
//         // Try multiple methods to find PGN on Lichess
//         console.log("Attempting to extract PGN from Lichess");

//         // Method 1: Direct PGN element in analysis
//         const pgnText = document.querySelector('.pgn');
//         if (pgnText && pgnText.textContent) {
//           console.log("Found PGN text element");
//           return pgnText.textContent.trim();
//         }

//         // Method 2: PGN from moves area
//         const movesArea = document.querySelector('.analyse__moves, .replay');
//         if (movesArea) {
//           console.log("Found moves area, extracting moves");
//           const moveElements = movesArea.querySelectorAll('.move');
//           if (moveElements && moveElements.length > 0) {
//             let moveTexts = [];
//             let currentMoveNumber = 1;
//             let currentTurn = 'w';

//             // Go through all moves and collect them in proper format
//             moveElements.forEach(moveEl => {
//               const san = moveEl.getAttribute('data-san') || moveEl.getAttribute('san') || moveEl.textContent.trim();
//               if (san) {
//                 if (currentTurn === 'w') {
//                   moveTexts.push(currentMoveNumber + '. ' + san);
//                   currentTurn = 'b';
//                 } else {
//                   moveTexts.push(san);
//                   currentTurn = 'w';
//                   currentMoveNumber++;
//                 }
//               }
//             });

//             if (moveTexts.length > 0) {
//               console.log("Extracted " + moveTexts.length + " moves");
//               return moveTexts.join(' ');
//             }
//           }
//         }

//         // Method 3: Look for moves in notation
//         const notationItems = document.querySelectorAll('.notation-322V9, .analyse__move-list, .move-list');
//         if (notationItems && notationItems.length > 0) {
//           console.log("Found notation items, extracting moves");
//           let moveTexts = [];
//           let currentMove = '';

//           // Try to extract from all potential notation elements
//           for (const container of notationItems) {
//             // Get all move text nodes
//             const moveNodes = container.querySelectorAll('move, .move, san, .san, l4x, .l4x');
//             if (moveNodes && moveNodes.length > 0) {
//               console.log(`Found ${moveNodes.length} move nodes`);
//               moveNodes.forEach(move => {
//                 const text = move.textContent.trim();
//                 if (text) moveTexts.push(text);
//               });
//             } else {
//               // If we can't find specific move elements, try to parse the text content
//               const text = container.textContent.trim();
//               const movePattern = /\d+\.\s+[a-zA-Z0-9\+#\=\-]+(?:\s+[a-zA-Z0-9\+#\=\-]+)?/g; // Improved pattern
//               const matches = text.match(movePattern);
//               if (matches && matches.length > 0) {
//                 moveTexts = matches;
//               }
//             }

//             if (moveTexts.length > 0) break;
//           }

//           if (moveTexts.length > 0) {
//             console.log("Processed move texts:", moveTexts);
//             return moveTexts.join(' ');
//           }
//         }

//         // Method 4: Check all page text for PGN-like content
//         const bodyText = document.body.textContent;
//         // More robust regex for moves (including castling, checks, captures, promotions)
//         const pgnRegex = /\b[1-9]\d*\.\s+[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[\+#]?|O-O(?:-O)?\s+(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[\+#]?|O-O(?:-O)?\s+)?\b/;
//         if (pgnRegex.test(bodyText)) {
//           console.log("Found PGN-like content in page text");
//           // Extract a sizable chunk around the match
//           const match = bodyText.match(new RegExp('(?:' + pgnRegex.source + '.{0,200}){3,}', 'g'));
//           if (match && match[0]) {
//              console.log("Extracted PGN chunk from body text");
//             return match[0].trim();
//           }
//         }
//       } else if (isChessCom) {
//         // Try multiple methods to find PGN on Chess.com
//         console.log("Attempting to extract PGN from Chess.com");

//         // Method 1: Share Menu PGN
//         const pgnElement = document.querySelector('.share-menu-tab-pgn-textarea, textarea.copy-pgn');
//         if (pgnElement && pgnElement.value) { // Use .value for textarea
//           console.log("Found PGN in share menu textarea");
//           return pgnElement.value.trim();
//         }

//         // Method 2: Look for the PGN button and its data
//         const pgnButton = document.querySelector('button[data-cy="share-menu-pgn-button"]');
//         if (pgnButton) {
//           console.log("Found PGN button, attempting to extract data");
//           const pgnData = pgnButton.getAttribute('data-pgn') || pgnButton.getAttribute('data-clipboard-text');
//           if (pgnData) {
//              console.log("Extracted PGN from button data attribute");
//              return pgnData;
//           }
//         }

//         // Method 3: Try looking for share or export elements (Async fetch might not work reliably here)
//         // Skipping async fetch in content script for simplicity/reliability

//         // Method 4: Global game object direct access
//         if (typeof window.ChessComGame !== 'undefined') {
//           console.log("Found Chess.com game object");
//           if (typeof window.ChessComGame.getPgn === 'function') {
//             try {
//               const gamePgn = window.ChessComGame.getPgn();
//               if (gamePgn) {
//                 console.log("Got PGN from ChessComGame.getPgn()");
//                 return gamePgn;
//               }
//             } catch (e) {
//               console.log("Error getting PGN from ChessComGame:", e);
//             }
//           }
//           if (window.ChessComGame.game && window.ChessComGame.game.pgn) {
//             console.log("Got PGN from ChessComGame.game.pgn");
//             return window.ChessComGame.game.pgn;
//           }
//         }
//         if (typeof chessHelper !== 'undefined' && typeof chessHelper.getPgn === 'function') {
//             try {
//                 const gamePgn = chessHelper.getPgn();
//                 if (gamePgn) {
//                     console.log("Got PGN from chessHelper.getPgn()");
//                     return gamePgn;
//                 }
//             } catch(e) { console.log("Error getting PGN from chessHelper", e); }
//         }


//         // Method 5: Extract from move list elements directly
//         const moveList = document.querySelector('.move-list-container, .vertical-move-list');
//         if (moveList) {
//           console.log("Found move list container");
//           // Chess.com structure can vary, target nodes containing moves
//           const moveNodes = moveList.querySelectorAll('[data-whole-move-number], div[class^="node"], div[class*="selected"]');
//           if (moveNodes.length > 0) {
//             console.log("Found " + moveNodes.length + " move nodes/elements");
//             let moveTexts = [];
//             let lastMoveNumber = 0;

//             moveNodes.forEach(node => {
//               let moveNumberText = '';
//               let whiteMoveText = '';
//               let blackMoveText = '';

//               // Try getting move number
//               const moveNumElement = node.querySelector('div[class^="move-number"], .move-number');
//               if (moveNumElement) {
//                  moveNumberText = moveNumElement.textContent.trim();
//                  if (!moveNumberText.endsWith('.')) moveNumberText += '.';
//               } else if (node.getAttribute('data-whole-move-number')) {
//                  moveNumberText = node.getAttribute('data-whole-move-number') + '.';
//               }


//               // Try getting moves (often within divs inside the node)
//               const moveElements = node.querySelectorAll('span[data-figurine], div[class*="node-highlight"], div[class^="white"] > span, div[class^="black"] > span');
//               if(moveElements.length >= 1) whiteMoveText = moveElements[0].textContent.trim();
//               if(moveElements.length >= 2) blackMoveText = moveElements[1].textContent.trim();

//               // Fallback if specific spans aren't found
//                if (!whiteMoveText && !blackMoveText) {
//                     const textContent = node.textContent.trim();
//                     const parts = textContent.split(/\s+/);
//                     if (parts[0].match(/^\d+\.$/)) { // Format like "1. e4 e5"
//                         moveNumberText = parts[0];
//                         if (parts[1]) whiteMoveText = parts[1];
//                         if (parts[2]) blackMoveText = parts[2];
//                     } else if (parts[0]) { // Might just be the move text itself
//                        // Need context to know if it's white or black move here - complex
//                     }
//                }

//               // Assemble the move string
//               if (moveNumberText && whiteMoveText) {
//                  let moveStr = moveNumberText + ' ' + whiteMoveText;
//                  if (blackMoveText) {
//                    moveStr += ' ' + blackMoveText;
//                  }
//                  // Avoid duplicates and ensure order
//                  const currentMoveNumber = parseInt(moveNumberText);
//                  if (currentMoveNumber > lastMoveNumber) {
//                     moveTexts.push(moveStr);
//                     lastMoveNumber = currentMoveNumber;
//                  }
//               }
//             });

//             if (moveTexts.length > 0) {
//               const pgn = moveTexts.join(' ').trim();
//               console.log("Extracted PGN from move list: " + pgn);
//               return pgn;
//             }
//           }
//         }

//         // Method 6: PGN metadata in document head
//         const metaTags = document.querySelectorAll('meta');
//         for (const tag of metaTags) {
//           const content = tag.getAttribute('content');
//           // Look for basic PGN structure in meta content
//           if (content && content.includes('1.') && content.match(/\b[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8]/)) {
//             console.log("Found PGN-like content in meta tag");
//             return content;
//           }
//         }

//         // Method 7: Look for any element with PGN data
//         const allElements = document.querySelectorAll('*[data-pgn]');
//         for (const el of allElements) {
//           const pgnData = el.getAttribute('data-pgn');
//           if (pgnData) {
//             console.log("Found element with data-pgn attribute");
//             return pgnData;
//           }
//         }

//         // Method 8: Check for moves in any element (Last resort text scan)
//         const movePatternRegex = /\b[1-9]\d*\.\s+(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[\+#]?|O-O(?:-O)?)(?:\s+(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[\+#]?|O-O(?:-O)?))?/g;
//         const textElements = document.querySelectorAll('div, span, p, pre, code'); // Added pre/code
//         for (const el of textElements) {
//           // Only check elements likely to contain PGN, ignore tiny ones
//           if (el.offsetWidth > 50 && el.offsetHeight > 10) {
//             const text = el.textContent;
//             if (text && movePatternRegex.test(text)) {
//               const movesMatch = text.match(movePatternRegex);
//               // Require a decent number of moves to avoid false positives
//               if (movesMatch && movesMatch.length >= 3) {
//                 console.log("Found PGN-like content in text element:", el.className);
//                 return movesMatch.join(' ');
//               }
//             }
//           }
//         }
//       }

//       console.log("No PGN found using standard methods, returning empty.");
//       return pgn; // Return empty string if nothing found
//     } catch (error) {
//       console.error("Error extracting PGN:", error);
//       return ""; // Return empty string if extraction fails
//     }
//   } // --- End of extractPGN ---

//   // --- isValidFENFormat ---
//   function isValidFENFormat(fen) {
//     // ... (keep the existing isValidFENFormat function content as it was) ...
//     if (!fen || typeof fen !== 'string') return false;

//     const trimmedFen = fen.trim();
//     const fields = trimmedFen.split(/\s+/);

//     // 1. Check number of fields (must be 6)
//     if (fields.length !== 6) return false;

//     // 2. Check piece placement section
//     const ranks = fields[0].split('/');
//     if (ranks.length !== 8) return false; // Must have 8 ranks
//     for (const rank of ranks) {
//       let fileCount = 0;
//       for (const char of rank) {
//         if (/\d/.test(char)) {
//           const num = parseInt(char, 10);
//           if (num < 1 || num > 8) return false; // Digit must be 1-8
//           fileCount += num;
//         } else if (/[prnbqkPRNBQK]/.test(char)) {
//           fileCount += 1;
//         } else {
//           return false; // Invalid character in rank
//         }
//       }
//       if (fileCount !== 8) return false; // Each rank must sum to 8 files
//     }

//     // 3. Check active color
//     if (!/^[wb]$/.test(fields[1])) return false;

//     // 4. Check castling availability
//     if (!/^(KQ?k?q?|Qk?q?|kq?|q|-)$/.test(fields[2].replace(/[^KQkq-]/g, ''))) return false; // Allow only valid chars or '-'

//     // 5. Check en passant target square
//     if (!/^(-|[a-h][36])$/.test(fields[3])) return false;
//     // Ensure en passant is valid given the active color
//     if (fields[3] !== '-') {
//         const rank = fields[3][1];
//         if (fields[1] === 'w' && rank !== '6') return false; // White moves, en passant must be rank 6
//         if (fields[1] === 'b' && rank !== '3') return false; // Black moves, en passant must be rank 3
//     }

//     // 6. Check halfmove clock (non-negative integer)
//     if (!/^\d+$/.test(fields[4]) || parseInt(fields[4], 10) < 0) return false;

//     // 7. Check fullmove number (positive integer)
//     if (!/^\d+$/.test(fields[5]) || parseInt(fields[5], 10) < 1) return false;

//     return true; // Passed all checks
//   } // --- End of isValidFENFormat ---

//   // --- extractLichessFEN ---
//   function extractLichessFEN() {
//     // ... (keep the existing extractLichessFEN function content as it was) ...
//     console.log("Extracting FEN from Lichess using enhanced methods");
//     const isStudyPage = window.location.pathname.includes('/study/');
//     let potentialFEN = null;

//     // --- Prioritize Study-Specific Methods if on a Study Page ---
//     if (isStudyPage) {
//         console.log("On Lichess study page, prioritizing study FEN methods.");
//         try {
//           // Method S1: Active node in the move list (often most up-to-date)
//           const activeNodeElem = document.querySelector('.analyse__moves .node.active, .moves .node.active'); // Look in analysis or simple moves list
//           if (activeNodeElem) {
//             potentialFEN = activeNodeElem.getAttribute('data-fen');
//             if (potentialFEN && isValidFENFormat(potentialFEN)) {
//               console.log("Found FEN in active move node data-fen:", potentialFEN);
//               return potentialFEN;
//             }
//           }

//           // Method S2: Study chapter main element data-fen
//           const studyChapterElem = document.querySelector('.study__chapter[data-fen]');
//           if (studyChapterElem) {
//             potentialFEN = studyChapterElem.getAttribute('data-fen');
//             if (potentialFEN && isValidFENFormat(potentialFEN)) {
//               console.log("Found FEN in study chapter data-fen:", potentialFEN);
//               return potentialFEN;
//             }
//           }

//           // Method S3: Lichess study global state
//           if (window.Lichess?.study?.currentNode?.fen) {
//              potentialFEN = window.Lichess.study.currentNode.fen;
//              if (isValidFENFormat(potentialFEN)) {
//                console.log("Found FEN in Lichess.study.currentNode:", potentialFEN);
//                return potentialFEN;
//              }
//           }

//           // Method S4: Lichess analysis global state (might still be populated in studies)
//           if (window.Lichess?.analysis?.node?.fen) {
//             potentialFEN = window.Lichess.analysis.node.fen;
//             if (isValidFENFormat(potentialFEN)) {
//               console.log("Found FEN in Lichess.analysis.node (within study):", potentialFEN);
//               return potentialFEN;
//             }
//           }

//         } catch (e) {
//           console.log("Error checking specific study FEN sources:", e);
//         }
//     }

//     // --- General Lichess FEN Extraction Methods ---

//     // Method 1: Primary data-fen attribute on board wrappers
//     try {
//         // Include study-specific wrappers
//       const boardWrapper = document.querySelector('.cg-wrap[data-fen], .round__app__board[data-fen], .main-board[data-fen], .study__board [data-fen]');
//       if (boardWrapper) {
//         potentialFEN = boardWrapper.getAttribute('data-fen');
//         if (potentialFEN && isValidFENFormat(potentialFEN)) {
//           console.log("Found FEN in primary board wrapper data-fen:", potentialFEN);
//           return potentialFEN;
//         }
//       }
//     } catch (e) {
//       console.log("Error getting FEN from primary data-fen attribute:", e);
//     }

//     // Method 2: Lichess global state (redundant check for non-study, but safe)
//     try {
//        if (window.Lichess?.analysis?.node?.fen) { /* ... already checked for study ... */ }
//        if (window.Lichess?.chessground?.state?.fen) {
//          potentialFEN = window.Lichess.chessground.state.fen;
//          if (isValidFENFormat(potentialFEN)) {
//            console.log("Found FEN in Lichess.chessground.state:", potentialFEN);
//            return potentialFEN;
//          }
//        }
//        if (window.Lichess?.boot?.data?.game?.fen) { /* ... */ }
//        if (window.Lichess?.puzzle?.data?.puzzle?.fen) { /* ... */ }
//     } catch (e) {
//         console.log("Error accessing Lichess global state:", e);
//     }


//     // Method 3: UI Elements (Input fields, FEN displays)
//     try {
//       const fenInput = document.querySelector('input.copyable[spellcheck="false"]'); // More specific selector for FEN input
//       if (fenInput && fenInput.value) {
//         potentialFEN = fenInput.value.trim();
//         if (isValidFENFormat(potentialFEN)) {
//           console.log("Found FEN in copyable input field:", potentialFEN);
//           return potentialFEN;
//         }
//       }
//       const fenDisplay = document.querySelector('.fen .copyable, .copyables .fen'); // Look for display elements
//       if (fenDisplay && fenDisplay.textContent) {
//         potentialFEN = fenDisplay.textContent.trim();
//         if (isValidFENFormat(potentialFEN)) {
//           console.log("Found FEN in FEN display element:", potentialFEN);
//           return potentialFEN;
//         }
//       }
//     } catch (e) {
//         console.log("Error getting FEN from UI elements:", e);
//     }

//     // Method 4: Fallback - Reconstruct FEN from piece elements (Improved)
//     console.log("Attempting FEN reconstruction from visible pieces as fallback...");
//     try {
//         // Find the most likely board element (cg-board is common)
//         const boardElement = document.querySelector('cg-board');
//         const boardContainer = boardElement?.closest('.cg-wrap, .round__app__board, .main-board, .study__board'); // Find container for orientation

//         if (boardElement && boardContainer) {
//             console.log("Found cg-board element for reconstruction.");
//             const pieces = boardElement.querySelectorAll('piece');
//             console.log(`Found ${pieces.length} piece elements.`);

//             if (pieces.length > 0) { // Need at least some pieces
//                 const boardArray = Array(8).fill().map(() => Array(8).fill(''));
//                 const isFlipped = boardContainer.classList.contains('orientation-black');
//                 console.log(`Reconstruction board orientation: ${isFlipped ? 'black' : 'white'}`);

//                 const boardRect = boardElement.getBoundingClientRect();
//                 const squareSize = boardRect.width / 8;
//                 let successCount = 0;
//                 let errorCount = 0;
//                 let kingCount = { w: 0, b: 0 }; // Track kings

//                 pieces.forEach((piece, index) => {
//                     try {
//                         const pieceClasses = piece.className.split(' ');
//                         const colorClass = pieceClasses.find(cls => cls === 'white' || cls === 'black');
//                         const typeClass = pieceClasses.find(cls => ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'].includes(cls));
//                         const squareClass = pieceClasses.find(cls => cls.startsWith('square-')); // Lichess specific pos class

//                         if (!colorClass || !typeClass) {
//                             console.log(`Piece ${index} missing color/type class:`, pieceClasses);
//                             errorCount++;
//                             return;
//                         }

//                         const color = colorClass === 'white' ? 'w' : 'b';
//                         let type = '';
//                         switch (typeClass) {
//                             case 'king': type = 'k'; break;
//                             case 'queen': type = 'q'; break;
//                             case 'rook': type = 'r'; break;
//                             case 'bishop': type = 'b'; break;
//                             case 'knight': type = 'n'; break;
//                             case 'pawn': type = 'p'; break;
//                         }
//                         const pieceFenChar = color === 'w' ? type.toUpperCase() : type;

//                         let file = -1, rank = -1;

//                         // Method A: Use square-* class if available (more reliable)
//                         if (squareClass && squareClass.length === 9) { // e.g., 'square-e4'
//                             const squareName = squareClass.substring(7); // "e4"
//                             file = squareName.charCodeAt(0) - 'a'.charCodeAt(0);
//                             rank = 8 - parseInt(squareName[1], 10);
//                              // console.log(`Piece ${index} (${pieceFenChar}): Found square class ${squareName} -> [${file}, ${rank}]`); // Reduce log noise
//                         }
//                         // Method B: Use transform style (less reliable, might be percentages)
//                         else {
//                             const transform = piece.style.transform || '';
//                             const translateMatch = transform.match(/translate(?:3d)?\(\s*([^,]+)px,\s*([^,]+)px/);
//                             const matrixMatch = transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,([^,]+),([^,\)]+)/); // Check matrix too

//                             if (translateMatch) {
//                                 const x = parseFloat(translateMatch[1]);
//                                 const y = parseFloat(translateMatch[2]);
//                                 file = Math.round(x / squareSize); // Use round for potentially fractional px
//                                 rank = Math.round(y / squareSize);
//                                 // console.log(`Piece ${index} (${pieceFenChar}): Found translate(${x},${y}) -> raw [${file}, ${rank}]`);
//                             } else if (matrixMatch) {
//                                 const x = parseFloat(matrixMatch[1]);
//                                 const y = parseFloat(matrixMatch[2]);
//                                 file = Math.round(x / squareSize);
//                                 rank = Math.round(y / squareSize);
//                                 // console.log(`Piece ${index} (${pieceFenChar}): Found matrix -> raw [${file}, ${rank}]`);
//                             } else {
//                                 console.log(`Piece ${index} (${pieceFenChar}): No position info (no square class, no transform)`);
//                                 errorCount++;
//                                 return;
//                             }
//                         }

//                         // Adjust for board orientation AFTER getting 0-7 coords relative to top-left
//                         let finalRank = isFlipped ? 7 - rank : rank;
//                         let finalFile = isFlipped ? 7 - file : file;

//                         if (finalFile >= 0 && finalFile < 8 && finalRank >= 0 && finalRank < 8) {
//                             if (boardArray[finalRank][finalFile] === '') { // Avoid overwriting if multiple pieces detected on same square
//                                 boardArray[finalRank][finalFile] = pieceFenChar;
//                                 successCount++;
//                                 if (type === 'k') kingCount[color]++;
//                                 // console.log(`   -> Placed ${pieceFenChar} at final [${finalFile}, ${finalRank}] (adjusted for orientation)`);
//                             } else {
//                                 console.log(`   -> Square [${finalFile}, ${finalRank}] already occupied by ${boardArray[finalRank][finalFile]}, skipping ${pieceFenChar}`);
//                                 errorCount++;
//                             }
//                         } else {
//                             console.log(`Piece ${index} (${pieceFenChar}): Invalid calculated position [${finalFile}, ${finalRank}] from raw [${file}, ${rank}]`);
//                             errorCount++;
//                         }
//                     } catch (err) {
//                         console.log(`Error processing piece ${index}:`, err);
//                         errorCount++;
//                     }
//                 });

//                 console.log(`Reconstruction summary: ${successCount} success, ${errorCount} errors. Kings: w=${kingCount.w}, b=${kingCount.b}`);

//                 // Validate reconstruction: Need both kings and a reasonable number of pieces
//                 if (kingCount.w === 1 && kingCount.b === 1 && successCount >= 8) {
//                     let fenPosition = '';
//                     for (let r = 0; r < 8; r++) {
//                         let emptyCount = 0;
//                         for (let f = 0; f < 8; f++) {
//                             if (boardArray[r][f] === '') {
//                                 emptyCount++;
//                             } else {
//                                 if (emptyCount > 0) fenPosition += emptyCount;
//                                 fenPosition += boardArray[r][f];
//                                 emptyCount = 0;
//                             }
//                         }
//                         if (emptyCount > 0) fenPosition += emptyCount;
//                         if (r < 7) fenPosition += '/';
//                     }

//                     // Cannot reliably determine turn, castling, en passant from pieces alone
//                     // Use 'w' as default turn, standard castling/en passant placeholders
//                     potentialFEN = `${fenPosition} w KQkq - 0 1`;
//                     if (isValidFENFormat(potentialFEN)) {
//                          console.log("Successfully reconstructed FEN:", potentialFEN);
//                          return potentialFEN;
//                     } else {
//                          console.log("Reconstructed FEN is invalid:", potentialFEN);
//                     }
//                 } else {
//                     console.log("Reconstruction failed validation (missing kings or too few pieces).");
//                 }
//             }
//         } else {
//              console.log("Could not find suitable board element (cg-board) for reconstruction.");
//         }
//     } catch (e) {
//         console.log("Error during FEN reconstruction:", e);
//     }

//     // Method 5: URL parameters (Less common on Lichess itself)
//     try {
//       const urlParams = new URLSearchParams(window.location.search);
//       potentialFEN = urlParams.get('fen');
//       if (potentialFEN && isValidFENFormat(potentialFEN)) {
//         console.log("Found FEN in URL parameters:", potentialFEN);
//         return potentialFEN;
//       }
//     } catch (e) {
//       console.log("Error getting FEN from URL:", e);
//     }

//     // --- Default ---
//     console.log("Could not extract valid FEN using any method, returning default.");
//     return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
//   } // --- End of extractLichessFEN ---

//   // --- captureLichessBoard (async) ---
//   async function captureLichessBoard(pgn) {
//      // ... (keep the existing captureLichessBoard function content as it was) ...
//      console.log("Starting Lichess board capture process");

//      // Find the best board container element
//      // Prioritize study board, then analysis board, then main game board
//      let boardContainer = document.querySelector('.study__board .cg-wrap') || // Study board wrapper
//                          document.querySelector('.analyse__board .cg-wrap') || // Analysis board wrapper
//                          document.querySelector('.main-board .cg-wrap') || // Main game board wrapper
//                          document.querySelector('cg-board');         // Fallback to cg-board directly

//      if (!boardContainer) {
//          console.error("Could not find a suitable Lichess board container (.cg-wrap or cg-board).");
//          return Promise.reject(new Error("Could not find Lichess board container."));
//      }
//      console.log("Found board container:", boardContainer.tagName, boardContainer.className);

//      // Extract FEN using the improved function
//      let fen = extractLichessFEN(); // This now returns the default FEN if extraction fails
//      console.log("Using FEN for capture:", fen);

//      // Determine board orientation from the container or its parent
//      const orientationElement = boardContainer.closest('.orientation-white, .orientation-black') || boardContainer;
//      const isFlipped = orientationElement.classList.contains('orientation-black');
//      const orientation = isFlipped ? 'black' : 'white';
//      console.log("Board orientation:", orientation);

//      // --- Always use the custom board rendering method ---
//      // This avoids CSP issues with cloning/direct capture and ensures consistency.
//      console.log("Using custom board rendering method.");

//      // Create a temporary off-screen container for rendering
//      const tempContainer = document.createElement('div');
//      tempContainer.id = 'vichar-temp-board-container';
//      tempContainer.style.cssText = `
//        position: fixed !important;
//        top: -9999px !important;
//        left: -9999px !important;
//        width: 600px !important; /* Match custom board size */
//        height: 600px !important;/* Match custom board size */
//        z-index: -1 !important; /* Hide it */
//        background: transparent !important;
//        overflow: hidden !important;
//      `;
//      document.body.appendChild(tempContainer);

//      try {
//          // Create the custom board structure
//          const customBoard = createCustomBoardElement(fen, orientation); // Defined below
//          tempContainer.appendChild(customBoard);
//          console.log("Custom board element created and added to temp container.");

//          // Wait brief moment for elements to potentially render (though usually not needed for inline SVG)
//          await new Promise(resolve => setTimeout(resolve, 50));

//          // Use html2canvas to capture the custom board
//          const canvas = await html2canvas(customBoard, {
//            backgroundColor: null, // Use transparent background
//            scale: 2, // Higher scale for better quality
//            logging: false,
//            useCORS: false, // Not needed for inline SVG data
//            allowTaint: false, // Not needed for inline SVG data
//            width: 600,
//            height: 600,
//            scrollX: 0, // Ensure capture starts at top-left
//            scrollY: 0,
//            windowWidth: 600, // Explicitly set window size for capture
//            windowHeight: 600,
//            imageTimeout: 5000, // 5 second timeout
//            onclone: (clonedDoc, element) => {
//                console.log("Document cloned for html2canvas capture.");
//            }
//          });

//          console.log("html2canvas capture successful.");
//          const imageData = canvas.toDataURL('image/png');

//          // Clean up the temporary container
//          if (tempContainer && tempContainer.parentNode) {
//            tempContainer.parentNode.removeChild(tempContainer);
//          }
//          console.log("Temporary container removed.");

//          // Resolve the promise with the captured data object
//          return { imageData, fen, pgn, orientation, site: 'lichess' };

//      } catch (error) {
//          console.error("Error during custom board rendering or html2canvas capture:", error);
//          // Clean up temp container on error
//          if (tempContainer && tempContainer.parentNode) {
//             tempContainer.parentNode.removeChild(tempContainer);
//          }
//          // Reject the promise
//          return Promise.reject(error);
//      }
//   } // --- End of captureLichessBoard ---

//   // --- createCustomBoardElement ---
//   function createCustomBoardElement(fen, orientation) {
//      // ... (keep the existing createCustomBoardElement function content as it was) ...
//         console.log(`Creating custom board for FEN: ${fen}, Orientation: ${orientation}`);
//         const isFlipped = orientation === 'black';

//         const boardWrapper = document.createElement('div');
//         boardWrapper.className = 'vichar-custom-board'; // Use class for styling

//         // Create background squares
//         const boardBackground = document.createElement('div');
//         boardBackground.className = 'vichar-board-background';
//         for (let rank = 0; rank < 8; rank++) {
//             for (let file = 0; file < 8; file++) {
//                 const square = document.createElement('div');
//                 const isLight = (rank + file) % 2 === 0;
//                 square.className = `vichar-board-square ${isLight ? 'light' : 'dark'}`;
//                 boardBackground.appendChild(square);
//             }
//         }
//         boardWrapper.appendChild(boardBackground);

//         // Add coordinates
//         const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
//         const ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];
//         const displayFiles = isFlipped ? files.slice().reverse() : files;
//         const displayRanks = isFlipped ? ranks.slice() : ranks.slice().reverse(); // Ranks displayed bottom-up

//         // File coordinates (Bottom)
//         for (let i = 0; i < 8; i++) {
//             const fileCoord = document.createElement('div');
//             fileCoord.textContent = displayFiles[i];
//             fileCoord.className = 'vichar-coordinate vichar-file-coord';
//             fileCoord.style.left = `${20 + (i * 70)}px`; // 20 padding + i * square_width
//             boardWrapper.appendChild(fileCoord);
//         }

//         // Rank coordinates (Left)
//         for (let i = 0; i < 8; i++) {
//             const rankCoord = document.createElement('div');
//             rankCoord.textContent = displayRanks[i];
//             rankCoord.className = 'vichar-coordinate vichar-rank-coord';
//             rankCoord.style.top = `${20 + (i * 70)}px`; // 20 padding + i * square_height
//             boardWrapper.appendChild(rankCoord);
//         }

//         // Place pieces based on FEN
//         try {
//             const fenParts = fen.split(' ');
//             const position = fenParts[0];
//             const rows = position.split('/');

//             rows.forEach((row, rankIndex) => { // FEN ranks are 8 down to 1
//                 let fileIndex = 0;
//                 for (let i = 0; i < row.length; i++) {
//                     const char = row[i];
//                     if (!isNaN(parseInt(char))) {
//                         fileIndex += parseInt(char);
//                     } else {
//                         const isWhite = char === char.toUpperCase();
//                         const pieceType = char.toLowerCase();
//                         const color = isWhite ? 'w' : 'b';
//                         const pieceKey = `${color}${pieceType}`;

//                         // Calculate display rank/file based on orientation
//                         let displayRank = isFlipped ? 7 - rankIndex : rankIndex;
//                         let displayFile = isFlipped ? 7 - fileIndex : fileIndex;

//                         const pieceElement = document.createElement('div');
//                         pieceElement.className = 'vichar-piece';
//                         pieceElement.style.top = `${20 + (displayRank * 70)}px`;
//                         pieceElement.style.left = `${20 + (displayFile * 70)}px`;

//                         const svgData = getPieceSvgData(pieceKey); // Defined below
//                         if (svgData) {
//                             // Use innerHTML to directly insert the SVG string
//                             pieceElement.innerHTML = svgData;
//                         } else {
//                             console.warn(`Missing SVG for piece key: ${pieceKey}`);
//                             // Optionally add fallback text or style
//                             pieceElement.textContent = pieceKey;
//                             pieceElement.style.color = isWhite ? '#eee' : '#111';
//                             pieceElement.style.fontSize = '40px';
//                             pieceElement.style.fontWeight = 'bold';
//                         }

//                         boardWrapper.appendChild(pieceElement);
//                         fileIndex++;
//                     }
//                 }
//             });
//              console.log("Pieces placed on custom board.");
//         } catch (fenError) {
//             console.error("Error parsing FEN for custom board:", fenError);
//             // Board will be empty or partially filled, capture will proceed
//         }

//         return boardWrapper;
//   } // --- End of createCustomBoardElement ---

//   // --- getPieceSvgData ---
//   function getPieceSvgData(pieceKey) {
//     // ... (keep the existing getPieceSvgData function content with SVG strings) ...
//      const pieceSvgs = {
//       'wk': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5" stroke-linejoin="miter"/><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z"/><path d="M11.5 30c5.5-3 15.5-3 21 0M11.5 33.5c5.5-3 15.5-3 21 0M11.5 37c5.5-3 15.5-3 21 0"/></g></svg>',
//       'wq': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zm16.5-4.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zm16.5 4.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM16 8.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zm17-1.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0z" fill="#fff"/><path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L7 14l2 12z" stroke-linecap="butt"/><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" stroke-linecap="butt"/><path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none"/></g></svg>',
//       'wr': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12.5 32l1.5-2.5h17l1.5 2.5h-20zM12 36v-4h21v4H12z" stroke-linecap="butt"/><path d="M14 29.5v-13h17v13H14z" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M14 16.5L11 14h23l-3 2.5H14zM11 14V9h4v2h5V9h5v2h5V9h4v5H11z" stroke-linecap="butt"/><path d="M11 14h23" fill="none" stroke-linejoin="miter"/></g></svg>',
//       'wb': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.35.49-2.32.47-3-.5 1.35-1.94 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2zM22.5 10a2.5 2.5 0 1 1 0 5 2.5 2.5 0 1 1 0-5z" stroke-linecap="butt"/><path d="M17.5 26h10M15.5 30h14" fill="none"/></g></svg>',
//       'wn': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.04-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3z"/><path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0zm5.43-9.75a1.5 1.5 0 1 1-1.5 0 1.5 1.5 0 1 1 1.5 0z" fill="#000"/><path d="M24.55 10.4l-.45 1.45.5.15c3.15 1 5.65 2.49 7.9 6.75s2.75 10.56 2.25 20.8l-.05.5h2.25l.05-.5c.5-10.06-.88-16.85-3.25-21.34C33.4 14.2 30 12.05 26.6 11.54l-.51-.1z" fill="none"/></g></svg>',
//       'wp': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"/></g></svg>',
//       'bk': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#000" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5" stroke-linejoin="miter" fill="none"/><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" stroke-linecap="butt" stroke-linejoin="miter" stroke="#fff"/><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z"/><path d="M11.5 30c5.5-3 15.5-3 21 0M11.5 33.5c5.5-3 15.5-3 21 0M11.5 37c5.5-3 15.5-3 21 0" fill="none" stroke="#fff"/></g></svg>',
//       'bq': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#000" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zm16.5-4.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zm16.5 4.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM16 8.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zm17-1.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0z" fill="#000"/><path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L7 14l2 12z" stroke-linecap="butt" stroke="#fff"/><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" stroke-linecap="butt"/><path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none" stroke="#fff"/></g></svg>',
//       'br': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#000" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12.5 32l1.5-2.5h17l1.5 2.5h-20zM12 36v-4h21v4H12z" stroke-linecap="butt"/><path d="M14 29.5v-13h17v13H14z" stroke-linecap="butt" stroke-linejoin="miter" stroke="#fff"/><path d="M14 16.5L11 14h23l-3 2.5H14zM11 14V9h4v2h5V9h5v2h5V9h4v5H11z" stroke-linecap="butt"/><path d="M11 14h23" fill="none" stroke-linejoin="miter" stroke="#fff"/></g></svg>',
//       'bb': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#000" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.35.49-2.32.47-3-.5 1.35-1.94 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2zM22.5 10a2.5 2.5 0 1 1 0 5 2.5 2.5 0 1 1 0-5z" stroke-linecap="butt"/><path d="M17.5 26h10M15.5 30h14" fill="none" stroke="#fff"/></g></svg>',
//       'bn': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#000" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.04-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3z" stroke="#fff"/><path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0zm5.43-9.75a1.5 1.5 0 1 1-1.5 0 1.5 1.5 0 1 1 1.5 0z"/><path d="M24.55 10.4l-.45 1.45.5.15c3.15 1 5.65 2.49 7.9 6.75s2.75 10.56 2.25 20.8l-.05.5h2.25l.05-.5c.5-10.06-.88-16.85-3.25-21.34C33.4 14.2 30 12.05 26.6 11.54l-.51-.1z" fill="none" stroke="#fff"/></g></svg>',
//       'bp': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#000" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"/></g></svg>'
//     };
//     return pieceSvgs[pieceKey] || null;
//   } // --- End of getPieceSvgData ---

//   // --- captureChessComBoard (async, placeholder FEN) ---
//   async function captureChessComBoard(pgn) {
//       // ... (keep the existing captureChessComBoard function content) ...
//       // It uses the custom board renderer, which is good.
//       // TODO: Still needs robust FEN extraction for Chess.com.
//       console.warn("Chess.com capture function needs FEN extraction implementation.");
//       console.log("Received PGN for Chess.com:", pgn);

//       // Placeholder FEN extraction - NEEDS REPLACEMENT
//       let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"; // Default
//       let orientation = "white";

//       // Attempt to find board and orientation
//       const boardElement = document.querySelector('chess-board, div[class^="board "]');
//       if (!boardElement) {
//          console.error("Could not find Chess.com board element.");
//          // Proceed with default FEN/orientation, capture might still work visually
//       } else {
//            if (boardElement.classList.contains('flipped')) {
//               orientation = 'black';
//            }
//            // TODO: Add FEN extraction logic targeting Chess.com elements/data attributes
//            // e.g., boardElement.game.getFEN(), or data attributes on boardElement or parents
//            console.log("Chess.com board found, orientation:", orientation, "(FEN extraction pending)");
//       }


//       // --- Use Custom Board Rendering (Similar to Lichess) ---
//       console.log("Using custom board rendering for Chess.com (FEN potentially placeholder).");
//       const tempContainer = document.createElement('div');
//       tempContainer.id = 'vichar-temp-board-container';
//       tempContainer.style.cssText = `
//          position: fixed !important; top: -9999px !important; left: -9999px !important;
//          width: 600px !important; height: 600px !important; z-index: -1 !important;
//          background: transparent !important; overflow: hidden !important;
//       `;
//       document.body.appendChild(tempContainer);

//       try {
//           const customBoard = createCustomBoardElement(fen, orientation); // Use the same helper
//           tempContainer.appendChild(customBoard);

//           await new Promise(resolve => setTimeout(resolve, 50));

//           const canvas = await html2canvas(customBoard, {
//               backgroundColor: null, scale: 2, logging: false, useCORS: false,
//               allowTaint: false, width: 600, height: 600, scrollX: 0, scrollY: 0,
//               windowWidth: 600, windowHeight: 600, imageTimeout: 5000
//           });
//           const imageData = canvas.toDataURL('image/png');

//           if (tempContainer.parentNode) tempContainer.parentNode.removeChild(tempContainer);

//           // Resolve with captured data
//           return { imageData, fen, pgn, orientation, site: 'chesscom' };

//       } catch (error) {
//           console.error("Error during Chess.com custom board capture:", error);
//           if (tempContainer.parentNode) tempContainer.parentNode.removeChild(tempContainer);
//           // Reject the promise
//           return Promise.reject(error);
//       }
//   } // --- End of captureChessComBoard ---

//   // --- End of Helper Functions within captureChessBoard scope ---

// } // --- End of captureChessBoard function ---


// // Export the main injector function for use in background.js or popup.js
// export { injectCaptureScript };

// // --- END OF FILE scriptInjector.js ---

///
//   yo 
///

// --- START OF FILE scriptInjector.js ---

// This script injects capture functionality dynamically when needed
console.log("Script injector initialized");

// Function to inject the capture script when needed
async function injectCaptureScript(tabId) {
  console.log("Injecting capture script into tab:", tabId);

  try {
    // First inject custom CSS to avoid font CSP violations
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: injectCustomCSS
    });

    console.log("Custom CSS injected successfully");

    // Then inject html2canvas
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['lib/html2canvas.min.js']
    });

    console.log("html2canvas injected successfully");

    // Then inject the capture code
    const result = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: captureChessBoard // The main function to be executed in the page context
    });

    console.log("Capture script injection result (raw):", result);

    // html2canvas promises resolve within the content script,
    // so the result here is what captureChessBoard returns *before* html2canvas finishes.
    // We need to handle the promise that captureChessBoard returns.
    if (result && result[0] && result[0].result && typeof result[0].result.then === 'function') {
      // Handle the promise returned by captureChessBoard
      const finalResult = await result[0].result;
      console.log("Capture script final result (after promise):", finalResult);

      if (finalResult && finalResult.imageData) {
        // Process the captured image data
        await processChessboardImage(finalResult);
        return { success: true };
      } else {
        throw new Error("Capture promise resolved without valid image data.");
      }
    } else if (result && result[0] && result[0].result && result[0].result.imageData) {
       // If it didn't return a promise but has data (less likely with async html2canvas)
       console.log("Capture script result (direct):", result[0].result);
       await processChessboardImage(result[0].result);
       return { success: true };
    } else if (result && result[0] && result[0].error) {
       throw new Error(`Capture script execution error: ${result[0].error.message || result[0].error}`);
    }
    else {
      console.error("Unexpected capture script result structure:", result);
      throw new Error("Failed to capture chess board - unexpected result structure.");
    }
  } catch (error) {
    console.error("Error injecting or executing capture script:", error);
    // Try to get more specific error message if possible
    let errorMessage = error.message;
    if (error.message && error.message.includes("Could not establish connection") && error.message.includes("Receiving end does not exist")) {
        errorMessage = "Cannot connect to the tab. It might be closed, reloading, or a special page (e.g., chrome://).";
    } else if (error.message && error.message.includes("No target with given id")) {
        errorMessage = "The target tab could not be found. It might have been closed.";
    } else if (error.message && error.message.includes("Cannot access contents of url")) {
        errorMessage = `Cannot access this page due to browser restrictions (${error.message.split('"')[1] || 'URL restricted'}). Try on a different page.`;
    }
    return { success: false, error: errorMessage };
  }
}

// Function to inject custom CSS with system fonts to avoid CSP violations
function injectCustomCSS() {
  console.log("Injecting custom CSS with system fonts");

  try {
    // Remove existing style if present
    const existingStyle = document.getElementById('vichar-custom-css');
    if (existingStyle) {
      existingStyle.remove();
    }

    // Create a style element
    const style = document.createElement('style');
    style.id = 'vichar-custom-css';

    // Add CSS rules to use system fonts and avoid external font loading
    // Also includes styles needed for custom board rendering
    style.textContent = `
      /* Use system fonts to avoid CSP violations */
      #vichar-temp-board-container,
      #vichar-temp-board-container *,
      .vichar-custom-board, /* Added class for custom board */
      .vichar-custom-board * {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif !important;
        font-weight: normal !important;
        font-style: normal !important;
        box-sizing: border-box; /* Ensure consistent sizing */
      }

      /* Ensure no external resources are loaded */
      #vichar-temp-board-container,
      .vichar-custom-board {
        background-image: none !important;
        background-color: transparent !important; /* Ensure container bg is transparent */
      }

      /* Hide potentially problematic elements during capture */
      #vichar-temp-board-container .coords,
      #vichar-temp-board-container .promotion-choice,
      #vichar-temp-board-container .piece-promotion {
        display: none !important;
      }

      /* Styling for the custom generated board */
      .vichar-custom-board {
        width: 600px !important;
        height: 600px !important;
        position: relative !important;
        overflow: visible !important;
        background-color: #f0f0f0 !important; /* Light gray background around board */
        padding: 20px !important; /* Padding for coordinates */
      }
      .vichar-board-background {
        width: 560px !important;
        height: 560px !important;
        position: absolute !important;
        top: 20px !important;
        left: 20px !important;
        display: grid !important;
        grid-template-columns: repeat(8, 1fr) !important;
        grid-template-rows: repeat(8, 1fr) !important;
        border: 1px solid #555; /* Add a border around the squares */
      }
      .vichar-board-square {
        width: 100% !important;
        height: 100% !important;
        position: relative !important;
      }
      .vichar-board-square.light {
        background-color: #f0d9b5 !important;
      }
      .vichar-board-square.dark {
        background-color: #b58863 !important;
      }
      .vichar-coordinate {
        position: absolute !important;
        font-size: 12px !important;
        color: #333 !important; /* Darker color for better visibility */
        text-align: center !important;
        line-height: 1 !important; /* Ensure tight line height */
      }
      .vichar-file-coord {
        bottom: 2px !important; /* Position files at the bottom */
        height: 16px; /* Ensure space below board */
        width: 70px; /* Width of a square */
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .vichar-rank-coord {
        left: 2px !important; /* Position ranks on the left */
        width: 16px; /* Ensure space left of board */
        height: 70px; /* Height of a square */
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .vichar-piece {
        position: absolute !important;
        width: 70px !important; /* 560 / 8 */
        height: 70px !important; /* 560 / 8 */
        z-index: 2 !important;
        display: flex !important; /* Use flex to center SVG */
        align-items: center !important;
        justify-content: center !important;
        pointer-events: none; /* Prevent pieces from interfering with capture */
      }
      .vichar-piece svg {
        width: 85% !important; /* Adjust SVG size within square */
        height: 85% !important;
        display: block !important; /* Ensure SVG behaves like a block element */
      }
    `;

    // Add the style element to the document head
    document.head.appendChild(style);

    console.log("Custom CSS injected");
    return true;
  } catch (error) {
    console.error("Error injecting custom CSS:", error);
    return false;
  }
}

// Process the captured chessboard image
async function processChessboardImage(captureResult) {
  if (!captureResult) {
    throw new Error("No capture result received");
  }

  // Extract data from the capture result
  const { imageData, pgn, fen, orientation, site } = captureResult;

  if (!imageData) {
    throw new Error("No image data received");
  }

  try {
    console.log("Storing captured board data");
    console.log("PGN data:", pgn ? `Found (length: ${pgn.length})` : "Not found");
    console.log("FEN data:", fen ? fen : "Not found");
    console.log("Orientation:", orientation);
    console.log("Site:", site);

    // Store the image data and game information for use in the analysis page
    await chrome.storage.local.set({
      capturedBoard: {
        imageData: imageData,
        pgn: pgn || "",
        fen: fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", // Default if not found or invalid
        orientation: orientation || "white",
        site: site || "unknown",
        timestamp: Date.now()
      }
    });

    console.log("Board data stored successfully");
    return { success: true };
  } catch (error) {
    console.error("Error storing chess position:", error);
    throw error;
  }
}

// This function is injected into the tab and captures the chess board
// It now returns a Promise that resolves with the capture data
function captureChessBoard() {
  console.log("Capture function running in page context");

  // Check if html2canvas is available
  if (typeof html2canvas === 'undefined') {
     console.error("html2canvas is not loaded!");
     // Return a rejected promise or throw error
     return Promise.reject(new Error("html2canvas library failed to load. Cannot capture board."));
  }

  // Check if we're on Lichess or Chess.com
  const isLichess = window.location.hostname.includes('lichess.org');
  const isChessCom = window.location.hostname.includes('chess.com');

  console.log("Site detection:", { isLichess, isChessCom });

  // Try to extract PGN data from the page
  let pgn = extractPGN(isLichess, isChessCom);

  // Different handling based on the site
  if (isLichess) {
    // captureLichessBoard now returns a promise directly
    return captureLichessBoard(pgn);
  } else if (isChessCom) {
    // Ensure captureChessComBoard also returns a promise
    return captureChessComBoard(pgn);
  } else {
     // Return a rejected promise for unsupported sites
    return Promise.reject(new Error("Unsupported chess site for capture."));
  }

  // --- Helper functions defined within captureChessBoard scope ---

  // Function to extract PGN based on the site
  function extractPGN(isLichess, isChessCom) {
    // ... (keep the existing extractPGN function content as it was)
    try {
      let pgn = "";

      if (isLichess) {
        // Try multiple methods to find PGN on Lichess
        console.log("Attempting to extract PGN from Lichess");

        // Method 1: Direct PGN element in analysis
        const pgnText = document.querySelector('.pgn');
        if (pgnText && pgnText.textContent) {
          console.log("Found PGN text element");
          return pgnText.textContent.trim();
        }

        // Method 2: PGN from moves area
        const movesArea = document.querySelector('.analyse__moves, .replay');
        if (movesArea) {
          console.log("Found moves area, extracting moves");
          const moveElements = movesArea.querySelectorAll('.move');
          if (moveElements && moveElements.length > 0) {
            let moveTexts = [];
            let currentMoveNumber = 1;
            let currentTurn = 'w';

            // Go through all moves and collect them in proper format
            moveElements.forEach(moveEl => {
              const san = moveEl.getAttribute('data-san') || moveEl.getAttribute('san') || moveEl.textContent.trim();
              if (san) {
                if (currentTurn === 'w') {
                  moveTexts.push(currentMoveNumber + '. ' + san);
                  currentTurn = 'b';
                } else {
                  moveTexts.push(san);
                  currentTurn = 'w';
                  currentMoveNumber++;
                }
              }
            });

            if (moveTexts.length > 0) {
              console.log("Extracted " + moveTexts.length + " moves");
              return moveTexts.join(' ');
            }
          }
        }

        // Method 3: Look for moves in notation
        const notationItems = document.querySelectorAll('.notation-322V9, .analyse__move-list, .move-list');
        if (notationItems && notationItems.length > 0) {
          console.log("Found notation items, extracting moves");
          let moveTexts = [];
          let currentMove = '';

          // Try to extract from all potential notation elements
          for (const container of notationItems) {
            // Get all move text nodes
            const moveNodes = container.querySelectorAll('move, .move, san, .san, l4x, .l4x');
            if (moveNodes && moveNodes.length > 0) {
              console.log(`Found ${moveNodes.length} move nodes`);
              moveNodes.forEach(move => {
                const text = move.textContent.trim();
                if (text) moveTexts.push(text);
              });
            } else {
              // If we can't find specific move elements, try to parse the text content
              const text = container.textContent.trim();
              const movePattern = /\d+\.\s+[a-zA-Z0-9\+#\=\-]+(?:\s+[a-zA-Z0-9\+#\=\-]+)?/g; // Improved pattern
              const matches = text.match(movePattern);
              if (matches && matches.length > 0) {
                moveTexts = matches;
              }
            }

            if (moveTexts.length > 0) break;
          }

          if (moveTexts.length > 0) {
            console.log("Processed move texts:", moveTexts);
            return moveTexts.join(' ');
          }
        }

        // Method 4: Check all page text for PGN-like content
        const bodyText = document.body.textContent;
        // More robust regex for moves (including castling, checks, captures, promotions)
        const pgnRegex = /\b[1-9]\d*\.\s+[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[\+#]?|O-O(?:-O)?\s+(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[\+#]?|O-O(?:-O)?\s+)?\b/;
        if (pgnRegex.test(bodyText)) {
          console.log("Found PGN-like content in page text");
          // Extract a sizable chunk around the match
          const match = bodyText.match(new RegExp('(?:' + pgnRegex.source + '.{0,200}){3,}', 'g'));
          if (match && match[0]) {
             console.log("Extracted PGN chunk from body text");
            return match[0].trim();
          }
        }
      } else if (isChessCom) {
        // Try multiple methods to find PGN on Chess.com
        console.log("Attempting to extract PGN from Chess.com");

        // Method 1: Share Menu PGN
        const pgnElement = document.querySelector('.share-menu-tab-pgn-textarea, textarea.copy-pgn');
        if (pgnElement && pgnElement.value) { // Use .value for textarea
          console.log("Found PGN in share menu textarea");
          return pgnElement.value.trim();
        }

        // Method 2: Look for the PGN button and its data
        const pgnButton = document.querySelector('button[data-cy="share-menu-pgn-button"]');
        if (pgnButton) {
          console.log("Found PGN button, attempting to extract data");
          const pgnData = pgnButton.getAttribute('data-pgn') || pgnButton.getAttribute('data-clipboard-text');
          if (pgnData) {
             console.log("Extracted PGN from button data attribute");
             return pgnData;
          }
        }

        // Method 3: Try looking for share or export elements (Async fetch might not work reliably here)
        // Skipping async fetch in content script for simplicity/reliability

        // Method 4: Global game object direct access
        if (typeof window.ChessComGame !== 'undefined') {
          console.log("Found Chess.com game object");
          if (typeof window.ChessComGame.getPgn === 'function') {
            try {
              const gamePgn = window.ChessComGame.getPgn();
              if (gamePgn) {
                console.log("Got PGN from ChessComGame.getPgn()");
                return gamePgn;
              }
            } catch (e) {
              console.log("Error getting PGN from ChessComGame:", e);
            }
          }
          if (window.ChessComGame.game && window.ChessComGame.game.pgn) {
            console.log("Got PGN from ChessComGame.game.pgn");
            return window.ChessComGame.game.pgn;
          }
        }
        if (typeof chessHelper !== 'undefined' && typeof chessHelper.getPgn === 'function') {
            try {
                const gamePgn = chessHelper.getPgn();
                if (gamePgn) {
                    console.log("Got PGN from chessHelper.getPgn()");
                    return gamePgn;
                }
            } catch(e) { console.log("Error getting PGN from chessHelper", e); }
        }


        // Method 5: Extract from move list elements directly
        const moveList = document.querySelector('.move-list-container, .vertical-move-list');
        if (moveList) {
          console.log("Found move list container");
          // Chess.com structure can vary, target nodes containing moves
          const moveNodes = moveList.querySelectorAll('[data-whole-move-number], div[class^="node"], div[class*="selected"]');
          if (moveNodes.length > 0) {
            console.log("Found " + moveNodes.length + " move nodes/elements");
            let moveTexts = [];
            let lastMoveNumber = 0;

            moveNodes.forEach(node => {
              let moveNumberText = '';
              let whiteMoveText = '';
              let blackMoveText = '';

              // Try getting move number
              const moveNumElement = node.querySelector('div[class^="move-number"], .move-number');
              if (moveNumElement) {
                 moveNumberText = moveNumElement.textContent.trim();
                 if (!moveNumberText.endsWith('.')) moveNumberText += '.';
              } else if (node.getAttribute('data-whole-move-number')) {
                 moveNumberText = node.getAttribute('data-whole-move-number') + '.';
              }


              // Try getting moves (often within divs inside the node)
              const moveElements = node.querySelectorAll('span[data-figurine], div[class*="node-highlight"], div[class^="white"] > span, div[class^="black"] > span');
              if(moveElements.length >= 1) whiteMoveText = moveElements[0].textContent.trim();
              if(moveElements.length >= 2) blackMoveText = moveElements[1].textContent.trim();

              // Fallback if specific spans aren't found
               if (!whiteMoveText && !blackMoveText) {
                    const textContent = node.textContent.trim();
                    const parts = textContent.split(/\s+/);
                    if (parts[0].match(/^\d+\.$/)) { // Format like "1. e4 e5"
                        moveNumberText = parts[0];
                        if (parts[1]) whiteMoveText = parts[1];
                        if (parts[2]) blackMoveText = parts[2];
                    } else if (parts[0]) { // Might just be the move text itself
                       // Need context to know if it's white or black move here - complex
                    }
               }

              // Assemble the move string
              if (moveNumberText && whiteMoveText) {
                 let moveStr = moveNumberText + ' ' + whiteMoveText;
                 if (blackMoveText) {
                   moveStr += ' ' + blackMoveText;
                 }
                 // Avoid duplicates and ensure order
                 const currentMoveNumber = parseInt(moveNumberText);
                 if (currentMoveNumber > lastMoveNumber) {
                    moveTexts.push(moveStr);
                    lastMoveNumber = currentMoveNumber;
                 }
              }
            });

            if (moveTexts.length > 0) {
              const pgn = moveTexts.join(' ').trim();
              console.log("Extracted PGN from move list: " + pgn);
              return pgn;
            }
          }
        }

        // Method 6: PGN metadata in document head
        const metaTags = document.querySelectorAll('meta');
        for (const tag of metaTags) {
          const content = tag.getAttribute('content');
          // Look for basic PGN structure in meta content
          if (content && content.includes('1.') && content.match(/\b[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8]/)) {
            console.log("Found PGN-like content in meta tag");
            return content;
          }
        }

        // Method 7: Look for any element with PGN data
        const allElements = document.querySelectorAll('*[data-pgn]');
        for (const el of allElements) {
          const pgnData = el.getAttribute('data-pgn');
          if (pgnData) {
            console.log("Found element with data-pgn attribute");
            return pgnData;
          }
        }

        // Method 8: Check for moves in any element (Last resort text scan)
        const movePatternRegex = /\b[1-9]\d*\.\s+(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[\+#]?|O-O(?:-O)?)(?:\s+(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[\+#]?|O-O(?:-O)?))?/g;
        const textElements = document.querySelectorAll('div, span, p, pre, code'); // Added pre/code
        for (const el of textElements) {
          // Only check elements likely to contain PGN, ignore tiny ones
          if (el.offsetWidth > 50 && el.offsetHeight > 10) {
            const text = el.textContent;
            if (text && movePatternRegex.test(text)) {
              const movesMatch = text.match(movePatternRegex);
              // Require a decent number of moves to avoid false positives
              if (movesMatch && movesMatch.length >= 3) {
                console.log("Found PGN-like content in text element:", el.className);
                return movesMatch.join(' ');
              }
            }
          }
        }
      }

      console.log("No PGN found using standard methods, returning empty.");
      return pgn; // Return empty string if nothing found
    } catch (error) {
      console.error("Error extracting PGN:", error);
      return ""; // Return empty string if extraction fails
    }
  }

  // Helper function to validate FEN string format
  function isValidFENFormat(fen) {
    if (!fen || typeof fen !== 'string') return false;

    const trimmedFen = fen.trim();
    const fields = trimmedFen.split(/\s+/);

    // 1. Check number of fields (must be 6)
    if (fields.length !== 6) return false;

    // 2. Check piece placement section
    const ranks = fields[0].split('/');
    if (ranks.length !== 8) return false; // Must have 8 ranks
    for (const rank of ranks) {
      let fileCount = 0;
      for (const char of rank) {
        if (/\d/.test(char)) {
          const num = parseInt(char, 10);
          if (num < 1 || num > 8) return false; // Digit must be 1-8
          fileCount += num;
        } else if (/[prnbqkPRNBQK]/.test(char)) {
          fileCount += 1;
        } else {
          return false; // Invalid character in rank
        }
      }
      if (fileCount !== 8) return false; // Each rank must sum to 8 files
    }

    // 3. Check active color
    if (!/^[wb]$/.test(fields[1])) return false;

    // 4. Check castling availability
    if (!/^(KQ?k?q?|Qk?q?|kq?|q|-)$/.test(fields[2].replace(/[^KQkq-]/g, ''))) return false; // Allow only valid chars or '-'

    // 5. Check en passant target square
    if (!/^(-|[a-h][36])$/.test(fields[3])) return false;
    // Ensure en passant is valid given the active color
    if (fields[3] !== '-') {
        const rank = fields[3][1];
        if (fields[1] === 'w' && rank !== '6') return false; // White moves, en passant must be rank 6
        if (fields[1] === 'b' && rank !== '3') return false; // Black moves, en passant must be rank 3
    }

    // 6. Check halfmove clock (non-negative integer)
    if (!/^\d+$/.test(fields[4]) || parseInt(fields[4], 10) < 0) return false;

    // 7. Check fullmove number (positive integer)
    if (!/^\d+$/.test(fields[5]) || parseInt(fields[5], 10) < 1) return false;

    return true; // Passed all checks
  }

  // Function to extract FEN from Lichess - Enhanced for Study Mode (Analysis Off)
  function extractLichessFEN() {
    console.log("Extracting FEN from Lichess using enhanced methods");
    const isStudyPage = window.location.pathname.includes('/study/');
    let potentialFEN = null;

    // --- Prioritize Study-Specific Methods if on a Study Page ---
    if (isStudyPage) {
        console.log("On Lichess study page, prioritizing study FEN methods.");
        try {
          // Method S1: Active node in the move list (often most up-to-date)
          const activeNodeElem = document.querySelector('.analyse__moves .node.active, .moves .node.active'); // Look in analysis or simple moves list
          if (activeNodeElem) {
            potentialFEN = activeNodeElem.getAttribute('data-fen');
            if (potentialFEN && isValidFENFormat(potentialFEN)) {
              console.log("Found FEN in active move node data-fen:", potentialFEN);
              return potentialFEN;
            }
          }

          // Method S2: Study chapter main element data-fen
          const studyChapterElem = document.querySelector('.study__chapter[data-fen]');
          if (studyChapterElem) {
            potentialFEN = studyChapterElem.getAttribute('data-fen');
            if (potentialFEN && isValidFENFormat(potentialFEN)) {
              console.log("Found FEN in study chapter data-fen:", potentialFEN);
              return potentialFEN;
            }
          }

          // Method S3: Lichess study global state
          if (window.Lichess?.study?.currentNode?.fen) {
             potentialFEN = window.Lichess.study.currentNode.fen;
             if (isValidFENFormat(potentialFEN)) {
               console.log("Found FEN in Lichess.study.currentNode:", potentialFEN);
               return potentialFEN;
             }
          }

          // Method S4: Lichess analysis global state (might still be populated in studies)
          if (window.Lichess?.analysis?.node?.fen) {
            potentialFEN = window.Lichess.analysis.node.fen;
            if (isValidFENFormat(potentialFEN)) {
              console.log("Found FEN in Lichess.analysis.node (within study):", potentialFEN);
              return potentialFEN;
            }
          }

        } catch (e) {
          console.log("Error checking specific study FEN sources:", e);
        }
    }

    // --- General Lichess FEN Extraction Methods ---

    // Method 1: Primary data-fen attribute on board wrappers
    try {
        // Include study-specific wrappers
      const boardWrapper = document.querySelector('.cg-wrap[data-fen], .round__app__board[data-fen], .main-board[data-fen], .study__board [data-fen]');
      if (boardWrapper) {
        potentialFEN = boardWrapper.getAttribute('data-fen');
        if (potentialFEN && isValidFENFormat(potentialFEN)) {
          console.log("Found FEN in primary board wrapper data-fen:", potentialFEN);
          return potentialFEN;
        }
      }
    } catch (e) {
      console.log("Error getting FEN from primary data-fen attribute:", e);
    }

    // Method 2: Lichess global state (redundant check for non-study, but safe)
    try {
       if (window.Lichess?.analysis?.node?.fen) { /* ... already checked for study ... */ }
       if (window.Lichess?.chessground?.state?.fen) {
         potentialFEN = window.Lichess.chessground.state.fen;
         if (isValidFENFormat(potentialFEN)) {
           console.log("Found FEN in Lichess.chessground.state:", potentialFEN);
           return potentialFEN;
         }
       }
       if (window.Lichess?.boot?.data?.game?.fen) { /* ... */ }
       if (window.Lichess?.puzzle?.data?.puzzle?.fen) { /* ... */ }
    } catch (e) {
        console.log("Error accessing Lichess global state:", e);
    }


    // Method 3: UI Elements (Input fields, FEN displays)
    try {
      const fenInput = document.querySelector('input.copyable[spellcheck="false"]'); // More specific selector for FEN input
      if (fenInput && fenInput.value) {
        potentialFEN = fenInput.value.trim();
        if (isValidFENFormat(potentialFEN)) {
          console.log("Found FEN in copyable input field:", potentialFEN);
          return potentialFEN;
        }
      }
      const fenDisplay = document.querySelector('.fen .copyable, .copyables .fen'); // Look for display elements
      if (fenDisplay && fenDisplay.textContent) {
        potentialFEN = fenDisplay.textContent.trim();
        if (isValidFENFormat(potentialFEN)) {
          console.log("Found FEN in FEN display element:", potentialFEN);
          return potentialFEN;
        }
      }
    } catch (e) {
        console.log("Error getting FEN from UI elements:", e);
    }

    // Method 4: Fallback - Reconstruct FEN from piece elements (Improved)
    console.log("Attempting FEN reconstruction from visible pieces as fallback...");
    try {
        // Find the most likely board element (cg-board is common)
        const boardElement = document.querySelector('cg-board');
        const boardContainer = boardElement?.closest('.cg-wrap, .round__app__board, .main-board, .study__board'); // Find container for orientation

        if (boardElement && boardContainer) {
            console.log("Found cg-board element for reconstruction.");
            const pieces = boardElement.querySelectorAll('piece');
            console.log(`Found ${pieces.length} piece elements.`);

            if (pieces.length > 0) { // Need at least some pieces
                const boardArray = Array(8).fill().map(() => Array(8).fill(''));
                const isFlipped = boardContainer.classList.contains('orientation-black');
                console.log(`Reconstruction board orientation: ${isFlipped ? 'black' : 'white'}`);

                const boardRect = boardElement.getBoundingClientRect();
                const squareSize = boardRect.width / 8;
                let successCount = 0;
                let errorCount = 0;
                let kingCount = { w: 0, b: 0 }; // Track kings

                pieces.forEach((piece, index) => {
                    try {
                        const pieceClasses = piece.className.split(' ');
                        const colorClass = pieceClasses.find(cls => cls === 'white' || cls === 'black');
                        const typeClass = pieceClasses.find(cls => ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'].includes(cls));
                        const squareClass = pieceClasses.find(cls => cls.startsWith('square-')); // Lichess specific pos class

                        if (!colorClass || !typeClass) {
                            console.log(`Piece ${index} missing color/type class:`, pieceClasses);
                            errorCount++;
                            return;
                        }

                        const color = colorClass === 'white' ? 'w' : 'b';
                        let type = '';
                        switch (typeClass) {
                            case 'king': type = 'k'; break;
                            case 'queen': type = 'q'; break;
                            case 'rook': type = 'r'; break;
                            case 'bishop': type = 'b'; break;
                            case 'knight': type = 'n'; break;
                            case 'pawn': type = 'p'; break;
                        }
                        const pieceFenChar = color === 'w' ? type.toUpperCase() : type;

                        let file = -1, rank = -1;

                        // Method A: Use square-* class if available (more reliable)
                        if (squareClass && squareClass.length === 9) { // e.g., 'square-e4'
                            const squareName = squareClass.substring(7); // "e4"
                            file = squareName.charCodeAt(0) - 'a'.charCodeAt(0);
                            rank = 8 - parseInt(squareName[1], 10);
                             console.log(`Piece ${index} (${pieceFenChar}): Found square class ${squareName} -> [${file}, ${rank}]`);
                        }
                        // Method B: Use transform style (less reliable, might be percentages)
                        else {
                            const transform = piece.style.transform || '';
                            const translateMatch = transform.match(/translate(?:3d)?\(\s*([^,]+)px,\s*([^,]+)px/);
                            const matrixMatch = transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,([^,]+),([^,\)]+)/); // Check matrix too

                            if (translateMatch) {
                                const x = parseFloat(translateMatch[1]);
                                const y = parseFloat(translateMatch[2]);
                                file = Math.round(x / squareSize); // Use round for potentially fractional px
                                rank = Math.round(y / squareSize);
                                console.log(`Piece ${index} (${pieceFenChar}): Found translate(${x},${y}) -> raw [${file}, ${rank}]`);
                            } else if (matrixMatch) {
                                const x = parseFloat(matrixMatch[1]);
                                const y = parseFloat(matrixMatch[2]);
                                file = Math.round(x / squareSize);
                                rank = Math.round(y / squareSize);
                                console.log(`Piece ${index} (${pieceFenChar}): Found matrix -> raw [${file}, ${rank}]`);
                            } else {
                                console.log(`Piece ${index} (${pieceFenChar}): No position info (no square class, no transform)`);
                                errorCount++;
                                return;
                            }
                        }

                        // Adjust for board orientation AFTER getting 0-7 coords relative to top-left
                        let finalRank = isFlipped ? 7 - rank : rank;
                        let finalFile = isFlipped ? 7 - file : file;

                        if (finalFile >= 0 && finalFile < 8 && finalRank >= 0 && finalRank < 8) {
                            if (boardArray[finalRank][finalFile] === '') { // Avoid overwriting if multiple pieces detected on same square
                                boardArray[finalRank][finalFile] = pieceFenChar;
                                successCount++;
                                if (type === 'k') kingCount[color]++;
                                console.log(`   -> Placed ${pieceFenChar} at final [${finalFile}, ${finalRank}] (adjusted for orientation)`);
                            } else {
                                console.log(`   -> Square [${finalFile}, ${finalRank}] already occupied by ${boardArray[finalRank][finalFile]}, skipping ${pieceFenChar}`);
                                errorCount++;
                            }
                        } else {
                            console.log(`Piece ${index} (${pieceFenChar}): Invalid calculated position [${finalFile}, ${finalRank}] from raw [${file}, ${rank}]`);
                            errorCount++;
                        }
                    } catch (err) {
                        console.log(`Error processing piece ${index}:`, err);
                        errorCount++;
                    }
                });

                console.log(`Reconstruction summary: ${successCount} success, ${errorCount} errors. Kings: w=${kingCount.w}, b=${kingCount.b}`);

                // Validate reconstruction: Need both kings and a reasonable number of pieces
                if (kingCount.w === 1 && kingCount.b === 1 && successCount >= 8) {
                    let fenPosition = '';
                    for (let r = 0; r < 8; r++) {
                        let emptyCount = 0;
                        for (let f = 0; f < 8; f++) {
                            if (boardArray[r][f] === '') {
                                emptyCount++;
                            } else {
                                if (emptyCount > 0) fenPosition += emptyCount;
                                fenPosition += boardArray[r][f];
                                emptyCount = 0;
                            }
                        }
                        if (emptyCount > 0) fenPosition += emptyCount;
                        if (r < 7) fenPosition += '/';
                    }

                    // Cannot reliably determine turn, castling, en passant from pieces alone
                    // Use 'w' as default turn, standard castling/en passant placeholders
                    potentialFEN = `${fenPosition} w KQkq - 0 1`;
                    if (isValidFENFormat(potentialFEN)) {
                         console.log("Successfully reconstructed FEN:", potentialFEN);
                         return potentialFEN;
                    } else {
                         console.log("Reconstructed FEN is invalid:", potentialFEN);
                    }
                } else {
                    console.log("Reconstruction failed validation (missing kings or too few pieces).");
                }
            }
        } else {
             console.log("Could not find suitable board element (cg-board) for reconstruction.");
        }
    } catch (e) {
        console.log("Error during FEN reconstruction:", e);
    }

    // Method 5: URL parameters (Less common on Lichess itself)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      potentialFEN = urlParams.get('fen');
      if (potentialFEN && isValidFENFormat(potentialFEN)) {
        console.log("Found FEN in URL parameters:", potentialFEN);
        return potentialFEN;
      }
    } catch (e) {
      console.log("Error getting FEN from URL:", e);
    }

    // --- Default ---
    console.log("Could not extract valid FEN using any method, returning default.");
    return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  }

  // Function to capture board on Lichess with enhanced quality and reliability
  async function captureLichessBoard(pgn) {
     console.log("Starting Lichess board capture process");

     // Find the best board container element
     // Prioritize study board, then analysis board, then main game board
     let boardContainer = document.querySelector('.study__board .cg-wrap') || // Study board wrapper
                         document.querySelector('.analyse__board .cg-wrap') || // Analysis board wrapper
                         document.querySelector('.main-board .cg-wrap') || // Main game board wrapper
                         document.querySelector('cg-board');         // Fallback to cg-board directly
     
     if (!boardContainer) {
         console.error("Could not find a suitable Lichess board container (.cg-wrap or cg-board).");
         return Promise.reject(new Error("Could not find Lichess board container."));
     }
     console.log("Found board container:", boardContainer.tagName, boardContainer.className);

     // Extract FEN using the improved function
     let fen = extractLichessFEN(); // This now returns the default FEN if extraction fails
     console.log("Using FEN for capture:", fen);

     // Determine board orientation from the container or its parent
     const orientationElement = boardContainer.closest('.orientation-white, .orientation-black') || boardContainer;
     const isFlipped = orientationElement.classList.contains('orientation-black');
     const orientation = isFlipped ? 'black' : 'white';
     console.log("Board orientation:", orientation);

     // --- Always use the custom board rendering method ---
     // This avoids CSP issues with cloning/direct capture and ensures consistency.
     console.log("Using custom board rendering method.");

     // Create a temporary off-screen container for rendering
     const tempContainer = document.createElement('div');
     tempContainer.id = 'vichar-temp-board-container';
     tempContainer.style.cssText = `
       position: fixed !important;
       top: -9999px !important;
       left: -9999px !important;
       width: 600px !important; /* Match custom board size */
       height: 600px !important;/* Match custom board size */
       z-index: -1 !important; /* Hide it */
       background: transparent !important;
       overflow: hidden !important;
     `;
     document.body.appendChild(tempContainer);

     try {
         // Create the custom board structure
         const customBoard = createCustomBoardElement(fen, orientation);
         tempContainer.appendChild(customBoard);
         console.log("Custom board element created and added to temp container.");

         // Wait brief moment for elements to potentially render (though usually not needed for inline SVG)
         await new Promise(resolve => setTimeout(resolve, 50));

         // Use html2canvas to capture the custom board
         const canvas = await html2canvas(customBoard, {
           backgroundColor: null, // Use transparent background
           scale: 2, // Higher scale for better quality
           logging: false,
           useCORS: false, // Not needed for inline SVG data
           allowTaint: false, // Not needed for inline SVG data
           width: 600,
           height: 600,
           scrollX: 0, // Ensure capture starts at top-left
           scrollY: 0,
           windowWidth: 600, // Explicitly set window size for capture
           windowHeight: 600,
           imageTimeout: 5000, // 5 second timeout
           onclone: (clonedDoc, element) => {
               console.log("Document cloned for html2canvas capture.");
               // Ensure styles are applied in the clone if needed (usually okay with inline styles/SVG)
               // Example: Force repaint if issues occur
               // element.style.display = 'none';
               // element.offsetHeight; // Trigger reflow
               // element.style.display = '';
           }
         });

         console.log("html2canvas capture successful.");
         const imageData = canvas.toDataURL('image/png');

         // Clean up the temporary container
         if (tempContainer && tempContainer.parentNode) {
           tempContainer.parentNode.removeChild(tempContainer);
         }
         console.log("Temporary container removed.");

         // Resolve the promise with the captured data
         return { imageData, fen, pgn, orientation, site: 'lichess' };

     } catch (error) {
         console.error("Error during custom board rendering or html2canvas capture:", error);
         // Clean up temp container on error
         if (tempContainer && tempContainer.parentNode) {
            tempContainer.parentNode.removeChild(tempContainer);
         }
         // Reject the promise
         return Promise.reject(error);
     }
  }

   // Function to create the custom board DOM element with pieces
   function createCustomBoardElement(fen, orientation) {
        console.log(`Creating custom board for FEN: ${fen}, Orientation: ${orientation}`);
        const isFlipped = orientation === 'black';

        const boardWrapper = document.createElement('div');
        boardWrapper.className = 'vichar-custom-board'; // Use class for styling

        // Create background squares
        const boardBackground = document.createElement('div');
        boardBackground.className = 'vichar-board-background';
        for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
                const square = document.createElement('div');
                const isLight = (rank + file) % 2 === 0;
                square.className = `vichar-board-square ${isLight ? 'light' : 'dark'}`;
                boardBackground.appendChild(square);
            }
        }
        boardWrapper.appendChild(boardBackground);

        // Add coordinates
        const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        const ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];
        const displayFiles = isFlipped ? files.slice().reverse() : files;
        const displayRanks = isFlipped ? ranks.slice() : ranks.slice().reverse(); // Ranks displayed bottom-up

        // File coordinates (Bottom)
        for (let i = 0; i < 8; i++) {
            const fileCoord = document.createElement('div');
            fileCoord.textContent = displayFiles[i];
            fileCoord.className = 'vichar-coordinate vichar-file-coord';
            fileCoord.style.left = `${20 + (i * 70)}px`; // 20 padding + i * square_width
            boardWrapper.appendChild(fileCoord);
        }

        // Rank coordinates (Left)
        for (let i = 0; i < 8; i++) {
            const rankCoord = document.createElement('div');
            rankCoord.textContent = displayRanks[i];
            rankCoord.className = 'vichar-coordinate vichar-rank-coord';
            rankCoord.style.top = `${20 + (i * 70)}px`; // 20 padding + i * square_height
            boardWrapper.appendChild(rankCoord);
        }

        // Place pieces based on FEN
        try {
            const fenParts = fen.split(' ');
            const position = fenParts[0];
            const rows = position.split('/');

            rows.forEach((row, rankIndex) => { // FEN ranks are 8 down to 1
                let fileIndex = 0;
                for (let i = 0; i < row.length; i++) {
                    const char = row[i];
                    if (!isNaN(parseInt(char))) {
                        fileIndex += parseInt(char);
                    } else {
                        const isWhite = char === char.toUpperCase();
                        const pieceType = char.toLowerCase();
                        const color = isWhite ? 'w' : 'b';
                        const pieceKey = `${color}${pieceType}`;

                        // Calculate display rank/file based on orientation
                        let displayRank = isFlipped ? 7 - rankIndex : rankIndex;
                        let displayFile = isFlipped ? 7 - fileIndex : fileIndex;

                        const pieceElement = document.createElement('div');
                        pieceElement.className = 'vichar-piece';
                        pieceElement.style.top = `${20 + (displayRank * 70)}px`;
                        pieceElement.style.left = `${20 + (displayFile * 70)}px`;

                        const svgData = getPieceSvgData(pieceKey);
                        if (svgData) {
                            // Use innerHTML to directly insert the SVG string
                            pieceElement.innerHTML = svgData;
                        } else {
                            console.warn(`Missing SVG for piece key: ${pieceKey}`);
                            // Optionally add fallback text or style
                            pieceElement.textContent = pieceKey;
                            pieceElement.style.color = isWhite ? '#eee' : '#111';
                            pieceElement.style.fontSize = '40px';
                            pieceElement.style.fontWeight = 'bold';
                        }

                        boardWrapper.appendChild(pieceElement);
                        fileIndex++;
                    }
                }
            });
             console.log("Pieces placed on custom board.");
        } catch (fenError) {
            console.error("Error parsing FEN for custom board:", fenError);
            // Board will be empty or partially filled, capture will proceed
        }

        return boardWrapper;
    }


  // Helper function to get SVG data for chess pieces (Self-contained)
  function getPieceSvgData(pieceKey) {
    // Simple SVG representations of chess pieces (using Merida style from Lichess assets for better look)
    // Source: https://github.com/lichess-org/lila/tree/master/public/piece/merida
    // Simplified and embedded as data. Stroke/fill adjusted.
    const pieceSvgs = {
      'wk': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5" stroke-linejoin="miter"/><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z"/><path d="M11.5 30c5.5-3 15.5-3 21 0M11.5 33.5c5.5-3 15.5-3 21 0M11.5 37c5.5-3 15.5-3 21 0"/></g></svg>',
      'wq': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zm16.5-4.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zm16.5 4.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM16 8.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zm17-1.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0z" fill="#fff"/><path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L7 14l2 12z" stroke-linecap="butt"/><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" stroke-linecap="butt"/><path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none"/></g></svg>',
      'wr': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12.5 32l1.5-2.5h17l1.5 2.5h-20zM12 36v-4h21v4H12z" stroke-linecap="butt"/><path d="M14 29.5v-13h17v13H14z" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M14 16.5L11 14h23l-3 2.5H14zM11 14V9h4v2h5V9h5v2h5V9h4v5H11z" stroke-linecap="butt"/><path d="M11 14h23" fill="none" stroke-linejoin="miter"/></g></svg>',
      'wb': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.35.49-2.32.47-3-.5 1.35-1.94 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2zM22.5 10a2.5 2.5 0 1 1 0 5 2.5 2.5 0 1 1 0-5z" stroke-linecap="butt"/><path d="M17.5 26h10M15.5 30h14" fill="none"/></g></svg>',
      'wn': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.04-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3z"/><path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0zm5.43-9.75a1.5 1.5 0 1 1-1.5 0 1.5 1.5 0 1 1 1.5 0z" fill="#000"/><path d="M24.55 10.4l-.45 1.45.5.15c3.15 1 5.65 2.49 7.9 6.75s2.75 10.56 2.25 20.8l-.05.5h2.25l.05-.5c.5-10.06-.88-16.85-3.25-21.34C33.4 14.2 30 12.05 26.6 11.54l-.51-.1z" fill="none"/></g></svg>',
      'wp': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"/></g></svg>',
      'bk': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#000" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5" stroke-linejoin="miter" fill="none"/><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" stroke-linecap="butt" stroke-linejoin="miter" stroke="#fff"/><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z"/><path d="M11.5 30c5.5-3 15.5-3 21 0M11.5 33.5c5.5-3 15.5-3 21 0M11.5 37c5.5-3 15.5-3 21 0" fill="none" stroke="#fff"/></g></svg>',
      'bq': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#000" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12a2 2 0 1 1-4 0 2 2 0 1 1 4 0zm16.5-4.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zm16.5 4.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zM16 8.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0zm17-1.5a2 2 0 1 1-4 0 2 2 0 1 1 4 0z" fill="#000"/><path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L7 14l2 12z" stroke-linecap="butt" stroke="#fff"/><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" stroke-linecap="butt"/><path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none" stroke="#fff"/></g></svg>',
      'br': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#000" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12.5 32l1.5-2.5h17l1.5 2.5h-20zM12 36v-4h21v4H12z" stroke-linecap="butt"/><path d="M14 29.5v-13h17v13H14z" stroke-linecap="butt" stroke-linejoin="miter" stroke="#fff"/><path d="M14 16.5L11 14h23l-3 2.5H14zM11 14V9h4v2h5V9h5v2h5V9h4v5H11z" stroke-linecap="butt"/><path d="M11 14h23" fill="none" stroke-linejoin="miter" stroke="#fff"/></g></svg>',
      'bb': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#000" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.35.49-2.32.47-3-.5 1.35-1.94 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2zM22.5 10a2.5 2.5 0 1 1 0 5 2.5 2.5 0 1 1 0-5z" stroke-linecap="butt"/><path d="M17.5 26h10M15.5 30h14" fill="none" stroke="#fff"/></g></svg>',
      'bn': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#000" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.04-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3z" stroke="#fff"/><path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0zm5.43-9.75a1.5 1.5 0 1 1-1.5 0 1.5 1.5 0 1 1 1.5 0z"/><path d="M24.55 10.4l-.45 1.45.5.15c3.15 1 5.65 2.49 7.9 6.75s2.75 10.56 2.25 20.8l-.05.5h2.25l.05-.5c.5-10.06-.88-16.85-3.25-21.34C33.4 14.2 30 12.05 26.6 11.54l-.51-.1z" fill="none" stroke="#fff"/></g></svg>',
      'bp': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#000" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"/></g></svg>'
    };
    return pieceSvgs[pieceKey] || null;
  }

  // Function to capture board on Chess.com (Needs implementation or refinement)
  async function captureChessComBoard(pgn) {
      console.warn("Chess.com capture function needs implementation/refinement.");
      console.log("Received PGN for Chess.com:", pgn);
      // Placeholder FEN extraction
      let fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"; // Default
      let orientation = "white";

      // TODO: Implement robust FEN extraction for Chess.com
      // Look for elements like <chess-board data-board="..." data-orientation="...">
      // Or use window variables if available (e.g., from chess-board element's JS controller)

      // TODO: Implement board capture logic for Chess.com
      // Find the primary board element (e.g., 'chess-board', 'div[class^="board "]')
      // Use the custom board rendering or attempt direct clone + html2canvas
      const boardElement = document.querySelector('chess-board, div[class^="board "]');
      if (!boardElement) {
         return Promise.reject(new Error("Could not find Chess.com board element."));
      }

       // Basic orientation check
       if (boardElement.classList.contains('flipped')) {
          orientation = 'black';
       }

      // --- Use Custom Board Rendering (Similar to Lichess) ---
      console.log("Using custom board rendering for Chess.com (placeholder FEN).");
      const tempContainer = document.createElement('div');
      tempContainer.id = 'vichar-temp-board-container';
      // ... (add styling as in Lichess capture) ...
      document.body.appendChild(tempContainer);

      try {
          const customBoard = createCustomBoardElement(fen, orientation); // Use the same helper
          tempContainer.appendChild(customBoard);

          await new Promise(resolve => setTimeout(resolve, 50));

          const canvas = await html2canvas(customBoard, { /* ... options ... */ });
          const imageData = canvas.toDataURL('image/png');

          if (tempContainer.parentNode) tempContainer.parentNode.removeChild(tempContainer);

          return { imageData, fen, pgn, orientation, site: 'chesscom' };

      } catch (error) {
          console.error("Error during Chess.com custom board capture:", error);
          if (tempContainer.parentNode) tempContainer.parentNode.removeChild(tempContainer);
          return Promise.reject(error);
      }
  }

} // End of captureChessBoard function

// Export the main injector function for use in background.js
export { injectCaptureScript };

// --- END OF FILE scriptInjector.js ---
