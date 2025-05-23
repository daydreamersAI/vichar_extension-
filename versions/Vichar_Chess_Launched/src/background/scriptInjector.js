// // --- START OF FILE scriptInjector.js ---

// // This script injects capture functionality dynamically when needed
console.log("Script injector initialized");

// Helper function to validate FEN string format - moved to top level scope
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

    // First inject the utility function so it's available in the page context
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: function() {
        // Define the function in the global scope of the page
        window.isValidFENFormat = function(fen) {
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
          if (!/^(KQ?k?q?|Qk?q?|kq?|q|-)$/.test(fields[2].replace(/[^KQkq-]/g, ''))) return false;

          // 5. Check en passant target square
          if (!/^(-|[a-h][36])$/.test(fields[3])) return false;

          return true; // Passed all checks
        };
      }
    });

    console.log("FEN validation function injected successfully");

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
        // Process the captured image data and return the processed result directly
        return await processChessboardImage(finalResult);
      } else {
        throw new Error("Capture promise resolved without valid image data.");
      }
    } else if (result && result[0] && result[0].result && result[0].result.imageData) {
       // If it didn't return a promise but has data (less likely with async html2canvas)
       console.log("Capture script result (direct):", result[0].result);
       // Process and return the result directly
       return await processChessboardImage(result[0].result);
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
  try {
    if (!captureResult) {
      throw new Error("No capture result received");
    }

    // Extract data from the capture result
    const { imageData, pgn, fen, orientation, site } = captureResult;

    if (!imageData) {
      throw new Error("No image data received");
    }

    console.log("Processing captured board data:");
    console.log("PGN data:", pgn ? `Found (length: ${pgn.length})` : "Not found");
    console.log("FEN data:", fen ? fen : "Not found");
    console.log("Orientation:", orientation);
    console.log("Site:", site);

    // Use our own validation rather than depending on the injected function
    if (!fen) {
      console.error("Missing FEN string");
      throw new Error("Missing FEN string");
    }

    // Create the board data object
    const boardData = {
      imageData: imageData,
      pgn: pgn || "",
      fen: fen,
      orientation: orientation || "white",
      site: site || "unknown",
      timestamp: Date.now()
    };

    // Store the board data
    await chrome.storage.local.set({
      capturedBoard: boardData
    });

    console.log("Board data stored successfully");
    
    // Return a properly structured response
    return {
      success: true,
      data: boardData
    };
  } catch (error) {
    console.error("Error processing chess position:", error);
    // Return a properly structured error response
    return {
      success: false,
      error: error.message || "Failed to process chess position"
    };
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

        // Method 1: Share Menu PGN (Updated selectors)
        const pgnElement = document.querySelector('.share-menu-tab-pgn-textarea, textarea.copy-pgn, .share-menu__pgn-textarea');
        if (pgnElement && (pgnElement.value || pgnElement.textContent)) {
          console.log("Found PGN in share menu textarea");
          return (pgnElement.value || pgnElement.textContent).trim();
        }

        // Method 2: Look for the PGN button and its data (Updated selectors)
        const pgnButton = document.querySelector('button[data-cy="share-menu-pgn-button"], .share-menu__pgn-button, .share-menu__button--pgn');
        if (pgnButton) {
          console.log("Found PGN button, attempting to extract data");
          const pgnData = pgnButton.getAttribute('data-pgn') || 
                         pgnButton.getAttribute('data-clipboard-text') ||
                         pgnButton.getAttribute('data-pgn-text');
          if (pgnData) {
             console.log("Extracted PGN from button data attribute");
             return pgnData;
          }
        }

        // Method 3: Global game object direct access (Updated to handle both old and new chess.com structure)
        if (typeof window.ChessComGame !== 'undefined') {
          console.log("Found Chess.com game object");
          try {
            // Try the new structure first
            if (window.ChessComGame.game && typeof window.ChessComGame.game.getPgn === 'function') {
              const gamePgn = window.ChessComGame.game.getPgn();
              if (gamePgn) {
                console.log("Got PGN from ChessComGame.game.getPgn()");
                return gamePgn;
              }
            }
            // Try the old structure
            if (typeof window.ChessComGame.getPgn === 'function') {
              const gamePgn = window.ChessComGame.getPgn();
              if (gamePgn) {
                console.log("Got PGN from ChessComGame.getPgn()");
                return gamePgn;
              }
            }
            // Try direct access to pgn property
            if (window.ChessComGame.game && window.ChessComGame.game.pgn) {
              console.log("Got PGN from ChessComGame.game.pgn");
              return window.ChessComGame.game.pgn;
            }
          } catch (e) {
            console.log("Error accessing ChessComGame:", e);
          }
        }

        // Method 4: Extract from move list elements directly (Updated selectors)
        const moveList = document.querySelector('.move-list-container, .vertical-move-list, .move-list, .moves');
        if (moveList) {
          console.log("Found move list container");
          // Updated selectors for move nodes
          const moveNodes = moveList.querySelectorAll('[data-whole-move-number], .node, .move, .move-text-component, [class*="node-"]');
          if (moveNodes.length > 0) {
            console.log("Found " + moveNodes.length + " move nodes/elements");
            let moveTexts = [];
            let lastMoveNumber = 0;

            moveNodes.forEach(node => {
              let moveNumberText = '';
              let whiteMoveText = '';
              let blackMoveText = '';

              // Try getting move number (Updated selectors)
              const moveNumElement = node.querySelector('.move-number, [class*="move-number"], [class*="node-number"]');
              if (moveNumElement) {
                 moveNumberText = moveNumElement.textContent.trim();
                 if (!moveNumberText.endsWith('.')) moveNumberText += '.';
              } else if (node.getAttribute('data-whole-move-number')) {
                 moveNumberText = node.getAttribute('data-whole-move-number') + '.';
              }

              // Try getting moves (Updated selectors)
              const moveElements = node.querySelectorAll('[data-figurine], [class*="node-highlight"], [class*="move-text"], [class*="san"], [class*="notation"]');
              if(moveElements.length >= 1) whiteMoveText = moveElements[0].textContent.trim();
              if(moveElements.length >= 2) blackMoveText = moveElements[1].textContent.trim();

              // Fallback if specific elements aren't found
               if (!whiteMoveText && !blackMoveText) {
                    const textContent = node.textContent.trim();
                    const parts = textContent.split(/\s+/);
                    if (parts[0].match(/^\d+\.$/)) {
                        moveNumberText = parts[0];
                        if (parts[1]) whiteMoveText = parts[1];
                        if (parts[2]) blackMoveText = parts[2];
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

        // Method 5: Try to find PGN in the game data object
        try {
          const gameData = window.gameData || window.chessGameData;
          if (gameData && gameData.pgn) {
            console.log("Found PGN in game data object");
            return gameData.pgn;
          }
        } catch (e) {
          console.log("Error accessing game data:", e);
        }

        // Method 6: Look for PGN in any data attributes
        const pgnElements = document.querySelectorAll('[data-pgn], [data-game-pgn], [data-clipboard-text*="1."]');
        for (const el of pgnElements) {
          const pgnData = el.getAttribute('data-pgn') || 
                         el.getAttribute('data-game-pgn') || 
                         el.getAttribute('data-clipboard-text');
          if (pgnData && pgnData.includes('1.')) {
            console.log("Found PGN in data attribute");
            return pgnData;
          }
        }

        // Method 7: Last resort - scan for PGN-like content in the page
        const movePatternRegex = /\b[1-9]\d*\.\s+(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[\+#]?|O-O(?:-O)?)(?:\s+(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[\+#]?|O-O(?:-O)?))?/g;
        const textElements = document.querySelectorAll('div, span, p, pre, code');
        for (const el of textElements) {
          if (el.offsetWidth > 50 && el.offsetHeight > 10) {
            const text = el.textContent;
            if (text && movePatternRegex.test(text)) {
              const movesMatch = text.match(movePatternRegex);
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
            if (potentialFEN && window.isValidFENFormat(potentialFEN)) {
              console.log("Found FEN in active move node data-fen:", potentialFEN);
              return potentialFEN;
            }
          }

          // Method S2: Study chapter main element data-fen
          const studyChapterElem = document.querySelector('.study__chapter[data-fen]');
          if (studyChapterElem) {
            potentialFEN = studyChapterElem.getAttribute('data-fen');
            if (potentialFEN && window.isValidFENFormat(potentialFEN)) {
              console.log("Found FEN in study chapter data-fen:", potentialFEN);
              return potentialFEN;
            }
          }

          // Method S3: Lichess study global state
          if (window.Lichess?.study?.currentNode?.fen) {
             potentialFEN = window.Lichess.study.currentNode.fen;
             if (window.isValidFENFormat(potentialFEN)) {
               console.log("Found FEN in Lichess.study.currentNode:", potentialFEN);
               return potentialFEN;
             }
          }

          // Method S4: Lichess analysis global state (might still be populated in studies)
          if (window.Lichess?.analysis?.node?.fen) {
            potentialFEN = window.Lichess.analysis.node.fen;
            if (window.isValidFENFormat(potentialFEN)) {
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
        if (potentialFEN && window.isValidFENFormat(potentialFEN)) {
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
         if (window.isValidFENFormat(potentialFEN)) {
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
        if (window.isValidFENFormat(potentialFEN)) {
          console.log("Found FEN in copyable input field:", potentialFEN);
          return potentialFEN;
        }
      }
      const fenDisplay = document.querySelector('.fen .copyable, .copyables .fen'); // Look for display elements
      if (fenDisplay && fenDisplay.textContent) {
        potentialFEN = fenDisplay.textContent.trim();
        if (window.isValidFENFormat(potentialFEN)) {
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
                            console.warn(`Piece ${index} missing color or type classes:`, piece.className);
                            errorCount++;
                            return;
                        }

                        // Default extraction method - get position from transform if available
                        let position = { file: -1, rank: -1 };
                        
                        // First try: Use square-XX class if present (modern Lichess)
                        if (squareClass) {
                            console.log(`Using square class for position: ${squareClass}`);
                            const square = squareClass.replace('square-', '');
                            
                            if (square && square.length === 2) {
                                const file = parseInt(square[0], 10) - 1; // 1-8 => 0-7
                                const rank = 8 - parseInt(square[1], 10); // 1-8 => 7-0
                                position = { file, rank };
                            }
                        }
                        
                        // Second try: Use transform/style.left/top if position still invalid
                        if (position.file < 0 || position.rank < 0 || position.file > 7 || position.rank > 7) {
                            // Get position from transform: translate(x, y) style
                            const transformValue = piece.style.transform;
                            
                            if (transformValue && transformValue.startsWith('translate(')) {
                                const coords = transformValue.slice(10, -1).split(',').map(v => parseFloat(v));
                                console.log(`Piece ${index} (${colorClass[0]}${typeClass[0]}): Found ${transformValue} -> raw [${coords[0] / squareSize}, ${coords[1] / squareSize}]`);
                                
                                if (coords.length === 2) {
                                    const fileIdx = Math.round(coords[0] / squareSize);
                                    const rankIdx = Math.round(coords[1] / squareSize);
                                    
                                    // Adjust based on board orientation
                                    position.file = isFlipped ? 7 - fileIdx : fileIdx;
                                    position.rank = isFlipped ? 7 - rankIdx : rankIdx;
                                }
                            }
                        }
                        
                        // Only proceed if we have a valid position
                        if (position.file < 0 || position.rank < 0 || position.file > 7 || position.rank > 7) {
                            console.warn(`Piece ${index} position out of bounds:`, position);
                            errorCount++;
                            return;
                        }
                        
                        console.log(`   -> Placed ${colorClass[0]}${typeClass[0]} at final [${position.file}, ${position.rank}] (adjusted for orientation)`);
                        
                        // Set the piece in our array
                        let fenChar;
                        switch (typeClass) {
                            case 'king': fenChar = 'k'; kingCount[colorClass === 'white' ? 'w' : 'b']++; break;
                            case 'queen': fenChar = 'q'; break;
                            case 'rook': fenChar = 'r'; break;
                            case 'bishop': fenChar = 'b'; break;
                            case 'knight': fenChar = 'n'; break;
                            case 'pawn': fenChar = 'p'; break;
                        }
                        
                        if (fenChar) {
                            boardArray[position.rank][position.file] = colorClass === 'white' ? fenChar.toUpperCase() : fenChar;
                            successCount++;
                        }
                    } catch (e) {
                        console.warn(`Error processing piece ${index}:`, e);
                        errorCount++;
                    }
                });
                
                console.log(`Reconstruction summary: ${successCount} success, ${errorCount} errors. Kings: w=${kingCount.w}, b=${kingCount.b}`);
                
                // Only proceed if we have a valid board (at least some pieces and both kings)
                if (successCount > 0 && kingCount.w === 1 && kingCount.b === 1) {
                    // Convert the board array to FEN notation
                    let fen = boardArray.map(row => {
                        let rowStr = '';
                        let emptyCount = 0;
                        
                        for (let i = 0; i < 8; i++) {
                            if (row[i] === '') {
                                emptyCount++;
                            } else {
                                if (emptyCount > 0) {
                                    rowStr += emptyCount;
                                    emptyCount = 0;
                                }
                                rowStr += row[i];
                            }
                        }
                        
                        if (emptyCount > 0) {
                            rowStr += emptyCount;
                        }
                        
                        return rowStr;
                    }).join('/');
                    
                    // Add the rest of the FEN components - default to white's turn, all castling possible
                    fen += ' w KQkq - 0 1';
                    
                    // Validate the reconstructed FEN
                    if (window.isValidFENFormat(fen)) {
                        console.log("Successfully reconstructed FEN:", fen);
                        return fen;
                    } else {
                        console.error("Generated FEN failed validation:", fen);
                    }
                } else {
                    console.error("Incomplete board reconstruction, missing kings or too few pieces.");
                }
            }
        } else {
            console.warn("Could not find necessary elements for board reconstruction.");
        }
    } catch (e) {
        console.error("Error during board reconstruction:", e);
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
      console.log("Starting Chess.com board capture with PGN:", pgn);

      try {
          // Find the board element with more comprehensive selectors
          const boardElement = document.querySelector('chess-board, div[class^="board"], div[class*="board-"], div[class*="chessboard"], div[data-board], div[id*="board"], .board-b72b1, .board-modal-board, .board-container');
          if (!boardElement) {
              throw new Error("Could not find Chess.com board element");
          }

          // Get orientation
          const orientation = boardElement.classList.contains('flipped') || 
              boardElement.getAttribute('data-orientation') === 'black' ||
              document.querySelector('.board-flipped') ? 'black' : 'white';
          console.log("Board orientation:", orientation);

          // Get the current FEN directly from Chess.com's internal state
          let fen = null;

          // Method 1: Try to get FEN from the game's internal state
          try {
              if (window.ChessComGame?.game?.state?.fen) {
                  fen = window.ChessComGame.game.state.fen;
                  console.log("Got FEN from ChessComGame.game.state.fen:", fen);
              } else if (window.ChessComGame?.game?.position?.fen) {
                  fen = window.ChessComGame.game.position.fen;
                  console.log("Got FEN from ChessComGame.game.position.fen:", fen);
              } else if (window.ChessComGame?.game?.fen) {
                  fen = typeof window.ChessComGame.game.fen === 'function' ? 
                    window.ChessComGame.game.fen() : window.ChessComGame.game.fen;
                  console.log("Got FEN from ChessComGame.game.fen:", fen);
              } else if (typeof window.ChessComGame?.game?.getFen === 'function') {
                  fen = window.ChessComGame.game.getFen();
                  console.log("Got FEN from ChessComGame.game.getFen():", fen);
              } else if (window.game?.getFen) {
                  fen = window.game.getFen();
                  console.log("Got FEN from window.game.getFen():", fen);
              } else if (window.game?.fen) {
                  fen = typeof window.game.fen === 'function' ? window.game.fen() : window.game.fen;
                  console.log("Got FEN from window.game.fen:", fen);
              } else if (window.chessboard?.getFen) {
                  fen = window.chessboard.getFen();
                  console.log("Got FEN from window.chessboard.getFen():", fen);
              } else if (window.chessboard?.fen) {
                  fen = typeof window.chessboard.fen === 'function' ? window.chessboard.fen() : window.chessboard.fen;
                  console.log("Got FEN from window.chessboard.fen:", fen);
              } else if (window.chess?.getFen) {
                  fen = window.chess.getFen();
                  console.log("Got FEN from window.chess.getFen():", fen);
              } else if (window.chess?.fen) {
                  fen = typeof window.chess.fen === 'function' ? window.chess.fen() : window.chess.fen;
                  console.log("Got FEN from window.chess.fen:", fen);
              }

              if (fen && window.isValidFENFormat(fen)) {
                  console.log("📊 [Capture] Got valid FEN from global object:", fen);
              } else {
                  fen = null;
              }
          } catch (e) {
              console.warn("📊 [Capture] Could not get FEN from global objects:", e);
              fen = null;
          }

          // Method 2: Try to get FEN from the board's data attributes
          if (!fen) {
              try {
                  const boardData = boardElement.getAttribute('data-fen') || 
                                  boardElement.getAttribute('data-position') ||
                                  boardElement.getAttribute('data-board');
                  
                  if (boardData) {
                      try {
                          const parsedData = JSON.parse(boardData);
                          if (parsedData?.fen && window.isValidFENFormat(parsedData.fen)) {
                              fen = parsedData.fen;
                              console.log("Got FEN from parsed board data:", fen);
                          }
                      } catch (e) {
                          if (boardData.includes('/') && window.isValidFENFormat(boardData)) {
                              fen = boardData;
                              console.log("Got FEN from raw board data:", fen);
                          }
                      }
                  }

                  // Try other DOM selectors
                  if (!fen) {
                      const selectors = [
                          '[data-fen]',
                          '[data-position]',
                          '[data-game-state]',
                          '.move.selected[data-fen]',
                          '.copy-fen-btn',
                          '.share-menu-tab-pgn-textarea',
                          '.board-modal-pgn-textarea',
                          '.board-modal-fen-textarea',
                          '.board-modal-position-textarea',
                          '.board-modal-fen',
                          '.board-modal-position',
                          '.board-modal-state'
                      ];
                      
                      for (const selector of selectors) {
                          const elements = document.querySelectorAll(selector);
                          for (const el of elements) {
                              const possibleFen = el.getAttribute('data-fen') ||
                                              el.getAttribute('data-position') ||
                                              el.getAttribute('data-game-state') ||
                                              el.value ||
                                              el.textContent;
                              if (possibleFen && window.isValidFENFormat(possibleFen)) {
                                  fen = possibleFen;
                                  console.log(`Got FEN from ${selector}:`, fen);
                                  break;
                              }
                          }
                          if (fen) break;
                      }
                  }
              } catch (e) {
                  console.warn("Could not get FEN from DOM attributes:", e);
              }
          }

          // Method 3: Visual extraction
          if (!fen) {
              try {
                  console.log("Attempting board state reconstruction from visual elements");
                  
                  // 1. Try various piece selectors to support different Chess.com layouts
                  const pieceSelectors = [
                      'div.piece[class*="square-"]',
                      'div[class*="piece-"]',
                      'div[class*="square-"] > div[class*="piece"]',
                      'div[class*="chess-piece"]',
                      'div[class*="piece"][class*="square-"]',
                      '.piece', 
                      '[class*="piece"]',
                      'img[src*="piece"]',
                      // New Chess.com selectors
                      'div[class*="piece_"] > svg',
                      'div[class*="piece_"]',
                      'chess-board div[class*="piece"]',
                      'chess-board div[class*="square-"] div',
                      // Generic selectors as last resort
                      'chess-board *[style*="transform"]',
                      'chess-board > div > div'
                  ];

                  let pieces = [];
                  for (const selector of pieceSelectors) {
                      const foundPieces = Array.from(boardElement.querySelectorAll(selector));
                      if (foundPieces.length > 0) {
                          pieces = foundPieces;
                          console.log(`Found ${pieces.length} pieces using selector: ${selector}`);
                          break;
                      }
                  }

                  // If we still didn't find pieces, try parent element just in case
                  if (pieces.length === 0) {
                      const parentElement = boardElement.parentElement;
                      if (parentElement) {
                          console.log("Trying parent element for board:", parentElement.tagName, parentElement.className);
                          for (const selector of pieceSelectors) {
                              const foundPieces = Array.from(parentElement.querySelectorAll(selector));
                              if (foundPieces.length > 0) {
                                  pieces = foundPieces;
                                  console.log(`Found ${pieces.length} pieces using parent element and selector: ${selector}`);
                                  break;
                              }
                          }
                      }
                  }

                  if (pieces.length === 0) {
                      console.error("No pieces found on the board");
                      throw new Error("Could not find chess pieces on the board");
                  }

                  const boardArray = Array(8).fill().map(() => Array(8).fill(''));
                  const boardRect = boardElement.getBoundingClientRect();
                  const squareSize = boardRect.width / 8;

                  console.log(`Board dimensions: ${boardRect.width}x${boardRect.height}, square size: ${squareSize}`);
                  
                  let successCount = 0;
                  let kingCount = { w: 0, b: 0 };

                  pieces.forEach((piece, index) => {
                      try {
                          // Initialize position variables at the very beginning
                          let fileIdx = -1;
                          let rankIdx = -1;
                          const classList = piece.className.split(' ');
                          
                          // 1. Try standard Chess.com classes
                          let pieceType = classList.find(cls => /^[bw][pnbrqk]$/.test(cls)) || 
                                      classList.find(cls => /^piece-[bw][pnbrqk]$/.test(cls)) ||
                                      classList.find(cls => /^chess-piece-[bw][pnbrqk]$/.test(cls)) ||
                                      classList.find(cls => /^[bw][pnbrqk]-piece$/.test(cls));

                          // 2. Try alternative format (white/black + king/queen/etc classes)
                          let color, type;
                          if (!pieceType) {
                              // Try to find color in class names
                              const colorClass = classList.find(cls => cls === 'white' || cls === 'black') ||
                                               classList.find(cls => cls.includes('white')) || 
                                               classList.find(cls => cls.includes('black'));
                              
                              // Try to find piece type in class names
                              const typeClass = classList.find(cls => ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'].includes(cls)) ||
                                              classList.find(cls => cls.includes('king')) || 
                                              classList.find(cls => cls.includes('queen')) ||
                                              classList.find(cls => cls.includes('rook')) ||
                                              classList.find(cls => cls.includes('bishop')) ||
                                              classList.find(cls => cls.includes('knight')) ||
                                              classList.find(cls => cls.includes('pawn'));
                              
                              if (colorClass && typeClass) {
                                  color = colorClass.includes('white') ? 'w' : 'b';
                                  if (typeClass.includes('king')) type = 'k';
                                  else if (typeClass.includes('queen')) type = 'q';
                                  else if (typeClass.includes('rook')) type = 'r';
                                  else if (typeClass.includes('bishop')) type = 'b';
                                  else if (typeClass.includes('knight')) type = 'n';
                                  else if (typeClass.includes('pawn')) type = 'p';
                              }
                          }
                          
                          // 3. Try to extract from class names with piece_ prefix (new Chess.com format)
                          if (!pieceType && !color && !type) {
                              const pieceClass = classList.find(cls => cls.startsWith('piece_'));
                              if (pieceClass) {
                                  const parts = pieceClass.split('_');
                                  if (parts.length >= 3) {
                                      // Format might be like piece_color_type
                                      color = parts[1].includes('w') ? 'w' : 'b';
                                      const typePart = parts[2];
                                      if (typePart.includes('k')) type = 'k';
                                      else if (typePart.includes('q')) type = 'q';
                                      else if (typePart.includes('r')) type = 'r';
                                      else if (typePart.includes('b')) type = 'b';
                                      else if (typePart.includes('n')) type = 'n';
                                      else if (typePart.includes('p')) type = 'p';
                                  }
                              }
                          }
                          
                          // 4. Try to extract from SVG use element if present
                          if (!pieceType && !color && !type && piece.querySelector) {
                              const svgUse = piece.querySelector('use');
                              if (svgUse) {
                                  const href = svgUse.getAttribute('href') || svgUse.getAttribute('xlink:href');
                                  if (href) {
                                      // Extract color and type from href like #wk or #bp
                                      const match = href.match(/#([wb])([pnbrqk])/i);
                                      if (match) {
                                          color = match[1].toLowerCase();
                                          type = match[2].toLowerCase();
                                      }
                                  }
                              }
                          }
                          
                          // Try to get position from class or transform
                          // 1. Try square class
                          const squareClass = classList.find(cls => /^square-\d{2}$/.test(cls)) ||
                                      classList.find(cls => /^square-[a-h][1-8]$/.test(cls)) ||
                                      classList.find(cls => /^[a-h][1-8]$/.test(cls));
                          
                          if (squareClass) {
                              console.log(`Piece ${index} has square class: ${squareClass}`);
                              if (squareClass.includes('-')) {
                                  const sq = squareClass.split('-')[1];
                                  if (sq.length === 2 && /^\d{2}$/.test(sq)) {
                                      // Handle numeric coordinates (e.g., square-12)
                                      fileIdx = parseInt(sq[0], 10) - 1;
                                      rankIdx = 8 - parseInt(sq[1], 10);
                                  } else {
                                      // Handle algebraic coordinates (e.g., square-e4)
                                      fileIdx = sq.charCodeAt(0) - 'a'.charCodeAt(0);
                                      rankIdx = 8 - parseInt(sq[1], 10);
                                  }
                              } else {
                                  // Handle direct algebraic notation (e.g., e4)
                                  fileIdx = squareClass.charCodeAt(0) - 'a'.charCodeAt(0);
                                  rankIdx = 8 - parseInt(squareClass[1], 10);
                              }
                          }
                          
                          // 2. If position not found, try transform style
                          if (fileIdx < 0 || rankIdx < 0) {
                              const transform = piece.style.transform || '';
                              console.log(`Piece ${index} transform: ${transform}`);
                              
                              // Try translate
                              const translateMatch = transform.match(/translate(?:3d)?\(\s*([^,]+)px,\s*([^,]+)px/);
                              if (translateMatch) {
                                  const x = parseFloat(translateMatch[1]);
                                  const y = parseFloat(translateMatch[2]);
                                  fileIdx = Math.round(x / squareSize);
                                  rankIdx = Math.round(y / squareSize);
                                  console.log(`Piece ${index} position from translate: [${fileIdx}, ${rankIdx}]`);
                              } 
                              // Try matrix
                              else {
                                  const matrixMatch = transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,([^,]+),([^,\)]+)/);
                                  if (matrixMatch) {
                                      const x = parseFloat(matrixMatch[1]);
                                      const y = parseFloat(matrixMatch[2]);
                                      fileIdx = Math.round(x / squareSize);
                                      rankIdx = Math.round(y / squareSize);
                                      console.log(`Piece ${index} position from matrix: [${fileIdx}, ${rankIdx}]`);
                                  }
                              }
                              
                              // Adjust for orientation if needed
                              if (fileIdx >= 0 && rankIdx >= 0) {
                                  if (orientation === 'black') {
                                      fileIdx = 7 - fileIdx;
                                      rankIdx = 7 - rankIdx;
                                  }
                              }
                          }
                          
                          // Skip if position is invalid
                          if (fileIdx < 0 || fileIdx > 7 || rankIdx < 0 || rankIdx > 7) {
                              console.warn(`Piece ${index} position out of bounds: [${fileIdx}, ${rankIdx}]`);
                              return;
                          }
                          
                          // Get the FEN character
                          let fenChar;
                          if (pieceType) {
                              // Method 1: from pieceType
                              const pieceChar = pieceType.includes('-') ? pieceType.split('-').pop() : pieceType;
                              fenChar = pieceChar[0] === 'w' ? pieceChar[1].toUpperCase() : pieceChar[1];
                          } else if (color && type) {
                              // Method 2: from separate color and type
                              fenChar = color === 'w' ? type.toUpperCase() : type;
                          } else {
                              // No valid piece type found
                              console.warn(`Piece ${index} has invalid type: ${piece.className}`);
                              return;
                          }
                          
                          // Place the piece on the board array
                          boardArray[rankIdx][fileIdx] = fenChar;
                          successCount++;
                          if (fenChar.toLowerCase() === 'k') {
                              kingCount[fenChar === 'K' ? 'w' : 'b']++;
                          }
                          
                          console.log(`Placed ${fenChar} at [${fileIdx}, ${rankIdx}]`);
                      } catch (err) {
                          console.warn(`Error processing piece ${index}:`, err);
                      }
                  });

                  console.log('Reconstructed board array:', JSON.stringify(boardArray));
                  console.log('Pieces placed successfully:', successCount);
                  console.log('King count:', kingCount);

                  // Only generate FEN if we found at least some pieces and both kings
                  if (successCount > 0 && kingCount.w === 1 && kingCount.b === 1) {
                      // Convert board array to FEN notation
                      let boardFen = boardArray.map(row => {
                          let str = '';
                          let empty = 0;
                          for (const sq of row) {
                              if (!sq) empty++;
                              else {
                                  if (empty) { str += empty; empty = 0; }
                                  str += sq;
                              }
                          }
                          if (empty) str += empty;
                          return str;
                      }).join('/');

                      // Add the rest of the FEN components
                      const isWhiteToMove = !boardElement.classList.contains('flipped');
                      fen = `${boardFen} ${isWhiteToMove ? 'w' : 'b'} KQkq - 0 1`;
                      
                      if (window.isValidFENFormat(fen)) {
                          console.log("Successfully reconstructed FEN:", fen);
                      } else {
                          console.error("Generated FEN failed validation:", fen);
                          fen = null;
                      }
                  } else {
                      console.error("Incomplete board reconstruction, missing kings or too few pieces.");
                  }
              } catch (e) {
                  console.error("Visual board analysis failed:", e);
              }
          }

          if (!fen) {
              throw new Error("Could not determine current board position");
          }

          // Create a temporary off-screen container for rendering
          const tempContainer = document.createElement('div');
          tempContainer.id = 'vichar-temp-board-container';
          tempContainer.style.cssText = `
              position: fixed;
              top: -9999px;
              left: -9999px;
              width: 600px;
              height: 600px;
              z-index: -1;
              background: transparent;
              overflow: hidden;
          `;
          document.body.appendChild(tempContainer);

          try {
              // Create and append custom board
              const customBoard = createCustomBoardElement(fen, orientation);
              tempContainer.appendChild(customBoard);

              // Wait for board to render
              await new Promise(resolve => setTimeout(resolve, 100));

              // Capture the board
              const canvas = await html2canvas(customBoard, {
                  backgroundColor: null,
                  scale: 2,
                  logging: false,
                  useCORS: true,
                  allowTaint: true,
                  width: 600,
                  height: 600,
                  scrollX: 0,
                  scrollY: 0,
                  windowWidth: 600,
                  windowHeight: 600,
                  imageTimeout: 5000
              });

              const imageData = canvas.toDataURL('image/png');

              // Clean up
              if (tempContainer.parentNode) {
                  tempContainer.parentNode.removeChild(tempContainer);
              }

              console.log("Successfully captured Chess.com board with FEN:", fen);
              return {
                  imageData,
                  fen,
                  pgn,
                  orientation,
                  site: 'chesscom'
              };

          } catch (error) {
              console.error("Error during custom board capture:", error);
              if (tempContainer.parentNode) {
                  tempContainer.parentNode.removeChild(tempContainer);
              }
              throw error;
          }

      } catch (error) {
          console.error("Error in Chess.com board capture:", error);
          throw error;
      }
  }

} // End of captureChessBoard function

// Export the main injector function for use in background.js
export { injectCaptureScript };

// --- END OF FILE scriptInjector.js ---
